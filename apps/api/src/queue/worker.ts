/**
 * Judging + match lifecycle worker — separate entry point (`pnpm dev:worker`).
 *
 * Queues processed:
 *  - 'submissions': run source against the problem's tests via Judge0, persist
 *    verdict/time/memory/test counts, publish verdict + progress match events,
 *    and finish the match on the first accepted Submit (Speed Race §1.2).
 *  - 'match-lifecycle': the state machine's durable timers (countdown → reveal
 *    → timeout), see src/match/engine.ts.
 */
import { Worker } from "bullmq";
import type { Job } from "bullmq";
import { and, count, eq } from "drizzle-orm";
import { closeDb, db } from "../db/client.js";
import { matches, submissions } from "../db/schema.js";
import {
  MATCH_LIFECYCLE_QUEUE_NAME,
  finishMatch,
  processLifecycleJob,
} from "../match/engine.js";
import { appendMatchEvent, refreshMatchState } from "../match/events.js";
import { runSuite, type SuiteResult } from "../match/judging.js";
import { closeMatchmaker, runMatchmakerTick } from "../match/matchmaker.js";
import { closePresence, startPresenceSubscriber } from "../match/presence.js";
import {
  createRedisConnection,
  SUBMISSIONS_QUEUE_NAME,
  type SubmissionJobData,
} from "./submissions.js";

/** Run/Submit a submission's source against the problem's test suite. */
async function judgeAllTests(job: Job<SubmissionJobData>): Promise<SuiteResult> {
  const { request } = job.data;
  return runSuite({
    problemId: request.problemId,
    language: request.language,
    source: request.source,
    kind: request.kind,
  });
}

/**
 * Publish verdict + progress events for a judged Submit and, in Speed Race,
 * finish the match on the first accepted one (§1.2: sudden death). Fixed-window
 * modes (Code Golf, Fastest Runtime) do NOT finish here — the accepted player
 * keeps improving until the window closes and the winner is computed by metric
 * (see match/resolve.ts).
 */
async function publishMatchOutcome(
  job: Job<SubmissionJobData>,
  summary: SuiteResult,
): Promise<void> {
  const { submissionId, userId, request } = job.data;
  const matchId = request.matchId;
  if (!matchId || request.kind !== "submit") return;

  const [match] = await db
    .select({ mode: matches.mode, status: matches.status })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match) return;

  const [submitCount] = await db
    .select({ value: count() })
    .from(submissions)
    .where(
      and(
        eq(submissions.matchId, matchId),
        eq(submissions.userId, userId),
        eq(submissions.kind, "submit"),
      ),
    );

  // detail stays null in the broadcast: compile output can quote source lines
  // and the whole room hears these events (§1.1: never the opponent's code).
  // The submitting client gets full detail from GET /submissions/:id.
  await appendMatchEvent(matchId, "verdict", {
    userId,
    result: {
      submissionId,
      status: "done",
      verdict: summary.verdict,
      timeMs: summary.timeMs,
      memoryKb: summary.memoryKb,
      bytes: Buffer.byteLength(request.source, "utf8"),
      testsPassed: summary.testsPassed,
      testsTotal: summary.testsTotal,
      tierReached: null,
      detail: null,
    },
  });
  await appendMatchEvent(matchId, "progress", {
    userId,
    testsPassed: summary.testsPassed,
    testsTotal: summary.testsTotal,
    submissionCount: submitCount?.value ?? 1,
    lastVerdict: summary.verdict,
  });
  await refreshMatchState(matchId);

  if (summary.verdict === "accepted" && match.mode === "speed_race") {
    const won = await finishMatch(matchId, userId, "win_condition");
    if (won) console.log(`[worker] match ${matchId} won by ${userId}`);
  }
}

async function processSubmission(job: Job<SubmissionJobData>): Promise<void> {
  const { submissionId } = job.data;

  await db
    .update(submissions)
    .set({ status: "running" })
    .where(eq(submissions.id, submissionId));

  const summary = await judgeAllTests(job);

  await db
    .update(submissions)
    .set({
      status: "done",
      verdict: summary.verdict,
      timeMs: summary.timeMs,
      timeSumMs: Math.round(summary.sumMs),
      memoryKb: summary.memoryKb,
      testsPassed: summary.testsPassed,
      testsTotal: summary.testsTotal,
      detail: summary.detail,
    })
    .where(eq(submissions.id, submissionId));

  await publishMatchOutcome(job, summary);
  console.log(`[worker] submission ${submissionId} → ${summary.verdict}`);
}

const submissionWorker = new Worker<SubmissionJobData>(
  SUBMISSIONS_QUEUE_NAME,
  processSubmission,
  { connection: createRedisConnection(), concurrency: 4 },
);

const lifecycleWorker = new Worker(MATCH_LIFECYCLE_QUEUE_NAME, processLifecycleJob, {
  connection: createRedisConnection(),
  concurrency: 8,
});

// Ranked matchmaker (PLAN §3.1): a periodic, lock-guarded pass that pairs the
// longest-waiting players whose Glicko bands overlap. Runs here (the worker) so
// there is a single durable ticker; the api runs the same pass inline on join
// for snappy pairing, and both take the same Redis lock (never double-pair).
const MATCHMAKER_TICK_MS = 1500;
const matchmakerTimer = setInterval(() => {
  void runMatchmakerTick().catch((err) =>
    console.error("[worker] matchmaker tick failed:", err instanceof Error ? err.message : err),
  );
}, MATCHMAKER_TICK_MS);

submissionWorker.on("failed", (job, err) => {
  console.error(`[worker] submission job ${job?.id} failed:`, err.message);
  // Out of retries: settle the row so clients aren't left polling forever.
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    void db
      .update(submissions)
      .set({ status: "done", verdict: "internal_error", detail: err.message.slice(0, 4000) })
      .where(eq(submissions.id, job.data.submissionId))
      .then(() =>
        publishMatchOutcome(job, {
          verdict: "internal_error",
          timeMs: null,
          sumMs: 0,
          memoryKb: null,
          detail: null,
          testsPassed: 0,
          testsTotal: 0,
        }),
      )
      .catch((e) => console.error("[worker] failed to settle submission:", e));
  }
});

lifecycleWorker.on("failed", (job, err) => {
  console.error(`[worker] lifecycle job ${job?.name}(${job?.data?.matchId}) failed:`, err.message);
});

// Disconnect/abandon: consume presence signals from the realtime gateway.
await startPresenceSubscriber();

console.log(
  `[worker] listening on queues '${SUBMISSIONS_QUEUE_NAME}', '${MATCH_LIFECYCLE_QUEUE_NAME}'`,
);

async function shutdown(): Promise<void> {
  console.log("[worker] shutting down…");
  clearInterval(matchmakerTimer);
  await Promise.all([submissionWorker.close(), lifecycleWorker.close()]);
  await closeMatchmaker();
  await closePresence();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
