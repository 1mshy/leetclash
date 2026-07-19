import type {
  ExecBatchRequest,
  ExecBatchResult,
  PlannedSeededCase,
  TierOutcome,
} from "./judge-protocol.js";
import { plannedSeededCases } from "./judge-protocol.js";
import type { Verdict } from "./core.js";

/**
 * Backend-agnostic suite execution: the fold that turns per-case outcomes into
 * an ExecBatchResult. Both judges — the Judge0 driver in apps/api and the
 * isolate workers in apps/judge — drive their cases through THIS function, so
 * the tiered (Scaling Duel) semantics, the stop-at-first-failure rule, and the
 * sumMs bookkeeping can never disagree between backends.
 *
 * Semantics:
 *  - Static cases (tier 0) run first, in order; the first failure decides the
 *    verdict and stops the suite.
 *  - Non-tiered seeded cases are just more hidden tests: first failure decides.
 *  - Tiered (Scaling Duel §1.2): tiers escalate; a failed tier stops execution
 *    but only demotes the verdict when tier 1 itself failed — failing tier 2+
 *    is the mode working as intended (tierReached records the depth).
 *  - sumMs accumulates static cases plus PASSED seeded tiers only, so equal
 *    tierReached ⇒ identical case set ⇒ a fair runtime tiebreak (same seed).
 */

export interface CaseOutcome {
  verdict: Verdict;
  timeMs: number | null;
  memoryKb: number | null;
  detail: string | null;
}

export type SuiteCase =
  | { kind: "static"; ordinal: number; input: string; expected: string }
  | { kind: "seeded"; planned: PlannedSeededCase };

/** One full pass over a request's planned cases (a single benchmark run). */
export async function driveSuite(
  req: ExecBatchRequest,
  runCase: (c: SuiteCase) => Promise<CaseOutcome>,
): Promise<ExecBatchResult> {
  const seeded = req.seeded ? plannedSeededCases(req.seeded) : [];
  const result: ExecBatchResult = {
    verdict: "accepted",
    testsPassed: 0,
    testsTotal: req.tests.length + seeded.length,
    timeMs: null,
    sumMs: 0,
    memoryKb: null,
    tierReached: req.tiered ? 0 : null,
    tiers: [],
    detail: null,
    sampleSumMs: null,
    samplePeakKb: null,
  };

  const record = (o: CaseOutcome): void => {
    if (o.timeMs !== null) result.timeMs = Math.max(result.timeMs ?? 0, o.timeMs);
    if (o.memoryKb !== null) result.memoryKb = Math.max(result.memoryKb ?? 0, o.memoryKb);
  };

  // ── Static cases ──
  for (const t of req.tests) {
    const outcome = await runCase({ kind: "static", ...t });
    record(outcome);
    if (outcome.timeMs !== null) result.sumMs += outcome.timeMs;
    if (outcome.verdict !== "accepted") {
      result.verdict = outcome.verdict;
      result.detail = outcome.detail;
      return result;
    }
    result.testsPassed += 1;
  }

  // ── Seeded cases, grouped by tier ──
  const tiers = [...new Set(seeded.map((c) => c.tier))].sort((a, b) => a - b);
  for (const tier of tiers) {
    const cases = seeded.filter((c) => c.tier === tier);
    const outcome: TierOutcome = {
      tier,
      passed: true,
      testsPassed: 0,
      testsTotal: cases.length,
      sumMs: 0,
    };
    let failure: CaseOutcome | null = null;

    for (const planned of cases) {
      const o = await runCase({ kind: "seeded", planned });
      record(o);
      if (o.timeMs !== null) outcome.sumMs += o.timeMs;
      if (o.verdict !== "accepted") {
        outcome.passed = false;
        failure = o;
        break;
      }
      outcome.testsPassed += 1;
      result.testsPassed += 1;
    }
    result.tiers.push(outcome);

    if (outcome.passed) {
      // Only passed tiers count toward the comparable suite time (see above).
      result.sumMs += outcome.sumMs;
      if (req.tiered) result.tierReached = tier;
      continue;
    }

    if (!req.tiered || tier === tiers[0]) {
      // Plain hidden suite, or the base tier of a Scaling Duel: a failure
      // here means the solution is simply wrong/too slow — real verdict.
      result.verdict = failure?.verdict ?? "wrong_answer";
      result.detail = failure?.detail ?? null;
    }
    return result;
  }

  return result;
}

/**
 * Run the suite benchmarkRuns times back-to-back (§1.2 protocol shape) and
 * attach per-run samples to the final run's result.
 */
export async function driveBenchmark(
  req: ExecBatchRequest,
  runCase: (c: SuiteCase) => Promise<CaseOutcome>,
): Promise<ExecBatchResult> {
  const sampleSumMs: number[] = [];
  const samplePeakKb: number[] = [];
  let last: ExecBatchResult | null = null;

  for (let i = 0; i < req.benchmarkRuns; i++) {
    last = await driveSuite(req, runCase);
    // A benchmark that stops reproducing Accepted can't be ranked — bail with
    // the failing run so the caller sees the real verdict.
    if (last.verdict !== "accepted") return last;
    sampleSumMs.push(last.sumMs);
    if (last.memoryKb !== null) samplePeakKb.push(last.memoryKb);
  }
  if (!last) throw new Error("benchmarkRuns must be >= 1");

  if (req.benchmarkRuns > 1) {
    last.sampleSumMs = sampleSumMs;
    last.samplePeakKb = samplePeakKb.length > 0 ? samplePeakKb : null;
  }
  return last;
}
