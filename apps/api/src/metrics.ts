/**
 * Observability + judge autoscaling signal (PLAN §9 Phase 3).
 *
 * One Prometheus registry shared by the api server (/metrics route) and the
 * worker (its own metrics port). Queue depths are collected lazily on scrape;
 * the worker's autoscale tick turns them into a desired judge replica count,
 * published both as a gauge and a Redis key that
 * infra/scripts/judge-autoscale.sh applies via `docker compose --scale`.
 */
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { collectDefaultMetrics, Gauge, Histogram, Registry } from "prom-client";
import { Language, judgeQueueName } from "@leetclash/shared";
import { config } from "./config.js";
import { MATCH_LIFECYCLE_QUEUE_NAME } from "./match/engine.js";
import { createRedisConnection, SUBMISSIONS_QUEUE_NAME } from "./queue/submissions.js";

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

/** Redis key the compose autoscaler polls (infra/scripts/judge-autoscale.sh). */
export const AUTOSCALE_KEY = "judge:autoscale:desired";

// Autoscale tuning: replicas = clamp(ceil(waiting / TARGET), MIN, MAX).
const TARGET_WAITING_PER_WORKER = 4;
const MIN_JUDGE_WORKERS = 1;
const MAX_JUDGE_WORKERS = 8;

// ─── Queue depth gauges ──────────────────────────────────────────────────────

const observedQueues = new Map<string, Queue>();

function trackQueue(name: string): void {
  if (!observedQueues.has(name)) {
    observedQueues.set(name, new Queue(name, { connection: createRedisConnection() }));
  }
}

trackQueue(SUBMISSIONS_QUEUE_NAME);
trackQueue(MATCH_LIFECYCLE_QUEUE_NAME);
for (const language of Language.options) trackQueue(judgeQueueName(language));

const queueDepth = new Gauge({
  name: "leetclash_queue_jobs",
  help: "BullMQ job counts by queue and state",
  labelNames: ["queue", "state"],
  registers: [registry],
  async collect() {
    await Promise.all(
      [...observedQueues.entries()].map(async ([name, q]) => {
        try {
          const counts = await q.getJobCounts("waiting", "active", "delayed");
          this.set({ queue: name, state: "waiting" }, counts["waiting"] ?? 0);
          this.set({ queue: name, state: "active" }, counts["active"] ?? 0);
          this.set({ queue: name, state: "delayed" }, counts["delayed"] ?? 0);
        } catch {
          /* scrape must never fail on a queue hiccup */
        }
      }),
    );
  },
});

// ─── Worker-side instruments ─────────────────────────────────────────────────

export const judgingDuration = new Histogram({
  name: "leetclash_judging_duration_seconds",
  help: "Wall time from submission job pickup to verdict persisted",
  labelNames: ["kind", "verdict"],
  buckets: [0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers: [registry],
});

const desiredJudgeWorkers = new Gauge({
  name: "leetclash_judge_desired_workers",
  help: "Judge replicas the autoscaler wants (queue-depth driven, §9)",
  registers: [registry],
});

// ─── Autoscale tick (runs in the worker) ─────────────────────────────────────

const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
redis.on("error", (err) => console.error("[metrics] redis error:", err.message));

let lastDesired = -1;

/**
 * Judge load = waiting submissions + waiting exec batches across every
 * language queue (whichever backend is active, the pressure shows up in one
 * of them). Publishes the desired replica count for the compose scaler.
 */
export async function judgeAutoscaleTick(): Promise<number> {
  let waiting = 0;
  for (const [name, q] of observedQueues) {
    if (name === MATCH_LIFECYCLE_QUEUE_NAME) continue; // lifecycle ≠ judge load
    try {
      const counts = await q.getJobCounts("waiting");
      waiting += counts["waiting"] ?? 0;
    } catch {
      /* transient — next tick recovers */
    }
  }

  const desired = Math.min(
    MAX_JUDGE_WORKERS,
    Math.max(MIN_JUDGE_WORKERS, Math.ceil(waiting / TARGET_WAITING_PER_WORKER)),
  );
  desiredJudgeWorkers.set(desired);
  await redis.set(AUTOSCALE_KEY, String(desired), "EX", 120);

  if (desired !== lastDesired) {
    console.log(`[metrics] judge autoscale: waiting=${waiting} → desired workers=${desired}`);
    lastDesired = desired;
  }
  return desired;
}

export async function closeMetrics(): Promise<void> {
  redis.disconnect();
  await Promise.all([...observedQueues.values()].map((q) => q.close()));
}

// Referenced so the collect() closure stays alive under isolatedModules.
void queueDepth;
