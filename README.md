# LeetClash

Real-time 1v1 competitive coding duels. Both players get the same problem at the
same instant and race under a mode-specific win condition (speed, runtime, code
golf, memory, scaling). Full design in [PLAN.md](./PLAN.md).

## Repo layout

| Path | What |
|---|---|
| `apps/web` | Next.js 15 UI — lobby, Monaco duel screen |
| `apps/api` | Fastify REST API — auth, problems, rooms, submission queue, Judge0 client |
| `apps/realtime` | Socket.IO gateway — match rooms, live opponent progress |
| `packages/shared` | Shared types: modes, verdicts, match-event schema (zod) |
| `packages/problems` | Original problem bank + authoring/validation toolchain |
| `infra/` | docker-compose (postgres, redis, minio, Judge0), Traefik, observability |

## Quick start (dev)

```sh
corepack enable pnpm
pnpm install
cp .env.example .env

# infra: postgres, redis, minio, judge0
docker compose -f infra/docker-compose.yml up -d

# db migrations + seed the problem bank
pnpm --filter @leetclash/api db:migrate
pnpm --filter @leetclash/api db:seed

# run everything (web :3000, api :4000, realtime :4001)
pnpm dev

# in another terminal: the judging + match-lifecycle worker
pnpm --filter @leetclash/api dev:worker
```

Validate the problem bank (reference solutions must pass, bad ones must fail):

```sh
pnpm problems:validate
```

## Status

Phase 1 (playable MVP) — private rooms with invite codes, Speed Race duels
(Python + C++), Run/Submit via Judge0, live opponent progress, results screen
with code reveal and rematch, 15-problem bank. See PLAN.md §9 for the roadmap.
