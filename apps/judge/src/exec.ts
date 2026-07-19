/**
 * ExecBatch processor: compile once, run every planned case through the
 * shared suite driver (identical fold semantics to the Judge0 backend), and
 * report measurements per §4.4 — CPU time from isolate metadata, peak memory
 * from the run cgroup.
 */
import {
  driveBenchmark,
  type CaseOutcome,
  type ExecBatchRequest,
  type ExecBatchResult,
  type SuiteCase,
  type Verdict,
} from "@leetclash/shared";
import { GenerationError, materializeCase } from "./generate.js";
import { cgroupsActive, runInBox, writeBoxFile, type Box, type RunResult } from "./isolate.js";
import { outputsMatch } from "./compare.js";
import { LANGUAGE_SPECS } from "./languages.js";
import type { BoxPool } from "./pool.js";

const DETAIL_MAX_CHARS = 4_000;

function classify(run: RunResult, expected: string): CaseOutcome {
  let verdict: Verdict;
  let detail: string | null = null;

  if (run.oomKilled) {
    // Only reportable with cgroups — the whole reason Memory Golf is Phase 3.
    verdict = "memory_limit_exceeded";
  } else if (run.status === "TO") {
    verdict = "time_limit_exceeded";
  } else if (run.status === "XX") {
    verdict = "internal_error";
    detail = run.message;
  } else if (run.status === "RE" || run.status === "SG" || run.exitCode !== 0) {
    // Without cgroups an OOM usually surfaces as a kill signal — the address
    // -space limit (--mem) makes allocation fail instead, hence runtime_error.
    verdict = "runtime_error";
    detail = run.stderr || run.message;
  } else if (run.stdoutTruncated) {
    verdict = "output_limit_exceeded";
  } else if (outputsMatch(run.stdout, expected)) {
    verdict = "accepted";
  } else {
    verdict = "wrong_answer";
  }

  return {
    verdict,
    timeMs: run.timeMs,
    memoryKb: run.memoryKb,
    detail: detail ? detail.slice(0, DETAIL_MAX_CHARS) : null,
  };
}

function terminal(verdict: Verdict, testsTotal: number, detail: string | null): ExecBatchResult {
  return {
    verdict,
    testsPassed: 0,
    testsTotal,
    timeMs: null,
    sumMs: 0,
    memoryKb: null,
    tierReached: null,
    tiers: [],
    detail: detail ? detail.slice(0, DETAIL_MAX_CHARS) : null,
    sampleSumMs: null,
    samplePeakKb: null,
  };
}

/** Full batch on a pre-warmed box: compile once, then drive the suite. */
export async function processBatch(
  req: ExecBatchRequest,
  pool: BoxPool,
  genPool: BoxPool,
): Promise<ExecBatchResult> {
  const spec = LANGUAGE_SPECS[req.language];
  const plannedTotal =
    req.tests.length + (req.seeded?.tiers.reduce((n, t) => n + t.count, 0) ?? 0);

  const box = await pool.acquire();
  try {
    await writeBoxFile(box, spec.sourceFile, req.source);

    // Compile step, sandboxed with its own looser limits (§4.2).
    if (spec.compile) {
      const compiled = await runInBox(box, {
        argv: spec.compile.argv,
        env: spec.env,
        processes: spec.compile.processes,
        cpuMs: spec.compile.timeLimitMs,
        memoryKb: spec.compile.memoryLimitKb,
      });
      if (compiled.status !== null || compiled.exitCode !== 0) {
        return terminal("compile_error", plannedTotal, compiled.stderr || compiled.message);
      }
    }

    const runCase = async (c: SuiteCase): Promise<CaseOutcome> => {
      let input: string;
      let expected: string;
      if (c.kind === "static") {
        ({ input, expected } = c);
      } else {
        if (!req.seeded) {
          return {
            verdict: "internal_error",
            timeMs: null,
            memoryKb: null,
            detail: "seeded case without a plan",
          };
        }
        try {
          ({ input, expected } = await materializeCase(genPool, req.seeded, c.planned));
        } catch (err) {
          const detail =
            err instanceof GenerationError ? err.message : `seeded generation failed: ${err}`;
          return { verdict: "internal_error", timeMs: null, memoryKb: null, detail };
        }
      }

      // Only the INPUT enters the player's box; expected stays host-side and
      // the comparison happens here (§6.3: hidden data never readable).
      await writeBoxFile(box, "__in__", input);
      const run = await runInBox(box, {
        argv: spec.runArgv,
        env: spec.env,
        processes: spec.processes,
        cpuMs: req.limits.timeLimitMs,
        memoryKb: req.limits.memoryLimitKb,
        stdinFile: "__in__",
      });
      return classify(run, expected);
    };

    return await driveBenchmark(req, runCase);
  } finally {
    pool.release(box);
  }
}

export function memoryMeasurementMode(): "cgroup" | "rss" {
  return cgroupsActive() ? "cgroup" : "rss";
}
