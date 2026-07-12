# @leetclash/realtime

WebSocket gateway (Socket.IO + Redis adapter). Sits between browsers and the
backend: clients join per-match rooms; api/matchmaker push `MatchEvent`s
through Redis pub/sub and this service fans them out (PLAN.md §3.1–3.2).

## What it does (Phase 0)

- **Rooms** (`src/rooms.ts`): `match:join` / `match:leave` with zod-validated
  payloads. On join, replies with `match:state` read from the Redis key
  `match:{id}:state` (null if absent).
- **Bridge** (`src/bridge.ts`): subscribes to the `match-events` Redis channel,
  validates each message against the shared `MatchEvent` schema, and broadcasts
  it to room `match:{matchId}` as `match:event`. Invalid payloads are logged
  and dropped.
- **Presence** (`src/presence.ts`): in-memory socket→match tracking; disconnect
  logging only.
- **Redis adapter**: rooms work across multiple gateway instances.

## Honest gaps (Phase 1)

- **No auth.** Any client can join any match room. Phase 1 adds session-token
  verification in Socket.IO middleware.
- **No disconnect grace period.** The 60s reconnect window (§3.2) belongs to
  the match state machine in api, not this gateway.

## Config (env, zod-validated)

| Var | Default | Purpose |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Adapter + pub/sub + state reads |
| `REALTIME_PORT` | `4001` | Listen port (`/healthz` for checks) |
| `WEB_URL` | `http://localhost:3000` | Only allowed CORS origin |

## Run

```bash
pnpm dev        # tsx watch
pnpm typecheck
pnpm build
```
