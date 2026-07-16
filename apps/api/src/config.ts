import { z } from "zod";

/**
 * Zod-validated environment config. Fails fast on boot with a readable error.
 * Defaults target local docker-compose dev; production must set everything.
 */
const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgres://leetclash:leetclash@localhost:5432/leetclash"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  JUDGE0_URL: z.string().min(1).default("http://localhost:2358"),
  /**
   * Minimum memory_limit (KB) sent to Judge0. Dev-only escape hatch: on Apple
   * Silicon the amd64 Judge0 image runs under Rosetta, whose translation layer
   * needs far more address space than the per-problem limits allow — anything
   * under ~512 MB dies with "rosetta error: mmap failed". 0 = respect problem
   * limits exactly (production).
   */
  JUDGE0_MEMORY_FLOOR_KB: z.coerce.number().int().nonnegative().default(0),
  API_PORT: z.coerce.number().int().positive().default(4000),
  AUTH_SECRET: z.string().min(1).default("dev-only-secret-change-me"),
  WEB_URL: z.string().min(1).default("http://localhost:3000"),
  // OAuth — empty is fine in dev; the providers just won't complete a flow.
  GITHUB_CLIENT_ID: z.string().default(""),
  GITHUB_CLIENT_SECRET: z.string().default(""),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config: Env = parsed.data;
