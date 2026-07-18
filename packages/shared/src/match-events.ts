import { z } from "zod";
import { GameMode, Language, MatchConfig, SubmissionResult, Verdict } from "./core.js";

// Append-only match event log (§3.2). Server is the only clock: every event
// carries a server timestamp; clients never supply timing.

const base = {
  matchId: z.string().uuid(),
  seq: z.number().int().nonnegative(),
  at: z.string().datetime(),
};

export const MatchCreatedEvent = z.object({
  ...base,
  type: z.literal("match_created"),
  payload: z.object({
    config: MatchConfig,
    playerIds: z.array(z.string().uuid()).min(2),
  }),
});

export const CountdownStartedEvent = z.object({
  ...base,
  type: z.literal("countdown_started"),
  payload: z.object({ seconds: z.number().int().positive() }),
});

export const ProblemRevealedEvent = z.object({
  ...base,
  type: z.literal("problem_revealed"),
  payload: z.object({ problemId: z.string().uuid() }),
});

export const SubmissionReceivedEvent = z.object({
  ...base,
  type: z.literal("submission_received"),
  payload: z.object({
    userId: z.string().uuid(),
    submissionId: z.string().uuid(),
    kind: z.enum(["run", "submit"]),
  }),
});

/** Opponent progress signal — never includes code (§1.1). */
export const ProgressEvent = z.object({
  ...base,
  type: z.literal("progress"),
  payload: z.object({
    userId: z.string().uuid(),
    testsPassed: z.number().int(),
    testsTotal: z.number().int(),
    submissionCount: z.number().int(),
    lastVerdict: Verdict.nullable(),
  }),
});

export const VerdictEvent = z.object({
  ...base,
  type: z.literal("verdict"),
  payload: z.object({
    userId: z.string().uuid(),
    result: SubmissionResult,
  }),
});

export const PlayerDisconnectedEvent = z.object({
  ...base,
  type: z.literal("player_disconnected"),
  payload: z.object({ userId: z.string().uuid(), graceSec: z.number().int() }),
});

export const PlayerReconnectedEvent = z.object({
  ...base,
  type: z.literal("player_reconnected"),
  payload: z.object({ userId: z.string().uuid() }),
});

export const MatchFinishedEvent = z.object({
  ...base,
  type: z.literal("match_finished"),
  payload: z.object({
    winnerId: z.string().uuid().nullable(),
    reason: z.enum(["win_condition", "timeout", "abandon", "draw"]),
  }),
});

/** A player started a rematch; both clients navigate to the new match. */
export const RematchEvent = z.object({
  ...base,
  type: z.literal("rematch"),
  payload: z.object({
    newMatchId: z.string().uuid(),
    byUserId: z.string().uuid(),
  }),
});

/**
 * Benchmark result for a Fastest Runtime finalist (§1.2 benchmark protocol):
 * the median CPU time over N re-runs of their best accepted submission,
 * computed at the fixed-window close.
 */
export const BenchmarkEvent = z.object({
  ...base,
  type: z.literal("benchmark"),
  payload: z.object({
    userId: z.string().uuid(),
    medianMs: z.number(),
    /** Per-run CPU times (ms); the first is dropped before the median (§1.2). */
    sampleMs: z.array(z.number()),
  }),
});

/** Per-player Glicko-2 delta after a ranked match, for the results screen. */
export const RatingUpdatedEvent = z.object({
  ...base,
  type: z.literal("rating_updated"),
  payload: z.object({
    userId: z.string().uuid(),
    mode: GameMode,
    language: Language.nullable(),
    ratingBefore: z.number(),
    ratingAfter: z.number(),
    rd: z.number(),
  }),
});

export const MatchEvent = z.discriminatedUnion("type", [
  MatchCreatedEvent,
  CountdownStartedEvent,
  ProblemRevealedEvent,
  SubmissionReceivedEvent,
  ProgressEvent,
  VerdictEvent,
  PlayerDisconnectedEvent,
  PlayerReconnectedEvent,
  MatchFinishedEvent,
  RematchEvent,
  BenchmarkEvent,
  RatingUpdatedEvent,
]);
export type MatchEvent = z.infer<typeof MatchEvent>;

// ─── User-scoped events (delivered to a per-user socket room) ────────────────
// The matchmaker publishes these to notify a queued player that they've been
// paired — the queued player has no match room yet, so match events can't
// reach them (the notify-path gap). Fanned out on the `user-events` channel.

export const QueueMatchedEvent = z.object({
  userId: z.string().uuid(),
  type: z.literal("queue_matched"),
  payload: z.object({
    matchId: z.string().uuid(),
    mode: GameMode,
  }),
});

export const UserEvent = z.discriminatedUnion("type", [QueueMatchedEvent]);
export type UserEvent = z.infer<typeof UserEvent>;

// ─── Socket.IO event names (client ⇄ realtime) ───────────────────────────────

export const WS_EVENTS = {
  // client → server
  JOIN_MATCH: "match:join",
  LEAVE_MATCH: "match:leave",
  /** Subscribe to a per-user room for queue/notification pushes (payload: {userId}). */
  IDENTIFY: "user:identify",
  // server → client
  MATCH_EVENT: "match:event",
  MATCH_STATE: "match:state",
  USER_EVENT: "user:event",
  ERROR: "error",
} as const;

/** Redis pub/sub channel for user-scoped notifications (queue_matched, …). */
export const USER_EVENTS_CHANNEL = "user-events";

// ─── Presence signals (realtime gateway → match state machine) ───────────────
// The gateway reports raw connectivity; it never decides match outcomes (§3.2).
// It publishes connect/disconnect here and the api/worker owns the 60s grace
// timer and the abandon decision.

export const PRESENCE_EVENTS_CHANNEL = "presence-events";

export const PresenceSignal = z.object({
  type: z.enum(["connect", "disconnect"]),
  matchId: z.string().uuid(),
  userId: z.string().uuid(),
});
export type PresenceSignal = z.infer<typeof PresenceSignal>;
