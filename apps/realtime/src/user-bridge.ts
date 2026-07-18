import type { Redis } from "ioredis";
import type { Server } from "socket.io";
import { USER_EVENTS_CHANNEL, UserEvent, WS_EVENTS } from "@leetclash/shared";
import { userRoom } from "./rooms.js";

/**
 * Bridge Redis `user-events` pub/sub → per-user Socket.IO rooms.
 *
 * The matchmaker publishes user-scoped notifications (`queue_matched`) here: a
 * queued player has no match room yet, so match events can't reach them. We
 * re-validate (never trust the wire) and fan out to the target user's room —
 * clients join it via WS_EVENTS.IDENTIFY (see rooms.ts).
 */
export async function startUserEventBridge(io: Server, sub: Redis): Promise<void> {
  await sub.subscribe(USER_EVENTS_CHANNEL);

  sub.on("message", (channel: string, message: string) => {
    if (channel !== USER_EVENTS_CHANNEL) return;

    let json: unknown;
    try {
      json = JSON.parse(message);
    } catch {
      console.warn("[realtime] dropping non-JSON message on user-events");
      return;
    }

    const parsed = UserEvent.safeParse(json);
    if (!parsed.success) {
      console.warn("[realtime] dropping invalid UserEvent:", parsed.error.issues[0]?.message);
      return;
    }

    const event = parsed.data;
    io.to(userRoom(event.userId)).emit(WS_EVENTS.USER_EVENT, event);
  });

  console.log(`[realtime] bridging ${USER_EVENTS_CHANNEL} → user rooms`);
}
