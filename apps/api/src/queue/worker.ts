/**
 * Submission judging worker — separate entry point (`pnpm dev:worker`).
 *
 * Pulls jobs from the 'submissions' queue, runs the source against the
 * problem's test cases via Judge0, and persists verdict/time/memory on the
 * submissions row.
 */
import { Worker } from "bullmq";
import type { Job } from "bullmq";
import { and, asc, eq } from "drizzle-orm";
import type { Verdict } from "@leetclash/shared";
import { closeDb, db } from "../db/client.js";
import { submissions, testCases } from "../db/schema.js";
import { judgeWithJudge0 } from "../judge0.js";
import {
  createRedisConnection,
  SUBMISSIONS_QUEUE_NAME,
  type SubmissionJobData,
} from "./submissions.js";

async function processSubmission(job: Job<SubmissionJobData>): Promise<void> {
  const { submissionId, request } = job.data;

  await db
    .update(submissions)
    .set({ status: "running" })
    .where(eq(submissions.id, submissionId));

  // Run uses public samples only; Submit uses the full suite.
  const filters = [eq(testCases.problemId, request.problemId)];
  if (request.kind === "run") filters.push(eq(testCases.isPublic, true));

  const cases = await db
    .select()
    .from(testCases)
    .where(and(...filters))
    .orderBy(asc(testCases.tier), asc(testCases.ordinal));

  let verdict: Verdict = "accepted";
  let worstTimeMs: number | null = null;
  let worstMemoryKb: number | null = null;
  let detail: string | null = null;

  for (const tc of cases) {
    // MVP: inline test data only. TODO(phase2): fetch input_uri/expected_uri
    // from MinIO for large cases.
    if (tc.inputInline === null || tc.expectedInline === null) {
      verdict = "internal_error";
      detail = `test case ${tc.ordinal} has no inline data (MinIO fetch not implemented)`;
      break;
    }

    // TODO(phase2): apply per-language limit overrides from problems.limits.
    const outcome = await judgeWithJudge0({
      language: request.language,
      source: request.source,
      stdin: tc.inputInline,
      expectedOutput: tc.expectedInline,
    });

    if (outcome.timeMs !== null) worstTimeMs = Math.max(worstTimeMs ?? 0, outcome.timeMs);
    if (outcome.memoryKb !== null)
      worstMemoryKb = Math.max(worstMemoryKb ?? 0, outcome.memoryKb);

    if (outcome.verdict !== "accepted") {
      verdict = outcome.verdict;
      detail = outcome.detail;
      break; // first failing test decides the verdict
    }
  }

  await db
    .update(submissions)
    .set({
      status: "done",
      verdict,
      timeMs: worstTimeMs,
      memoryKb: worstMemoryKb,
    })
    .where(eq(submissions.id, submissionId));

  // TODO(phase1): publish a VerdictEvent + ProgressEvent on Redis pub/sub so
  // the realtime service pushes it to both players, and append the
  // corresponding match_events rows for the match state machine.
  console.log(`[worker] submission ${submissionId} → ${verdict}`, { detail });
}

const worker = new Worker<SubmissionJobData>(SUBMISSIONS_QUEUE_NAME, processSubmission, {
  connection: createRedisConnection(),
  concurrency: 4,
});

worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});

console.log(`[worker] listening on queue '${SUBMISSIONS_QUEUE_NAME}'`);

async function shutdown(): Promise<void> {
  console.log("[worker] shutting down…");
  await worker.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
