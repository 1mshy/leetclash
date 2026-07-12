import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { FastifyInstance } from "fastify";
import { config } from "./config.js";
import { db } from "./db/client.js";

/**
 * better-auth setup (PLAN.md §8: GitHub + Google OAuth).
 *
 * TODO(phase1): generate better-auth's own tables (user/session/account/
 * verification) into src/db/schema.ts via `npx @better-auth/cli generate`
 * and link them to our `users` table (handle, avatar sync on first login).
 * Until then OAuth flows will fail at the DB layer — fine for Phase 0.
 */
export const auth = betterAuth({
  secret: config.AUTH_SECRET,
  baseURL: `http://localhost:${config.API_PORT}`,
  trustedOrigins: [config.WEB_URL],
  database: drizzleAdapter(db, { provider: "pg" }),
  socialProviders: {
    github: {
      clientId: config.GITHUB_CLIENT_ID,
      clientSecret: config.GITHUB_CLIENT_SECRET,
    },
    google: {
      clientId: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
    },
  },
});

/**
 * Mount better-auth on Fastify by bridging Fastify's req/reply to the
 * web-standard Request/Response handler better-auth exposes. This is the
 * integration pattern recommended by better-auth's docs for Fastify.
 */
export function mountAuth(app: FastifyInstance): void {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value === undefined) continue;
        headers.append(key, Array.isArray(value) ? value.join(", ") : value);
      }

      const webRequest = new Request(url.toString(), {
        method: request.method,
        headers,
        body:
          request.method === "GET" || request.body == null
            ? undefined
            : JSON.stringify(request.body),
      });

      const response = await auth.handler(webRequest);

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });
      reply.send(response.body ? await response.text() : null);
    },
  });
}
