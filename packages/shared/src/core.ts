import { z } from "zod";

// ─── Match constants (server-authoritative; clients render, never decide) ────

/** Seconds between "matched" and problem reveal (§1.1 step 2). */
export const COUNTDOWN_SECONDS = 5;
/** Minimum seconds between two Submits per player per match (§1.2). */
export const SUBMIT_THROTTLE_SEC = 10;
/** Grace period to reconnect before a disconnect becomes an abandon (§3.2). */
export const DISCONNECT_GRACE_SEC = 60;
/** Spectators see the match delayed by this much to prevent ghosting (§1.3). */
export const SPECTATOR_DELAY_SEC = 30;

// ─── Modes & languages ────────────────────────────────────────────────────────

export const GameMode = z.enum([
  "speed_race",
  "fastest_runtime",
  "code_golf",
  "memory_golf",
  "scaling_duel",
  "blitz",
]);
export type GameMode = z.infer<typeof GameMode>;

/** Launch languages (Phase 1 uses python + cpp only). */
export const Language = z.enum(["python", "cpp", "javascript", "java", "go", "rust"]);
export type Language = z.infer<typeof Language>;

export const Difficulty = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof Difficulty>;

// ─── Match lifecycle (§3.2) ───────────────────────────────────────────────────

export const MatchStatus = z.enum([
  "queued",
  "matched",
  "countdown",
  "live",
  "judging",
  "finished",
  "abandoned",
]);
export type MatchStatus = z.infer<typeof MatchStatus>;

// ─── Submissions & verdicts ───────────────────────────────────────────────────

export const Verdict = z.enum([
  "accepted",
  "wrong_answer",
  "time_limit_exceeded",
  "memory_limit_exceeded",
  "runtime_error",
  "compile_error",
  "output_limit_exceeded",
  "internal_error",
]);
export type Verdict = z.infer<typeof Verdict>;

export const SubmissionStatus = z.enum(["pending", "running", "done"]);
export type SubmissionStatus = z.infer<typeof SubmissionStatus>;

export const SubmissionKind = z.enum(["run", "submit"]);
export type SubmissionKind = z.infer<typeof SubmissionKind>;

export const SubmissionRequest = z.object({
  matchId: z.string().uuid().nullable(),
  problemId: z.string().uuid(),
  language: Language,
  source: z.string().max(256 * 1024),
  kind: SubmissionKind,
});
export type SubmissionRequest = z.infer<typeof SubmissionRequest>;

export const SubmissionResult = z.object({
  submissionId: z.string().uuid(),
  status: SubmissionStatus,
  verdict: Verdict.nullable(),
  timeMs: z.number().nullable(),
  memoryKb: z.number().nullable(),
  bytes: z.number().int(),
  testsPassed: z.number().int(),
  testsTotal: z.number().int(),
  tierReached: z.number().int().nullable(),
  /** Compile/runtime error detail, truncated server-side. */
  detail: z.string().nullable(),
});
export type SubmissionResult = z.infer<typeof SubmissionResult>;

// ─── Match config ─────────────────────────────────────────────────────────────

export const MatchConfig = z.object({
  mode: GameMode,
  /** Same-language matchmaking key for perf modes; null = cross-language casual. */
  language: Language.nullable(),
  difficulty: Difficulty.nullable(),
  /** Wall-clock cap for the match, seconds. */
  timeLimitSec: z.number().int().positive(),
  /** Blitz only. */
  bestOf: z.number().int().positive().nullable(),
  ranked: z.boolean(),
});
export type MatchConfig = z.infer<typeof MatchConfig>;
