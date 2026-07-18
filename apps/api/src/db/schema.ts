/**
 * Drizzle schema implementing PLAN.md §5.
 *
 * Enum values are inlined (not derived from @leetclash/shared zod enums) so
 * drizzle-kit can introspect this file without building the shared package,
 * but they MUST stay in sync with GameMode / MatchStatus / Verdict /
 * Difficulty / Language / SubmissionStatus in packages/shared/src/core.ts.
 */
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ─── Enums (mirror @leetclash/shared) ────────────────────────────────────────

export const gameModeEnum = pgEnum("game_mode", [
  "speed_race",
  "fastest_runtime",
  "code_golf",
  "memory_golf",
  "scaling_duel",
  "blitz",
]);

export const languageEnum = pgEnum("language", [
  "python",
  "cpp",
  "javascript",
  "java",
  "go",
  "rust",
]);

export const difficultyEnum = pgEnum("difficulty", ["easy", "medium", "hard"]);

export const matchStatusEnum = pgEnum("match_status", [
  "queued",
  "matched",
  "countdown",
  "live",
  "judging",
  "finished",
  "abandoned",
]);

export const verdictEnum = pgEnum("verdict", [
  "accepted",
  "wrong_answer",
  "time_limit_exceeded",
  "memory_limit_exceeded",
  "runtime_error",
  "compile_error",
  "output_limit_exceeded",
  "internal_error",
]);

export const submissionStatusEnum = pgEnum("submission_status", [
  "pending",
  "running",
  "done",
]);

export const submissionKindEnum = pgEnum("submission_kind", ["run", "submit"]);

export const problemStatusEnum = pgEnum("problem_status", [
  "draft",
  "published",
  "archived",
]);

// ─── users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  handle: text("handle").notNull().unique(),
  email: text("email").notNull().unique(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── ratings (Glicko-2, per mode; language for same-language perf modes) ─────

export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: gameModeEnum("mode").notNull(),
    /** null = mode's cross-language rating; set for same-language perf modes. */
    language: languageEnum("language"),
    rating: doublePrecision("rating").notNull().default(1500),
    rd: doublePrecision("rd").notNull().default(350),
    volatility: doublePrecision("volatility").notNull().default(0.06),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // NULLS NOT DISTINCT is not exposed by drizzle yet; language=null rows are
    // deduped at the application level for now. TODO(phase2): raw migration.
    uniqueIndex("ratings_user_mode_language_uq").on(t.userId, t.mode, t.language),
  ],
);

// ─── problems ─────────────────────────────────────────────────────────────────

export const problems = pgTable(
  "problems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    difficulty: difficultyEnum("difficulty").notNull(),
    statementMd: text("statement_md").notNull(),
    /** Input/output format description shown to players. */
    ioSpec: text("io_spec"),
    tags: text("tags").array().notNull().default([]),
    /** Per-language starter code: Record<Language, string>. */
    starterCode: jsonb("starter_code")
      .$type<Partial<Record<string, string>>>()
      .notNull()
      .default({}),
    /** ProblemManifest["limits"] shape from @leetclash/shared. */
    limits: jsonb("limits")
      .$type<{
        baseline: { timeLimitMs: number; memoryLimitKb: number };
        overrides: Partial<
          Record<string, { timeLimitMs?: number; memoryLimitKb?: number }>
        >;
      }>()
      .notNull(),
    /** MinIO URI of the seeded input generator (Phase 3). */
    generatorUri: text("generator_uri"),
    /** MinIO URI of the output checker/validator (Phase 3). */
    checkerUri: text("checker_uri"),
    status: problemStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("problems_difficulty_idx").on(t.difficulty)],
);

// ─── test_cases ───────────────────────────────────────────────────────────────

export const testCases = pgTable(
  "test_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    /** MinIO URIs for large cases … */
    inputUri: text("input_uri"),
    expectedUri: text("expected_uri"),
    /** … or inline payloads for small ones (exactly one of uri/inline is set). */
    inputInline: text("input_inline"),
    expectedInline: text("expected_inline"),
    /** Public = shown via Run; hidden tests are Submit-only, never sent to clients. */
    isPublic: boolean("is_public").notNull().default(false),
    /** Scaling Duel tier (0 = base tier for all other modes). */
    tier: integer("tier").notNull().default(0),
    weight: doublePrecision("weight").notNull().default(1),
  },
  (t) => [
    uniqueIndex("test_cases_problem_ordinal_uq").on(t.problemId, t.ordinal),
    index("test_cases_problem_idx").on(t.problemId),
  ],
);

// ─── matches ──────────────────────────────────────────────────────────────────

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mode: gameModeEnum("mode").notNull(),
    /** Same-language matchmaking key; null = cross-language casual. */
    language: languageEnum("language"),
    /** Null until the problem is assigned (reveal happens at countdown end). */
    problemId: uuid("problem_id").references(() => problems.id),
    status: matchStatusEnum("status").notNull().default("queued"),
    /** MatchConfig from @leetclash/shared, plus room extras (e.g. inviteCode). */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    winnerId: uuid("winner_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("matches_status_idx").on(t.status),
    index("matches_problem_idx").on(t.problemId),
  ],
);

// ─── match_players ────────────────────────────────────────────────────────────

export const matchPlayers = pgTable(
  "match_players",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** win | loss | draw | abandon — null while the match is in flight. */
    result: text("result"),
    ratingBefore: doublePrecision("rating_before"),
    ratingAfter: doublePrecision("rating_after"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.userId] }),
    index("match_players_user_idx").on(t.userId),
  ],
);

// ─── submissions (null match_id = solo practice) ─────────────────────────────

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id),
    language: languageEnum("language").notNull(),
    /** MinIO URI of the archived source blob. Inline in MVP via sourceInline. */
    sourceUri: text("source_uri"),
    /** MVP: source stored inline until MinIO archival lands. TODO(phase2). */
    sourceInline: text("source_inline"),
    /** Raw UTF-8 byte length of the source (Code Golf metric, computed API-side). */
    bytes: integer("bytes").notNull(),
    /** Run = public samples, fast feedback; Submit = hidden suite, counts. */
    kind: submissionKindEnum("kind").notNull().default("submit"),
    status: submissionStatusEnum("status").notNull().default("pending"),
    verdict: verdictEnum("verdict"),
    timeMs: integer("time_ms"),
    /**
     * Summed CPU time across the whole suite (ms) — the same unit the §1.2
     * benchmark medians, so live standings and the final ranking agree.
     */
    timeSumMs: integer("time_sum_ms"),
    memoryKb: integer("memory_kb"),
    /** Tests passed before the first failure / total tests run. */
    testsPassed: integer("tests_passed"),
    testsTotal: integer("tests_total"),
    /** Compile/runtime error detail, truncated server-side. */
    detail: text("detail"),
    /** Highest Scaling Duel tier passed. */
    tierReached: integer("tier_reached"),
    /**
     * Benchmarked median CPU time (ms) from the §1.2 protocol — set only for
     * Fastest Runtime finalists at the fixed-window close, never from the
     * fast-feedback judging path.
     */
    benchmarkMs: integer("benchmark_ms"),
    /** Anti-cheat telemetry (§6.6): paste events recorded before this submit. */
    pasteCount: integer("paste_count").notNull().default(0),
    /** Size (chars) of the largest single paste this editing session. */
    largestPaste: integer("largest_paste").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("submissions_match_idx").on(t.matchId),
    index("submissions_user_idx").on(t.userId),
    index("submissions_problem_idx").on(t.problemId),
  ],
);

// ─── match_events (append-only; powers replay/spectate) ──────────────────────

export const matchEvents = pgTable(
  "match_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    /** MatchEvent["type"] discriminator from @leetclash/shared. */
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("match_events_match_seq_uq").on(t.matchId, t.seq)],
);

// ─── similarity_flags (anti-cheat collusion review queue, §6.5) ──────────────

export const similarityFlags = pgTable(
  "similarity_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    /** The two players whose accepted sources were fingerprinted. */
    userA: uuid("user_a")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userB: uuid("user_b")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Winnowing (MOSS-style) similarity in [0,1]; 1 = identical fingerprints. */
    score: doublePrecision("score").notNull(),
    /** True once similarity crossed the flag threshold — feeds a review queue. */
    flagged: boolean("flagged").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("similarity_flags_match_idx").on(t.matchId),
    index("similarity_flags_flagged_idx").on(t.flagged),
  ],
);
