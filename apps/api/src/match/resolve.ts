/**
 * Fixed-window mode resolution (PLAN §1.2: Code Golf, Fastest Runtime).
 *
 * These modes do NOT end when a player is accepted — both players keep
 * improving their metric until the wall-clock window closes. This module runs
 * at the window close (the `timeout` lifecycle job) and computes the winner:
 *
 *   Code Golf      → smallest accepted source in bytes (lower wins).
 *   Fastest Runtime→ lowest benchmarked median CPU time (lower wins), measured
 *                    by re-running each finalist's best accepted solution N
 *                    times and taking the median (drop the first, §1.2). The
 *                    hardware-fairness rigor (pinned core, governor, same-worker
 *                    back-to-back) is Phase 3 / isolate; on Judge0 we implement
 *                    the protocol *shape* — median-of-N CPU time from metadata.
 */
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { MODE_SPECS, type GameMode, type Language } from "@leetclash/shared";
import { db } from "../db/client.js";
import { matches, matchPlayers, submissions } from "../db/schema.js";
import { finishMatch } from "./engine.js";
import { appendMatchEvent, refreshMatchState } from "./events.js";
import { runSuite } from "./judging.js";

/** Number of benchmark runs; the first is dropped (JIT/cache warmup, §1.2). */
const BENCHMARK_RUNS = 5;

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
 * Benchmark a finalist's accepted solution: re-run the full suite N times, take
 * the summed CPU time per run, drop the first, median the rest. Returns null if
 * any run fails to reproduce Accepted (non-deterministic / flaky — can't rank).
 */
export async function benchmarkSubmission(params: {
  source: string;
  language: Language;
  problemId: string;
}): Promise<{ medianMs: number; sampleMs: number[] } | null> {
  const samples: number[] = [];
  for (let i = 0; i < BENCHMARK_RUNS; i++) {
    const result = await runSuite({ ...params, kind: "submit" });
    if (result.verdict !== "accepted") return null;
    samples.push(result.sumMs);
  }
  const timed = samples.slice(1); // drop first (warmup)
  return { medianMs: median(timed), sampleMs: samples };
}

interface Finalist {
  userId: string;
  submissionId: string;
  source: string;
  language: Language;
  bytes: number;
  /** Lowest summed suite CPU time among this player's accepted submits (ms). */
  bestSumMs: number | null;
}

/** Each player's best accepted Submit for the mode's metric. */
async function loadFinalists(matchId: string, problemId: string): Promise<Finalist[]> {
  const players = await db
    .select({ userId: matchPlayers.userId })
    .from(matchPlayers)
    .where(eq(matchPlayers.matchId, matchId));

  const finalists: Finalist[] = [];
  for (const { userId } of players) {
    const accepted = await db
      .select({
        id: submissions.id,
        source: submissions.sourceInline,
        language: submissions.language,
        bytes: submissions.bytes,
        timeMs: submissions.timeMs,
        timeSumMs: submissions.timeSumMs,
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
      .orderBy(asc(submissions.bytes));
    if (accepted.length === 0) continue; // this player never solved it

    // Smallest source = golf pick; the runtime metric is the summed suite time
    // (the unit the benchmark medians; timeMs covers rows predating it).
    const golfPick = accepted[0]!;
    const suiteMs = (a: (typeof accepted)[number]): number | null => a.timeSumMs ?? a.timeMs;
    const bestSumMs = accepted
      .map(suiteMs)
      .filter((t): t is number => t !== null)
      .reduce<number | null>((min, t) => (min === null ? t : Math.min(min, t)), null);
    // For runtime we benchmark the fastest-recorded accepted submission.
    const runtimePick =
      accepted.find((a) => suiteMs(a) !== null && suiteMs(a) === bestSumMs) ?? golfPick;

    finalists.push({
      userId,
      submissionId: runtimePick.id,
      source: runtimePick.source ?? golfPick.source ?? "",
      language: runtimePick.language,
      bytes: golfPick.bytes,
      bestSumMs,
    });
  }
  return finalists;
}

/**
 * Resolve a fixed-window match at the window close. Computes the winner by the
 * mode's metric, records benchmark results (Fastest Runtime), and finishes the
 * match. A tie or no-finalists ends in a draw.
 */
export async function resolveFixedWindowMatch(matchId: string): Promise<void> {
  const [match] = await db
    .select({ mode: matches.mode, problemId: matches.problemId, status: matches.status })
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

  const mode: GameMode = match.mode;
  let winnerId: string | null = null;

  if (mode === "code_golf") {
    winnerId = pickLowest(finalists.map((f) => ({ userId: f.userId, metric: f.bytes })));
  } else if (mode === "fastest_runtime") {
    // Benchmark each finalist back-to-back, then rank by median CPU time.
    const benched: { userId: string; metric: number }[] = [];
    for (const f of finalists) {
      const bench = await benchmarkSubmission({
        source: f.source,
        language: f.language,
        problemId: match.problemId,
      });
      const medianMs = bench?.medianMs ?? Infinity;
      if (bench) {
        await db
          .update(submissions)
          .set({ benchmarkMs: Math.round(medianMs) })
          .where(eq(submissions.id, f.submissionId));
        await appendMatchEvent(matchId, "benchmark", {
          userId: f.userId,
          medianMs,
          sampleMs: bench.sampleMs,
        });
      }
      benched.push({ userId: f.userId, metric: medianMs });
    }
    winnerId = pickLowest(benched);
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

/** True when a mode's win condition is decided at the window close, not on accept. */
export function isFixedWindowResolved(mode: GameMode): boolean {
  return MODE_SPECS[mode].fixedWindow;
}
