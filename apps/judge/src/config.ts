import { z } from "zod";
import { Language } from "@leetclash/shared";

/**
 * Zod-validated environment config for the isolate judge worker (PLAN §4).
 * Runs inside the judge container (Linux, privileged, cgroup v2) — the only
 * external dependency is Redis; no Postgres, no MinIO, no secrets (§4.2).
 */
const EnvSchema = z.object({
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  /**
   * Languages this worker serves — one BullMQ worker per judge-exec-<lang>
   * queue. Production runs one container per language (§7); dev runs one
   * container with the whole launch set.
   */
  JUDGE_LANGUAGES: z.string().min(1).default("python,cpp"),
  /** Pre-warmed sandbox pool size (= max concurrent runs on this node). */
  JUDGE_POOL_SIZE: z.coerce.number().int().positive().max(64).default(4),
  /**
   * cgroup accounting: "on" fails hard when isolate --cg is unavailable,
   * "off" skips it (memory via max-rss — dev fallback), "auto" probes at boot.
   * Memory Golf verdicts need "on" (cgroup memory.peak, §4.4).
   */
  JUDGE_CGROUPS: z.enum(["auto", "on", "off"]).default("auto"),
  /** Disk cache for materialized seeded cases (input/expected pairs). */
  JUDGE_CACHE_DIR: z.string().min(1).default("/var/cache/leetclash-judge"),
  /** Prometheus metrics + health port (0 = disabled). */
  JUDGE_METRICS_PORT: z.coerce.number().int().nonnegative().default(4200),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid judge environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export const languages: Language[] = config.JUDGE_LANGUAGES.split(",")
  .map((s) => Language.parse(s.trim()))
  .filter((v, i, a) => a.indexOf(v) === i);
