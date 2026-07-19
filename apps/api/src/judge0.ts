import type { Language, Verdict } from "@leetclash/shared";
import { config } from "./config.js";

/**
 * Judge0 REST client (PLAN.md §4.1 — the MVP judge; replaced by custom
 * isolate-based workers in Phase 3).
 *
 * Flow: POST /submissions?base64_encoded=true&wait=false → token, then poll
 * GET /submissions/:token until the status id leaves the In Queue/Processing
 * range.
 */

/** Judge0 CE language ids for our launch set. */
const JUDGE0_LANGUAGE_IDS: Record<Language, number> = {
  python: 71, // Python 3.8.1
  cpp: 54, // C++ (GCC 9.2.0)
  javascript: 63, // JavaScript (Node.js 12.14.0)
  java: 62, // Java (OpenJDK 13.0.1)
  go: 60, // Go 1.13.5
  rust: 73, // Rust 1.40.0
};

/**
 * Judge0 status id → shared Verdict.
 *
 * Judge0 CE has no distinct "memory limit exceeded" status — MLE surfaces as
 * a runtime error (SIGKILL/SIGSEGV). TODO(phase3): the custom isolate judge
 * reads cgroup memory.peak and reports memory_limit_exceeded properly.
 */
function mapStatus(statusId: number): Verdict {
  switch (statusId) {
    case 3:
      return "accepted";
    case 4:
      return "wrong_answer";
    case 5:
      return "time_limit_exceeded";
    case 6:
      return "compile_error";
    case 7: // Runtime Error (SIGSEGV)
    case 9: // Runtime Error (SIGFPE)
    case 10: // Runtime Error (SIGABRT)
    case 11: // Runtime Error (NZEC)
    case 12: // Runtime Error (Other)
      return "runtime_error";
    case 8: // Runtime Error (SIGXFSZ) — output file size limit
      return "output_limit_exceeded";
    case 13: // Internal Error
    case 14: // Exec Format Error
    default:
      return "internal_error";
  }
}

interface Judge0Status {
  id: number;
  description: string;
}

interface Judge0Submission {
  token: string;
  status: Judge0Status;
  /** Seconds as a string, e.g. "0.002". */
  time: string | null;
  /** Kilobytes. */
  memory: number | null;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
}

export interface JudgeParams {
  language: Language;
  source: string;
  stdin: string;
  /**
   * Omit to run without an answer check (exit 0 ⇒ accepted) — the seeded
   * generation path uses this to capture generator/reference stdout.
   */
  expectedOutput?: string;
  /** CPU time limit in ms (Judge0 takes seconds). */
  timeLimitMs?: number;
  memoryLimitKb?: number;
  /** argv passed to the program (generator runs: "<seed> <size_tier>"). */
  commandLineArguments?: string;
  /** Max created-file size (KB) — raised for large seeded tiers. */
  maxFileSizeKb?: number;
}

export interface JudgeOutcome {
  verdict: Verdict;
  timeMs: number | null;
  memoryKb: number | null;
  /** Program stdout — consumed by the seeded generation path. */
  stdout: string | null;
  /** Compile/runtime error detail, truncated. */
  detail: string | null;
}

const b64 = (s: string): string => Buffer.from(s, "utf8").toString("base64");
const fromB64 = (s: string | null): string | null =>
  s === null ? null : Buffer.from(s, "base64").toString("utf8");

const POLL_INTERVAL_MS = 500;
const MAX_POLLS = 120; // 60s ceiling — beyond any per-run limit we set.
const DETAIL_MAX_CHARS = 4_000;

async function judge0Fetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.JUDGE0_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`Judge0 ${init?.method ?? "GET"} ${path} → ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Run one test case through Judge0 and map the result to our Verdict. */
export async function judgeWithJudge0(params: JudgeParams): Promise<JudgeOutcome> {
  const { token } = await judge0Fetch<{ token: string }>(
    "/submissions?base64_encoded=true&wait=false",
    {
      method: "POST",
      body: JSON.stringify({
        language_id: JUDGE0_LANGUAGE_IDS[params.language],
        source_code: b64(params.source),
        stdin: b64(params.stdin),
        expected_output:
          params.expectedOutput === undefined ? undefined : b64(params.expectedOutput),
        cpu_time_limit: params.timeLimitMs ? params.timeLimitMs / 1000 : undefined,
        memory_limit: params.memoryLimitKb
          ? Math.max(params.memoryLimitKb, config.JUDGE0_MEMORY_FLOOR_KB)
          : undefined,
        command_line_arguments: params.commandLineArguments,
        max_file_size: params.maxFileSizeKb,
      }),
    },
  );

  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    const sub = await judge0Fetch<Judge0Submission>(
      `/submissions/${token}?base64_encoded=true&fields=token,status,time,memory,stdout,stderr,compile_output,message`,
    );

    // 1 = In Queue, 2 = Processing — keep polling.
    if (sub.status.id <= 2) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      continue;
    }

    const detailRaw =
      fromB64(sub.compile_output) ?? fromB64(sub.stderr) ?? sub.message ?? null;

    return {
      verdict: mapStatus(sub.status.id),
      timeMs: sub.time === null ? null : Math.round(parseFloat(sub.time) * 1000),
      memoryKb: sub.memory,
      stdout: fromB64(sub.stdout),
      detail: detailRaw === null ? null : detailRaw.slice(0, DETAIL_MAX_CHARS),
    };
  }

  return {
    verdict: "internal_error",
    timeMs: null,
    memoryKb: null,
    stdout: null,
    detail: `Judge0 poll timed out after ${(MAX_POLLS * POLL_INTERVAL_MS) / 1000}s`,
  };
}
