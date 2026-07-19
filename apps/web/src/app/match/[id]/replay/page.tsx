"use client";

/**
 * Replay + spectator view (PLAN §9 Phase 3), reconstructed purely from the
 * append-only match_events log (§3.2 — "replays and spectating for free").
 *
 * Finished match → replay: scrub/play the event timeline.
 * Live match     → spectate: REST backfill + the delayed socket stream. The
 * server enforces the SPECTATOR_DELAY_SEC anti-ghosting delay for non-players;
 * progress signals only, never anyone's code (§1.1).
 */
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import type { MatchDetail, MatchEvent, Verdict } from "@leetclash/shared";
import { MatchEvent as MatchEventSchema } from "@leetclash/shared";
import { getMatch, getMatchEvents } from "@/lib/api";
import { spectateMatch } from "@/lib/socket";

interface PlayerView {
  userId: string;
  handle: string;
  testsPassed: number;
  testsTotal: number;
  submissionCount: number;
  lastVerdict: Verdict | null;
  bestTier: number;
  accepted: boolean;
}

interface TimelineState {
  status: string;
  players: Map<string, PlayerView>;
  winnerId: string | null;
  finishReason: string | null;
  startedAt: number | null;
}

/** Fold events[0..cursor) into a view — the replay "state at time t". */
function foldEvents(events: MatchEvent[], cursor: number, detail: MatchDetail | null): TimelineState {
  const players = new Map<string, PlayerView>();
  for (const p of detail?.players ?? []) {
    players.set(p.id, {
      userId: p.id,
      handle: p.handle,
      testsPassed: 0,
      testsTotal: 0,
      submissionCount: 0,
      lastVerdict: null,
      bestTier: 0,
      accepted: false,
    });
  }
  const state: TimelineState = {
    status: "matched",
    players,
    winnerId: null,
    finishReason: null,
    startedAt: null,
  };

  for (const e of events.slice(0, cursor)) {
    switch (e.type) {
      case "countdown_started":
        state.status = "countdown";
        break;
      case "problem_revealed":
        state.status = "live";
        state.startedAt = Date.parse(e.at);
        break;
      case "progress": {
        const p = players.get(e.payload.userId);
        if (p) {
          p.testsPassed = e.payload.testsPassed;
          p.testsTotal = e.payload.testsTotal;
          p.submissionCount = e.payload.submissionCount;
          p.lastVerdict = e.payload.lastVerdict;
        }
        break;
      }
      case "verdict": {
        const p = players.get(e.payload.userId);
        if (p) {
          if (e.payload.result.verdict === "accepted") p.accepted = true;
          if (e.payload.result.tierReached !== null) {
            p.bestTier = Math.max(p.bestTier, e.payload.result.tierReached);
          }
        }
        break;
      }
      case "match_finished":
        state.status = "finished";
        state.winnerId = e.payload.winnerId;
        state.finishReason = e.payload.reason;
        break;
    }
  }
  return state;
}

function describe(e: MatchEvent, handles: Map<string, string>): string {
  const who = (id: string): string => handles.get(id) ?? "player";
  switch (e.type) {
    case "match_created":
      return "match created";
    case "countdown_started":
      return `countdown — ${e.payload.seconds}s to reveal`;
    case "problem_revealed":
      return "problem revealed — GO";
    case "submission_received":
      return `${who(e.payload.userId)} sent a ${e.payload.kind}`;
    case "progress":
      return `${who(e.payload.userId)} · ${e.payload.testsPassed}/${e.payload.testsTotal} tests`;
    case "verdict": {
      const r = e.payload.result;
      const tier = r.tierReached !== null ? ` (tier ${r.tierReached})` : "";
      return `${who(e.payload.userId)} → ${r.verdict ?? "judging"}${tier}`;
    }
    case "player_disconnected":
      return `${who(e.payload.userId)} disconnected (${e.payload.graceSec}s grace)`;
    case "player_reconnected":
      return `${who(e.payload.userId)} reconnected`;
    case "benchmark":
      return `${who(e.payload.userId)} benchmarked at ${Math.round(e.payload.medianMs)}ms`;
    case "rating_updated":
      return `${who(e.payload.userId)} rating ${Math.round(e.payload.ratingBefore)} → ${Math.round(e.payload.ratingAfter)}`;
    case "match_finished":
      return e.payload.winnerId
        ? `${who(e.payload.winnerId)} wins (${e.payload.reason})`
        : `draw (${e.payload.reason})`;
    case "rematch":
      return "rematch started";
    default:
      // Exhaustive today; a future event type degrades to its raw name.
      return (e as { type: string }).type;
  }
}

function clockAt(e: MatchEvent, startedAt: number | null): string {
  if (startedAt === null) return "--:--";
  const ms = Math.max(0, Date.parse(e.at) - startedAt);
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [finished, setFinished] = useState(false);
  const [delayedBySec, setDelayedBySec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Replay controls (finished matches only; live view always tails the log).
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const tailing = !finished;

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMatch(id), getMatchEvents(id)]).then(([d, ev]) => {
      if (cancelled) return;
      if (!d.ok) return setError(d.error);
      if (!ev.ok) return setError(ev.error);
      setDetail(d.data);
      setFinished(ev.data.finished);
      setDelayedBySec(ev.data.delayedBySec);
      const parsed = ev.data.events
        .map((raw) => MatchEventSchema.safeParse(raw))
        .flatMap((r) => (r.success ? [r.data] : []));
      setEvents(parsed);
      setCursor(ev.data.finished ? parsed.length : parsed.length);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Live spectate: append the delayed socket stream on top of the backfill.
  useEffect(() => {
    if (finished) return;
    return spectateMatch(id, (e) => {
      setEvents((prev) => {
        if (prev.some((p) => p.seq === e.seq)) return prev;
        const next = [...prev, e].sort((a, b) => a.seq - b.seq);
        return next;
      });
      setCursor((c) => c + 1);
      if (e.type === "match_finished") {
        // Flip to replay mode and refresh detail for the results footer.
        setFinished(true);
        void getMatch(id).then((d) => d.ok && setDetail(d.data));
      }
    });
  }, [id, finished]);

  // Keep the cursor pinned to the tail while spectating.
  useEffect(() => {
    if (tailing) setCursor(events.length);
  }, [tailing, events.length]);

  // Replay playback: advance one event per tick, pacing from real gaps
  // (capped so dead air doesn't stall the replay), divided by the speed.
  useEffect(() => {
    if (!playing || cursor >= events.length) {
      if (cursor >= events.length) setPlaying(false);
      return;
    }
    const prev = events[cursor - 1];
    const next = events[cursor];
    const gapMs =
      prev && next ? Math.min(Math.max(Date.parse(next.at) - Date.parse(prev.at), 120), 5000) : 400;
    const t = setTimeout(() => setCursor((c) => c + 1), gapMs / speed);
    return () => clearTimeout(t);
  }, [playing, cursor, events, speed]);

  const handles = useMemo(
    () => new Map((detail?.players ?? []).map((p) => [p.id, p.handle])),
    [detail],
  );
  const view = useMemo(() => foldEvents(events, cursor, detail), [events, cursor, detail]);

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [cursor]);

  if (error) {
    return <p className="p-8 text-sm text-red-400">{error}</p>;
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            {finished ? "replay" : "spectating"} · {(detail?.mode ?? "").replace(/_/g, " ")}
          </p>
          <h1 className="mt-1 text-xl font-bold text-zinc-100">
            {detail?.problem?.title ?? "LeetClash match"}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {!finished && (
            <span className="rounded bg-red-950/60 px-2 py-1 font-mono text-[10px] uppercase text-red-400">
              live · delayed {delayedBySec || 30}s
            </span>
          )}
          <Link
            href={`/match/${id}`}
            className="text-xs text-zinc-500 hover:text-accent"
          >
            match page →
          </Link>
        </div>
      </div>

      {/* Standings reconstructed at the cursor */}
      <div className="grid grid-cols-2 gap-4">
        {[...view.players.values()].map((p) => (
          <div key={p.userId} className="rounded-lg border border-edge bg-panel p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-zinc-200">
                {p.handle}
                {view.winnerId === p.userId && " 🏆"}
              </span>
              <span
                className={`font-mono text-xs ${
                  p.lastVerdict === "accepted" ? "text-green-400" : "text-zinc-500"
                }`}
              >
                {p.lastVerdict ?? "—"}
              </span>
            </div>
            <div className="mt-3 flex gap-4 font-mono text-xs text-zinc-400">
              <span>
                tests {p.testsPassed}/{p.testsTotal || "?"}
              </span>
              <span>{p.submissionCount} submits</span>
              {detail?.mode === "scaling_duel" && <span>tier {p.bestTier}</span>}
              {p.accepted && <span className="text-green-500">accepted</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Replay transport (finished matches only) */}
      {finished && (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-edge bg-panel px-4 py-3">
          <button
            onClick={() => {
              if (cursor >= events.length) setCursor(0);
              setPlaying((p) => !p);
            }}
            className="rounded bg-accent px-4 py-1.5 text-sm font-semibold text-black hover:opacity-90"
          >
            {playing ? "Pause" : cursor >= events.length ? "Restart" : "Play"}
          </button>
          <input
            type="range"
            min={0}
            max={events.length}
            value={cursor}
            onChange={(e) => {
              setPlaying(false);
              setCursor(Number(e.target.value));
            }}
            className="flex-1 accent-[var(--accent,#22d3ee)]"
          />
          <span className="w-16 text-right font-mono text-xs text-zinc-500">
            {cursor}/{events.length}
          </span>
          <button
            onClick={() => setSpeed((s) => (s === 1 ? 4 : s === 4 ? 16 : 1))}
            className="rounded border border-edge px-2 py-1 font-mono text-xs text-zinc-300 hover:border-accent"
          >
            {speed}×
          </button>
        </div>
      )}

      {/* Event log up to the cursor */}
      <div
        ref={logRef}
        className="mt-6 max-h-80 overflow-y-auto rounded-lg border border-edge bg-black/30 p-3 font-mono text-xs leading-6"
      >
        {events.slice(0, cursor).map((e) => (
          <div key={e.seq} className="flex gap-3">
            <span className="w-12 shrink-0 text-zinc-600">{clockAt(e, view.startedAt)}</span>
            <span
              className={
                e.type === "match_finished"
                  ? "text-accent"
                  : e.type === "verdict"
                    ? "text-zinc-200"
                    : "text-zinc-400"
              }
            >
              {describe(e, handles)}
            </span>
          </div>
        ))}
        {events.length === 0 && (
          <p className="text-zinc-600">
            no events yet{!finished && " — spectator view runs behind the live match"}
          </p>
        )}
      </div>
    </div>
  );
}
