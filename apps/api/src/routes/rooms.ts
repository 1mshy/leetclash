import { randomInt } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { matches, matchPlayers } from "../db/schema.js";

/**
 * Private rooms — Phase 1 skeleton (PLAN.md §9: invite code, Speed Race only).
 *
 * Auth is not wired through yet (see src/auth.ts TODO), so callers pass their
 * userId explicitly. TODO(phase1): derive userId from the better-auth session
 * and reject unauthenticated requests.
 */

// Unambiguous alphabet (no 0/O/1/I/L) for shout-across-the-room invite codes.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

const CreateRoomBody = z.object({
  hostId: z.string().uuid(),
  timeLimitSec: z.number().int().positive().max(3600).default(1800),
});

const JoinRoomParams = z.object({
  code: z
    .string()
    .length(CODE_LENGTH)
    .transform((s) => s.toUpperCase()),
});

const JoinRoomBody = z.object({
  userId: z.string().uuid(),
});

export const roomRoutes: FastifyPluginAsync = async (app) => {
  /** Create a private room: a match row in 'matched' with an invite code. */
  app.post("/rooms", async (request, reply) => {
    const body = CreateRoomBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    }

    const inviteCode = generateInviteCode();
    // MatchConfig shape from @leetclash/shared, plus the room's inviteCode.
    const roomConfig = {
      inviteCode,
      mode: "speed_race",
      language: null,
      difficulty: null,
      timeLimitSec: body.data.timeLimitSec,
      bestOf: null,
      ranked: false,
    };

    const [match] = await db
      .insert(matches)
      .values({
        mode: "speed_race",
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
    const body = JoinRoomBody.safeParse(request.body);
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

    // TODO(phase1): notify the realtime service (Redis pub/sub) so it starts
    // the countdown state machine and appends match_created / countdown_started
    // rows to match_events. This route only persists the join.

    return reply.status(200).send({ matchId: match.id });
  });
};
