import type { FastifyPluginAsync } from "fastify";
import { registry } from "../metrics.js";

/** Prometheus scrape endpoint (PLAN §3.1 observability, hardened in Phase 3). */
export const metricsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/metrics", async (_request, reply) => {
    reply.header("content-type", registry.contentType);
    return registry.metrics();
  });
};
