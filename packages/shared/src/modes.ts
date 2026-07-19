import { GameMode, Language } from "./core.js";

/**
 * Single source of truth for per-mode behaviour (PLAN §1.2).
 *
 * Every service that reasons about a mode — the matchmaker (queue key), the
 * rating engine (rating key), the judge worker (win condition), and the web
 * client (editor language lock) — reads its rule from HERE. Defining the
 * same-language rule and the win metric once is what keeps the queue key and
 * the rating-lookup key from silently disagreeing.
 */

/** How a mode decides the winner. */
export type WinMetric =
  | "time_to_accept" // first fully-accepted submission (sudden death)
  | "runtime_ms" // lowest benchmarked runtime among accepted (lower wins)
  | "source_bytes" // smallest accepted source (lower wins)
  | "peak_memory_kb" // lowest peak memory among accepted (lower wins)
  | "tier_reached" // largest input tier passed (higher wins)
  | "round_wins"; // best-of-N series

export interface ModeSpec {
  mode: GameMode;
  label: string;
  /**
   * Fixed window: accepted does NOT end the match — players keep improving
   * their metric until the wall-clock window closes, then the winner is
   * computed. Sudden death (false): the first player to meet the win
   * condition ends the match immediately (Speed Race).
   */
  fixedWindow: boolean;
  /**
   * Same-language matchmaking: the queue is partitioned by language and the
   * rating is keyed by (mode, language). Perf modes only — Python can't beat
   * C++ on raw ms (§1.2). Cross-language modes key rating by (mode, null).
   */
  sameLanguage: boolean;
  winMetric: WinMetric;
  /** true = a lower metric wins (golf/runtime/memory). */
  lowerIsBetter: boolean;
  /** Default wall-clock window / hard cap, seconds. */
  defaultTimeLimitSec: number;
  /** Shipped and queueable. Blitz is the remaining Phase 4 stub (§9). */
  shipped: boolean;
}

export const MODE_SPECS: Record<GameMode, ModeSpec> = {
  speed_race: {
    mode: "speed_race",
    label: "Speed Race",
    fixedWindow: false,
    sameLanguage: false,
    winMetric: "time_to_accept",
    lowerIsBetter: true,
    defaultTimeLimitSec: 1800,
    shipped: true,
  },
  code_golf: {
    mode: "code_golf",
    label: "Code Golf",
    fixedWindow: true,
    // Cross-language by design: golf is language-agnostic sport, and the plan
    // leaves it ambiguous — plain default is one shared ladder (§1.2 note).
    sameLanguage: false,
    winMetric: "source_bytes",
    lowerIsBetter: true,
    defaultTimeLimitSec: 900,
    shipped: true,
  },
  fastest_runtime: {
    mode: "fastest_runtime",
    label: "Fastest Runtime",
    fixedWindow: true,
    sameLanguage: true,
    winMetric: "runtime_ms",
    lowerIsBetter: true,
    defaultTimeLimitSec: 900,
    shipped: true,
  },
  memory_golf: {
    mode: "memory_golf",
    label: "Memory Golf",
    fixedWindow: true,
    sameLanguage: true,
    winMetric: "peak_memory_kb",
    lowerIsBetter: true,
    defaultTimeLimitSec: 900,
    shipped: true, // Phase 3: cgroup memory.peak via the isolate judge (§4.4)
  },
  scaling_duel: {
    mode: "scaling_duel",
    label: "Scaling Duel",
    fixedWindow: true,
    sameLanguage: false,
    winMetric: "tier_reached",
    lowerIsBetter: false,
    defaultTimeLimitSec: 1200,
    shipped: true, // Phase 3: tiered seeded generation (§4.1)
  },
  blitz: {
    mode: "blitz",
    label: "Blitz",
    fixedWindow: false,
    sameLanguage: false,
    winMetric: "round_wins",
    lowerIsBetter: false,
    defaultTimeLimitSec: 300,
    shipped: false, // best-of-N series — Phase 4 (§9)
  },
};

/** Modes a player can queue for / a room can select. */
export const SHIPPED_MODES = (Object.values(MODE_SPECS) as ModeSpec[])
  .filter((s) => s.shipped)
  .map((s) => s.mode);

export function isSameLanguageMode(mode: GameMode): boolean {
  return MODE_SPECS[mode].sameLanguage;
}

export function isFixedWindowMode(mode: GameMode): boolean {
  return MODE_SPECS[mode].fixedWindow;
}

/**
 * Rating ladder key. Same-language modes have a per-language ladder; everyone
 * else shares one ladder (language = null). This MUST agree with queueKey — a
 * player is matched, rated, and ranked on the same ladder.
 */
export function ratingLanguageKey(
  mode: GameMode,
  language: Language | null,
): Language | null {
  return isSameLanguageMode(mode) ? language : null;
}

/**
 * Redis ZSET key for the matchmaking queue. Same-language modes get one queue
 * per language (only same-language players pair); cross-language modes pool
 * everyone under `x`.
 */
export function queueKey(mode: GameMode, language: Language | null): string {
  const lang = isSameLanguageMode(mode) ? (language ?? "x") : "x";
  return `mm:q:${mode}:${lang}`;
}

/** Leaderboard ZSET key — mirrors the rating ladder key. */
export function leaderboardKey(mode: GameMode, language: Language | null): string {
  return `lb:${mode}:${ratingLanguageKey(mode, language) ?? "all"}`;
}

/**
 * Per-language interpreter/runtime memory floor (KB), measured against an
 * empty program (§1.2): Memory Golf subtracts it for display and for ranking
 * in cross-language (casual) rooms so Python's ~10 MB floor doesn't dominate.
 * Ranked Memory Golf is same-language, where the baseline cancels out anyway.
 * Dev-calibrated defaults — re-measure on the production judge image.
 */
export const LANGUAGE_MEMORY_BASELINE_KB: Record<Language, number> = {
  python: 9_800,
  cpp: 1_600,
  javascript: 42_000,
  java: 36_000,
  go: 2_100,
  rust: 1_700,
};

/** Peak memory adjusted by the language baseline (never below zero). */
export function adjustedMemoryKb(memoryKb: number, language: Language): number {
  return Math.max(0, memoryKb - LANGUAGE_MEMORY_BASELINE_KB[language]);
}
