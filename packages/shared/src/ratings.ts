import { z } from "zod";
import { GameMode, Language } from "./core.js";

// Rating + leaderboard DTOs (PLAN §1.3, §5 `ratings`). Glicko-2 numbers are
// computed server-side (see @leetclash/shared glicko.ts) and surfaced here.

export const RatingSnapshot = z.object({
  mode: GameMode,
  /** null = the mode's shared cross-language ladder. */
  language: Language.nullable(),
  rating: z.number(),
  rd: z.number(),
  volatility: z.number(),
  /** Games played on this ladder (wins + losses + draws). */
  games: z.number().int(),
  updatedAt: z.string().datetime().nullable(),
});
export type RatingSnapshot = z.infer<typeof RatingSnapshot>;

export const LeaderboardEntry = z.object({
  rank: z.number().int().positive(),
  userId: z.string().uuid(),
  handle: z.string(),
  rating: z.number(),
  rd: z.number(),
  games: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntry>;

export const LeaderboardResponse = z.object({
  mode: GameMode,
  language: Language.nullable(),
  entries: z.array(LeaderboardEntry),
});
export type LeaderboardResponse = z.infer<typeof LeaderboardResponse>;

/**
 * Provisional until a player has faced enough opponents for their RD to
 * settle; leaderboards hide provisional players by default (§1.3). Mirrors the
 * common Glicko convention of RD < 100 ≈ "established".
 */
export const ESTABLISHED_RD_THRESHOLD = 100;
