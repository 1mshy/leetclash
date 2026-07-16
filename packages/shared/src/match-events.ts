import { z } from "zod";
import { MatchConfig, SubmissionResult, Verdict } from "./core.js";

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
]);
export type MatchEvent = z.infer<typeof MatchEvent>;

// ─── Socket.IO event names (client ⇄ realtime) ───────────────────────────────

export const WS_EVENTS = {
  // client → server
  JOIN_MATCH: "match:join",
  LEAVE_MATCH: "match:leave",
  // server → client
  MATCH_EVENT: "match:event",
  MATCH_STATE: "match:state",
  ERROR: "error",
} as const;
