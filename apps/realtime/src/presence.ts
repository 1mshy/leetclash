import type { Redis } from "ioredis";
import type { Server, Socket } from "socket.io";
import { PRESENCE_EVENTS_CHANNEL, type PresenceSignal } from "@leetclash/shared";

/**
 * Presence tracking (PLAN §3.2). The gateway reports raw connectivity only — it
 * publishes connect/disconnect PresenceSignals to Redis and never decides match
 * outcomes; the api/worker owns the 60s grace timer and the abandon decision.
 *
 * Membership is a Redis SET per (matchId, userId) of that user's live socket
 * ids, so a user with two tabs isn't reported as disconnected when one closes.
 * A signal fires only on the true edges: the set going empty→1 (connect) or
 * 1→empty (disconnect).
 */
const presenceKey = (matchId: string, userId: string): string => `presence:${matchId}:${userId}`;
const PRESENCE_TTL_SEC = 24 * 60 * 60;

async function publish(redis: Redis, signal: PresenceSignal): Promise<void> {
  await redis.publish(PRESENCE_EVENTS_CHANNEL, JSON.stringify(signal));
}

/** Record that this socket is present in a match room; signal on first connect. */
export async function joinPresence(redis: Redis, socket: Socket, matchId: string): Promise<void> {
  const userId = socket.data.userId as string | undefined;
  if (!userId) return; // not identified — can't attribute presence

  const rooms: Set<string> = socket.data.matchRooms ?? (socket.data.matchRooms = new Set());
  rooms.add(matchId);

  const key = presenceKey(matchId, userId);
  await redis.sadd(key, socket.id);
  await redis.expire(key, PRESENCE_TTL_SEC);
  const count = await redis.scard(key);
  if (count === 1) await publish(redis, { type: "connect", matchId, userId });
}

/** Drop this socket from a match room; signal on last disconnect. */
export async function leavePresence(redis: Redis, socket: Socket, matchId: string): Promise<void> {
  const userId = socket.data.userId as string | undefined;
  if (!userId) return;

  const rooms: Set<string> | undefined = socket.data.matchRooms;
  rooms?.delete(matchId);

  const key = presenceKey(matchId, userId);
  await redis.srem(key, socket.id);
  const count = await redis.scard(key);
  if (count === 0) {
    await redis.del(key);
    await publish(redis, { type: "disconnect", matchId, userId });
  }
}

export function registerPresenceHandlers(io: Server, redis: Redis): void {
  io.on("connection", (socket: Socket) => {
    socket.on("disconnect", (reason: string) => {
      const rooms: Set<string> | undefined = socket.data.matchRooms;
      if (!rooms || rooms.size === 0) return;
      // Copy — leavePresence mutates the set as it goes.
      for (const matchId of [...rooms]) {
        void leavePresence(redis, socket, matchId).catch((err) =>
          console.error(`[realtime] presence leave error (${reason}):`, err),
        );
      }
    });
  });
}
