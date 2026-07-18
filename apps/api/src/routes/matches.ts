import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { MatchDetail, MatchProblem, PlayerReveal } from "@leetclash/shared";
import { RematchRequest } from "@leetclash/shared";
import { db } from "../db/client.js";
import {
  matches,
  matchPlayers,
  problems,
  submissions,
  testCases,
  users,
} from "../db/schema.js";
import { enqueueMatchStart } from "../match/engine.js";
import { appendMatchEvent } from "../match/events.js";
import { generateInviteCode } from "../match/invite.js";

const IdParams = z.object({ id: z.string().uuid() });

/** Statuses in which the problem has been revealed and may be sent to clients. */
const REVEALED_STATUSES = ["live", "judging", "finished"] as const;

export const matchRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Match detail (shape: MatchDetail in @leetclash/shared). The problem is
   * included only after reveal; per-player code reveal only after finish
   * (§1.1 step 5 — both solutions shown on the results screen).
   */
  app.get("/matches/:id", async (request, reply) => {
    const params = IdParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "invalid match id" });
    const matchId = params.data.id;

    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);
    if (!match) return reply.status(404).send({ error: "match not found" });

    const players = await db
      .select({
        id: matchPlayers.userId,
        handle: users.handle,
        result: matchPlayers.result,
        ratingBefore: matchPlayers.ratingBefore,
        ratingAfter: matchPlayers.ratingAfter,
      })
      .from(matchPlayers)
      .innerJoin(users, eq(matchPlayers.userId, users.id))
      .where(eq(matchPlayers.matchId, matchId))
      .orderBy(asc(matchPlayers.joinedAt));

    const revealed =
      match.problemId !== null &&
      (REVEALED_STATUSES as readonly string[]).includes(match.status);

    let problem: MatchProblem | null = null;
    if (revealed && match.problemId) {
      const [p] = await db
        .select({
          id: problems.id,
          slug: problems.slug,
          title: problems.title,
          difficulty: problems.difficulty,
          statementMd: problems.statementMd,
          ioSpec: problems.ioSpec,
          starterCode: problems.starterCode,
        })
        .from(problems)
        .where(eq(problems.id, match.problemId))
        .limit(1);
      if (p) {
        const sampleTests = await db
          .select({
            ordinal: testCases.ordinal,
            input: testCases.inputInline,
            expected: testCases.expectedInline,
          })
          .from(testCases)
          .where(and(eq(testCases.problemId, p.id), eq(testCases.isPublic, true)))
          .orderBy(asc(testCases.ordinal));
        problem = {
          ...p,
          starterCode: (p.starterCode ?? {}) as Record<string, string>,
          sampleTests: sampleTests.map((t) => ({
            ordinal: t.ordinal,
            input: t.input ?? "",
            expected: t.expected ?? "",
          })),
        };
      }
    }

    const results =
      match.status === "finished" ? await buildResults(matchId, match.mode, players) : null;

    const cfg = match.config as {
      inviteCode?: string;
      timeLimitSec?: number;
      ranked?: boolean;
    };
    const detail: MatchDetail = {
      id: match.id,
      mode: match.mode,
      status: match.status,
      ranked: cfg.ranked === true,
      language: match.language,
      inviteCode: cfg.inviteCode ?? null,
      timeLimitSec: Number(cfg.timeLimitSec ?? 1800),
      players: players.map((p) => ({ id: p.id, handle: p.handle, result: p.result })),
      problem,
      startedAt: match.startedAt?.toISOString() ?? null,
      endedAt: match.endedAt?.toISOString() ?? null,
      winnerId: match.winnerId,
      results,
    };
    return detail;
  });

  /**
   * Rematch: same players, fresh match, previous problem excluded. Idempotent
   * per source match — the first caller creates it, everyone else is routed
   * to the same new match (both players' Rematch buttons may race).
   */
  app.post("/matches/:id/rematch", async (request, reply) => {
    const params = IdParams.safeParse(request.params);
    const body = RematchRequest.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: "invalid match id or body" });
    }
    const oldMatchId = params.data.id;
    const { userId } = body.data;

    type RematchOutcome = { error: 403 | 404 | 409 } | { matchId: string; created: boolean };
    const outcome = await db.transaction<RematchOutcome>(async (tx) => {
      const [old] = await tx
        .select()
        .from(matches)
        .where(eq(matches.id, oldMatchId))
        .limit(1)
        .for("update");
      if (!old) return { error: 404 as const };
      if (old.status !== "finished") return { error: 409 as const };

      const players = await tx
        .select({ userId: matchPlayers.userId })
        .from(matchPlayers)
        .where(eq(matchPlayers.matchId, oldMatchId));
      if (!players.some((p) => p.userId === userId)) return { error: 403 as const };

      const oldCfg = old.config as { rematchMatchId?: string; timeLimitSec?: number };
      if (oldCfg.rematchMatchId) {
        return { matchId: oldCfg.rematchMatchId, created: false };
      }

      const [rematch] = await tx
        .insert(matches)
        .values({
          mode: old.mode,
          status: "matched",
          config: {
            inviteCode: generateInviteCode(),
            mode: old.mode,
            language: null,
            difficulty: null,
            timeLimitSec: Number(oldCfg.timeLimitSec ?? 1800),
            bestOf: null,
            ranked: false,
            excludeProblemId: old.problemId,
          },
        })
        .returning({ id: matches.id });
      if (!rematch) throw new Error("failed to create rematch");

      await tx
        .insert(matchPlayers)
        .values(players.map((p) => ({ matchId: rematch.id, userId: p.userId })));

      await tx
        .update(matches)
        .set({ config: { ...(old.config as object), rematchMatchId: rematch.id } })
        .where(eq(matches.id, oldMatchId));

      return { matchId: rematch.id, created: true };
    });

    if ("error" in outcome) {
      const messages = {
        403: "not a player in this match",
        404: "match not found",
        409: "match is not finished",
      } as const;
      return reply.status(outcome.error).send({ error: messages[outcome.error] });
    }

    if (outcome.created) {
      // Tell the old match's room so the opponent's client follows along,
      // then start the new match's countdown.
      await appendMatchEvent(oldMatchId, "rematch", {
        newMatchId: outcome.matchId,
        byUserId: userId,
      });
      await enqueueMatchStart(outcome.matchId);
    }

    return reply.status(200).send({ matchId: outcome.matchId });
  });
};

/**
 * Per-player reveal (§1.1 step 5). The shown submission is the one that decided
 * the mode's metric — smallest accepted source for Code Golf, benchmarked/
 * fastest accepted for Fastest Runtime, first accepted for Speed Race — falling
 * back to the latest submit if the player never solved it.
 */
async function buildResults(
  matchId: string,
  mode: string,
  players: {
    id: string;
    handle: string;
    ratingBefore: number | null;
    ratingAfter: number | null;
  }[],
): Promise<PlayerReveal[]> {
  const subs = await db
    .select({
      userId: submissions.userId,
      language: submissions.language,
      source: submissions.sourceInline,
      verdict: submissions.verdict,
      timeMs: submissions.timeMs,
      memoryKb: submissions.memoryKb,
      bytes: submissions.bytes,
      benchmarkMs: submissions.benchmarkMs,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.matchId, matchId),
        eq(submissions.kind, "submit"),
        inArray(
          submissions.userId,
          players.map((p) => p.id),
        ),
      ),
    )
    .orderBy(desc(submissions.createdAt));

  return players.map((p) => {
    const mine = subs.filter((s) => s.userId === p.id);
    const accepted = mine.filter((s) => s.verdict === "accepted");
    const acceptedFirst = accepted[accepted.length - 1]; // oldest accepted (desc order)
    let shown = acceptedFirst ?? mine[0];
    if (accepted.length > 0) {
      if (mode === "code_golf") {
        shown = accepted.reduce((a, b) => (b.bytes < a.bytes ? b : a));
      } else if (mode === "fastest_runtime") {
        const benched = accepted.find((s) => s.benchmarkMs !== null);
        shown =
          benched ??
          accepted.reduce((a, b) =>
            (b.timeMs ?? Infinity) < (a.timeMs ?? Infinity) ? b : a,
          );
      }
    }
    return {
      userId: p.id,
      handle: p.handle,
      language: shown?.language ?? null,
      source: shown?.source ?? null,
      verdict: shown?.verdict ?? null,
      timeMs: shown?.timeMs ?? null,
      memoryKb: shown?.memoryKb ?? null,
      bytes: shown?.bytes ?? null,
      submitCount: mine.length,
      acceptedAt: acceptedFirst?.createdAt.toISOString() ?? null,
      benchmarkMs: shown?.benchmarkMs ?? null,
      ratingBefore: p.ratingBefore,
      ratingAfter: p.ratingAfter,
    };
  });
}
