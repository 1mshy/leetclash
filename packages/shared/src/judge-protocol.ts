import { z } from "zod";
import { Language, Verdict } from "./core.js";

/**
 * Contract between the api-side judging driver and the Phase 3 isolate judge
 * workers (PLAN §4.1). One BullMQ job = one full suite pass over a submission:
 * compile once, run every planned test, fold the outcome. The judge nodes hold
 * no secrets and reach no database (§4.2) — everything a run needs travels in
 * the job payload, and only verdict/measurement data travels back.
 *
 * Queues are partitioned per language so a worker can be restricted to the
 * runtimes its image carries (JUDGE_LANGUAGES) and each language pool can be
 * scaled on its own queue depth (§7: one pre-warmed pool per language).
 */

// Dashes, not colons — BullMQ rejects ':' in queue names.
export const judgeQueueName = (language: Language): string => `judge-exec-${language}`;

export const JUDGE_EXEC_JOB = "exec";

// ─── Scaling Duel tiers (§1.2: escalating input sizes) ───────────────────────

/**
 * Seeded tier numbers → generator size_tier names. Tier 0 is reserved for the
 * static (sample/hand-written) cases; seeded escalation starts at 1.
 */
export const SCALING_TIER_NAMES = ["small", "medium", "large"] as const;
export type ScalingTierName = (typeof SCALING_TIER_NAMES)[number];
export const SCALING_TIER_COUNT = SCALING_TIER_NAMES.length;

/** Generator size_tier argument for a seeded tier number (1-based). */
export function scalingTierName(tier: number): ScalingTierName {
  const name = SCALING_TIER_NAMES[tier - 1];
  if (!name) throw new Error(`no generator size_tier for tier ${tier}`);
  return name;
}

// ─── Request ─────────────────────────────────────────────────────────────────

export const ExecLimits = z.object({
  timeLimitMs: z.number().int().positive(),
  memoryLimitKb: z.number().int().positive(),
});
export type ExecLimits = z.infer<typeof ExecLimits>;

/** A static test carried inline (tier 0 — samples / hand-written cases). */
export const ExecTest = z.object({
  ordinal: z.number().int().nonnegative(),
  input: z.string(),
  expected: z.string(),
});
export type ExecTest = z.infer<typeof ExecTest>;

/**
 * Seeded per-match test generation (§2.3, §6.1): the judge derives every case
 * deterministically from (seed, tier, index) by running the problem's
 * generator, then produces the expected output with the reference solution.
 * Both players of a match share the seed, so they race identical data; other
 * matches get different data, so hardcoded answers die.
 */
export const SeededPlan = z.object({
  /** Python generator: argv = <seed> <size_tier>, prints one input to stdout. */
  generatorSource: z.string(),
  /** Reference solution: reads the generated input on stdin, prints the answer. */
  referenceSource: z.string(),
  referenceLanguage: Language,
  seed: z.number().int().nonnegative(),
  /** Cases per seeded tier, ascending; index within a tier salts the seed. */
  tiers: z
    .array(
      z.object({
        tier: z.number().int().positive(),
        count: z.number().int().positive(),
      }),
    )
    .min(1),
});
export type SeededPlan = z.infer<typeof SeededPlan>;

export const ExecBatchRequest = z.object({
  /** Correlation id (submission id or a synthetic one for benchmarks). */
  execId: z.string(),
  language: Language,
  source: z.string(),
  limits: ExecLimits,
  /** Static inline tests, run first in order (tier 0). */
  tests: z.array(ExecTest),
  /** Seeded generation plan appended after the static tests; null = static only. */
  seeded: SeededPlan.nullable().default(null),
  /**
   * Tiered (Scaling Duel) semantics: seeded tiers escalate and execution stops
   * at the first tier that fails, reporting tierReached. Non-tiered: every
   * planned case must pass for an accepted verdict (first failure decides).
   */
  tiered: z.boolean().default(false),
  /**
   * Re-run the whole suite N times back-to-back on the same worker and report
   * per-run samples — the §1.2 benchmark protocol. 1 = normal judging.
   */
  benchmarkRuns: z.number().int().positive().max(9).default(1),
});
export type ExecBatchRequest = z.infer<typeof ExecBatchRequest>;

// ─── Result ──────────────────────────────────────────────────────────────────

/** Per-seeded-tier fold (tiered runs) — powers the Scaling Duel tiebreak. */
export const TierOutcome = z.object({
  tier: z.number().int().positive(),
  passed: z.boolean(),
  testsPassed: z.number().int().nonnegative(),
  testsTotal: z.number().int().nonnegative(),
  /** Summed CPU ms across this tier's cases (comparable per match: same seed). */
  sumMs: z.number().nonnegative(),
});
export type TierOutcome = z.infer<typeof TierOutcome>;

export const ExecBatchResult = z.object({
  verdict: Verdict,
  testsPassed: z.number().int().nonnegative(),
  testsTotal: z.number().int().nonnegative(),
  /** Max per-case CPU time (ms) — the "worst case" run time. */
  timeMs: z.number().nullable(),
  /**
   * Summed CPU ms over the static cases plus every PASSED seeded tier. With
   * equal tierReached both players ran identical cases (same match seed), so
   * this is the apples-to-apples runtime tiebreak.
   */
  sumMs: z.number().nonnegative(),
  /** Max peak memory across cases (KB) — cgroup memory.peak on isolate (§4.4). */
  memoryKb: z.number().nullable(),
  /** Highest consecutive fully-passed seeded tier; null unless tiered. */
  tierReached: z.number().int().nullable(),
  tiers: z.array(TierOutcome).default([]),
  /** Compile/runtime error detail, truncated judge-side. */
  detail: z.string().nullable(),
  /** Per-benchmark-run summed CPU ms; null unless benchmarkRuns > 1. */
  sampleSumMs: z.array(z.number()).nullable().default(null),
  /** Per-benchmark-run peak memory KB; null unless benchmarkRuns > 1. */
  samplePeakKb: z.array(z.number()).nullable().default(null),
});
export type ExecBatchResult = z.infer<typeof ExecBatchResult>;

// ─── Shared plan helpers (used by both the judge0 driver and apps/judge) ─────

export interface PlannedSeededCase {
  tier: number;
  /** Index within the tier — salts the generator seed. */
  index: number;
  sizeTier: ScalingTierName;
  /** Deterministic per-case seed: same (matchSeed, tier, index) ⇒ same input. */
  caseSeed: number;
}

/** Expand a SeededPlan into the ordered case list both backends execute. */
export function plannedSeededCases(plan: SeededPlan): PlannedSeededCase[] {
  const cases: PlannedSeededCase[] = [];
  for (const t of [...plan.tiers].sort((a, b) => a.tier - b.tier)) {
    for (let i = 0; i < t.count; i++) {
      cases.push({
        tier: t.tier,
        index: i,
        sizeTier: scalingTierName(t.tier),
        // Mix tier/index into the match seed; keep it in safe-integer range.
        caseSeed: (plan.seed * 1_000 + t.tier * 100 + i) % 2_147_483_647,
      });
    }
  }
  return cases;
}

/** Seeded-tier plan for the fast hidden suite of non-tiered modes (§6.1). */
export const DEFAULT_SEEDED_TIERS = [
  { tier: 1, count: 4 },
  { tier: 2, count: 3 },
];

/** Escalating plan for Scaling Duel (§1.2: 10³ → 10⁵ → …). */
export const SCALING_DUEL_TIERS = [
  { tier: 1, count: 3 },
  { tier: 2, count: 3 },
  { tier: 3, count: 2 },
];
