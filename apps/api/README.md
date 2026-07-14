# @leetclash/api

REST API for LeetClash (PLAN.md §3.1): auth, problems, rooms, and the
submission judging pipeline. Fastify + Drizzle ORM (Postgres via postgres.js) +
BullMQ (Redis) + Judge0.

## Run

```sh
pnpm dev          # API server on :4000 (tsx watch)
pnpm dev:worker   # submission judging worker (separate process)
```

Requires Postgres, Redis, and Judge0 from the repo's docker-compose. Config is
zod-validated env (`src/config.ts`): `DATABASE_URL`, `REDIS_URL`, `JUDGE0_URL`,
`API_PORT` (default 4000), `AUTH_SECRET`, `WEB_URL`, plus GitHub/Google OAuth
credentials (may be empty in dev).

## Database

Schema in `src/db/schema.ts` (PLAN.md §5): users, ratings, problems,
test_cases, matches, match_players, submissions, match_events.

```sh
pnpm db:generate   # emit SQL migrations to ./drizzle
pnpm db:migrate    # apply them
pnpm db:seed       # upsert packages/problems into problems/test_cases (idempotent)
```

## Routes

- `GET /health` — liveness.
- `GET /problems` — published problem summaries.
- `GET /problems/:slug` — statement + starter code + **public sample tests
  only** (hidden tests never leave the server).
- `POST /users/guest` — create an anonymous guest user (Phase 0 stand-in for
  auth; the web caches the id in localStorage).
- `POST /rooms` — create a private room (match in `matched` status, 6-char
  invite code, Speed Race). Phase 1 skeleton. Body/response DTOs live in
  `@leetclash/shared` (`CreateRoomRequest` / `CreateRoomResponse`).
- `POST /rooms/:code/join` — join by invite code (`JoinRoomRequest`).
- `/api/auth/*` — better-auth (GitHub + Google OAuth). Skeleton: auth tables
  still need to be generated (`npx @better-auth/cli generate`).

## Judging pipeline

`src/queue/submissions.ts` enqueues onto the BullMQ `submissions` queue;
`src/queue/worker.ts` pulls jobs and judges each test case through Judge0
(`src/judge0.ts`: base64 POST, poll by token, status → Verdict mapping).
Phase 3 replaces Judge0 with custom isolate-based workers.

Known Phase 0 gaps (marked with TODO in the code): realtime notifications,
auth-derived user ids on room routes, MinIO-backed test data and source
archival, per-language limit overrides.
