/**
 * Thin wrapper around the `isolate` sandbox CLI (the IOI sandbox Judge0 and
 * CMS use underneath — PLAN §4.1). One box = one initialized sandbox; the
 * pool (pool.ts) keeps boxes pre-warmed so a run skips --init entirely.
 *
 * Hardening applied per §4.2 on every run: no network (isolate default),
 * read-only rootfs binds, CPU + wall + extra-time limits, cgroup memory cap,
 * pids cap, file-size cap, cleared environment. Measurement per §4.4: CPU
 * time from isolate metadata, peak memory from the run cgroup (cg-mem).
 */
import { execFile } from "node:child_process";
import { open, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const ISOLATE_BIN = process.env.ISOLATE_BIN ?? "isolate";

/** stdout/stderr truncation cap (§4.2: prevents log-flood DoS). */
export const OUTPUT_CAP_BYTES = 1_048_576;

let cgroupsEnabled = false;

export function cgroupsActive(): boolean {
  return cgroupsEnabled;
}

/**
 * Probe --cg support once at boot: init+cleanup a throwaway box. Returns true
 * when cgroup accounting works (required for real Memory Golf verdicts).
 */
export async function probeCgroups(probeBoxId: number): Promise<boolean> {
  try {
    await execFileP(ISOLATE_BIN, [`--box-id=${probeBoxId}`, "--cg", "--init"]);
    await execFileP(ISOLATE_BIN, [`--box-id=${probeBoxId}`, "--cg", "--cleanup"]);
    cgroupsEnabled = true;
  } catch {
    cgroupsEnabled = false;
  }
  return cgroupsEnabled;
}

export function setCgroups(enabled: boolean): void {
  cgroupsEnabled = enabled;
}

const cgFlag = (): string[] => (cgroupsEnabled ? ["--cg"] : []);

export interface Box {
  id: number;
  /** Host path of the box working dir (…/<id>/box). */
  dir: string;
}

export async function initBox(id: number): Promise<Box> {
  const { stdout } = await execFileP(ISOLATE_BIN, [`--box-id=${id}`, ...cgFlag(), "--init"]);
  return { id, dir: path.join(stdout.trim(), "box") };
}

export async function cleanupBox(id: number): Promise<void> {
  await execFileP(ISOLATE_BIN, [`--box-id=${id}`, ...cgFlag(), "--cleanup"]).catch(() => {});
}

export interface RunOptions {
  argv: string[];
  env: string[];
  processes: number;
  cpuMs: number;
  memoryKb: number;
  fsizeKb?: number;
  /** File inside the box to feed as stdin (written by the caller). */
  stdinFile?: string;
  /** Override the 1 MB stdout cap — generation runs emit multi-MB inputs. */
  stdoutCapBytes?: number;
}

export interface RunResult {
  /** isolate meta status: null = clean exit 0, else RE | SG | TO | XX. */
  status: string | null;
  exitCode: number;
  /** CPU time, ms (isolate meta `time`). */
  timeMs: number;
  wallMs: number;
  /** Peak memory KB — cgroup cg-mem when available, else max-rss. */
  memoryKb: number | null;
  /** The cgroup OOM killer fired → memory_limit_exceeded (§4.4). */
  oomKilled: boolean;
  /** stdout, truncated at the stdout cap (truncated flag set when cut). */
  stdout: string;
  stdoutTruncated: boolean;
  stderr: string;
  message: string | null;
}

/** Parse isolate's `key:value` meta file. Exported for tests. */
export function parseMeta(text: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) meta[line.slice(0, idx)] = line.slice(idx + 1).trim();
  }
  return meta;
}

/** Read a box file with an output cap applied. */
async function readCapped(file: string, cap: number): Promise<{ text: string; truncated: boolean }> {
  try {
    const fh = await open(file, "r");
    try {
      const buf = Buffer.alloc(cap + 1);
      const { bytesRead } = await fh.read(buf, 0, cap + 1, 0);
      return {
        text: buf.subarray(0, Math.min(bytesRead, cap)).toString("utf8"),
        truncated: bytesRead > cap,
      };
    } finally {
      await fh.close();
    }
  } catch {
    return { text: "", truncated: false };
  }
}

/** Execute one program inside an initialized box. */
export async function runInBox(box: Box, opts: RunOptions): Promise<RunResult> {
  const metaFile = path.join(os.tmpdir(), `isolate-meta-${box.id}-${Date.now()}`);
  const cpuSec = opts.cpuMs / 1000;
  // Wall ≈ 2× CPU limit (§4.2), floor 3s so tiny limits survive scheduler noise.
  const wallSec = Math.max(cpuSec * 2, 3);

  const args = [
    `--box-id=${box.id}`,
    ...cgFlag(),
    "--run",
    `--meta=${metaFile}`,
    `--time=${cpuSec}`,
    `--wall-time=${wallSec}`,
    "--extra-time=0.5",
    `--processes=${opts.processes}`,
    `--fsize=${opts.fsizeKb ?? 16_384}`,
    cgroupsEnabled ? `--cg-mem=${opts.memoryKb}` : `--mem=${opts.memoryKb}`,
    "--stdout=__stdout__",
    "--stderr=__stderr__",
    ...(opts.stdinFile ? [`--stdin=${opts.stdinFile}`] : []),
    ...opts.env.map((e) => `--env=${e}`),
    "--silent",
    "--",
    ...opts.argv,
  ];

  // isolate exits 1 when the PROGRAM was killed/failed (that's a verdict, not
  // an error) and 2 on sandbox-internal errors — the meta status tells them
  // apart, so never throw on non-zero exit here.
  await execFileP(ISOLATE_BIN, args, { maxBuffer: 1 << 20 }).catch(() => {});

  let meta: Record<string, string> = {};
  try {
    meta = parseMeta(await readFile(metaFile, "utf8"));
  } finally {
    await rm(metaFile, { force: true });
  }

  const out = await readCapped(
    path.join(box.dir, "__stdout__"),
    opts.stdoutCapBytes ?? OUTPUT_CAP_BYTES,
  );
  const err = await readCapped(path.join(box.dir, "__stderr__"), OUTPUT_CAP_BYTES);

  const cgMem = meta["cg-mem"] ? Number(meta["cg-mem"]) : null;
  const maxRss = meta["max-rss"] ? Number(meta["max-rss"]) : null;

  return {
    status: meta["status"] ?? null,
    exitCode: meta["exitcode"] ? Number(meta["exitcode"]) : 0,
    timeMs: Math.round(Number(meta["time"] ?? "0") * 1000),
    wallMs: Math.round(Number(meta["time-wall"] ?? "0") * 1000),
    memoryKb: cgMem ?? maxRss,
    oomKilled: meta["cg-oom-killed"] === "1",
    stdout: out.text,
    stdoutTruncated: out.truncated,
    stderr: err.text,
    message: meta["message"] ?? null,
  };
}

/** Write a file into the box working dir (host side, not sandboxed). */
export async function writeBoxFile(box: Box, name: string, content: string): Promise<void> {
  await writeFile(path.join(box.dir, name), content, "utf8");
}

export async function removeBoxFile(box: Box, name: string): Promise<void> {
  await rm(path.join(box.dir, name), { force: true });
}
