import { z } from "zod";
import { Difficulty, GameMode, Language, MatchStatus, Verdict } from "./core.js";

// Match REST DTOs + the live match state blob (`match:{id}:state` in Redis).
// Single source of truth for the api routes, the realtime gateway's state
// snapshot, and the web client.

// ─── Live state (Redis, written by the match engine, read on room join) ──────

export const PlayerProgress = z.object({
  userId: z.string().uuid(),
  handle: z.string(),
  testsPassed: z.number().int(),
  testsTotal: z.number().int(),
  /** Submit-kind submissions only; Run doesn't count toward the match. */
  submissionCount: z.number().int(),
  lastVerdict: Verdict.nullable(),
  /** Has at least one accepted Submit — the fixed-window "in contention" flag. */
  accepted: z.boolean(),
  /**
   * Best value of the mode's win metric so far (bytes for Code Golf, summed
   * suite CPU ms for Fastest Runtime — the same unit the §1.2 benchmark
   * medians), among this player's accepted submits. null until they have an
   * accepted submission. Drives live standings in fixed-window modes.
   */
  bestMetric: z.number().nullable(),
});
export type PlayerProgress = z.infer<typeof PlayerProgress>;

export const LiveMatchState = z.object({
  matchId: z.string().uuid(),
  status: MatchStatus,
  /** Server epoch ms when the countdown ends (problem reveal). */
  countdownEndsAt: z.number().nullable(),
  /** Server epoch ms when the match hard cap hits. */
  endsAt: z.number().nullable(),
  problemSlug: z.string().nullable(),
  players: z.array(PlayerProgress),
  winnerId: z.string().uuid().nullable(),
});
export type LiveMatchState = z.infer<typeof LiveMatchState>;

// ─── GET /matches/:id ─────────────────────────────────────────────────────────

export const SampleTest = z.object({
  ordinal: z.number().int(),
  input: z.string(),
  expected: z.string(),
});
export type SampleTest = z.infer<typeof SampleTest>;

/** Problem payload as revealed to players mid-match: statement + samples only. */
export const MatchProblem = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  difficulty: Difficulty,
  statementMd: z.string(),
  ioSpec: z.string().nullable(),
  starterCode: z.record(z.string()),
  sampleTests: z.array(SampleTest),
});
export type MatchProblem = z.infer<typeof MatchProblem>;

export const MatchPlayer = z.object({
  id: z.string().uuid(),
  handle: z.string(),
  /** win | loss | draw | abandon — null while the match is in flight. */
  result: z.string().nullable(),
});
export type MatchPlayer = z.infer<typeof MatchPlayer>;

/** Per-player reveal shown on the results screen (only after finished). */
export const PlayerReveal = z.object({
  userId: z.string().uuid(),
  handle: z.string(),
  /** Best (accepted) or latest submission — code reveal per §1.1 step 5. */
  language: Language.nullable(),
  source: z.string().nullable(),
  verdict: Verdict.nullable(),
  timeMs: z.number().nullable(),
  memoryKb: z.number().nullable(),
  bytes: z.number().int().nullable(),
  submitCount: z.number().int(),
  /** ISO timestamp of the accepted submission, if any. */
  acceptedAt: z.string().nullable(),
  /** Benchmarked median CPU time (ms) — Fastest Runtime only (§1.2). */
  benchmarkMs: z.number().nullable(),
  /** Highest Scaling Duel tier passed — Scaling Duel only. */
  tierReached: z.number().int().nullable(),
  /** Glicko-2 rating before/after this match — ranked matches only. */
  ratingBefore: z.number().nullable(),
  ratingAfter: z.number().nullable(),
});
export type PlayerReveal = z.infer<typeof PlayerReveal>;

export const MatchDetail = z.object({
  id: z.string().uuid(),
  mode: GameMode,
  status: MatchStatus,
  /** Ranked (matchmade, rated) vs casual (private room). */
  ranked: z.boolean(),
  /** Match language for same-language modes; null = cross-language. */
  language: Language.nullable(),
  inviteCode: z.string().nullable(),
  timeLimitSec: z.number().int(),
  players: z.array(MatchPlayer),
  /** Null until the problem is revealed (status live/judging/finished). */
  problem: MatchProblem.nullable(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  winnerId: z.string().uuid().nullable(),
  /** Present only when the match is finished. */
  results: z.array(PlayerReveal).nullable(),
});
export type MatchDetail = z.infer<typeof MatchDetail>;

// ─── GET /matches/:id/events (replay + delayed spectator backfill) ───────────

export const MatchEventsResponse = z.object({
  matchId: z.string().uuid(),
  /** Terminal matches replay in full; in-flight ones are delayed for spectators. */
  finished: z.boolean(),
  /** Seconds the view is delayed by (0 for finished matches / players). */
  delayedBySec: z.number().int().nonnegative(),
  /** Validated MatchEvent rows, ascending seq. Kept loose here — the client
   *  narrows with MatchEvent.parse per entry (the api only emits valid ones). */
  events: z.array(z.unknown()),
});
export type MatchEventsResponse = z.infer<typeof MatchEventsResponse>;

// ─── POST /matches/:id/rematch ────────────────────────────────────────────────

export const RematchRequest = z.object({
  userId: z.string().uuid(),
});
export type RematchRequest = z.infer<typeof RematchRequest>;

export const RematchResponse = z.object({
  matchId: z.string().uuid(),
});
export type RematchResponse = z.infer<typeof RematchResponse>;

// ─── POST /submissions ────────────────────────────────────────────────────────

export const CreateSubmissionRequest = z.object({
  /** Guest id until auth sessions land (see apps/api TODOs). */
  userId: z.string().uuid(),
  matchId: z.string().uuid(),
  language: Language,
  source: z.string().min(1).max(256 * 1024),
  kind: z.enum(["run", "submit"]),
  /** Anti-cheat telemetry (§6.6): paste events since the last submit. */
  pasteCount: z.number().int().nonnegative().default(0),
  /** Size (chars) of the largest single paste in this editing session. */
  largestPaste: z.number().int().nonnegative().default(0),
});
export type CreateSubmissionRequest = z.infer<typeof CreateSubmissionRequest>;

export const CreateSubmissionResponse = z.object({
  submissionId: z.string().uuid(),
});
export type CreateSubmissionResponse = z.infer<typeof CreateSubmissionResponse>;
