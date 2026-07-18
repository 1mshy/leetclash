import { z } from "zod";
import { Difficulty, Language } from "./core.js";

// Ranked matchmaking DTOs (PLAN §3.1 matchmaker, §1.2 same-language queues).
// The queue lives in Redis sorted sets; these shapes are the REST surface the
// web client uses to join, poll, and leave.

/** Modes queueable in Phase 2 (§9). Keep in sync with PHASE2_MODES in modes.ts. */
export const QueueMode = z.enum(["speed_race", "code_golf", "fastest_runtime"]);
export type QueueMode = z.infer<typeof QueueMode>;

export const QueueJoinRequest = z.object({
  userId: z.string().uuid(),
  mode: QueueMode,
  /**
   * The language the player will code in. For same-language modes (Fastest
   * Runtime) this is also the matchmaking partition; for cross-language modes
   * it is just their editor preference.
   */
  language: Language,
  difficulty: Difficulty.nullable().default(null),
});
export type QueueJoinRequest = z.infer<typeof QueueJoinRequest>;

export const QueueJoinResponse = z.object({
  /** "searching" once enqueued, or "matched" if an opponent was waiting. */
  status: z.enum(["searching", "matched"]),
  matchId: z.string().uuid().nullable(),
});
export type QueueJoinResponse = z.infer<typeof QueueJoinResponse>;

export const QueueLeaveRequest = z.object({
  userId: z.string().uuid(),
});
export type QueueLeaveRequest = z.infer<typeof QueueLeaveRequest>;

export const QueueStatusResponse = z.object({
  /** idle = not in any queue; searching = waiting; matched = go to matchId. */
  status: z.enum(["idle", "searching", "matched"]),
  matchId: z.string().uuid().nullable(),
  mode: QueueMode.nullable(),
  language: Language.nullable(),
  /** Seconds spent waiting (drives the widening rating band in the UI). */
  waitedSec: z.number().int().nonnegative(),
});
export type QueueStatusResponse = z.infer<typeof QueueStatusResponse>;

// ─── Matchmaking tunables (server-authoritative) ─────────────────────────────

/** Initial Glicko rating band for a fresh queue entry (±). */
export const MM_INITIAL_BAND = 100;
/** Band growth per second waited — widens until a pairing is found (§3.1). */
export const MM_BAND_GROWTH_PER_SEC = 20;
/** Hard ceiling so a lone queuer eventually matches anyone present. */
export const MM_MAX_BAND = 1000;
/** A queue entry older than this is treated as stale and dropped. */
export const MM_ENTRY_TTL_SEC = 600;
