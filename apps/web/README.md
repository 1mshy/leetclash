# @leetclash/web

Next.js 15 (app router) frontend for LeetClash — lobby, duel screen, Monaco
editor, live opponent progress.

## Run

```sh
pnpm dev        # http://localhost:3000
pnpm typecheck
pnpm build
```

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | REST api service |
| `NEXT_PUBLIC_REALTIME_URL` | `http://localhost:4001` | Socket.IO realtime gateway |

## Layout

- `src/app/` — pages: lobby (`page.tsx`), duel screen (`match/[id]/page.tsx`)
- `src/components/` — `CodeEditor` (Monaco, python/cpp, live byte counter),
  `OpponentProgress` (tests passed / submissions / last verdict)
- `src/lib/` — `api.ts` (fetch helper), `socket.ts` (socket.io singleton +
  typed join/leave helpers)
- `src/stores/match.ts` — Zustand match store with `applyMatchEvent` reducer
  over `MatchEvent` from `@leetclash/shared`

## Status (Phase 0)

Skeleton only. Run/Submit are stubbed; room create/join calls the api service
and surfaces an error if it is not running yet; opponent progress renders its
zero state until the realtime service exists.
