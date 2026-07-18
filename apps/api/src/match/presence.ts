/**
 * Disconnect / abandon handling (PLAN §3.2).
 *
 * The realtime gateway only reports connectivity — it publishes connect/
 * disconnect PresenceSignals and never decides outcomes. This module (in the
 * worker) owns the decision: on a disconnect from an in-progress match it
 * starts a 60s grace timer (a durable BullMQ delayed job) and tells the room;
 * a reconnect within the window cancels it; on expiry the dropped player
 * forfeits and the opponent wins (ranked ⇒ a rated loss for the abandoner).
 */
import { Redis } from "ioredis";
import { and, eq, ne } from "drizzle-orm";
import { DISCONNECT_GRACE_SEC, PRESENCE_EVENTS_CHANNEL, PresenceSignal } from "@leetclash/shared";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { matchPlayers, matches } from "../db/schema.js";
import { finishMatch, matchLifecycleQueue } from "./engine.js";
import { appendMatchEvent, refreshMatchState } from "./events.js";

const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
redis.on("error", (err) => console.error("[presence] redis error:", err.message));

/** Set while a player is inside the grace window; cleared on reconnect/abandon. */
const disconnectKey = (matchId: string, userId: string): string => `dc:${matchId}:${userId}`;

/** Deterministic grace-job id — dedups concurrent disconnect signals. */
const abandonJobId = (matchId: string, userId: string): string => `abandon:${matchId}:${userId}`;

/** Statuses in which a disconnect matters (before the match is terminal). */
const IN_PROGRESS = ["matched", "countdown", "live", "judging"] as const;

async function matchInProgress(matchId: string): Promise<boolean> {
  const [m] = await db
    .select({ status: matches.status })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  return !!m && (IN_PROGRESS as readonly string[]).includes(m.status);
}

async function handleDisconnect(matchId: string, userId: string): Promise<void> {
  if (!(await matchInProgress(matchId))) return;

  await redis.set(disconnectKey(matchId, userId), "1", "EX", DISCONNECT_GRACE_SEC + 15);
  await appendMatchEvent(matchId, "player_disconnected", {
    userId,
    graceSec: DISCONNECT_GRACE_SEC,
  });
  await refreshMatchState(matchId);

  // Durable grace timer. BullMQ silently ignores an add whose jobId still
  // exists — including in the completed set (removeOnComplete keeps 1000) — so
  // a spent job from an earlier disconnect/reconnect cycle must be dropped
  // first or a later disconnect would never get a timer.
  const jobId = abandonJobId(matchId, userId);
  await matchLifecycleQueue.remove(jobId).catch(() => {});
  await matchLifecycleQueue.add(
    "abandon",
    { matchId, userId },
    { delay: DISCONNECT_GRACE_SEC * 1000, jobId },
  );
}

async function handleReconnect(matchId: string, userId: string): Promise<void> {
  const wasDown = await redis.del(disconnectKey(matchId, userId));
  if (wasDown > 0) {
    // Cancel the grace timer outright so it never lands in the completed set,
    // where it would block the jobId of the next disconnect's timer.
    await matchLifecycleQueue.remove(abandonJobId(matchId, userId)).catch(() => {});
    await appendMatchEvent(matchId, "player_reconnected", { userId });
    await refreshMatchState(matchId);
  }
}

/**
 * Grace-timer expiry: if the player is still in the disconnect window and the
 * match is still in progress, they forfeit and the opponent wins.
 */
export async function processAbandon(matchId: string, userId: string | undefined): Promise<void> {
  if (!userId) return;
  const stillDown = await redis.get(disconnectKey(matchId, userId));
  if (!stillDown) return; // reconnected in time
  if (!(await matchInProgress(matchId))) {
    await redis.del(disconnectKey(matchId, userId));
    return;
  }

  const [opponent] = await db
    .select({ userId: matchPlayers.userId })
    .from(matchPlayers)
    .where(and(eq(matchPlayers.matchId, matchId), ne(matchPlayers.userId, userId)))
    .limit(1);

  await redis.del(disconnectKey(matchId, userId));
  // Opponent wins by abandon; finishMatch marks the dropper's result "abandon"
  // and applies the ranked rating loss.
  await finishMatch(matchId, opponent?.userId ?? null, "abandon");
}

/** Subscribe to presence signals from the realtime gateway. */
export async function startPresenceSubscriber(): Promise<void> {
  const sub = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  sub.on("error", (err) => console.error("[presence] sub error:", err.message));
  await sub.subscribe(PRESENCE_EVENTS_CHANNEL);

  sub.on("message", (channel, message) => {
    if (channel !== PRESENCE_EVENTS_CHANNEL) return;
    let parsed;
    try {
      parsed = PresenceSignal.safeParse(JSON.parse(message));
    } catch {
      return;
    }
    if (!parsed.success) return;
    const { type, matchId, userId } = parsed.data;
    const work = type === "disconnect" ? handleDisconnect(matchId, userId) : handleReconnect(matchId, userId);
    void work.catch((err) => console.error("[presence] handler error:", err));
  });

  console.log(`[presence] subscribed to ${PRESENCE_EVENTS_CHANNEL}`);
  presenceSub = sub;
}

let presenceSub: Redis | null = null;
export async function closePresence(): Promise<void> {
  presenceSub?.disconnect();
  redis.disconnect();
}
