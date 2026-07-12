import { createServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { Server } from "socket.io";
import { startMatchEventBridge } from "./bridge.js";
import { loadConfig } from "./config.js";
import { registerPresenceHandlers } from "./presence.js";
import { registerRoomHandlers } from "./rooms.js";

const config = loadConfig();

// Three ioredis connections:
//  - pubClient/subClient: the Socket.IO Redis adapter pair (cross-instance rooms)
//  - eventSub: dedicated subscriber for the match-events bridge (a subscribed
//    connection can't run other commands, and the adapter owns its own pair)
// pubClient is also reused for plain commands (match-state reads in rooms.ts).
const pubClient = new Redis(config.REDIS_URL);
const subClient = pubClient.duplicate();
const eventSub = pubClient.duplicate();

for (const [name, client] of [
  ["pub", pubClient],
  ["sub", subClient],
  ["event-sub", eventSub],
] as const) {
  client.on("error", (err) => console.error(`[realtime] redis ${name} error:`, err.message));
}

const httpServer = createServer((req, res) => {
  // Bare health endpoint for compose/Traefik checks.
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404).end();
});

const io = new Server(httpServer, {
  adapter: createAdapter(pubClient, subClient),
  cors: {
    origin: config.WEB_URL,
    credentials: true,
  },
});

// TODO(Phase 1 — auth): io.use() middleware verifying a session token and
// attaching userId to socket.data before any room handler runs.

registerRoomHandlers(io, pubClient);
registerPresenceHandlers(io);
await startMatchEventBridge(io, eventSub);

httpServer.listen(config.REALTIME_PORT, () => {
  console.log(
    `[realtime] listening on :${config.REALTIME_PORT} (CORS origin: ${config.WEB_URL})`,
  );
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[realtime] ${signal} received, shutting down…`);

  // io.close() disconnects sockets and closes the underlying HTTP server.
  await io.close();
  eventSub.disconnect();
  subClient.disconnect();
  pubClient.disconnect();

  console.log("[realtime] shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
