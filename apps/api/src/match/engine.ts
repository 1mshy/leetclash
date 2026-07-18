/**
 * Server-side match state machine (PLAN.md §3.2) for Speed Race:
 *
 *   matched → countdown → live → finished
 *
 * Transitions run as BullMQ jobs on the `match-lifecycle` queue (processed by
 * the worker entry point) so the countdown and the wall-clock cap are durable
 * Redis-backed timers — an api/worker restart never strands a match. Every
 * transition is guarded by a conditional UPDATE on matches.status: the first
 * writer wins, everyone else no-ops (e.g. a win racing the timeout job).
 */
import { Queue } from "bullmq";
import type { Job } from "bullmq";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { COUNTDOWN_SECONDS, MatchConfig, isFixedWindowMode } from "@leetclash/shared";
import { db } from "../db/client.js";
import { matches, matchPlayers, problems } from "../db/schema.js";
import { createRedisConnection } from "../queue/submissions.js";
import { runSimilarityCheck } from "./anticheat.js";
import { appendMatchEvent, refreshMatchState, storeCountdownEndsAt } from "./events.js";
import { processAbandon } from "./presence.js";
import { applyRatingChanges } from "./ratings.js";
import { resolveFixedWindowMatch } from "./resolve.js";

export const MATCH_LIFECYCLE_QUEUE_NAME = "match-lifecycle";

export interface LifecycleJobData {
  matchId: string;
  /** For "abandon" grace jobs: the player who dropped (may reconnect first). */
  userId?: string;
}

export const matchLifecycleQueue = new Queue<LifecycleJobData>(MATCH_LIFECYCLE_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

/** Kick off the state machine once a room is full (called by the join route). */
export async function enqueueMatchStart(matchId: string): Promise<void> {
  await matchLifecycleQueue.add("start", { matchId });
}

/** Worker entry point for lifecycle jobs. */
export async function processLifecycleJob(job: Job<LifecycleJobData>): Promise<void> {
  const { matchId } = job.data;
  switch (job.name) {
    case "start":
      return startMatch(matchId);
    case "reveal":
      return revealProblem(matchId);
    case "timeout":
      return timeoutMatch(matchId);
    case "abandon":
      return processAbandon(matchId, job.data.userId);
    case "similarity":
      return runSimilarityCheck(matchId);
    default:
      throw new Error(`unknown lifecycle job "${job.name}"`);
  }
}

/** matched → countdown; schedules the reveal COUNTDOWN_SECONDS later. */
async function startMatch(matchId: string): Promise<void> {
  const players = await db
    .select({ userId: matchPlayers.userId })
    .from(matchPlayers)
    .where(eq(matchPlayers.matchId, matchId));
  if (players.length < 2) return; // opponent left before the job ran

  const [claimed] = await db
    .update(matches)
    .set({ status: "countdown" })
    .where(and(eq(matches.id, matchId), eq(matches.status, "matched")))
    .returning({ config: matches.config });
  if (!claimed) return; // already started (job retry / double enqueue)

  await appendMatchEvent(matchId, "match_created", {
    // parse strips room extras (inviteCode, excludeProblemId) from the log.
    config: MatchConfig.parse(claimed.config),
    playerIds: players.map((p) => p.userId),
  });

  await storeCountdownEndsAt(matchId, Date.now() + COUNTDOWN_SECONDS * 1000);
  await appendMatchEvent(matchId, "countdown_started", { seconds: COUNTDOWN_SECONDS });
  await refreshMatchState(matchId);

  await matchLifecycleQueue.add(
    "reveal",
    { matchId },
    { delay: COUNTDOWN_SECONDS * 1000 },
  );
}

/** countdown → live; assigns a random problem and schedules the hard cap. */
async function revealProblem(matchId: string): Promise<void> {
  const [match] = await db
    .select({ status: matches.status, config: matches.config })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match || match.status !== "countdown") return;

  const cfg = match.config as { timeLimitSec?: number; excludeProblemId?: string };
  const problem = await pickRandomProblem(cfg.excludeProblemId);
  if (!problem) throw new Error("no published problems to assign — seed the problem bank");

  const [claimed] = await db
    .update(matches)
    .set({ problemId: problem.id, status: "live", startedAt: new Date() })
    .where(and(eq(matches.id, matchId), eq(matches.status, "countdown")))
    .returning({ id: matches.id });
  if (!claimed) return;

  await appendMatchEvent(matchId, "problem_revealed", { problemId: problem.id });
  await refreshMatchState(matchId);

  const timeLimitSec = Number(cfg.timeLimitSec ?? 1800);
  await matchLifecycleQueue.add("timeout", { matchId }, { delay: timeLimitSec * 1000 });
}

/** Rematches exclude the previous problem so friends don't replay it back-to-back. */
async function pickRandomProblem(
  excludeProblemId: string | undefined,
): Promise<{ id: string } | null> {
  const filters = [eq(problems.status, "published" as const)];
  if (excludeProblemId) filters.push(ne(problems.id, excludeProblemId));

  const [problem] = await db
    .select({ id: problems.id })
    .from(problems)
    .where(and(...filters))
    .orderBy(sql`random()`)
    .limit(1);
  if (problem) return problem;

  // Bank of one: better to repeat the problem than to strand the match.
  const [fallback] = await db
    .select({ id: problems.id })
    .from(problems)
    .where(eq(problems.status, "published"))
    .orderBy(sql`random()`)
    .limit(1);
  return fallback ?? null;
}

/**
 * Wall-clock window closed. Speed Race is sudden death, so hitting the cap with
 * no winner is a draw. Fixed-window modes (Code Golf, Fastest Runtime) treat
 * the close as the NORMAL end: the winner is computed by metric among the
 * accepted solutions (see match/resolve.ts).
 */
async function timeoutMatch(matchId: string): Promise<void> {
  const [match] = await db
    .select({ mode: matches.mode })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match) return;

  if (isFixedWindowMode(match.mode)) {
    await resolveFixedWindowMatch(matchId);
  } else {
    await finishMatch(matchId, null, "timeout");
  }
}

/**
 * Terminal transition; safe to call from both the timeout job and the judge
 * worker's win path. Returns false if someone else already finished it.
 */
export async function finishMatch(
  matchId: string,
  winnerId: string | null,
  reason: "win_condition" | "timeout" | "abandon" | "draw",
): Promise<boolean> {
  const [claimed] = await db
    .update(matches)
    .set({ status: "finished", winnerId, endedAt: new Date() })
    .where(
      and(
        eq(matches.id, matchId),
        inArray(matches.status, ["matched", "countdown", "live", "judging"]),
      ),
    )
    .returning({ id: matches.id, mode: matches.mode, language: matches.language, config: matches.config });
  if (!claimed) return false;

  if (winnerId) {
    await db
      .update(matchPlayers)
      .set({ result: "win" })
      .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, winnerId)));
    // The forfeiter's result is "abandon" (distinct from an in-play loss).
    await db
      .update(matchPlayers)
      .set({ result: reason === "abandon" ? "abandon" : "loss" })
      .where(and(eq(matchPlayers.matchId, matchId), ne(matchPlayers.userId, winnerId)));
  } else {
    await db
      .update(matchPlayers)
      .set({ result: "draw" })
      .where(eq(matchPlayers.matchId, matchId));
  }

  // Ranked matches move ratings (Glicko-2) before the finish event fires, so a
  // client fetching MatchDetail on match_finished already sees rating deltas.
  const ranked = (claimed.config as { ranked?: boolean }).ranked === true;
  if (ranked) {
    try {
      await applyRatingChanges(matchId, claimed.mode, claimed.language, winnerId);
    } catch (err) {
      console.error(`[engine] rating update failed for match ${matchId}:`, err);
    }
  }

  await appendMatchEvent(matchId, "match_finished", { winnerId, reason });
  await refreshMatchState(matchId);

  // Post-match collusion check (§6.5) — durable job, off the finish path.
  await matchLifecycleQueue
    .add("similarity", { matchId })
    .catch((err) => console.error(`[engine] failed to enqueue similarity check:`, err));
  return true;
}
