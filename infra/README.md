# LeetClash dev infrastructure

Everything the app depends on runs in Docker. The app services themselves
(**web / api / realtime**) run on the **host** via `pnpm dev` in Phase 0 — they
are not containerized yet (see PLAN.md §7/§9).

## Bring it up

```bash
# from the repo root
docker compose -f infra/docker-compose.yml up -d
```

Optional profiles:

```bash
docker compose -f infra/docker-compose.yml --profile proxy up -d          # + traefik
docker compose -f infra/docker-compose.yml --profile observability up -d # + prometheus/grafana/loki
```

Tear down (keeps volumes): `docker compose -f infra/docker-compose.yml down`
Wipe data too: add `-v`.

## What runs where

| Service | Image | Host port(s) | Notes |
|---|---|---|---|
| postgres | postgres:16-alpine | 5432 | app DB (`leetclash`/`leetclash`/`leetclash`) |
| redis | redis:7-alpine | 6379 | queues, pub/sub, match state |
| minio | minio/minio | 9000 (S3), 9001 (console) | root `leetclash` / `leetclash-secret` |
| minio-init | minio/mc | — | one-shot, creates `testdata` + `submissions` buckets |
| judge0-server | judge0/judge0:1.13.1 | 2358 | REST API; on both `default` and `judge` networks |
| judge0-worker ×2 | judge0/judge0:1.13.1 | — | `privileged`, isolated `judge` network only |
| judge0-db | postgres:16-alpine | — | Judge0-internal, `judge` network only |
| judge0-redis | redis:7-alpine | — | Judge0-internal, `judge` network only |
| traefik | traefik:v3 | 80, 8080 | profile `proxy` (dashboard on 8080) |
| prometheus | prom/prometheus | 9090 | profile `observability` |
| grafana | grafana/grafana | 3001 | profile `observability` (`leetclash`/`leetclash`) |
| loki | grafana/loki | 3100 | profile `observability` |

Judge0's env lives in [`judge0.env`](./judge0.env) — dev defaults only; change
all secrets in prod.

The host apps use the env vars in the repo-root `.env.example`
(`DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `JUDGE0_URL=http://localhost:2358`, …).

## Verify Judge0

Check it's alive:

```bash
curl -s http://localhost:2358/system_info | head
```

Submit a Python hello-world (language 71 = Python 3) and wait for the verdict:

```bash
curl -s -X POST 'http://localhost:2358/submissions?base64_encoded=false&wait=true' \
  -H 'Content-Type: application/json' \
  -d '{"source_code": "print(\"hello, world\")", "language_id": 71}'
```

Expected: JSON with `"stdout": "hello, world\n"` and
`"status": {"id": 3, "description": "Accepted"}`. If the status stays
"In Queue", check the workers: `docker compose -f infra/docker-compose.yml logs judge0-worker`.

## Directory layout

- `docker-compose.yml` — the dev compose file (this doc)
- `judge0.env` — Judge0 server + worker config
- `traefik/traefik.yml` — minimal Traefik v3 static config (profile `proxy`)
- `prometheus/prometheus.yml` — placeholder scrape config (profile `observability`)
- `runtimes/` — per-language judge images arrive in Phase 3 (see its README)
