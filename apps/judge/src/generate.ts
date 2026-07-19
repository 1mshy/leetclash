/**
 * Seeded test materialization (PLAN §2.3, §6.1): run the problem's generator
 * (deterministic per case seed) to produce an input, then the reference
 * solution to produce the expected output. Both run sandboxed in a dedicated
 * generation box pool — bank code is trusted-ish, but it still never touches
 * the host directly, and it NEVER shares a box with player code (a player
 * program must not be able to read expected outputs, §6.3).
 *
 * Materialized cases land in a disk cache keyed by content hash: every worker
 * can regenerate identical data independently (the seed is the source of
 * truth), so nothing needs central storage.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlannedSeededCase, SeededPlan } from "@leetclash/shared";
import { config } from "./config.js";
import { runInBox, writeBoxFile, type Box } from "./isolate.js";
import { LANGUAGE_SPECS } from "./languages.js";
import type { BoxPool } from "./pool.js";

/** Generator/reference runs get generous limits — they're bank code. */
const GEN_TIME_LIMIT_MS = 10_000;
const GEN_MEMORY_KB = 1_048_576;
/**
 * Generator stdout IS the test input and reference stdout IS the expected
 * output — the 1 MB player-output cap would silently corrupt "large" tiers
 * (~2.5 MB in the bank). 8 MB stays under the 16 MB --fsize ceiling.
 */
const GEN_OUTPUT_CAP_BYTES = 8 * 1_048_576;

export interface MaterializedCase {
  input: string;
  expected: string;
}

export class GenerationError extends Error {
  constructor(step: string, detail: string) {
    super(`seeded ${step} failed: ${detail}`.slice(0, 4000));
  }
}

function cacheBase(plan: SeededPlan, planned: PlannedSeededCase): string {
  const digest = createHash("sha1")
    .update(plan.generatorSource)
    .update(" ")
    .update(plan.referenceSource)
    .update(` ${planned.caseSeed}:${planned.sizeTier}`)
    .digest("hex");
  return path.join(config.JUDGE_CACHE_DIR, digest);
}

export async function ensureCacheDir(): Promise<void> {
  await mkdir(config.JUDGE_CACHE_DIR, { recursive: true });
}

async function readCache(base: string): Promise<MaterializedCase | null> {
  try {
    const [input, expected] = await Promise.all([
      readFile(`${base}.in`, "utf8"),
      readFile(`${base}.out`, "utf8"),
    ]);
    return { input, expected };
  } catch {
    return null;
  }
}

/** Run the generator + reference inside a generation box. Throws GenerationError. */
async function generate(
  box: Box,
  plan: SeededPlan,
  planned: PlannedSeededCase,
): Promise<MaterializedCase> {
  // 1) Generator (always Python in the bank): argv = <seed> <size_tier>.
  const py = LANGUAGE_SPECS.python;
  await writeBoxFile(box, py.sourceFile, plan.generatorSource);
  const gen = await runInBox(box, {
    argv: [...py.runArgv, String(planned.caseSeed), planned.sizeTier],
    env: py.env,
    processes: py.processes,
    cpuMs: GEN_TIME_LIMIT_MS,
    memoryKb: GEN_MEMORY_KB,
    stdoutCapBytes: GEN_OUTPUT_CAP_BYTES,
  });
  if (gen.status !== null || gen.exitCode !== 0) {
    throw new GenerationError("generator", gen.stderr || gen.message || `status ${gen.status}`);
  }
  if (gen.stdoutTruncated) {
    throw new GenerationError("generator", `input exceeds ${GEN_OUTPUT_CAP_BYTES} bytes`);
  }

  // 2) Reference solution on the generated input → expected output.
  const refSpec = LANGUAGE_SPECS[plan.referenceLanguage];
  await writeBoxFile(box, refSpec.sourceFile, plan.referenceSource);
  if (refSpec.compile) {
    const compiled = await runInBox(box, {
      argv: refSpec.compile.argv,
      env: refSpec.env,
      processes: refSpec.compile.processes,
      cpuMs: refSpec.compile.timeLimitMs,
      memoryKb: refSpec.compile.memoryLimitKb,
    });
    if (compiled.status !== null || compiled.exitCode !== 0) {
      throw new GenerationError("reference compile", compiled.stderr || "compiler error");
    }
  }
  await writeBoxFile(box, "__genin__", gen.stdout);
  const ref = await runInBox(box, {
    argv: refSpec.runArgv,
    env: refSpec.env,
    processes: refSpec.processes,
    cpuMs: GEN_TIME_LIMIT_MS,
    memoryKb: GEN_MEMORY_KB,
    stdinFile: "__genin__",
    stdoutCapBytes: GEN_OUTPUT_CAP_BYTES,
  });
  if (ref.status !== null || ref.exitCode !== 0) {
    throw new GenerationError(
      "reference solution",
      ref.stderr || ref.message || `status ${ref.status}`,
    );
  }
  if (ref.stdoutTruncated) {
    throw new GenerationError(
      "reference solution",
      `expected output exceeds ${GEN_OUTPUT_CAP_BYTES} bytes`,
    );
  }

  return { input: gen.stdout, expected: ref.stdout };
}

/** Cache-or-generate one planned seeded case. */
export async function materializeCase(
  genPool: BoxPool,
  plan: SeededPlan,
  planned: PlannedSeededCase,
): Promise<MaterializedCase> {
  const base = cacheBase(plan, planned);
  const cached = await readCache(base);
  if (cached) return cached;

  const box = await genPool.acquire();
  try {
    const materialized = await generate(box, plan, planned);
    await Promise.all([
      writeFile(`${base}.in`, materialized.input, "utf8"),
      writeFile(`${base}.out`, materialized.expected, "utf8"),
    ]);
    return materialized;
  } finally {
    genPool.release(box);
  }
}
