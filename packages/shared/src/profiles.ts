import { z } from "zod";
import { GameMode, Language } from "./core.js";
import { RatingSnapshot } from "./ratings.js";

// Profile + match-history DTOs (PLAN §1.3: profiles, match history).

/** One row in a player's match history / a match list. */
export const MatchHistoryEntry = z.object({
  matchId: z.string().uuid(),
  mode: GameMode,
  language: Language.nullable(),
  ranked: z.boolean(),
  /** This player's outcome: win | loss | draw | abandon | null (in flight). */
  result: z.string().nullable(),
  opponentId: z.string().uuid().nullable(),
  opponentHandle: z.string().nullable(),
  ratingBefore: z.number().nullable(),
  ratingAfter: z.number().nullable(),
  problemSlug: z.string().nullable(),
  problemTitle: z.string().nullable(),
  endedAt: z.string().datetime().nullable(),
});
export type MatchHistoryEntry = z.infer<typeof MatchHistoryEntry>;

export const MatchHistoryResponse = z.object({
  matches: z.array(MatchHistoryEntry),
});
export type MatchHistoryResponse = z.infer<typeof MatchHistoryResponse>;

/** Win/loss/draw tally on one rating ladder. */
export const ModeRecord = z.object({
  mode: GameMode,
  language: Language.nullable(),
  wins: z.number().int(),
  losses: z.number().int(),
  draws: z.number().int(),
});
export type ModeRecord = z.infer<typeof ModeRecord>;

export const ProfileDetail = z.object({
  userId: z.string().uuid(),
  handle: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  ratings: z.array(RatingSnapshot),
  records: z.array(ModeRecord),
  recentMatches: z.array(MatchHistoryEntry),
});
export type ProfileDetail = z.infer<typeof ProfileDetail>;
