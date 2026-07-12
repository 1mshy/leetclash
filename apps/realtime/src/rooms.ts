import type { Redis } from "ioredis";
import type { Server, Socket } from "socket.io";
import { WS_EVENTS } from "@leetclash/shared";
import { z } from "zod";
import { trackJoin, trackLeave } from "./presence.js";

// Client → server payloads. Server never trusts the client beyond this shape.
const JoinMatchPayload = z.object({ matchId: z.string().uuid() });
const LeaveMatchPayload = JoinMatchPayload;

export const matchRoom = (matchId: string): string => `match:${matchId}`;

/**
 * Wire up per-socket room handlers.
 *
 * TODO(Phase 1 — auth): verify a session token on connection (Socket.IO
 * middleware) and check the user is actually a player/spectator of the match
 * before letting them join the room. For Phase 0 any client may join any
 * match room; do not ship this beyond local dev.
 */
export function registerRoomHandlers(io: Server, redis: Redis): void {
  io.on("connection", (socket: Socket) => {
    socket.on(WS_EVENTS.JOIN_MATCH, async (raw: unknown) => {
      const parsed = JoinMatchPayload.safeParse(raw);
      if (!parsed.success) {
        socket.emit(WS_EVENTS.ERROR, { message: "invalid join_match payload" });
        return;
      }
      const { matchId } = parsed.data;

      await socket.join(matchRoom(matchId));
      trackJoin(socket.id, matchId);

      // Send the current live match state so a (re)joining client can render
      // immediately instead of waiting for the next event. Null-safe: the key
      // may not exist yet (match not started) or may have expired.
      const state = await readMatchState(redis, matchId);
      socket.emit(WS_EVENTS.MATCH_STATE, { matchId, state });
    });

    socket.on(WS_EVENTS.LEAVE_MATCH, async (raw: unknown) => {
      const parsed = LeaveMatchPayload.safeParse(raw);
      if (!parsed.success) {
        socket.emit(WS_EVENTS.ERROR, { message: "invalid leave_match payload" });
        return;
      }
      const { matchId } = parsed.data;
      await socket.leave(matchRoom(matchId));
      trackLeave(socket.id, matchId);
    });
  });
}

/** Read `match:{id}:state` (JSON blob owned by the match state machine). */
async function readMatchState(redis: Redis, matchId: string): Promise<unknown> {
  const raw = await redis.get(`match:${matchId}:state`);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    console.warn(`[realtime] corrupt match state for ${matchId}, returning null`);
    return null;
  }
}
