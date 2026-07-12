# LeetClash — Multiplayer Competitive Coding: Architecture & Build Plan

Real-time 1v1 (and later, multi-player) coding duels. Both players get the same
problem simultaneously and race under a mode-specific win condition. No code yet —
this document is the full plan.

---

## 1. Game design

### 1.1 Core loop
1. Player queues (ranked) or creates/joins a private room (invite code).
2. Match found → 5s countdown → problem revealed to both players at the same instant.
3. Both players code in an in-browser editor. Each can **Run** (public/sample tests,
   fast feedback) or **Submit** (full hidden test suite, counts toward the match).
4. Players see the opponent's *progress signals* live (tests passed, submission count,
   verdict of last submission) — never the opponent's code.
5. Win condition met (mode-dependent) → results screen: both solutions revealed,
   runtime/memory/bytes stats, rating delta, rematch button.

### 1.2 Modes
| Mode | Win condition | Match format | Judged metric |
|---|---|---|---|
| **Speed Race** | First fully-accepted submission wins | Sudden death, hard cap ~30 min | Wall-clock time to Accepted |
| **Fastest Runtime** | Lowest measured runtime among accepted solutions | Fixed window (e.g. 15 min), best submission counts | Median of N benchmark runs (ms) |
| **Code Golf** | Smallest source among accepted solutions | Fixed window | Raw UTF-8 bytes of source |
| **Memory Golf** | Lowest peak memory among accepted solutions | Fixed window | Peak RSS via cgroup `memory.peak` (KB) |
| **Scaling Duel** ("fastest algorithm") | Passes the largest input tier | Escalating input sizes: 10³ → 10⁵ → 10⁷ → adversarial | Highest tier passed, tiebreak on runtime |
| **Blitz (Best-of-N)** | First to win N quick rounds (easy problems) | Series of Speed Races | Round wins |

Design notes:
- **"Fastest algorithm" ≠ raw runtime.** Raw runtime rewards micro-optimization and
  language choice. The *Scaling Duel* tiers (progressively larger inputs with tight
  time limits) are what actually distinguish O(n log n) from O(n²) — this is the mode
  that judges algorithmic quality. Keep both modes; they're different skills.
- **Language fairness:** Python will never beat C++ on raw ms. For Fastest Runtime and
  Memory Golf, default matchmaking is **same-language** (queue key = mode + language).
  Cross-language is allowed only in casual/private rooms, clearly labeled unfair.
  Memory Golf additionally subtracts a per-language interpreter baseline (measured
  against an empty program) so Python's ~10 MB floor doesn't dominate.
- **Benchmark protocol** (runtime/memory modes): dedicated benchmark workers, 1 pinned
  CPU core, performance governor, 5 runs, drop first (JIT/cache warmup), take median.
  Both finalists re-benchmarked back-to-back on the *same* worker at match end so the
  comparison is apples-to-apples.
- **Code Golf counting:** raw source bytes, no stripping (standard golf rules — clever
  whitespace elimination is part of the game). Show live byte counter in the editor.
- Submission throttle: 1 submit per 10s + optional small time penalty per failed
  submit (Speed Race) to punish spray-and-pray.

### 1.3 Social / meta (later phases)
- Per-mode Glicko-2 ratings (skills differ wildly between Speed and Golf).
- Leaderboards (global, per-mode, per-language), match history with replays.
- Spectator mode (live view of both editors, delayed 30s to prevent ghosting).
- Tournaments (single-elim brackets), Battle Royale (100 players, bottom X eliminated
  each round).

---

## 2. Problem content — the legal elephant

**Do not scrape LeetCode.** Problem statements are copyrighted and scraping violates
their ToS. The *style* (short algorithmic puzzle, function signature, examples,
constraints) is not protectable; the text and test data are.

Plan:
1. **Author an original bank of ~50 problems** for launch, covering the classic
   pattern space (two pointers, hashmap, BFS/DFS, DP, heap, binary search, etc.),
   3 difficulty tiers. This is the single biggest content cost — budget real time.
2. **Problem authoring pipeline** (Polygon-style, as repo tooling):
   - `problem/` = statement (Markdown) + reference solution(s) per language +
     input **generator** (parameterized, seedable) + output **validator/checker** +
     limits config.
   - CI job verifies: reference solution passes all tests within limits in every
     supported language; a known-bad (wrong or slow) solution *fails*; limits are
     calibrated per language (e.g. C++ 1s → Python 5s).
3. **Parameterized/seeded test generation per match** — each match instantiates fresh
   test data from the generator. Doubles as anti-cheat (can't hardcode answers or
   share expected outputs).
4. Later: community-submitted problems with a review queue.

---

## 3. System architecture

```
                        ┌─────────────┐
   Browser ── HTTPS ──▶ │   Traefik    │
   (Next.js + Monaco)   └──┬───────┬──┘
        │  WebSocket       │       │
        ▼                  ▼       ▼
  ┌───────────┐      ┌─────────┐ ┌──────────┐
  │ realtime  │◀────▶│   api   │ │   web    │
  │ (ws gate) │      │ (REST/  │ │ (Next.js)│
  └─────┬─────┘      │  tRPC)  │ └──────────┘
        │            └────┬────┘
        │   Redis pub/sub │
        ▼                 ▼
  ┌───────────┐      ┌──────────┐     ┌───────────────┐
  │matchmaker │      │ Postgres │     │ MinIO / S3    │
  └─────┬─────┘      └──────────┘     │ (testdata,    │
        │                             │  submissions) │
        ▼            submission queue └───────────────┘
  ┌───────────┐      (Redis Streams / BullMQ)
  │   Redis   │◀──────────────┐
  └───────────┘               │
                        ┌─────┴──────────────────┐
                        │  judge workers (pool)   │
                        │  sandboxed execution    │
                        │  (isolate / Judge0)     │
                        └─────────────────────────┘
```

### 3.1 Services
| Service | Responsibility | Tech |
|---|---|---|
| **web** | UI: editor, lobby, match screen, profiles, leaderboards | Next.js 15 (React, TS), Tailwind, Monaco Editor, Zustand, Socket.IO client |
| **api** | Auth, profiles, problems, match history, leaderboards, room CRUD | Node.js + TypeScript (Fastify or NestJS), tRPC or REST+OpenAPI, Drizzle ORM |
| **realtime** | WebSocket gateway: match rooms, presence, countdowns, live opponent progress, verdict push | Socket.IO (Redis adapter for horizontal scale) |
| **matchmaker** | Ranked queues, rating-band pairing, match creation | Worker inside api for MVP; own service later. Redis sorted sets keyed by (mode, language), widening Glicko band over wait time |
| **judge** | Compile + run submissions in sandboxes, report verdict/time/memory | Judge0 (MVP) → custom isolate-based workers (see §4) |
| **postgres** | System of record | Postgres 16 |
| **redis** | Queues (BullMQ / Streams), pub/sub, presence, rate limits, live match state, leaderboard sorted sets | Redis 7 |
| **minio** | Test-case files, archived submission sources | S3-compatible |
| **traefik** | TLS, routing, sticky WS | Traefik v3 |
| **observability** | Metrics, logs, dashboards, alerts | Prometheus + Grafana + Loki; Sentry for FE/BE errors |

Why Node/TS everywhere backend: shared types with the frontend (submission DTOs,
match events) via a monorepo package; the judge is the only perf-critical piece and
it's isolated behind a queue anyway. Go is a fine alternative for the judge
orchestrator later.

Alternative worth noting: **Supabase** (already connected in this environment) can
replace `api`-side auth + Postgres + realtime *for the CRUD-ish parts* and cut MVP
time. The judge, matchmaker, and low-latency match WebSockets still need self-hosted
infra, so the fully self-hosted path is cleaner long-term. Decide at Phase 1 kickoff.

### 3.2 Match state machine (lives in Redis, event-sourced to Postgres)
`queued → matched → countdown → live → judging → finished / abandoned`
- Every transition is a `match_event` row (append-only) → enables replays and
  spectating "for free."
- Server is the only clock. Client timers are cosmetic; all timestamps
  (problem-reveal, submission-received) are server-side.
- Disconnect handling: grace period (e.g. 60s) to reconnect and resume; abandon = loss
  in ranked.

---

## 4. Code execution sandbox (the critical subsystem)

### 4.1 Two-step adoption
- **Phase 1 — Judge0 (self-hosted, open source).** Battle-tested, 60+ languages,
  returns time/memory per run, ships as Docker images. Gets Run/Submit working in
  days, not weeks. Limitations: coarse control over benchmarking methodology, its own
  Redis+Postgres to babysit.
- **Phase 3 — custom judge workers built on `isolate`** (the IOI sandbox that Judge0
  and CMS use underneath: namespaces + cgroups v2). Needed for: pre-warmed sandbox
  pools (sub-second Run feedback), the strict benchmark protocol (§1.2), per-match
  seeded test generation, and tiered Scaling Duel execution.

### 4.2 Sandbox hardening (non-negotiable, both phases)
- No network (`--network none` / isolate default).
- Read-only rootfs; writable tmpfs `/tmp` with size cap (e.g. 64 MB).
- CPU: 1 pinned core; CPU-time limit + wall-clock limit (wall ≈ 2× CPU limit).
- Memory: hard cgroup limit per language (e.g. 256 MB C++, 512 MB Java/Python).
- `pids` limit (~64) — kills fork bombs.
- Non-root user, all capabilities dropped, seccomp profile, `no-new-privileges`.
- Output caps: stdout/stderr truncated at e.g. 1 MB (prevents log-flood DoS).
- Compile step sandboxed separately with its own (looser) limits.
- Judge nodes are a **separate host/node pool** from everything else — untrusted code
  never shares a kernel neighborhood with the DB. If paranoia budget allows later:
  gVisor (`runsc`) runtime or Firecracker microVMs on the judge pool.

### 4.3 Language runtimes (launch set)
One pinned image per language: Python 3.12, Node 22, C++ (g++ 14), Java 21, Go 1.23,
Rust stable. Each image = compiler/interpreter + isolate + tini, nothing else.
Per-language time/memory multipliers stored with each problem.

### 4.4 Measurement
- **Runtime:** CPU time from isolate metadata (not wall clock), median-of-5 protocol
  on benchmark workers (§1.2).
- **Memory:** cgroup v2 `memory.peak` for the run cgroup; per-language baseline
  subtraction for Memory Golf display/ranking.
- **Bytes:** length of submitted source blob, computed API-side (no execution needed;
  still must be Accepted to count).

---

## 5. Data model (Postgres, sketch)

- `users` (id, handle, email, avatar_url, created_at)
- `ratings` (user_id, mode, language?, rating, rd, volatility) — Glicko-2, per mode
- `problems` (id, slug, title, difficulty, statement_md, io_spec, tags[],
  starter_code jsonb per-language, limits jsonb per-language, generator_uri,
  checker_uri, status)
- `test_cases` (problem_id, ordinal, input_uri, expected_uri, is_public, tier, weight)
  — URIs point at MinIO; small cases inline
- `matches` (id, mode, language?, problem_id, status, config jsonb, started_at,
  ended_at, winner_id)
- `match_players` (match_id, user_id, result, rating_before, rating_after)
- `submissions` (id, match_id?, user_id, problem_id, language, source_uri, bytes,
  status, verdict, time_ms, memory_kb, tier_reached, created_at) — also usable for
  solo practice (null match_id)
- `match_events` (match_id, seq, type, payload jsonb, at) — append-only, powers
  replay/spectate
- Redis (ephemeral): matchmaking queues, live match state, presence, rate-limit
  counters, leaderboard ZSETs (rebuilt from Postgres on demand)

---

## 6. Anti-cheat (layered, honest about limits)

1. **Seeded per-match test generation** — hardcoded answers and shared outputs die here.
2. **Server-authoritative everything** — timing, verdicts, problem reveal.
3. **Hidden tests + randomized test order**; public samples only via Run.
4. **Submission throttling** + failed-submit penalties.
5. **Collusion detection:** post-match code-similarity (winnowing/MOSS-style
   fingerprints) between opponents and across recent matches; flags feed a review queue.
6. **Paste/typing telemetry:** large-paste events and inhuman typing cadence recorded;
   ranked mode can disable paste entirely. Full AI-assistance prevention is
   *impossible* in-browser — the stance is: casual modes allow anything, ranked mode
   applies the deterrents above, and problems being parameterized/original (not
   googleable verbatim) raises the effort bar. Consider an explicit "AI-allowed" mode
   rather than pretending.
7. **Runtime-mode verification:** final rankings recomputed on trusted benchmark
   workers, never trusted from the fast-feedback path.
8. Rate limiting at Traefik + api (per-IP, per-user), CAPTCHA on signup.

---

## 7. Docker containers

### Dev (`docker-compose.yml`)
| Container | Image/Build | Notes |
|---|---|---|
| `web` | node:22 (Next dev) | Hot reload, bind mount |
| `api` | node:22 | tRPC/REST |
| `realtime` | node:22 | Socket.IO + Redis adapter |
| `postgres` | postgres:16-alpine | Volume |
| `redis` | redis:7-alpine | |
| `minio` | minio/minio | + bootstrap bucket job |
| `judge0-server` | judge0/judge0 | MVP judge API |
| `judge0-worker` | judge0/judge0 | ×2; `privileged` on an isolated compose network |
| `judge0-db` / `judge0-redis` | postgres / redis | Judge0's own deps |
| `traefik` | traefik:v3 | Optional in dev |
| `grafana`/`prometheus`/`loki` | official | Optional profile |

Phase 3 replaces the judge0 quartet with: `judge-orchestrator` + `judge-worker-python`,
`judge-worker-cpp`, … (one per language, pre-warmed isolate pools).

### Prod (initial: one beefy VPS + one judge VPS, plain compose)
- Host A: traefik, web, api, realtime, matchmaker, postgres, redis, minio, monitoring.
- Host B (judge pool): judge workers only, firewalled to only reach Redis queue.
- Scale path: move to k8s/Nomad only when >1 host per tier is actually needed;
  judge workers autoscale on queue depth.

---

## 8. Repo & tooling

- **Monorepo:** pnpm + Turborepo.
  - `apps/web`, `apps/api`, `apps/realtime`, `apps/judge`
  - `packages/shared` (types, match-event schema, zod validators)
  - `packages/problems` (problem bank + authoring toolchain)
  - `infra/` (compose files, Traefik config, language runtime Dockerfiles)
- **CI (GitHub Actions):** typecheck, lint, unit tests, problem-bank validation
  (reference solutions must pass, bad solutions must fail), Docker image builds.
- **Auth:** Auth.js or better-auth; GitHub + Google OAuth (the audience has GitHub).
- **Testing:** Vitest; Playwright for the match flow; a synthetic "bot duel" e2e that
  runs two headless clients through a full match against the real judge.

---

## 9. Phased roadmap

### Phase 0 — Foundations (≈1 week)
Monorepo scaffold, docker-compose with postgres/redis/minio/judge0, DB schema +
migrations, auth, CI skeleton, 3 hand-written problems to develop against.

### Phase 1 — Playable MVP (≈3–4 weeks)  ← *prove the fun*
- Private rooms (invite code), **Speed Race only**, one language pair (Python + C++).
- Monaco editor, Run (public tests) + Submit (hidden tests) via Judge0.
- Realtime opponent progress, server-side match state machine, results screen with
  code reveal.
- 15 original problems. No ratings, no matchmaking — friends racing friends.
- **Exit criterion:** two people finish a duel and immediately hit Rematch.

### Phase 2 — Competitive core (≈3–4 weeks)
- Ranked queue + Glicko-2, match history, profiles, leaderboards.
- **Code Golf** and **Fastest Runtime** modes (same-language matchmaking, benchmark
  protocol on dedicated workers).
- Remaining launch languages; 40+ problems; disconnect/abandon handling; basic
  anti-cheat (throttles, paste flagging, similarity job).

### Phase 3 — Judge v2 + depth (≈4 weeks)
- Custom isolate-based judge: pre-warmed pools (<1s Run), seeded per-match test
  generation, tiered execution → ships **Scaling Duel** and **Memory Golf**.
- Spectator mode + replays from `match_events`.
- Observability hardening, judge autoscaling on queue depth.

### Phase 4 — Meta & growth
Blitz best-of-N, tournaments, battle royale, friends/chat, community problem
submissions with review queue, seasonal ratings, mobile layout polish.

---

## 10. Top risks & mitigations

| Risk | Mitigation |
|---|---|
| Judge latency kills the feel (Run > 2s) | Pre-warmed sandbox pool (Phase 3); keep public tests tiny; Judge0 workers scaled generously in MVP |
| Cross-language unfairness poisons perf modes | Same-language matchmaking default; per-language limits/baselines; Scaling Duel as the "real" algorithm mode |
| Content treadmill (problems are expensive) | Parameterized generators stretch each problem; community pipeline in Phase 4; don't launch ranked golf until bank is deep enough |
| AI/cheating in ranked | Layered deterrents (§6), original parameterized problems, explicit AI-allowed modes for honesty |
| Sandbox escape | isolate + hardening list (§4.2), separate judge hosts, no secrets on judge nodes, egress firewall |
| Cost blowout on judge compute | Queue with backpressure, per-user concurrency caps, benchmark runs only for accepted finalists |
