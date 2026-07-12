import type { Server, Socket } from "socket.io";

/**
 * Minimal presence skeleton: an in-memory socket.id → matchIds mapping so we
 * know which matches a dropped socket was watching.
 *
 * Deliberately NOT here: publishing player_disconnected events or running the
 * 60s reconnect grace period (§3.2). That timer belongs to the match state
 * machine (api/matchmaker) — the gateway only reports connectivity; it never
 * decides match outcomes. In-memory is fine for a single gateway instance;
 * multi-instance presence will move to Redis keys (e.g.
 * `presence:{matchId}:{userId}`) in Phase 1 once sockets carry a userId.
 */
const socketMatches = new Map<string, Set<string>>();

export function trackJoin(socketId: string, matchId: string): void {
  let matches = socketMatches.get(socketId);
  if (!matches) {
    matches = new Set();
    socketMatches.set(socketId, matches);
  }
  matches.add(matchId);
}

export function trackLeave(socketId: string, matchId: string): void {
  const matches = socketMatches.get(socketId);
  if (!matches) return;
  matches.delete(matchId);
  if (matches.size === 0) socketMatches.delete(socketId);
}

export function registerPresenceHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    socket.on("disconnect", (reason: string) => {
      const matches = socketMatches.get(socket.id);
      socketMatches.delete(socket.id);
      if (!matches || matches.size === 0) return;

      // TODO(Phase 1 — §3.2 disconnect handling): once sockets are
      // authenticated, notify the match state machine (api) that this user
      // dropped so IT can start the 60s grace period and, on expiry, emit
      // player_disconnected / abandon events. Not implemented here on purpose.
      console.log(
        `[realtime] socket ${socket.id} disconnected (${reason}) while in matches: ${[...matches].join(", ")}`,
      );
    });
  });
}
