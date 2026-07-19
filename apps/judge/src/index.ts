/**
 * Isolate judge worker (PLAN §4.1 Phase 3) — consumes judge-exec-<language>
 * queues and executes submissions in pre-warmed isolate sandboxes.
 *
 * Boot sequence: probe cgroup support (Memory Golf needs it), warm the box
 * pools, then start one BullMQ worker per served language. Prometheus metrics
 * on JUDGE_METRICS_PORT feed the queue-depth autoscaler (§9 Phase 3).
 */
import { createServer } from "node:http";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";
import { ExecBatchRequest, judgeQueueName } from "@leetclash/shared";
import { config, languages } from "./config.js";
import { memoryMeasurementMode, processBatch } from "./exec.js";
import { ensureCacheDir } from "./generate.js";
import { probeCgroups, setCgroups } from "./isolate.js";
import { BoxPool } from "./pool.js";

// ─── cgroups (Memory Golf accuracy hinges on this, §4.4) ─────────────────────

const PROBE_BOX_ID = 999;
if (config.JUDGE_CGROUPS === "off") {
  setCgroups(false);
} else {
  const ok = await probeCgroups(PROBE_BOX_ID);
  if (!ok && config.JUDGE_CGROUPS === "on") {
    console.error("[judge] JUDGE_CGROUPS=on but isolate --cg failed — check cgroup v2 delegation");
    process.exit(1);
  }
  if (!ok) {
    console.warn(
      "[judge] cgroups unavailable — falling back to max-rss memory accounting " +
        "(Memory Golf verdicts will be approximate)",
    );
  }
}
console.log(`[judge] memory measurement: ${memoryMeasurementMode()}`);

// ─── Pools ───────────────────────────────────────────────────────────────────

await ensureCacheDir();

// Player boxes 0..N-1; generation boxes in the 900s so the two can never mix.
const pool = new BoxPool([...Array(config.JUDGE_POOL_SIZE).keys()]);
const genPool = new BoxPool([900, 901]);
await pool.warm();
await genPool.warm();
console.log(`[judge] pre-warmed ${config.JUDGE_POOL_SIZE} player boxes + 2 generation boxes`);

// ─── Metrics ─────────────────────────────────────────────────────────────────

const registry = new Registry();
collectDefaultMetrics({ register: registry });

const execCounter = new Counter({
  name: "judge_exec_total",
  help: "Exec batches processed",
  labelNames: ["language", "verdict"],
  registers: [registry],
});
const execDuration = new Histogram({
  name: "judge_exec_duration_seconds",
  help: "Wall time per exec batch",
  labelNames: ["language"],
  buckets: [0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers: [registry],
});
new Gauge({
  name: "judge_pool_free_boxes",
  help: "Pre-warmed boxes currently free",
  registers: [registry],
  collect() {
    this.set(pool.freeCount());
  },
});

// ─── Workers (one queue per served language, §7) ─────────────────────────────

const connection = () => new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

const workers = languages.map(
  (language) =>
    new Worker(
      judgeQueueName(language),
      async (job) => {
        const req = ExecBatchRequest.parse(job.data);
        const stop = execDuration.startTimer({ language });
        try {
          const result = await processBatch(req, pool, genPool);
          execCounter.inc({ language, verdict: result.verdict });
          return result;
        } finally {
          stop();
        }
      },
      { connection: connection(), concurrency: config.JUDGE_POOL_SIZE },
    ),
);

for (const w of workers) {
  w.on("failed", (job, err) =>
    console.error(`[judge] job ${job?.id} on ${w.name} failed:`, err.message),
  );
}

console.log(
  `[judge] serving ${languages.join(", ")} (pool=${config.JUDGE_POOL_SIZE}, cg=${memoryMeasurementMode()})`,
);

// ─── Health + metrics endpoint ───────────────────────────────────────────────

const server =
  config.JUDGE_METRICS_PORT > 0
    ? createServer((req, res) => {
        if (req.url === "/healthz") {
          res.writeHead(200, { "content-type": "text/plain" }).end("ok");
          return;
        }
        if (req.url === "/metrics") {
          void registry.metrics().then((body) => {
            res.writeHead(200, { "content-type": registry.contentType }).end(body);
          });
          return;
        }
        res.writeHead(404).end();
      }).listen(config.JUDGE_METRICS_PORT, () =>
        console.log(`[judge] metrics on :${config.JUDGE_METRICS_PORT}/metrics`),
      )
    : null;

// ─── Graceful shutdown ───────────────────────────────────────────────────────

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[judge] ${signal} received, shutting down…`);
  await Promise.all(workers.map((w) => w.close()));
  await pool.close();
  await genPool.close();
  server?.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
