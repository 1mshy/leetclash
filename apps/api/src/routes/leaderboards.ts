import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  ESTABLISHED_RD_THRESHOLD,
  GameMode,
  Language,
  ratingLanguageKey,
  type LeaderboardEntry,
  type LeaderboardResponse,
} from "@leetclash/shared";
import { db } from "../db/client.js";
import { matchPlayers, matches, ratings, users } from "../db/schema.js";

const LeaderboardQuery = z.object({
  mode: GameMode,
  language: Language.optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
  /** Provisional players (RD above the threshold) are hidden unless asked for. */
  includeProvisional: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

/**
 * Per-mode leaderboards (PLAN §1.3). Postgres `ratings` is the source of truth
 * (§5: Redis ZSETs are a rebuildable cache, not needed at this scale). The
 * ladder is (mode, language-per-rule): same-language modes rank per language,
 * everyone else shares one board.
 */
export const leaderboardRoutes: FastifyPluginAsync = async (app) => {
  app.get("/leaderboards", async (request, reply) => {
    const query = LeaderboardQuery.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: query.error.flatten().fieldErrors });
    }
    const { mode, language, limit, includeProvisional } = query.data;
    const langKey = ratingLanguageKey(mode, language ?? null);

    const rows = await db
      .select({
        userId: ratings.userId,
        handle: users.handle,
        rating: ratings.rating,
        rd: ratings.rd,
      })
      .from(ratings)
      .innerJoin(users, eq(users.id, ratings.userId))
      .where(
        and(
          eq(ratings.mode, mode),
          langKey === null ? isNull(ratings.language) : eq(ratings.language, langKey),
          // §1.3: provisional players stay off the board until their RD settles.
          includeProvisional ? undefined : lte(ratings.rd, ESTABLISHED_RD_THRESHOLD),
        ),
      )
      .orderBy(desc(ratings.rating))
      .limit(limit);

    // Win/loss tallies on the same ladder (same-language modes filter by
    // language; cross-language ladders pool all languages for the mode).
    const records = await db
      .select({
        userId: matchPlayers.userId,
        wins: sql<number>`count(*) filter (where ${matchPlayers.result} = 'win')`.mapWith(Number),
        losses:
          sql<number>`count(*) filter (where ${matchPlayers.result} in ('loss','abandon'))`.mapWith(
            Number,
          ),
        games: sql<number>`count(*)`.mapWith(Number),
      })
      .from(matchPlayers)
      .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
      .where(
        and(
          eq(matches.mode, mode),
          eq(matches.status, "finished"),
          sql`(${matches.config} ->> 'ranked')::boolean = true`,
          langKey === null ? undefined : eq(matches.language, langKey),
        ),
      )
      .groupBy(matchPlayers.userId);

    const byUser = new Map(records.map((r) => [r.userId, r]));
    const entries: LeaderboardEntry[] = rows.map((row, i) => {
      const rec = byUser.get(row.userId);
      return {
        rank: i + 1,
        userId: row.userId,
        handle: row.handle,
        rating: Math.round(row.rating),
        rd: Math.round(row.rd),
        games: rec?.games ?? 0,
        wins: rec?.wins ?? 0,
        losses: rec?.losses ?? 0,
      };
    });

    const res: LeaderboardResponse = { mode, language: langKey, entries };
    return res;
  });
};
