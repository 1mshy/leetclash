import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { SubmissionRequest } from "@leetclash/shared";
import { config } from "../config.js";

export const SUBMISSIONS_QUEUE_NAME = "submissions";

/** Payload carried by each job: the persisted submission row + the request. */
export interface SubmissionJobData {
  submissionId: string;
  /** Submitting player — the worker publishes verdict/progress events for them. */
  userId: string;
  request: SubmissionRequest;
}

/** BullMQ requires maxRetriesPerRequest: null on its connections. */
export function createRedisConnection(): Redis {
  return new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
}

export const submissionsQueue = new Queue<SubmissionJobData>(SUBMISSIONS_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

/** Enqueue a submission for judging. Caller persists the row first. */
export async function enqueueSubmission(
  submissionId: string,
  userId: string,
  request: SubmissionRequest,
): Promise<void> {
  await submissionsQueue.add("judge", { submissionId, userId, request });
}
