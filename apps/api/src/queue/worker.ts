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
import { and, asc, count, eq } from "drizzle-orm";
import type { LanguageLimits, Verdict } from "@leetclash/shared";
import { closeDb, db } from "../db/client.js";
import { matches, problems, submissions, testCases } from "../db/schema.js";
import { judgeWithJudge0 } from "../judge0.js";
import {
  MATCH_LIFECYCLE_QUEUE_NAME,
  finishMatch,
  processLifecycleJob,
} from "../match/engine.js";
import { appendMatchEvent, refreshMatchState } from "../match/events.js";
import {
  createRedisConnection,
  SUBMISSIONS_QUEUE_NAME,
  type SubmissionJobData,
} from "./submissions.js";

interface JudgeSummary {
  verdict: Verdict;
  timeMs: number | null;
  memoryKb: number | null;
  detail: string | null;
  testsPassed: number;
  testsTotal: number;
}

/** Baseline limits + per-language override from problems.limits (PLAN §2.2). */
async function effectiveLimits(
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

async function judgeAllTests(job: Job<SubmissionJobData>): Promise<JudgeSummary> {
  const { request } = job.data;

  // Run uses public samples only; Submit uses the full suite.
  const filters = [eq(testCases.problemId, request.problemId)];
  if (request.kind === "run") filters.push(eq(testCases.isPublic, true));

  const cases = await db
    .select()
    .from(testCases)
    .where(and(...filters))
    .orderBy(asc(testCases.tier), asc(testCases.ordinal));

  const limits = await effectiveLimits(request.problemId, request.language);

  const summary: JudgeSummary = {
    verdict: "accepted",
    timeMs: null,
    memoryKb: null,
    detail: null,
    testsPassed: 0,
    testsTotal: cases.length,
  };

  for (const tc of cases) {
    // MVP: inline test data only. TODO(phase2): fetch input_uri/expected_uri
    // from MinIO for large cases.
    if (tc.inputInline === null || tc.expectedInline === null) {
      summary.verdict = "internal_error";
      summary.detail = `test case ${tc.ordinal} has no inline data (MinIO fetch not implemented)`;
      break;
    }

    const outcome = await judgeWithJudge0({
      language: request.language,
      source: request.source,
      stdin: tc.inputInline,
      expectedOutput: tc.expectedInline,
      timeLimitMs: limits?.timeLimitMs,
      memoryLimitKb: limits?.memoryLimitKb,
    });

    if (outcome.timeMs !== null) {
      summary.timeMs = Math.max(summary.timeMs ?? 0, outcome.timeMs);
    }
    if (outcome.memoryKb !== null) {
      summary.memoryKb = Math.max(summary.memoryKb ?? 0, outcome.memoryKb);
    }

    if (outcome.verdict !== "accepted") {
      summary.verdict = outcome.verdict;
      summary.detail = outcome.detail;
      break; // first failing test decides the verdict
    }
    summary.testsPassed += 1;
  }

  return summary;
}

/**
 * Publish verdict + progress events for a judged Submit and, in Speed Race,
 * finish the match on the first accepted one (§1.2: sudden death).
 */
async function publishMatchOutcome(
  job: Job<SubmissionJobData>,
  summary: JudgeSummary,
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

console.log(
  `[worker] listening on queues '${SUBMISSIONS_QUEUE_NAME}', '${MATCH_LIFECYCLE_QUEUE_NAME}'`,
);

async function shutdown(): Promise<void> {
  console.log("[worker] shutting down…");
  await Promise.all([submissionWorker.close(), lifecycleWorker.close()]);
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
