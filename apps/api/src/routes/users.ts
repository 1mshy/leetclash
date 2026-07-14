import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

/**
 * Guest identity bootstrap — Phase 0 stand-in for real auth so the rooms flow
 * is exercisable end-to-end (match_players.user_id has an FK to users).
 * TODO(phase1): remove once better-auth sessions provide real user ids.
 */
export const userRoutes: FastifyPluginAsync = async (app) => {
  /** Create an anonymous guest user; returns GuestUser from @leetclash/shared. */
  app.post("/users/guest", async (_request, reply) => {
    const handle = `guest-${randomUUID().slice(0, 8)}`;
    const [user] = await db
      .insert(users)
      .values({ handle, email: `${handle}@guest.invalid` })
      .returning({ id: users.id, handle: users.handle });

    if (!user) {
      return reply.status(500).send({ error: "failed to create guest user" });
    }
    return reply.status(201).send(user);
  });
};
