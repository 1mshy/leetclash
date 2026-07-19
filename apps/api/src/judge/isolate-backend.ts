/**
 * Isolate execution backend (PLAN §4.1 Phase 3): request/reply over BullMQ to
 * the custom judge workers in apps/judge. One job = one full suite pass
 * (compile once, run every planned case, seeded generation done worker-side).
 *
 * Queues are per-language (judge-exec-<lang>) so language pools scale — and
 * autoscale on queue depth (§9) — independently. The judge nodes never see
 * Postgres or MinIO credentials: the request carries everything (§4.2).
 */
import { Queue, QueueEvents } from "bullmq";
import {
  ExecBatchResult,
  JUDGE_EXEC_JOB,
  judgeQueueName,
  type ExecBatchRequest,
  type Language,
} from "@leetclash/shared";
import { config } from "../config.js";
import { createRedisConnection } from "../queue/submissions.js";

interface LanguageChannel {
  queue: Queue<ExecBatchRequest>;
  events: QueueEvents;
}

const channels = new Map<Language, LanguageChannel>();

function channelFor(language: Language): LanguageChannel {
  let ch = channels.get(language);
  if (!ch) {
    const name = judgeQueueName(language);
    ch = {
      queue: new Queue<ExecBatchRequest>(name, {
        connection: createRedisConnection(),
        defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 1000 },
      }),
      // QueueEvents needs its own blocking connection (BullMQ requirement).
      events: new QueueEvents(name, { connection: createRedisConnection() }),
    };
    channels.set(language, ch);
  }
  return ch;
}

function internalError(detail: string): ExecBatchResult {
  return {
    verdict: "internal_error",
    testsPassed: 0,
    testsTotal: 0,
    timeMs: null,
    sumMs: 0,
    memoryKb: null,
    tierReached: null,
    tiers: [],
    detail,
    sampleSumMs: null,
    samplePeakKb: null,
  };
}

export async function executeOnIsolate(req: ExecBatchRequest): Promise<ExecBatchResult> {
  const { queue, events } = channelFor(req.language);
  const job = await queue.add(JUDGE_EXEC_JOB, req);
  try {
    const raw: unknown = await job.waitUntilFinished(events, config.JUDGE_EXEC_TIMEOUT_MS);
    return ExecBatchResult.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[isolate-backend] exec ${req.execId} failed:`, message);
    return internalError(`isolate judge failed: ${message}`.slice(0, 4000));
  }
}

export async function closeIsolateBackend(): Promise<void> {
  await Promise.all(
    [...channels.values()].flatMap((ch) => [ch.queue.close(), ch.events.close()]),
  );
  channels.clear();
}
