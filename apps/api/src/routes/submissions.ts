import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { CreateSubmissionRequest, SUBMIT_THROTTLE_SEC } from "@leetclash/shared";
import { db } from "../db/client.js";
import { matches, matchPlayers, submissions } from "../db/schema.js";
import { appendMatchEvent } from "../match/events.js";
import { enqueueSubmission } from "../queue/submissions.js";

const IdParams = z.object({ id: z.string().uuid() });

export const submissionRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Run (public samples) or Submit (hidden suite, counts toward the match).
   * Persists the row, appends submission_received to the match log, and
   * enqueues judging. The verdict lands asynchronously — clients poll
   * GET /submissions/:id and watch progress/verdict match events.
   */
  app.post("/submissions", async (request, reply) => {
    const body = CreateSubmissionRequest.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    }
    const { userId, matchId, language, source, kind, pasteCount, largestPaste } = body.data;

    const [match] = await db
      .select({ status: matches.status, problemId: matches.problemId })
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);
    if (!match) return reply.status(404).send({ error: "match not found" });
    if (match.status !== "live" || !match.problemId) {
      return reply.status(409).send({ error: "match is not live" });
    }

    const [player] = await db
      .select({ userId: matchPlayers.userId })
      .from(matchPlayers)
      .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, userId)))
      .limit(1);
    if (!player) return reply.status(403).send({ error: "not a player in this match" });

    // Submit throttle (§1.2): 1 per SUBMIT_THROTTLE_SEC per player per match.
    if (kind === "submit") {
      const [last] = await db
        .select({ createdAt: submissions.createdAt })
        .from(submissions)
        .where(
          and(
            eq(submissions.matchId, matchId),
            eq(submissions.userId, userId),
            eq(submissions.kind, "submit"),
          ),
        )
        .orderBy(desc(submissions.createdAt))
        .limit(1);
      if (last) {
        const elapsedSec = (Date.now() - last.createdAt.getTime()) / 1000;
        if (elapsedSec < SUBMIT_THROTTLE_SEC) {
          const retryAfterSec = Math.ceil(SUBMIT_THROTTLE_SEC - elapsedSec);
          return reply
            .status(429)
            .header("retry-after", String(retryAfterSec))
            .send({ error: "submit throttled", retryAfterSec });
        }
      }
    }

    const [submission] = await db
      .insert(submissions)
      .values({
        matchId,
        userId,
        problemId: match.problemId,
        language,
        sourceInline: source,
        bytes: Buffer.byteLength(source, "utf8"),
        kind,
        // Anti-cheat telemetry (§6.6) — recorded, surfaced to the review queue.
        pasteCount,
        largestPaste,
      })
      .returning({ id: submissions.id });
    if (!submission) return reply.status(500).send({ error: "failed to persist submission" });

    await appendMatchEvent(matchId, "submission_received", {
      userId,
      submissionId: submission.id,
      kind,
    });

    await enqueueSubmission(submission.id, userId, {
      matchId,
      problemId: match.problemId,
      language,
      source,
      kind,
    });

    return reply.status(201).send({ submissionId: submission.id });
  });

  /** Poll a submission's judging status; shape matches SubmissionResult. */
  app.get("/submissions/:id", async (request, reply) => {
    const params = IdParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "invalid id" });

    const [row] = await db
      .select({
        id: submissions.id,
        status: submissions.status,
        verdict: submissions.verdict,
        timeMs: submissions.timeMs,
        memoryKb: submissions.memoryKb,
        bytes: submissions.bytes,
        testsPassed: submissions.testsPassed,
        testsTotal: submissions.testsTotal,
        tierReached: submissions.tierReached,
        detail: submissions.detail,
      })
      .from(submissions)
      .where(eq(submissions.id, params.data.id))
      .limit(1);
    if (!row) return reply.status(404).send({ error: "submission not found" });

    return {
      submissionId: row.id,
      status: row.status,
      verdict: row.verdict,
      timeMs: row.timeMs,
      memoryKb: row.memoryKb,
      bytes: row.bytes,
      testsPassed: row.testsPassed ?? 0,
      testsTotal: row.testsTotal ?? 0,
      tierReached: row.tierReached,
      detail: row.detail,
    };
  });
};
