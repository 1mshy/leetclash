/**
 * Reusable judging over a problem's test suite (Judge0 path, PLAN §4.1).
 *
 * Shared by the fast-feedback submission worker (Run/Submit) and the Fastest
 * Runtime benchmark protocol (§1.2), which re-runs a finalist's accepted
 * solution N times. First-failing test decides the verdict; timing is reported
 * both as the max CPU time across tests and the summed CPU time (a more stable
 * benchmark metric than any single case).
 */
import { and, asc, eq } from "drizzle-orm";
import type { Language, LanguageLimits } from "@leetclash/shared";
import { db } from "../db/client.js";
import { problems, testCases } from "../db/schema.js";
import { judgeWithJudge0 } from "../judge0.js";

export interface SuiteResult {
  verdict: import("@leetclash/shared").Verdict;
  /** Max CPU time across tests (ms) — the "worst case" run time. */
  timeMs: number | null;
  /** Summed CPU time across tests (ms) — the stable benchmark metric. */
  sumMs: number;
  /** Max peak memory across tests (KB). */
  memoryKb: number | null;
  detail: string | null;
  testsPassed: number;
  testsTotal: number;
}

/** Baseline limits + per-language override from problems.limits (§2.2). */
export async function effectiveLimits(
  problemId: string,
  language: string,
): Promise<LanguageLimits | null> {
  const [problem] = await db
    .select({ limits: problems.limits })
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);
  if (!problem) return null;
  const { baseline, overrides } = problem.limits;
  return { ...baseline, ...(overrides[language] ?? {}) };
}

/**
 * Run `source` against a problem's tests. kind "run" uses public samples only;
 * "submit" uses the full suite (public + hidden). Stops at the first failure.
 */
export async function runSuite(params: {
  problemId: string;
  language: Language;
  source: string;
  kind: "run" | "submit";
}): Promise<SuiteResult> {
  const filters = [eq(testCases.problemId, params.problemId)];
  if (params.kind === "run") filters.push(eq(testCases.isPublic, true));

  const cases = await db
    .select()
    .from(testCases)
    .where(and(...filters))
    .orderBy(asc(testCases.tier), asc(testCases.ordinal));

  const limits = await effectiveLimits(params.problemId, params.language);

  const result: SuiteResult = {
    verdict: "accepted",
    timeMs: null,
    sumMs: 0,
    memoryKb: null,
    detail: null,
    testsPassed: 0,
    testsTotal: cases.length,
  };

  for (const tc of cases) {
    // MVP: inline test data only. TODO(phase3): fetch input_uri/expected_uri
    // from MinIO for large cases.
    if (tc.inputInline === null || tc.expectedInline === null) {
      result.verdict = "internal_error";
      result.detail = `test case ${tc.ordinal} has no inline data (MinIO fetch not implemented)`;
      break;
    }

    const outcome = await judgeWithJudge0({
      language: params.language,
      source: params.source,
      stdin: tc.inputInline,
      expectedOutput: tc.expectedInline,
      timeLimitMs: limits?.timeLimitMs,
      memoryLimitKb: limits?.memoryLimitKb,
    });

    if (outcome.timeMs !== null) {
      result.timeMs = Math.max(result.timeMs ?? 0, outcome.timeMs);
      result.sumMs += outcome.timeMs;
    }
    if (outcome.memoryKb !== null) {
      result.memoryKb = Math.max(result.memoryKb ?? 0, outcome.memoryKb);
    }

    if (outcome.verdict !== "accepted") {
      result.verdict = outcome.verdict;
      result.detail = outcome.detail;
      break; // first failing test decides the verdict
    }
    result.testsPassed += 1;
  }

  return result;
}
