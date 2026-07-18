import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  QueueJoinRequest,
  QueueLeaveRequest,
  type QueueJoinResponse,
  type QueueStatusResponse,
} from "@leetclash/shared";
import {
  dequeuePlayer,
  enqueuePlayer,
  getQueueStatus,
  runMatchmakerTick,
} from "../match/matchmaker.js";

/**
 * Ranked matchmaking (PLAN §3.1). The queue lives in Redis; these endpoints are
 * the REST surface. On join we enqueue and immediately run one lock-guarded
 * matchmaker pass so two players who are both waiting pair within milliseconds;
 * the worker's interval is the safety net for a lone waiter whose band widens.
 *
 * A queued player learns they've been paired via GET /queue/status (poll) and
 * via the `queue_matched` push on their per-user socket room (see realtime).
 */
const StatusQuery = z.object({ userId: z.string().uuid() });

export const queueRoutes: FastifyPluginAsync = async (app) => {
  app.post("/queue/join", async (request, reply) => {
    const body = QueueJoinRequest.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    }
    const { userId, mode, language, difficulty } = body.data;

    await enqueuePlayer({ userId, mode, language, difficulty });
    // Best-effort instant pairing; safe to fail (the interval retries).
    try {
      await runMatchmakerTick();
    } catch (err) {
      app.log.warn({ err }, "matchmaker tick on join failed");
    }

    const status = await getQueueStatus(userId);
    const res: QueueJoinResponse =
      status.status === "matched"
        ? { status: "matched", matchId: status.matchId }
        : { status: "searching", matchId: null };
    return reply.status(200).send(res);
  });

  app.post("/queue/leave", async (request, reply) => {
    const body = QueueLeaveRequest.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "invalid body" });
    }
    await dequeuePlayer(body.data.userId);
    return reply.status(200).send({ ok: true });
  });

  app.get("/queue/status", async (request, reply) => {
    const query = StatusQuery.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: "invalid userId" });
    }
    const status = await getQueueStatus(query.data.userId);
    const res: QueueStatusResponse =
      status.status === "matched"
        ? { status: "matched", matchId: status.matchId, mode: null, language: null, waitedSec: 0 }
        : status.status === "searching"
          ? {
              status: "searching",
              matchId: null,
              mode: status.mode as QueueStatusResponse["mode"],
              language: status.language,
              waitedSec: status.waitedSec,
            }
          : { status: "idle", matchId: null, mode: null, language: null, waitedSec: 0 };
    return reply.status(200).send(res);
  });
};
