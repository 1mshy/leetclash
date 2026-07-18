"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Language, MatchDetail, PlayerReveal, SubmissionResult } from "@leetclash/shared";
import { SUBMIT_THROTTLE_SEC, isSameLanguageMode } from "@leetclash/shared";
import CodeEditor from "@/components/CodeEditor";
import OpponentProgress from "@/components/OpponentProgress";
import {
  createSubmission,
  getMatch,
  getStoredGuest,
  pollSubmission,
  requestRematch,
} from "@/lib/api";
import { identify, joinMatch } from "@/lib/socket";
import { useMatchStore } from "@/stores/match";

/** Re-render on an interval — drives the countdown and match clocks. */
function useNow(intervalMs: number, enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, enabled]);
  return now;
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const status = useMatchStore((s) => s.status);
  const countdownEndsAt = useMatchStore((s) => s.countdownEndsAt);
  const endsAt = useMatchStore((s) => s.endsAt);
  const myLastResult = useMatchStore((s) => s.myLastResult);
  const winnerId = useMatchStore((s) => s.winnerId);
  const rematchMatchId = useMatchStore((s) => s.rematchMatchId);
  const detailVersion = useMatchStore((s) => s.detailVersion);
  const myUserId = useMatchStore((s) => s.myUserId);
  const opponentDisconnected = useMatchStore((s) => s.opponentDisconnected);
  const opponentGraceSec = useMatchStore((s) => s.opponentGraceSec);
  const setMatch = useMatchStore((s) => s.setMatch);
  const applyMatchEvent = useMatchStore((s) => s.applyMatchEvent);
  const applyState = useMatchStore((s) => s.applyState);
  const setMyLastResult = useMatchStore((s) => s.setMyLastResult);

  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [judging, setJudging] = useState<"run" | "submit" | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  // Current editor buffer — read at Run/Submit time, no re-render per keystroke.
  const codeRef = useRef<{ source: string; language: Language }>({
    source: "",
    language: "python",
  });
  // Paste telemetry accumulated since the last Submit (§6.6 anti-cheat).
  const pasteRef = useRef<{ count: number; largest: number }>({ count: 0, largest: 0 });

  useEffect(() => {
    // Guest id until real auth sessions land (see lib/api.ts).
    const guestId = getStoredGuest()?.id ?? null;
    setMatch(id, guestId);
    // Announce identity so the gateway can attribute presence/abandon (§3.2).
    if (guestId) identify(guestId);
    return joinMatch(id, applyMatchEvent, applyState);
  }, [id, setMatch, applyMatchEvent, applyState]);

  // Refetch REST detail whenever the store signals it changed (reveal, finish…).
  useEffect(() => {
    let cancelled = false;
    getMatch(id).then((res) => {
      if (cancelled) return;
      if (res.ok) setDetail(res.data);
      else setActionError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [id, detailVersion]);

  // Opponent hit Rematch → follow them into the new match.
  useEffect(() => {
    if (rematchMatchId && rematchMatchId !== id) {
      router.push(`/match/${rematchMatchId}`);
    }
  }, [rematchMatchId, id, router]);

  const effectiveStatus = status ?? detail?.status ?? null;
  const live = effectiveStatus === "live";
  const finished = effectiveStatus === "finished";
  const inCountdown = effectiveStatus === "countdown";

  const now = useNow(inCountdown ? 100 : 1000, inCountdown || live);
  const countdownLeft =
    inCountdown && countdownEndsAt ? Math.max(0, Math.ceil((countdownEndsAt - now) / 1000)) : null;
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  const submitCode = useCallback(
    async (kind: "run" | "submit") => {
      setActionError(null);
      setJudging(kind);
      const { source, language } = codeRef.current;
      const paste = pasteRef.current;
      const created = await createSubmission({
        matchId: id,
        language,
        source,
        kind,
        pasteCount: paste.count,
        largestPaste: paste.largest,
      });
      if (!created.ok) {
        setJudging(null);
        setActionError(created.error);
        return;
      }
      if (kind === "submit") {
        setCooldownUntil(Date.now() + SUBMIT_THROTTLE_SEC * 1000);
        pasteRef.current = { count: 0, largest: 0 }; // telemetry is per-submit
      }
      const result = await pollSubmission(created.data.submissionId);
      setJudging(null);
      if (result.ok) setMyLastResult(result.data);
      else setActionError(result.error);
    },
    [id, setMyLastResult],
  );

  async function handleRematch() {
    setActionError(null);
    const res = await requestRematch(id);
    if (res.ok) router.push(`/match/${res.data.matchId}`);
    else setActionError(res.error);
  }

  if (finished && detail?.status === "finished") {
    return (
      <ResultsScreen
        detail={detail}
        myUserId={myUserId}
        winnerId={winnerId ?? detail.winnerId}
        onRematch={handleRematch}
        error={actionError}
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-49px)] flex-col">
      <div className="flex items-center justify-between border-b border-edge bg-panel px-4 py-1.5 font-mono text-xs text-zinc-500">
        <span className="flex items-center gap-2">
          <span className="text-zinc-300">{(detail?.mode ?? "").replace(/_/g, " ") || "match"}</span>
          {detail?.ranked ? (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] uppercase text-accent">
              ranked
            </span>
          ) : detail ? (
            <span className="rounded border border-edge px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">
              casual
            </span>
          ) : null}
        </span>
        {live && endsAt !== null && (
          <span>
            time left <span className="text-accent">{formatClock(endsAt - now)}</span>
          </span>
        )}
        <span>
          status <span className="text-accent">{effectiveStatus ?? "connecting…"}</span>
        </span>
      </div>

      {live && opponentDisconnected && (
        <div className="border-b border-amber-900/60 bg-amber-950/40 px-4 py-1.5 text-center text-xs text-amber-300">
          Opponent disconnected — they have {opponentGraceSec ?? 60}s to reconnect or they forfeit.
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Countdown overlay: problem is about to be revealed. */}
        {inCountdown && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/80">
            <p className="text-sm uppercase tracking-widest text-zinc-400">
              problem reveal in
            </p>
            <p className="font-mono text-8xl font-bold text-accent">
              {countdownLeft ?? "…"}
            </p>
          </div>
        )}

        {/* Left: problem statement (or the waiting room). */}
        <section className="w-1/2 overflow-y-auto border-r border-edge p-6">
          {detail?.problem ? (
            <Statement
              title={detail.problem.title}
              difficulty={detail.problem.difficulty}
              markdown={detail.problem.statementMd}
            />
          ) : (
            <WaitingRoom inviteCode={detail?.inviteCode ?? null} inCountdown={inCountdown} />
          )}
        </section>

        {/* Right: editor + actions + opponent strip. */}
        <section className="flex w-1/2 min-w-0 flex-col">
          <div className="min-h-0 flex-1">
            <CodeEditor
              starterCode={detail?.problem?.starterCode}
              lockedLanguage={
                detail && isSameLanguageMode(detail.mode) ? detail.language : undefined
              }
              onChange={(source, language) => {
                codeRef.current = { source, language };
              }}
              onPaste={(size) => {
                pasteRef.current.count += 1;
                pasteRef.current.largest = Math.max(pasteRef.current.largest, size);
              }}
            />
          </div>

          <div className="flex items-center gap-2 border-t border-edge bg-panel px-4 py-2">
            <button
              onClick={() => void submitCode("run")}
              disabled={!live || judging !== null}
              className="rounded border border-edge px-4 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {judging === "run" ? "Running…" : "Run"}
            </button>
            <button
              onClick={() => void submitCode("submit")}
              disabled={!live || judging !== null || cooldownLeft > 0}
              className="rounded bg-accent px-4 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {judging === "submit"
                ? "Judging…"
                : cooldownLeft > 0
                  ? `Submit (${cooldownLeft}s)`
                  : "Submit"}
            </button>
            {myLastResult && <ResultBadge result={myLastResult} />}
            {actionError && (
              <span className="ml-auto truncate text-xs text-red-400">{actionError}</span>
            )}
          </div>

          {myLastResult?.detail && myLastResult.verdict !== "accepted" && (
            <pre className="max-h-32 overflow-auto border-t border-edge bg-black/40 px-4 py-2 font-mono text-xs text-red-300">
              {myLastResult.detail}
            </pre>
          )}

          <OpponentProgress />
        </section>
      </div>
    </div>
  );
}

function WaitingRoom({
  inviteCode,
  inCountdown,
}: {
  inviteCode: string | null;
  inCountdown: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
      {inCountdown ? (
        <p className="text-sm text-zinc-400">Opponent found — get ready.</p>
      ) : (
        <>
          <p className="text-sm text-zinc-400">Waiting for an opponent…</p>
          {inviteCode && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">
                invite code
              </p>
              <p className="select-all rounded-md border border-edge bg-panel px-6 py-3 font-mono text-4xl font-bold tracking-[0.3em] text-accent">
                {inviteCode}
              </p>
              <p className="mt-3 text-xs text-zinc-500">
                Share it — the duel starts the moment they join.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Statement({
  title,
  difficulty,
  markdown,
}: {
  title: string;
  difficulty: string;
  markdown: string;
}) {
  return (
    <article>
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-xl font-bold text-zinc-100">{title}</h1>
        <span className="rounded border border-edge px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-400">
          {difficulty}
        </span>
      </div>
      <ReactMarkdown
        components={{
          h1: () => null, // title already rendered above
          h2: (props) => (
            <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wider text-zinc-300" {...props} />
          ),
          p: (props) => <p className="mt-3 text-sm leading-relaxed text-zinc-400" {...props} />,
          ul: (props) => (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-400" {...props} />
          ),
          li: (props) => <li className="leading-relaxed" {...props} />,
          code: (props) => (
            <code className="rounded bg-panel px-1 py-0.5 font-mono text-[13px] text-accent" {...props} />
          ),
          pre: (props) => (
            <pre className="mt-2 overflow-x-auto rounded-md border border-edge bg-panel p-3 font-mono text-xs leading-relaxed text-zinc-300 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-zinc-300" {...props} />
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}

function ResultBadge({ result }: { result: SubmissionResult }) {
  const accepted = result.verdict === "accepted";
  return (
    <span className="ml-2 font-mono text-xs text-zinc-400">
      last:{" "}
      <span className={accepted ? "text-green-400" : "text-red-400"}>
        {result.verdict ?? result.status}
      </span>{" "}
      ({result.testsPassed}/{result.testsTotal}
      {result.timeMs !== null ? `, ${result.timeMs}ms` : ""})
    </span>
  );
}

/** Glicko-2 rating change on the results screen — ranked matches only. */
function RatingDelta({ reveal, ranked }: { reveal: PlayerReveal; ranked: boolean }) {
  if (!ranked || reveal.ratingBefore === null || reveal.ratingAfter === null) return null;
  const before = Math.round(reveal.ratingBefore);
  const after = Math.round(reveal.ratingAfter);
  const delta = after - before;
  return (
    <span>
      rating {before}→<span className="text-zinc-300">{after}</span>{" "}
      <span className={delta >= 0 ? "text-green-400" : "text-red-400"}>
        ({delta >= 0 ? "+" : ""}
        {delta})
      </span>
    </span>
  );
}

function ResultsScreen({
  detail,
  myUserId,
  winnerId,
  onRematch,
  error,
}: {
  detail: MatchDetail;
  myUserId: string | null;
  winnerId: string | null;
  onRematch: () => void;
  error: string | null;
}) {
  const [rematching, setRematching] = useState(false);
  const iWon = winnerId !== null && winnerId === myUserId;
  const winner = detail.players.find((p) => p.id === winnerId);

  const solveClock = (acceptedAt: string | null): string | null => {
    if (!acceptedAt || !detail.startedAt) return null;
    return formatClock(Date.parse(acceptedAt) - Date.parse(detail.startedAt));
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-zinc-500">
          {detail.problem?.title ?? "match"} — {detail.mode.replace(/_/g, " ")}
          {detail.ranked ? " · ranked" : ""}
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          {winnerId === null ? (
            <span className="text-zinc-300">Draw — time ran out</span>
          ) : iWon ? (
            <span className="text-green-400">You won 🏆</span>
          ) : (
            <span className="text-red-400">{winner?.handle ?? "Opponent"} won</span>
          )}
        </h1>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              setRematching(true);
              onRematch();
            }}
            disabled={rematching}
            className="rounded-md bg-accent px-6 py-2.5 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {rematching ? "Starting…" : "Rematch"}
          </button>
          <a
            href="/"
            className="rounded-md border border-edge px-6 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:border-accent hover:text-accent"
          >
            Back to lobby
          </a>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>

      {/* Code reveal (§1.1 step 5): both solutions, side by side. */}
      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        {(detail.results ?? []).map((r) => {
          const clock = solveClock(r.acceptedAt);
          return (
            <div key={r.userId} className="rounded-lg border border-edge bg-panel">
              <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
                <span className="font-mono text-sm text-zinc-200">
                  {r.handle}
                  {r.userId === myUserId && <span className="text-zinc-500"> (you)</span>}
                  {r.userId === winnerId && " 🏆"}
                </span>
                <span className="font-mono text-xs text-zinc-500">
                  {r.verdict ? (
                    <span className={r.verdict === "accepted" ? "text-green-400" : "text-red-400"}>
                      {r.verdict}
                    </span>
                  ) : (
                    "no submission"
                  )}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-edge px-4 py-2 font-mono text-xs text-zinc-500">
                <span>{r.language ?? "—"}</span>
                {clock && <span>solved in {clock}</span>}
                {r.benchmarkMs !== null && (
                  <span className="text-accent">{r.benchmarkMs}ms benchmark</span>
                )}
                {r.benchmarkMs === null && r.timeMs !== null && <span>{r.timeMs}ms</span>}
                {r.bytes !== null && <span>{r.bytes}B</span>}
                <span>{r.submitCount} submit{r.submitCount === 1 ? "" : "s"}</span>
                <RatingDelta reveal={r} ranked={detail.ranked} />
              </div>
              <pre className="max-h-96 overflow-auto p-4 font-mono text-xs leading-relaxed text-zinc-300">
                {r.source ?? "— nothing submitted —"}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
