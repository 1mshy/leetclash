/**
 * Socket.IO client singleton for the realtime service (ws gateway, §3.1).
 * Lazily connects on first use; safe to import from server components
 * (connection only happens when a helper is called in the browser).
 */
import { io, type Socket } from "socket.io-client";
import { WS_EVENTS, type LiveMatchState, type MatchEvent, type UserEvent } from "@leetclash/shared";

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

/**
 * Spectate a live match (§1.3): events arrive SPECTATOR_DELAY_SEC late and
 * presence is never touched — a spectator can't trip the abandon machinery.
 * Backfill history via getMatchEvents(); this stream picks up from "now".
 */
export function spectateMatch(
  matchId: string,
  onEvent: (event: MatchEvent) => void,
): () => void {
  const s = getSocket();

  const join = () => s.emit(WS_EVENTS.SPECTATE_MATCH, { matchId });
  join();
  s.on("connect", join);

  const handler = (event: MatchEvent) => {
    if (event.matchId === matchId) onEvent(event);
  };
  s.on(WS_EVENTS.MATCH_EVENT, handler);

  return () => {
    s.off("connect", join);
    s.off(WS_EVENTS.MATCH_EVENT, handler);
    s.emit(WS_EVENTS.LEAVE_SPECTATE, { matchId });
  };
}

/**
 * Join the per-user room and subscribe to user-scoped pushes (queue_matched).
 * A queued player has no match room yet, so this is how the matchmaker reaches
 * them. Re-identifies on reconnect (rooms don't survive a reconnect).
 */
export function subscribeUserEvents(
  userId: string,
  onEvent: (event: UserEvent) => void,
): () => void {
  const s = getSocket();
  const identify = () => s.emit(WS_EVENTS.IDENTIFY, { userId });
  identify();
  s.on("connect", identify);

  const handler = (event: UserEvent) => {
    if (event.userId === userId) onEvent(event);
  };
  s.on(WS_EVENTS.USER_EVENT, handler);

  return () => {
    s.off("connect", identify);
    s.off(WS_EVENTS.USER_EVENT, handler);
  };
}

/** Announce identity for a match connection (enables presence/abandon, §3.2). */
export function identify(userId: string): void {
  getSocket().emit(WS_EVENTS.IDENTIFY, { userId });
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
