/**
 * Match event log + live state (PLAN.md §3.2).
 *
 * Every state transition is appended to the match_events table (append-only,
 * powers replay/spectate) AND published on the `match-events` Redis channel,
 * where the realtime gateway fans it out to the match's Socket.IO room. The
 * server is the only clock: the event timestamp comes from Postgres.
 *
 * The live snapshot (`match:{id}:state`) is rebuilt from Postgres after every
 * transition rather than patched in place — a few extra queries per event at
 * MVP scale buys us zero drift and free crash recovery.
 */
import { Redis } from "ioredis";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { LiveMatchState, MatchEvent } from "@leetclash/shared";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { matches, matchEvents, matchPlayers, problems, submissions, users } from "../db/schema.js";

/** Redis pub/sub channel the realtime bridge subscribes to. */
export const MATCH_EVENTS_CHANNEL = "match-events";

const STATE_KEY = (matchId: string): string => `match:${matchId}:state`;
const STATE_TTL_SEC = 24 * 60 * 60;

/** Plain connection for publish + state writes (BullMQ owns its own). */
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
redis.on("error", (err) => console.error("[match-events] redis error:", err.message));

type EventPayload<T extends MatchEvent["type"]> = Extract<MatchEvent, { type: T }>["payload"];

/**
 * Append one event to the match log and broadcast it.
 *
 * seq is MAX(seq)+1 scoped to the match; the unique index on (match_id, seq)
 * turns concurrent appends into a retriable conflict instead of a gap.
 */
export async function appendMatchEvent<T extends MatchEvent["type"]>(
  matchId: string,
  type: T,
  payload: EventPayload<T>,
): Promise<MatchEvent> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [row] = await db
        .insert(matchEvents)
        .values({
          matchId,
          seq: sql`(SELECT COALESCE(MAX(seq) + 1, 0) FROM match_events WHERE match_id = ${matchId})`,
          type,
          payload: payload as Record<string, unknown>,
        })
        .returning({ seq: matchEvents.seq, at: matchEvents.at });
      if (!row) throw new Error("insert returned no row");

      // Validate before publishing — the bridge re-validates and silently
      // drops anything malformed, so failing loudly here is the kind option.
      const event = MatchEvent.parse({
        matchId,
        seq: row.seq,
        at: row.at.toISOString(),
        type,
        payload,
      });

      await redis.publish(MATCH_EVENTS_CHANNEL, JSON.stringify(event));
      return event;
    } catch (err) {
      lastError = err;
      // 23505 = unique_violation on (match_id, seq): another writer won; retry.
      if ((err as { code?: string }).code !== "23505") throw err;
    }
  }
  throw lastError;
}

/** Rebuild `match:{id}:state` from Postgres and write it to Redis. */
export async function refreshMatchState(matchId: string): Promise<LiveMatchState | null> {
  const [match] = await db
    .select({
      id: matches.id,
      status: matches.status,
      config: matches.config,
      startedAt: matches.startedAt,
      winnerId: matches.winnerId,
      problemSlug: problems.slug,
    })
    .from(matches)
    .leftJoin(problems, eq(matches.problemId, problems.id))
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match) return null;

  const players = await db
    .select({ userId: matchPlayers.userId, handle: users.handle })
    .from(matchPlayers)
    .innerJoin(users, eq(matchPlayers.userId, users.id))
    .where(eq(matchPlayers.matchId, matchId))
    .orderBy(asc(matchPlayers.joinedAt));

  // Per-player progress from submit-kind submissions (Run never counts).
  const subs = await db
    .select({
      userId: submissions.userId,
      verdict: submissions.verdict,
      testsPassed: submissions.testsPassed,
      testsTotal: submissions.testsTotal,
    })
    .from(submissions)
    .where(and(eq(submissions.matchId, matchId), eq(submissions.kind, "submit")))
    .orderBy(desc(submissions.createdAt));

  const timeLimitSec = Number((match.config as { timeLimitSec?: number }).timeLimitSec ?? 1800);
  const countdown = await readCountdownEndsAt(matchId);

  const state = LiveMatchState.parse({
    matchId,
    status: match.status,
    countdownEndsAt: match.status === "countdown" ? countdown : null,
    endsAt: match.startedAt ? match.startedAt.getTime() + timeLimitSec * 1000 : null,
    problemSlug: match.problemSlug ?? null,
    players: players.map((p) => {
      const mine = subs.filter((s) => s.userId === p.userId);
      const last = mine[0];
      return {
        userId: p.userId,
        handle: p.handle,
        testsPassed: last?.testsPassed ?? 0,
        testsTotal: last?.testsTotal ?? 0,
        submissionCount: mine.length,
        lastVerdict: last?.verdict ?? null,
      };
    }),
    winnerId: match.winnerId,
  });

  await redis.set(STATE_KEY(matchId), JSON.stringify(state), "EX", STATE_TTL_SEC);
  return state;
}

// The countdown deadline is the one piece of state not derivable from
// Postgres (no column for it) — stash it under its own key at countdown start.
const COUNTDOWN_KEY = (matchId: string): string => `match:${matchId}:countdownEndsAt`;

export async function storeCountdownEndsAt(matchId: string, endsAt: number): Promise<void> {
  await redis.set(COUNTDOWN_KEY(matchId), String(endsAt), "EX", 300);
}

async function readCountdownEndsAt(matchId: string): Promise<number | null> {
  const raw = await redis.get(COUNTDOWN_KEY(matchId));
  return raw === null ? null : Number(raw);
}
