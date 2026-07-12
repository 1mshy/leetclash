import { and, asc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { problems, testCases } from "../db/schema.js";

const SlugParams = z.object({ slug: z.string().regex(/^[a-z0-9-]+$/) });

export const problemRoutes: FastifyPluginAsync = async (app) => {
  /** List published problem summaries (matches ProblemSummary in shared). */
  app.get("/problems", async () => {
    const rows = await db
      .select({
        id: problems.id,
        slug: problems.slug,
        title: problems.title,
        difficulty: problems.difficulty,
        tags: problems.tags,
      })
      .from(problems)
      .where(eq(problems.status, "published"))
      .orderBy(asc(problems.slug));

    return { problems: rows };
  });

  /**
   * Full problem detail: statement, starter code, and PUBLIC sample tests
   * only. Hidden tests never leave the server (PLAN.md §6.3).
   */
  app.get("/problems/:slug", async (request, reply) => {
    const params = SlugParams.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid slug" });
    }

    const [problem] = await db
      .select({
        id: problems.id,
        slug: problems.slug,
        title: problems.title,
        difficulty: problems.difficulty,
        tags: problems.tags,
        statementMd: problems.statementMd,
        ioSpec: problems.ioSpec,
        starterCode: problems.starterCode,
        limits: problems.limits,
      })
      .from(problems)
      .where(and(eq(problems.slug, params.data.slug), eq(problems.status, "published")))
      .limit(1);

    if (!problem) {
      return reply.status(404).send({ error: "problem not found" });
    }

    const sampleTests = await db
      .select({
        ordinal: testCases.ordinal,
        input: testCases.inputInline,
        expected: testCases.expectedInline,
      })
      .from(testCases)
      .where(and(eq(testCases.problemId, problem.id), eq(testCases.isPublic, true)))
      .orderBy(asc(testCases.ordinal));

    return { ...problem, sampleTests };
  });
};
