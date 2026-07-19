# @leetclash/judge — isolate judge workers (Phase 3, PLAN §4)

Custom judge built on [`isolate`](https://github.com/ioi/isolate) (the IOI
sandbox Judge0/CMS use underneath). Consumes `judge-exec-<language>` BullMQ
queues; one job = one full suite pass (compile once, run every planned case).

What it adds over Judge0 (§4.1):

- **Pre-warmed box pools** — `--init` cost paid ahead of demand, so Run
  feedback skips sandbox setup entirely.
- **cgroup `memory.peak` measurement** — real Memory Golf verdicts and
  `memory_limit_exceeded` detection via the OOM kill flag (§4.4).
- **Seeded per-match test generation** worker-side with a content-addressed
  disk cache — the seed is the source of truth, so any worker regenerates
  identical data with no central storage (§2.3).
- **Tiered execution** for Scaling Duel and **back-to-back benchmark runs** on
  the same worker for the §1.2 protocol.

Verdict folding lives in `@leetclash/shared` (`suite-driver.ts`) and is shared
with the api's Judge0 driver, so the two backends cannot drift.

## Running

Linux only (namespaces + cgroup v2). In dev it runs as a container:

```sh
docker compose -f infra/docker-compose.yml --profile judge-v2 up -d --build
# then point the api/worker at it:
JUDGE_BACKEND=isolate pnpm dev
```

The container must be `privileged` with `cgroup: private`; `entrypoint.sh`
performs the cgroup v2 delegation dance. If `isolate --cg` is unavailable the
worker falls back to `max-rss` accounting (`JUDGE_CGROUPS=auto`) — functional,
but Memory Golf verdicts are approximate; set `JUDGE_CGROUPS=on` in production
to fail hard instead.

## Security posture (§4.2)

No network, cleared env, non-root box uids, pids/fsize/memory/CPU/wall caps,
1 MB output truncation, compile step sandboxed with its own limits. The worker
talks to Redis only — no Postgres, no MinIO, no secrets. Player boxes and
generation boxes are disjoint pools, so a submission can never read a
generator, reference solution, or expected output.

## Env

| Var | Default | Meaning |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | queue transport |
| `JUDGE_LANGUAGES` | `python,cpp` | queues served (one worker per language) |
| `JUDGE_POOL_SIZE` | `4` | pre-warmed boxes = max concurrency |
| `JUDGE_CGROUPS` | `auto` | `on` / `off` / `auto` probe |
| `JUDGE_CACHE_DIR` | `/var/cache/leetclash-judge` | seeded case cache |
| `JUDGE_METRICS_PORT` | `4200` | Prometheus `/metrics` + `/healthz` |
