import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config.js";
import * as schema from "./schema.js";

/** postgres.js connection pool. */
export const sql = postgres(config.DATABASE_URL, {
  max: 10,
  // Fail fast in dev instead of hanging when Postgres isn't up.
  connect_timeout: 10,
});

export const db = drizzle(sql, { schema });

export type Db = typeof db;

/** Close the pool on shutdown (called from src/index.ts). */
export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
