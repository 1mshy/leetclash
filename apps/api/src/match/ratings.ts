/**
 * Glicko-2 rating application on a ranked match finish (PLAN §1.3, §5).
 *
 * Called from finishMatch() for ranked matches only. Each match is a one-game
 * rating period: both players are updated against each other on the ladder for
 * (mode, language-per-rule), their before/after ratings are stamped onto
 * match_players, and a rating_updated event is emitted for the results screen.
 *
 * Casual (private-room) matches never touch ratings.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import {
  GLICKO,
  rate1v1,
  ratingLanguageKey,
  type GameMode,
  type Language,
  type Rating,
} from "@leetclash/shared";
import { db } from "../db/client.js";
import { matchPlayers, ratings } from "../db/schema.js";
import { appendMatchEvent } from "./events.js";

async function loadLadderRating(
  userId: string,
  mode: GameMode,
  langKey: Language | null,
): Promise<Rating> {
  const [row] = await db
    .select({ rating: ratings.rating, rd: ratings.rd, volatility: ratings.volatility })
    .from(ratings)
    .where(
      and(
        eq(ratings.userId, userId),
        eq(ratings.mode, mode),
        langKey === null ? isNull(ratings.language) : eq(ratings.language, langKey),
      ),
    )
    .limit(1);
  return (
    row ?? {
      rating: GLICKO.DEFAULT_RATING,
      rd: GLICKO.DEFAULT_RD,
      volatility: GLICKO.DEFAULT_VOLATILITY,
    }
  );
}

async function upsertLadderRating(
  userId: string,
  mode: GameMode,
  langKey: Language | null,
  next: Rating,
): Promise<void> {
  await db
    .insert(ratings)
    .values({
      userId,
      mode,
      language: langKey,
      rating: next.rating,
      rd: next.rd,
      volatility: next.volatility,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      // Arbiter is the (user_id, mode, language) unique index — with NULLS NOT
      // DISTINCT the cross-language ladder (language = NULL) upserts correctly.
      target: [ratings.userId, ratings.mode, ratings.language],
      set: {
        rating: next.rating,
        rd: next.rd,
        volatility: next.volatility,
        updatedAt: new Date(),
      },
    });
}

/**
 * Apply Glicko-2 to both players of a finished ranked match.
 *
 * `winnerId` is null for a draw. Abandon is scored like a normal loss for the
 * abandoner (they forfeited), so the caller passes the opponent as winnerId.
 */
export async function applyRatingChanges(
  matchId: string,
  mode: GameMode,
  matchLanguage: Language | null,
  winnerId: string | null,
): Promise<void> {
  const players = await db
    .select({ userId: matchPlayers.userId })
    .from(matchPlayers)
    .where(eq(matchPlayers.matchId, matchId))
    .orderBy(asc(matchPlayers.joinedAt));
  if (players.length !== 2) return; // 1v1 ranked only

  const [pa, pb] = players as [{ userId: string }, { userId: string }];
  const langKey = ratingLanguageKey(mode, matchLanguage);

  const before = {
    a: await loadLadderRating(pa.userId, mode, langKey),
    b: await loadLadderRating(pb.userId, mode, langKey),
  };

  // Score from A's perspective: 1 win / 0.5 draw / 0 loss.
  const scoreA = winnerId === null ? 0.5 : winnerId === pa.userId ? 1 : 0;
  const { a: nextA, b: nextB } = rate1v1(before.a, before.b, scoreA);

  await Promise.all([
    upsertLadderRating(pa.userId, mode, langKey, nextA),
    upsertLadderRating(pb.userId, mode, langKey, nextB),
  ]);

  await Promise.all([
    stampAndEmit(matchId, mode, langKey, pa.userId, before.a, nextA),
    stampAndEmit(matchId, mode, langKey, pb.userId, before.b, nextB),
  ]);
}

async function stampAndEmit(
  matchId: string,
  mode: GameMode,
  langKey: Language | null,
  userId: string,
  before: Rating,
  after: Rating,
): Promise<void> {
  await db
    .update(matchPlayers)
    .set({ ratingBefore: before.rating, ratingAfter: after.rating })
    .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, userId)));

  await appendMatchEvent(matchId, "rating_updated", {
    userId,
    mode,
    language: langKey,
    ratingBefore: before.rating,
    ratingAfter: after.rating,
    rd: after.rd,
  });
}
