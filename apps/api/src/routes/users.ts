import { randomUUID } from "node:crypto";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  ratingLanguageKey,
  type Language,
  type MatchHistoryEntry,
  type ModeRecord,
  type ProfileDetail,
  type RatingSnapshot,
} from "@leetclash/shared";
import { db } from "../db/client.js";
import { matchPlayers, matches, problems, ratings, users } from "../db/schema.js";

const HandleParams = z.object({ handle: z.string().min(1).max(64) });
const IdParams = z.object({ id: z.string().uuid() });

/**
 * User identity + public profiles (PLAN §1.3).
 *
 * Guest identity is the Phase 0 stand-in for auth; profiles/history/ratings
 * work on guest users too, so they're live now. TODO(auth): once better-auth
 * sessions land, `POST /users/guest` becomes a fallback and profiles key off
 * the session user.
 */
export const userRoutes: FastifyPluginAsync = async (app) => {
  /** Create an anonymous guest user; returns GuestUser from @leetclash/shared. */
  app.post("/users/guest", async (_request, reply) => {
    const handle = `guest-${randomUUID().slice(0, 8)}`;
    const [user] = await db
      .insert(users)
      .values({ handle, email: `${handle}@guest.invalid` })
      .returning({ id: users.id, handle: users.handle });

    if (!user) {
      return reply.status(500).send({ error: "failed to create guest user" });
    }
    return reply.status(201).send(user);
  });

  /** Public profile by handle: ratings per ladder, W/L/D records, recent matches. */
  app.get("/users/:handle", async (request, reply) => {
    const params = HandleParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "invalid handle" });

    const [user] = await db
      .select({
        id: users.id,
        handle: users.handle,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.handle, params.data.handle))
      .limit(1);
    if (!user) return reply.status(404).send({ error: "user not found" });

    const ladders = await loadLadderRecords(user.id);
    const ratingRows = await db
      .select({
        mode: ratings.mode,
        language: ratings.language,
        rating: ratings.rating,
        rd: ratings.rd,
        volatility: ratings.volatility,
        updatedAt: ratings.updatedAt,
      })
      .from(ratings)
      .where(eq(ratings.userId, user.id));

    const ratingSnapshots: RatingSnapshot[] = ratingRows.map((r) => ({
      mode: r.mode,
      language: r.language,
      rating: r.rating,
      rd: r.rd,
      volatility: r.volatility,
      games: ladders.get(ladderKey(r.mode, r.language))?.games ?? 0,
      updatedAt: r.updatedAt?.toISOString() ?? null,
    }));

    const records: ModeRecord[] = [...ladders.values()].map((l) => ({
      mode: l.mode,
      language: l.language,
      wins: l.wins,
      losses: l.losses,
      draws: l.draws,
    }));

    const profile: ProfileDetail = {
      userId: user.id,
      handle: user.handle,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
      ratings: ratingSnapshots,
      records,
      recentMatches: await loadHistory(user.id, 10),
    };
    return profile;
  });

  /** Full match history for a user id. */
  app.get("/users/:id/matches", async (request, reply) => {
    const params = IdParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "invalid user id" });
    return { matches: await loadHistory(params.data.id, 50) };
  });
};

interface Ladder {
  mode: RatingSnapshot["mode"];
  language: Language | null;
  wins: number;
  losses: number;
  draws: number;
  games: number;
}

const ladderKey = (mode: string, language: Language | null): string =>
  `${mode}:${language ?? "all"}`;

/**
 * W/L/D records grouped by rating ladder. Match rows carry a raw language, so
 * we fold them onto the ladder key (cross-language modes collapse to null).
 */
async function loadLadderRecords(userId: string): Promise<Map<string, Ladder>> {
  const rows = await db
    .select({
      mode: matches.mode,
      language: matches.language,
      wins: sql<number>`count(*) filter (where ${matchPlayers.result} = 'win')`.mapWith(Number),
      losses:
        sql<number>`count(*) filter (where ${matchPlayers.result} in ('loss','abandon'))`.mapWith(
          Number,
        ),
      draws: sql<number>`count(*) filter (where ${matchPlayers.result} = 'draw')`.mapWith(Number),
      games: sql<number>`count(*) filter (where ${matchPlayers.result} is not null)`.mapWith(
        Number,
      ),
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(
      and(
        eq(matchPlayers.userId, userId),
        eq(matches.status, "finished"),
        sql`(${matches.config} ->> 'ranked')::boolean = true`,
      ),
    )
    .groupBy(matches.mode, matches.language);

  const ladders = new Map<string, Ladder>();
  for (const r of rows) {
    const langKey = ratingLanguageKey(r.mode, r.language);
    const key = ladderKey(r.mode, langKey);
    const existing = ladders.get(key);
    if (existing) {
      existing.wins += r.wins;
      existing.losses += r.losses;
      existing.draws += r.draws;
      existing.games += r.games;
    } else {
      ladders.set(key, {
        mode: r.mode,
        language: langKey,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        games: r.games,
      });
    }
  }
  return ladders;
}

/** Recent matches for a user with opponent + rating deltas + problem. */
async function loadHistory(userId: string, limit: number): Promise<MatchHistoryEntry[]> {
  const opp = alias(matchPlayers, "opp");
  const oppUser = alias(users, "opp_user");

  const rows = await db
    .select({
      matchId: matches.id,
      mode: matches.mode,
      language: matches.language,
      config: matches.config,
      result: matchPlayers.result,
      ratingBefore: matchPlayers.ratingBefore,
      ratingAfter: matchPlayers.ratingAfter,
      endedAt: matches.endedAt,
      problemSlug: problems.slug,
      problemTitle: problems.title,
      opponentId: opp.userId,
      opponentHandle: oppUser.handle,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .leftJoin(problems, eq(problems.id, matches.problemId))
    .leftJoin(opp, and(eq(opp.matchId, matches.id), ne(opp.userId, userId)))
    .leftJoin(oppUser, eq(oppUser.id, opp.userId))
    .where(eq(matchPlayers.userId, userId))
    .orderBy(desc(matches.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    matchId: r.matchId,
    mode: r.mode,
    language: r.language,
    ranked: (r.config as { ranked?: boolean }).ranked === true,
    result: r.result,
    opponentId: r.opponentId ?? null,
    opponentHandle: r.opponentHandle ?? null,
    ratingBefore: r.ratingBefore,
    ratingAfter: r.ratingAfter,
    problemSlug: r.problemSlug ?? null,
    problemTitle: r.problemTitle ?? null,
    endedAt: r.endedAt?.toISOString() ?? null,
  }));
}
