/**
 * Fixed-window mode resolution (PLAN §1.2: Code Golf, Fastest Runtime,
 * Memory Golf, Scaling Duel).
 *
 * These modes do NOT end when a player is accepted — both players keep
 * improving their metric until the wall-clock window closes. This module runs
 * at the window close (the `timeout` lifecycle job) and computes the winner:
 *
 *   Code Golf       → smallest accepted source in bytes (lower wins).
 *   Fastest Runtime → lowest benchmarked median CPU time (lower wins): each
 *                     finalist's best accepted solution re-runs N times
 *                     back-to-back, first run dropped, median of the rest.
 *   Memory Golf     → lowest verified peak memory (lower wins): the §6.7
 *                     re-verification run measures cgroup memory.peak on the
 *                     trusted path; per-language baseline subtracted so casual
 *                     cross-language rooms aren't decided by interpreter floors
 *                     (ranked is same-language, where it cancels out).
 *   Scaling Duel    → highest seeded tier passed, tiebreak on suite CPU time
 *                     at that depth (same seed ⇒ identical cases ⇒ fair).
 */
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { adjustedMemoryKb, type GameMode, type Language } from "@leetclash/shared";
import { db } from "../db/client.js";
import { matches, matchPlayers, submissions } from "../db/schema.js";
import { finishMatch } from "./engine.js";
import { appendMatchEvent, refreshMatchState } from "./events.js";
import { runSuite, type MatchJudgingContext } from "./judging.js";

/** Number of benchmark runs; the first is dropped (JIT/cache warmup, §1.2). */
const BENCHMARK_RUNS = 5;
/** Memory verification runs (median peak) — cheaper than the time benchmark. */
const MEMORY_VERIFY_RUNS = 3;

/** In-flight submits at the window close get this long to settle before ranking. */
const SETTLE_MAX_MS = 60_000;
const SETTLE_POLL_MS = 750;

/**
 * A submit sent just before the close can still be judging when the timeout
 * job fires, and it must count — it's the deciding moment of the match. New
 * submits are already rejected (the route requires status "live"); this waits,
 * bounded, for the in-flight ones to reach a verdict.
 */
async function waitForPendingSubmits(matchId: string): Promise<void> {
  const deadline = Date.now() + SETTLE_MAX_MS;
  for (;;) {
    const [pending] = await db
      .select({ value: count() })
      .from(submissions)
      .where(
        and(
          eq(submissions.matchId, matchId),
          eq(submissions.kind, "submit"),
          inArray(submissions.status, ["pending", "running"]),
        ),
      );
    if ((pending?.value ?? 0) === 0 || Date.now() >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
  }
}

function median(values: number[]): number {
  if (values.length === 0) return Infinity;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/**
 * Benchmark a finalist's accepted solution: one exec batch that re-runs the
 * full suite N times back-to-back on the same worker (§1.2), summed CPU time
 * per run, drop the first, median the rest. Returns null if the run fails to
 * reproduce Accepted (non-deterministic / flaky — can't rank).
 */
export async function benchmarkSubmission(params: {
  source: string;
  language: Language;
  problemId: string;
  match: MatchJudgingContext | null;
}): Promise<{ medianMs: number; sampleMs: number[] } | null> {
  const result = await runSuite({
    problemId: params.problemId,
    language: params.language,
    source: params.source,
    kind: "submit",
    match: params.match,
    benchmarkRuns: BENCHMARK_RUNS,
  });
  if (result.verdict !== "accepted" || !result.sampleSumMs) return null;
  const timed = result.sampleSumMs.slice(1); // drop first (warmup)
  return { medianMs: median(timed), sampleMs: result.sampleSumMs };
}

/**
 * Memory Golf verification (§6.7: never trust the fast-feedback path): re-run
 * the finalist's best solution and take the median peak across runs. Returns
 * null when Accepted doesn't reproduce.
 */
async function verifyPeakMemory(params: {
  source: string;
  language: Language;
  problemId: string;
  match: MatchJudgingContext | null;
}): Promise<number | null> {
  const result = await runSuite({
    problemId: params.problemId,
    language: params.language,
    source: params.source,
    kind: "submit",
    match: params.match,
    benchmarkRuns: MEMORY_VERIFY_RUNS,
  });
  if (result.verdict !== "accepted") return null;
  if (result.samplePeakKb && result.samplePeakKb.length > 0) {
    return median(result.samplePeakKb);
  }
  return result.memoryKb;
}

interface AcceptedSubmission {
  id: string;
  source: string;
  language: Language;
  bytes: number;
  timeMs: number | null;
  timeSumMs: number | null;
  memoryKb: number | null;
  tierReached: number | null;
}

interface Finalist {
  userId: string;
  accepted: AcceptedSubmission[];
}

/** Each player's accepted Submits — the raw material for every mode's pick. */
async function loadFinalists(matchId: string, problemId: string): Promise<Finalist[]> {
  const players = await db
    .select({ userId: matchPlayers.userId })
    .from(matchPlayers)
    .where(eq(matchPlayers.matchId, matchId));

  const finalists: Finalist[] = [];
  for (const { userId } of players) {
    const rows = await db
      .select({
        id: submissions.id,
        source: submissions.sourceInline,
        language: submissions.language,
        bytes: submissions.bytes,
        timeMs: submissions.timeMs,
        timeSumMs: submissions.timeSumMs,
        memoryKb: submissions.memoryKb,
        tierReached: submissions.tierReached,
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.matchId, matchId),
          eq(submissions.userId, userId),
          eq(submissions.kind, "submit"),
          eq(submissions.verdict, "accepted"),
          eq(submissions.problemId, problemId),
        ),
      )
      .orderBy(asc(submissions.createdAt));
    if (rows.length === 0) continue; // this player never solved it

    finalists.push({
      userId,
      accepted: rows.map((r) => ({ ...r, source: r.source ?? "" })),
    });
  }
  return finalists;
}

/** Recorded suite time, tolerating rows predating time_sum_ms. */
const suiteMs = (a: AcceptedSubmission): number | null => a.timeSumMs ?? a.timeMs;

/** The accepted submission with the lowest recorded suite time. */
function fastestPick(accepted: AcceptedSubmission[]): AcceptedSubmission {
  return accepted.reduce((best, a) => {
    const t = suiteMs(a);
    const bt = suiteMs(best);
    if (t === null) return best;
    return bt === null || t < bt ? a : best;
  });
}

/**
 * Resolve a fixed-window match at the window close. Computes the winner by the
 * mode's metric, records benchmark/verification results, and finishes the
 * match. A tie or no-finalists ends in a draw.
 */
export async function resolveFixedWindowMatch(matchId: string): Promise<void> {
  const [match] = await db
    .select({
      mode: matches.mode,
      problemId: matches.problemId,
      status: matches.status,
      config: matches.config,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match || !match.problemId) {
    await finishMatch(matchId, null, "draw");
    return;
  }
  // Only resolve from a live/judging state (guards double-resolution).
  if (match.status !== "live" && match.status !== "judging") return;

  // Close the window: live → judging makes the submit route reject anything
  // new, so the settle-wait below can't be outrun by fresh submits.
  if (match.status === "live") {
    await db
      .update(matches)
      .set({ status: "judging" })
      .where(and(eq(matches.id, matchId), eq(matches.status, "live")));
    await refreshMatchState(matchId);
  }
  await waitForPendingSubmits(matchId);

  const finalists = await loadFinalists(matchId, match.problemId);
  if (finalists.length === 0) {
    await finishMatch(matchId, null, "draw");
    return;
  }
  if (finalists.length === 1) {
    await finishMatch(matchId, finalists[0]!.userId, "win_condition");
    return;
  }

  // Re-runs (benchmark/verification) must judge the same data the match did.
  const seed = (match.config as { testSeed?: number }).testSeed;
  const judgingContext: MatchJudgingContext = {
    mode: match.mode,
    testSeed: typeof seed === "number" ? seed : null,
  };

  const mode: GameMode = match.mode;
  let winnerId: string | null = null;

  if (mode === "code_golf") {
    winnerId = pickLowest(
      finalists.map((f) => ({
        userId: f.userId,
        metric: Math.min(...f.accepted.map((a) => a.bytes)),
      })),
    );
  } else if (mode === "fastest_runtime") {
    // Benchmark each finalist back-to-back, then rank by median CPU time.
    const benched: { userId: string; metric: number }[] = [];
    for (const f of finalists) {
      const pick = fastestPick(f.accepted);
      const bench = await benchmarkSubmission({
        source: pick.source,
        language: pick.language,
        problemId: match.problemId,
        match: judgingContext,
      });
      const medianMs = bench?.medianMs ?? Infinity;
      if (bench) {
        await db
          .update(submissions)
          .set({ benchmarkMs: Math.round(medianMs) })
          .where(eq(submissions.id, pick.id));
        await appendMatchEvent(matchId, "benchmark", {
          userId: f.userId,
          medianMs,
          sampleMs: bench.sampleMs,
        });
      }
      benched.push({ userId: f.userId, metric: medianMs });
    }
    winnerId = pickLowest(benched);
  } else if (mode === "memory_golf") {
    // Verify each finalist's most memory-frugal accepted submission on the
    // trusted path, then rank by baseline-adjusted peak (§1.2, §4.4).
    const verified: { userId: string; metric: number }[] = [];
    for (const f of finalists) {
      const withMemory = f.accepted.filter((a) => a.memoryKb !== null);
      const pick =
        withMemory.length > 0
          ? withMemory.reduce((best, a) => (a.memoryKb! < best.memoryKb! ? a : best))
          : f.accepted[f.accepted.length - 1]!;
      const peakKb =
        (await verifyPeakMemory({
          source: pick.source,
          language: pick.language,
          problemId: match.problemId,
          match: judgingContext,
        })) ?? pick.memoryKb;
      verified.push({
        userId: f.userId,
        metric: peakKb === null ? Infinity : adjustedMemoryKb(peakKb, pick.language),
      });
    }
    winnerId = pickLowest(verified);
  } else if (mode === "scaling_duel") {
    winnerId = pickScalingWinner(finalists);
  } else {
    // Not a fixed-window mode we resolve here — should not happen.
    winnerId = null;
  }

  await finishMatch(matchId, winnerId, winnerId ? "win_condition" : "draw");
}

/** Lowest metric wins; a tie (or all-Infinity) returns null → draw. */
function pickLowest(entries: { userId: string; metric: number }[]): string | null {
  let best: { userId: string; metric: number } | null = null;
  let tied = false;
  for (const e of entries) {
    if (!Number.isFinite(e.metric)) continue;
    if (best === null || e.metric < best.metric) {
      best = e;
      tied = false;
    } else if (e.metric === best.metric) {
      tied = true;
    }
  }
  return best && !tied ? best.userId : null;
}

/**
 * Scaling Duel ranking (§1.2): highest tier passed wins; equal depth breaks
 * on the suite CPU time recorded WITH that depth (both players ran identical
 * seeded cases, so the comparison is apples-to-apples). Exported for tests.
 */
export function pickScalingWinner(finalists: Finalist[]): string | null {
  interface Standing {
    userId: string;
    tier: number;
    sumMs: number;
  }
  const standings: Standing[] = [];
  for (const f of finalists) {
    const bestTier = Math.max(...f.accepted.map((a) => a.tierReached ?? 0));
    const atBest = f.accepted.filter((a) => (a.tierReached ?? 0) === bestTier);
    const times = atBest.map(suiteMs).filter((t): t is number => t !== null);
    standings.push({
      userId: f.userId,
      tier: bestTier,
      sumMs: times.length > 0 ? Math.min(...times) : Infinity,
    });
  }

  standings.sort((a, b) => b.tier - a.tier || a.sumMs - b.sumMs);
  const [first, second] = standings;
  if (!first) return null;
  if (second && first.tier === second.tier && first.sumMs === second.sumMs) return null;
  return first.userId;
}
