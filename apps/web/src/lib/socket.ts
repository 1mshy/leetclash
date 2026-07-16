/**
 * Socket.IO client singleton for the realtime service (ws gateway, §3.1).
 * Lazily connects on first use; safe to import from server components
 * (connection only happens when a helper is called in the browser).
 */
import { io, type Socket } from "socket.io-client";
import { WS_EVENTS, type LiveMatchState, type MatchEvent } from "@leetclash/shared";

const REALTIME_URL =
  process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4001";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(REALTIME_URL, {
      autoConnect: true,
      reconnection: true,
      transports: ["websocket"],
    });
  }
  return socket;
}

/** Join a match room and subscribe to its event stream + state snapshot. */
export function joinMatch(
  matchId: string,
  onEvent: (event: MatchEvent) => void,
  onState?: (state: LiveMatchState | null) => void,
): () => void {
  const s = getSocket();

  const join = () => s.emit(WS_EVENTS.JOIN_MATCH, { matchId });
  join();
  // Rooms don't survive a reconnect — rejoin to get a fresh state snapshot.
  s.on("connect", join);

  const handler = (event: MatchEvent) => {
    // Only forward events for the match we joined.
    if (event.matchId === matchId) onEvent(event);
  };
  s.on(WS_EVENTS.MATCH_EVENT, handler);

  const stateHandler = (msg: { matchId: string; state: LiveMatchState | null }) => {
    if (msg.matchId === matchId) onState?.(msg.state);
  };
  s.on(WS_EVENTS.MATCH_STATE, stateHandler);

  // Returned cleanup leaves the room and detaches the listeners.
  return () => {
    s.off("connect", join);
    s.off(WS_EVENTS.MATCH_EVENT, handler);
    s.off(WS_EVENTS.MATCH_STATE, stateHandler);
    s.emit(WS_EVENTS.LEAVE_MATCH, { matchId });
  };
}

export function leaveMatch(matchId: string): void {
  getSocket().emit(WS_EVENTS.LEAVE_MATCH, { matchId });
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
