import { z } from "zod";
import { Difficulty, Language } from "./core.js";

/** Per-language execution limits; multipliers applied over a C++ baseline. */
export const LanguageLimits = z.object({
  timeLimitMs: z.number().int().positive(),
  memoryLimitKb: z.number().int().positive(),
});
export type LanguageLimits = z.infer<typeof LanguageLimits>;

/** problem.json manifest for packages/problems entries. */
export const ProblemManifest = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  difficulty: Difficulty,
  tags: z.array(z.string()),
  /** Baseline limits (C++); per-language overrides on top. */
  limits: z.object({
    baseline: LanguageLimits,
    overrides: z.record(Language, LanguageLimits.partial()).default({}),
  }),
  starterCode: z.record(Language, z.string()).default({}),
  /** Ordinals of test cases shown as public samples (Run uses these). */
  publicTests: z.array(z.number().int().nonnegative()),
});
export type ProblemManifest = z.infer<typeof ProblemManifest>;

export const ProblemSummary = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  difficulty: Difficulty,
  tags: z.array(z.string()),
});
export type ProblemSummary = z.infer<typeof ProblemSummary>;
