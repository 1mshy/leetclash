/**
 * Suite planning + execution over a problem's tests (PLAN §4.1).
 *
 * This module decides WHAT runs — static samples for Run, the hidden suite
 * plus seeded per-match generation for Submit, escalating tiers for Scaling
 * Duel — and hands the plan to the configured judge backend (Judge0 or the
 * Phase 3 isolate workers), which decides HOW it runs. Shared by the
 * fast-feedback submission worker and the fixed-window benchmark protocol
 * (§1.2), which re-runs a finalist's suite N times back-to-back.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import {
  DEFAULT_SEEDED_TIERS,
  SCALING_DUEL_TIERS,
  type ExecBatchRequest,
  type GameMode,
  type Language,
  type LanguageLimits,
  type SeededPlan,
  type Verdict,
} from "@leetclash/shared";
import { db } from "../db/client.js";
import { problems, testCases } from "../db/schema.js";
import { executeSuite } from "../judge/index.js";

export interface SuiteResult {
  verdict: Verdict;
  /** Max CPU time across tests (ms) — the "worst case" run time. */
  timeMs: number | null;
  /** Summed CPU time across static tests + passed seeded tiers (ms). */
  sumMs: number;
  /** Max peak memory across tests (KB) — cgroup memory.peak on isolate. */
  memoryKb: number | null;
  detail: string | null;
  testsPassed: number;
  testsTotal: number;
  /** Highest fully-passed seeded tier — Scaling Duel only. */
  tierReached: number | null;
  /** Per-benchmark-run samples — set when benchmarkRuns > 1 (§1.2). */
  sampleSumMs: number[] | null;
  samplePeakKb: number[] | null;
}

/**
 * Match-scoped judging context: the mode picks the seeded plan shape and the
 * per-match seed makes both players race identical generated data (§6.1).
 * null/absent = solo practice → static tests only.
 */
export interface MatchJudgingContext {
  mode: GameMode;
  testSeed: number | null;
}

/** Baseline limits + per-language override from problems.limits (§2.2). */
export function resolveLimits(
  limits: { baseline: LanguageLimits; overrides: Partial<Record<string, Partial<LanguageLimits>>> },
  language: string,
): LanguageLimits {
  return { ...limits.baseline, ...(limits.overrides[language] ?? {}) };
}

/**
 * Run `source` against a problem's tests. kind "run" uses public samples only;
 * "submit" uses the full hidden suite — and, for matches with a seed and a
 * generator-equipped problem, fresh seeded cases on top (Scaling Duel swaps
 * the flat seeded suite for escalating tiers). First failure decides.
 */
export async function runSuite(params: {
  problemId: string;
  language: Language;
  source: string;
  kind: "run" | "submit";
  match?: MatchJudgingContext | null;
  /** >1 = the §1.2 benchmark protocol: N back-to-back runs, median upstream. */
  benchmarkRuns?: number;
}): Promise<SuiteResult> {
  const [problem] = await db
    .select({
      limits: problems.limits,
      generatorSource: problems.generatorSource,
      referenceSolutions: problems.referenceSolutions,
    })
    .from(problems)
    .where(eq(problems.id, params.problemId))
    .limit(1);
  if (!problem) {
    return internalError("problem not found");
  }

  const filters = [eq(testCases.problemId, params.problemId)];
  if (params.kind === "run") filters.push(eq(testCases.isPublic, true));
  const cases = await db
    .select()
    .from(testCases)
    .where(and(...filters))
    .orderBy(asc(testCases.tier), asc(testCases.ordinal));

  // MVP storage: inline test data only (input_uri/expected_uri stay for a
  // MinIO-backed bank later).
  const missing = cases.find((tc) => tc.inputInline === null || tc.expectedInline === null);
  if (missing) {
    return internalError(`test case ${missing.ordinal} has no inline data`);
  }

  const request: ExecBatchRequest = {
    execId: randomUUID(),
    language: params.language,
    source: params.source,
    limits: resolveLimits(problem.limits, params.language),
    tests: cases.map((tc) => ({
      ordinal: tc.ordinal,
      input: tc.inputInline ?? "",
      expected: tc.expectedInline ?? "",
    })),
    seeded: params.kind === "submit" ? buildSeededPlan(problem, params.match) : null,
    tiered: params.kind === "submit" && params.match?.mode === "scaling_duel",
    benchmarkRuns: params.benchmarkRuns ?? 1,
  };

  const result = await executeSuite(request);
  return {
    verdict: result.verdict,
    timeMs: result.timeMs,
    sumMs: result.sumMs,
    memoryKb: result.memoryKb,
    detail: result.detail,
    testsPassed: result.testsPassed,
    testsTotal: result.testsTotal,
    tierReached: result.tierReached,
    sampleSumMs: result.sampleSumMs,
    samplePeakKb: result.samplePeakKb,
  };
}

/**
 * Seeded plan for a Submit: requires a match seed (set at problem reveal) and
 * a generator + reference solution on the problem. Prefers the Python
 * reference (every bank entry has one; generators are Python anyway).
 */
function buildSeededPlan(
  problem: {
    generatorSource: string | null;
    referenceSolutions: Partial<Record<string, string>>;
  },
  match: MatchJudgingContext | null | undefined,
): SeededPlan | null {
  if (!match || match.testSeed === null || !problem.generatorSource) return null;

  const referenceLanguage = (
    problem.referenceSolutions["python"] ? "python" : Object.keys(problem.referenceSolutions)[0]
  ) as Language | undefined;
  const referenceSource = referenceLanguage
    ? problem.referenceSolutions[referenceLanguage]
    : undefined;
  if (!referenceLanguage || !referenceSource) return null;

  return {
    generatorSource: problem.generatorSource,
    referenceSource,
    referenceLanguage,
    seed: match.testSeed,
    tiers: match.mode === "scaling_duel" ? SCALING_DUEL_TIERS : DEFAULT_SEEDED_TIERS,
  };
}

function internalError(detail: string): SuiteResult {
  return {
    verdict: "internal_error",
    timeMs: null,
    sumMs: 0,
    memoryKb: null,
    detail,
    testsPassed: 0,
    testsTotal: 0,
    tierReached: null,
    sampleSumMs: null,
    samplePeakKb: null,
  };
}
