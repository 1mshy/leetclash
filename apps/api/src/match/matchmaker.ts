/**
 * Ranked matchmaker (PLAN §3.1, §1.2).
 *
 * A player joins a Redis ZSET queue keyed by (mode, language-per-rule); the
 * score is their enqueue time. A lock-guarded tick pairs the two closest-rated
 * waiting players whose Glicko bands overlap, widening each band the longer a
 * player waits so a lone queuer eventually matches anyone present.
 *
 * The tick runs both on the worker's interval (the durable safety net for lone
 * waiters whose band grows over time) AND inline right after a join (snappy
 * pairing when an opponent is already waiting). Both paths take the same Redis
 * lock, so a player is never double-paired. Pairing itself is atomic: we ZREM
 * both members and only create the match if both removals succeeded, so a
 * concurrent leave can't strand a half-formed match.
 */
import { Redis } from "ioredis";
import { and, eq, isNull } from "drizzle-orm";
import {
  MM_BAND_GROWTH_PER_SEC,
  MM_ENTRY_TTL_SEC,
  MM_INITIAL_BAND,
  MM_MAX_BAND,
  MODE_SPECS,
  USER_EVENTS_CHANNEL,
  UserEvent,
  isSameLanguageMode,
  queueKey,
  ratingLanguageKey,
  type GameMode,
  type Language,
  type Difficulty,
} from "@leetclash/shared";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { matches, matchPlayers, ratings } from "../db/schema.js";
import { enqueueMatchStart } from "./engine.js";

/** Plain Redis connection for queue ops + pub/sub publish. */
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
redis.on("error", (err) => console.error("[matchmaker] redis error:", err.message));

// ─── Redis key layout ────────────────────────────────────────────────────────
const QUEUES_SET = "mm:queues"; // set of active queue keys
const playerKey = (userId: string): string => `mm:player:${userId}`;
const matchedKey = (userId: string): string => `mm:matched:${userId}`;
const LOCK_KEY = "mm:lock";
const LOCK_TTL_MS = 3000;
const MATCHED_TTL_SEC = 120;

interface PlayerEntry {
  userId: string;
  mode: GameMode;
  language: Language;
  difficulty: Difficulty | null;
  queueKey: string;
  enqueuedAt: number;
  rating: number;
  rd: number;
}

/** Widening acceptance band (± rating points) as a function of wait time. */
function bandFor(waitSec: number): number {
  return Math.min(MM_INITIAL_BAND + MM_BAND_GROWTH_PER_SEC * waitSec, MM_MAX_BAND);
}

/** Look up a player's rating on the ladder they're queueing into (default 1500/350). */
async function loadRating(
  userId: string,
  mode: GameMode,
  language: Language,
): Promise<{ rating: number; rd: number }> {
  const langKey = ratingLanguageKey(mode, language);
  const [row] = await db
    .select({ rating: ratings.rating, rd: ratings.rd })
    .from(ratings)
    .where(
      and(
        eq(ratings.userId, userId),
        eq(ratings.mode, mode),
        langKey === null ? isNull(ratings.language) : eq(ratings.language, langKey),
      ),
    )
    .limit(1);
  return row ?? { rating: 1500, rd: 350 };
}

/**
 * Add a player to a ranked queue. Idempotent: any prior queue entry for this
 * user is removed first (a player is only ever in one queue). Returns the
 * queue key they landed in.
 */
export async function enqueuePlayer(params: {
  userId: string;
  mode: GameMode;
  language: Language;
  difficulty: Difficulty | null;
}): Promise<void> {
  const { userId, mode, language, difficulty } = params;
  await dequeuePlayer(userId); // leave any existing queue first

  const qk = queueKey(mode, language);
  const { rating, rd } = await loadRating(userId, mode, language);
  const enqueuedAt = Date.now();
  const entry: PlayerEntry = { userId, mode, language, difficulty, queueKey: qk, enqueuedAt, rating, rd };

  await redis
    .multi()
    .zadd(qk, enqueuedAt, userId)
    .sadd(QUEUES_SET, qk)
    .set(playerKey(userId), JSON.stringify(entry), "EX", MM_ENTRY_TTL_SEC + 30)
    .del(matchedKey(userId))
    .exec();
}

/** Remove a player from whatever queue they're in (no-op if not queued). */
export async function dequeuePlayer(userId: string): Promise<void> {
  const raw = await redis.get(playerKey(userId));
  if (raw) {
    try {
      const entry = JSON.parse(raw) as PlayerEntry;
      await redis.zrem(entry.queueKey, userId);
    } catch {
      /* corrupt entry — fall through to key delete */
    }
  }
  await redis.del(playerKey(userId));
}

export type QueueStatus =
  | { status: "idle" }
  | { status: "matched"; matchId: string }
  | { status: "searching"; mode: GameMode; language: Language; waitedSec: number };

export async function getQueueStatus(userId: string): Promise<QueueStatus> {
  const matchId = await redis.get(matchedKey(userId));
  if (matchId) return { status: "matched", matchId };

  const raw = await redis.get(playerKey(userId));
  if (!raw) return { status: "idle" };
  try {
    const entry = JSON.parse(raw) as PlayerEntry;
    return {
      status: "searching",
      mode: entry.mode,
      language: entry.language,
      waitedSec: Math.max(0, Math.floor((Date.now() - entry.enqueuedAt) / 1000)),
    };
  } catch {
    return { status: "idle" };
  }
}

async function readEntry(userId: string): Promise<PlayerEntry | null> {
  const raw = await redis.get(playerKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlayerEntry;
  } catch {
    return null;
  }
}

/** Create a ranked match for two paired players and start its state machine. */
async function createRankedMatch(a: PlayerEntry, b: PlayerEntry): Promise<string> {
  const mode = a.mode;
  // Same-language modes: both queued the same language (queue key enforces it),
  // so the match language is fixed. Cross-language: null, each codes their own.
  const language = isSameLanguageMode(mode) ? a.language : null;
  const difficulty = a.difficulty ?? b.difficulty ?? null;
  const timeLimitSec = MODE_SPECS[mode].defaultTimeLimitSec;

  const [match] = await db
    .insert(matches)
    .values({
      mode,
      language,
      status: "matched",
      config: {
        mode,
        language,
        difficulty,
        timeLimitSec,
        bestOf: null,
        ranked: true,
      },
    })
    .returning({ id: matches.id });
  if (!match) throw new Error("failed to create ranked match");

  await db.insert(matchPlayers).values([
    { matchId: match.id, userId: a.userId },
    { matchId: match.id, userId: b.userId },
  ]);

  await enqueueMatchStart(match.id);
  return match.id;
}

/** Notify a queued player (who has no match room yet) that they've been paired. */
async function notifyMatched(userId: string, matchId: string, mode: GameMode): Promise<void> {
  await redis.set(matchedKey(userId), matchId, "EX", MATCHED_TTL_SEC);
  const event: UserEvent = { userId, type: "queue_matched", payload: { matchId, mode } };
  await redis.publish(USER_EVENTS_CHANNEL, JSON.stringify(event));
}

/**
 * One matchmaking pass over every active queue. Lock-guarded so only one runs
 * process-wide at a time. Pairs greedily oldest-first: the longest-waiting
 * player anchors, and we take the closest-rated partner whose band overlaps.
 */
export async function runMatchmakerTick(): Promise<number> {
  const token = `${process.pid}:${Date.now()}`;
  const acquired = await redis.set(LOCK_KEY, token, "PX", LOCK_TTL_MS, "NX");
  if (acquired !== "OK") return 0;

  let paired = 0;
  try {
    const queues = await redis.smembers(QUEUES_SET);
    for (const qk of queues) {
      paired += await pairQueue(qk);
    }
  } finally {
    // Release only if we still hold the lock (best-effort; PX also protects us).
    const held = await redis.get(LOCK_KEY);
    if (held === token) await redis.del(LOCK_KEY);
  }
  return paired;
}

async function pairQueue(qk: string): Promise<number> {
  const now = Date.now();
  // Oldest first (score = enqueue time).
  const members = await redis.zrange(qk, 0, -1);
  if (members.length === 0) {
    await redis.srem(QUEUES_SET, qk);
    return 0;
  }

  // Load entries; drop stale ones as we go.
  const entries: PlayerEntry[] = [];
  for (const userId of members) {
    const entry = await readEntry(userId);
    if (!entry) {
      await redis.zrem(qk, userId);
      continue;
    }
    if ((now - entry.enqueuedAt) / 1000 > MM_ENTRY_TTL_SEC) {
      await redis.zrem(qk, userId);
      await redis.del(playerKey(userId));
      continue;
    }
    entries.push(entry);
  }
  entries.sort((x, y) => x.enqueuedAt - y.enqueuedAt);

  let paired = 0;
  const consumed = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    if (!a || consumed.has(a.userId)) continue;
    const bandA = bandFor((now - a.enqueuedAt) / 1000);

    // Closest-rated eligible partner among the not-yet-consumed remainder.
    let best: PlayerEntry | null = null;
    let bestDiff = Infinity;
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j];
      if (!b || consumed.has(b.userId)) continue;
      const diff = Math.abs(a.rating - b.rating);
      const bandB = bandFor((now - b.enqueuedAt) / 1000);
      if (diff <= Math.max(bandA, bandB) && diff < bestDiff) {
        best = b;
        bestDiff = diff;
      }
    }
    if (!best) continue;

    // Atomic claim: remove both; if either was already gone (left/paired), undo.
    const res = await redis.multi().zrem(qk, a.userId).zrem(qk, best.userId).exec();
    const remA = res?.[0]?.[1] as number | undefined;
    const remB = res?.[1]?.[1] as number | undefined;
    if (remA !== 1 || remB !== 1) {
      if (remA === 1) await redis.zadd(qk, a.enqueuedAt, a.userId);
      if (remB === 1) await redis.zadd(qk, best.enqueuedAt, best.userId);
      continue;
    }

    await redis.del(playerKey(a.userId), playerKey(best.userId));
    let matchId: string;
    try {
      matchId = await createRankedMatch(a, best);
    } catch (err) {
      // Both players are already claimed out of the queue; put them back with
      // their original wait time so a transient failure (e.g. a DB blip)
      // doesn't strand them on a client that quietly flips to idle.
      console.error("[matchmaker] match creation failed, re-enqueueing pair:", err);
      await redis
        .multi()
        .zadd(qk, a.enqueuedAt, a.userId)
        .zadd(qk, best.enqueuedAt, best.userId)
        .set(playerKey(a.userId), JSON.stringify(a), "EX", MM_ENTRY_TTL_SEC + 30)
        .set(playerKey(best.userId), JSON.stringify(best), "EX", MM_ENTRY_TTL_SEC + 30)
        .exec();
      // Skip both for the rest of this pass; the next tick retries the pair.
      consumed.add(a.userId);
      consumed.add(best.userId);
      continue;
    }
    await notifyMatched(a.userId, matchId, a.mode);
    await notifyMatched(best.userId, matchId, best.mode);
    consumed.add(a.userId);
    consumed.add(best.userId);
    paired++;
  }
  return paired;
}

export async function closeMatchmaker(): Promise<void> {
  redis.disconnect();
}
