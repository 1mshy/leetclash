#!/usr/bin/env bash
# Judge autoscaling on queue depth (PLAN §9 Phase 3, §7 scale path).
#
# The worker publishes its desired replica count to Redis
# (judge:autoscale:desired, refreshed every 15s with a 120s TTL). This script
# polls it and applies the change with `docker compose --scale`. Plain-compose
# stand-in for the k8s/Nomad autoscaler the plan defers until >1 host is real.
#
# Usage:  ./infra/scripts/judge-autoscale.sh   (runs forever; ctrl-c to stop)
set -euo pipefail

COMPOSE_FILE="$(cd "$(dirname "$0")/.." && pwd)/docker-compose.yml"
SERVICE="judge-worker"
KEY="judge:autoscale:desired"
POLL_SEC="${POLL_SEC:-30}"
REDIS_CONTAINER="${REDIS_CONTAINER:-leetclash-redis-1}"

current=-1
while true; do
  desired="$(docker exec "$REDIS_CONTAINER" redis-cli GET "$KEY" 2>/dev/null | tr -d '[:space:]')"
  if [[ "$desired" =~ ^[0-9]+$ ]] && (( desired >= 1 )); then
    if (( desired != current )); then
      echo "$(date '+%H:%M:%S') scaling $SERVICE → $desired (was $current)"
      docker compose -f "$COMPOSE_FILE" --profile judge-v2 up -d --no-recreate --scale "$SERVICE=$desired" "$SERVICE"
      current="$desired"
    fi
  else
    echo "$(date '+%H:%M:%S') no autoscale signal (is the worker running?)"
  fi
  sleep "$POLL_SEC"
done
