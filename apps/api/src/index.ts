import cors from "@fastify/cors";
import Fastify from "fastify";
import { mountAuth } from "./auth.js";
import { config } from "./config.js";
import { closeDb } from "./db/client.js";
import { healthRoutes } from "./routes/health.js";
import { problemRoutes } from "./routes/problems.js";
import { roomRoutes } from "./routes/rooms.js";
import { userRoutes } from "./routes/users.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: config.WEB_URL,
  credentials: true,
});

mountAuth(app);
await app.register(healthRoutes);
await app.register(problemRoutes);
await app.register(roomRoutes);
await app.register(userRoutes);

// Graceful shutdown: stop accepting connections, then close the DB pool.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
    await closeDb();
    process.exit(0);
  } catch (err) {
    app.log.error(err, "error during shutdown");
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
