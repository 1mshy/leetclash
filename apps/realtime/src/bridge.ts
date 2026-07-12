import type { Redis } from "ioredis";
import type { Server } from "socket.io";
import { MatchEvent, WS_EVENTS } from "@leetclash/shared";
import { matchRoom } from "./rooms.js";

/** Redis pub/sub channel that api/matchmaker publish MatchEvents to. */
export const MATCH_EVENTS_CHANNEL = "match-events";

/**
 * Bridge Redis pub/sub → Socket.IO rooms.
 *
 * The api/matchmaker services are the source of truth for match state (§3.2:
 * server is the only clock — events carry server timestamps, this gateway
 * never generates them). They publish validated MatchEvent JSON to the
 * `match-events` channel; we re-validate here (never trust the wire) and fan
 * out to the room for that match.
 *
 * Note: `sub` must be a dedicated ioredis connection — a subscribed ioredis
 * client cannot issue regular commands.
 */
export async function startMatchEventBridge(io: Server, sub: Redis): Promise<void> {
  await sub.subscribe(MATCH_EVENTS_CHANNEL);

  sub.on("message", (channel: string, message: string) => {
    if (channel !== MATCH_EVENTS_CHANNEL) return;

    let json: unknown;
    try {
      json = JSON.parse(message);
    } catch {
      console.warn("[realtime] dropping non-JSON message on match-events");
      return;
    }

    const parsed = MatchEvent.safeParse(json);
    if (!parsed.success) {
      console.warn("[realtime] dropping invalid MatchEvent:", parsed.error.issues[0]?.message);
      return;
    }

    const event = parsed.data;
    io.to(matchRoom(event.matchId)).emit(WS_EVENTS.MATCH_EVENT, event);
  });

  console.log(`[realtime] bridging ${MATCH_EVENTS_CHANNEL} → match rooms`);
}
