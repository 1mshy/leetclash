import { z } from "zod";

const EnvSchema = z.object({
  /** Redis connection string, e.g. redis://localhost:6379 */
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  /** Port the Socket.IO gateway listens on. */
  REALTIME_PORT: z.coerce.number().int().positive().default(4001),
  /** Origin of the Next.js app — the only allowed CORS origin. */
  WEB_URL: z.string().url().default("http://localhost:3000"),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    console.error("[realtime] invalid environment:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
