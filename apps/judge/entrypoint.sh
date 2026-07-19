#!/bin/sh
# cgroup v2 delegation for isolate --cg inside a container.
#
# With a private cgroup namespace the container root cgroup can't hold
# processes AND enable subtree controllers (the "no internal processes" rule).
# Under tini PID 1 lives in the root cgroup too, so EVERY process must move
# into a child first — moving only $$ would leave tini behind and the
# subtree_control write fails with EBUSY. Then enable the controllers and
# hand isolate its own subtree. If any step fails (unprivileged run, cgroup
# v1 host, …) we continue anyway — the worker probes --cg at boot and either
# falls back to max-rss accounting (JUDGE_CGROUPS=auto) or exits loudly
# (JUDGE_CGROUPS=on).
set -u

CG=/sys/fs/cgroup
if [ -w "$CG/cgroup.subtree_control" ]; then
  mkdir -p "$CG/init" 2>/dev/null || true
  pids="$(cat "$CG/cgroup.procs" 2>/dev/null || true)"
  for pid in $pids; do
    echo "$pid" > "$CG/init/cgroup.procs" 2>/dev/null || true
  done
  # One controller per write: a combined write is atomic, so one unavailable
  # controller (e.g. cpuset) would knock out all of them.
  for ctrl in cpuset cpu memory pids; do
    echo "+$ctrl" > "$CG/cgroup.subtree_control" 2>/dev/null || true
  done
  mkdir -p "$CG/isolate" 2>/dev/null || true
  for ctrl in cpuset cpu memory pids; do
    echo "+$ctrl" > "$CG/isolate/cgroup.subtree_control" 2>/dev/null || true
  done
else
  echo "[entrypoint] cgroup v2 root not writable — isolate will fall back to non-cg mode" >&2
fi

exec "$@"
