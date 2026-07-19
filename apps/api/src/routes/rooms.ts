import { and, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  CreateRoomRequest,
  INVITE_CODE_LENGTH,
  JoinRoomRequest,
  MODE_SPECS,
} from "@leetclash/shared";
import { db } from "../db/client.js";
import { matches, matchPlayers } from "../db/schema.js";
import { enqueueMatchStart } from "../match/engine.js";
import { generateInviteCode } from "../match/invite.js";

/**
 * Private rooms — Phase 1 (PLAN.md §9: invite code, Speed Race only).
 *
 * Auth is not wired through yet (see src/auth.ts TODO), so callers pass their
 * userId explicitly (a guest id from POST /users/guest). TODO(phase2): derive
 * userId from the better-auth session and reject unauthenticated requests.
 */

const JoinRoomParams = z.object({
  code: z
    .string()
    .length(INVITE_CODE_LENGTH)
    .transform((s) => s.toUpperCase()),
});

export const roomRoutes: FastifyPluginAsync = async (app) => {
  /** Create a private room: a match row in 'matched' with an invite code. */
  app.post("/rooms", async (request, reply) => {
    const body = CreateRoomRequest.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    }

    const inviteCode = generateInviteCode();
    const mode = body.data.mode;
    // MatchConfig shape from @leetclash/shared, plus the room's inviteCode.
    // Rooms are always cross-language casual (language: null) — perf modes in
    // a room are the plan's "clearly labeled unfair" arena (§1.2).
    const roomConfig = {
      inviteCode,
      mode,
      language: null,
      difficulty: null,
      timeLimitSec: body.data.timeLimitSec ?? MODE_SPECS[mode].defaultTimeLimitSec,
      bestOf: null,
      ranked: false,
    };

    const [match] = await db
      .insert(matches)
      .values({
        mode,
        status: "matched",
        config: roomConfig,
        // problemId stays null: the problem is assigned and revealed by the
        // realtime service when the countdown ends (server is the only clock).
      })
      .returning({ id: matches.id });

    if (!match) {
      return reply.status(500).send({ error: "failed to create room" });
    }

    await db.insert(matchPlayers).values({
      matchId: match.id,
      userId: body.data.hostId,
    });

    return reply.status(201).send({ matchId: match.id, inviteCode });
  });

  /** Join a room by invite code. */
  app.post("/rooms/:code/join", async (request, reply) => {
    const params = JoinRoomParams.safeParse(request.params);
    const body = JoinRoomRequest.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: "invalid code or body" });
    }

    const [match] = await db
      .select({ id: matches.id, config: matches.config })
      .from(matches)
      .where(
        and(
          sql`${matches.config} ->> 'inviteCode' = ${params.data.code}`,
          eq(matches.status, "matched"),
        ),
      )
      .limit(1);

    if (!match) {
      return reply.status(404).send({ error: "room not found or already started" });
    }

    const players = await db
      .select({ userId: matchPlayers.userId })
      .from(matchPlayers)
      .where(eq(matchPlayers.matchId, match.id));

    if (players.some((p) => p.userId === body.data.userId)) {
      return reply.status(409).send({ error: "already in this room" });
    }
    if (players.length >= 2) {
      return reply.status(409).send({ error: "room is full" });
    }

    await db.insert(matchPlayers).values({
      matchId: match.id,
      userId: body.data.userId,
    });

    // Room is full — hand off to the match state machine (countdown → reveal
    // → live → finished), which runs as durable jobs in the worker process.
    await enqueueMatchStart(match.id);

    return reply.status(200).send({ matchId: match.id });
  });
};
