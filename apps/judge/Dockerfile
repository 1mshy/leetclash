# Isolate judge worker image (PLAN §4, §7 Phase 3).
#
# Build from the REPO ROOT (workspace deps):
#   docker build -f apps/judge/Dockerfile -t leetclash-judge .
#
# Runs privileged with a private cgroup namespace (see infra/docker-compose.yml)
# so isolate can manage its own cgroup v2 subtree — that's where the
# memory.peak measurement for Memory Golf comes from (§4.4).

# ── Stage 1: isolate (the IOI sandbox) ───────────────────────────────────────
FROM debian:bookworm-slim AS isolate-build
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential git libcap-dev pkg-config libsystemd-dev \
    && rm -rf /var/lib/apt/lists/*
# v2.x targets cgroup v2 (what modern Docker hosts run).
RUN git clone --depth 1 --branch v2.1 https://github.com/ioi/isolate.git /isolate-src \
    && make -C /isolate-src isolate

# ── Stage 2: build the worker (pnpm workspace) ───────────────────────────────
FROM node:22-bookworm-slim AS app-build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/judge apps/judge
RUN pnpm install --frozen-lockfile --filter @leetclash/shared --filter @leetclash/judge
RUN pnpm --filter @leetclash/shared build && pnpm --filter @leetclash/judge build
RUN pnpm --filter @leetclash/judge deploy --prod /out

# ── Stage 3: runtime — toolchains + isolate + the worker, nothing else ───────
FROM node:22-bookworm-slim
# Launch-set toolchains for the default JUDGE_LANGUAGES (python,cpp) plus Node
# from the base image. Per-language production images (§7) trim this list and
# set JUDGE_LANGUAGES to match; add openjdk/golang/rustc here to serve more.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 g++ libcap2 tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=isolate-build /isolate-src/isolate /usr/local/bin/isolate
COPY --from=isolate-build /isolate-src/default.cf /usr/local/etc/isolate
# Point isolate at the cgroup subtree the entrypoint delegates.
RUN sed -i 's#^cg_root.*#cg_root = /sys/fs/cgroup/isolate#' /usr/local/etc/isolate \
    && mkdir -p /var/local/lib/isolate /var/cache/leetclash-judge

WORKDIR /app
COPY --from=app-build /out .
COPY apps/judge/entrypoint.sh /usr/local/bin/judge-entrypoint.sh
RUN chmod +x /usr/local/bin/judge-entrypoint.sh

ENV NODE_ENV=production
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/judge-entrypoint.sh"]
CMD ["node", "dist/index.js"]
