"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Language, QueueMode } from "@leetclash/shared";
import {
  createRoom,
  getQueueStatus,
  getStoredGuest,
  joinQueue,
  joinRoom,
  leaveQueue,
} from "@/lib/api";
import { subscribeUserEvents } from "@/lib/socket";

const MODES: { id: QueueMode; label: string; blurb: string }[] = [
  { id: "speed_race", label: "Speed Race", blurb: "First to solve wins" },
  { id: "code_golf", label: "Code Golf", blurb: "Smallest accepted source" },
  { id: "fastest_runtime", label: "Fastest Runtime", blurb: "Lowest benchmarked runtime" },
];

const LANGUAGES: { id: Language; label: string }[] = [
  { id: "python", label: "Python" },
  { id: "cpp", label: "C++" },
  { id: "javascript", label: "JavaScript" },
  { id: "java", label: "Java" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
];

export default function LobbyPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ── Ranked queue ──
  const [mode, setMode] = useState<QueueMode>("speed_race");
  const [language, setLanguage] = useState<Language>("python");
  const [searching, setSearching] = useState(false);
  const [waited, setWaited] = useState(0);

  const sameLang = mode === "fastest_runtime";

  useEffect(() => {
    if (!searching) return;
    const guest = getStoredGuest();
    const unsub = guest
      ? subscribeUserEvents(guest.id, (e) => {
          if (e.type === "queue_matched") router.push(`/match/${e.payload.matchId}`);
        })
      : () => {};
    const poll = setInterval(async () => {
      const s = await getQueueStatus();
      if (!s.ok) return;
      if (s.data.status === "matched" && s.data.matchId) {
        router.push(`/match/${s.data.matchId}`);
      } else if (s.data.status === "searching") {
        setWaited(s.data.waitedSec);
      } else if (s.data.status === "idle") {
        setSearching(false);
      }
    }, 1500);
    return () => {
      clearInterval(poll);
      unsub();
    };
  }, [searching, router]);

  async function findMatch() {
    setError(null);
    setBusy(true);
    const res = await joinQueue(mode, language);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (res.data.status === "matched" && res.data.matchId) {
      router.push(`/match/${res.data.matchId}`);
    } else {
      setWaited(0);
      setSearching(true);
    }
  }

  async function cancelSearch() {
    await leaveQueue();
    setSearching(false);
    setWaited(0);
  }

  async function handleCreate() {
    setBusy(true);
    setError(null);
    const res = await createRoom();
    setBusy(false);
    if (res.ok) router.push(`/match/${res.data.matchId}?invite=${res.data.inviteCode}`);
    else setError(res.error);
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    const res = await joinRoom(code.trim());
    setBusy(false);
    if (res.ok) router.push(`/match/${res.data.matchId}`);
    else setError(res.error);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-8 px-6 py-16">
      <div className="text-center">
        <h1 className="font-mono text-4xl font-bold tracking-tight">
          <span className="text-accent">leet</span>clash
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Real-time 1v1 coding duels. Same problem, live race.
        </p>
      </div>

      {/* Ranked matchmaking */}
      <section className="w-full rounded-lg border border-edge bg-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Ranked
          </h2>
          <a href="/leaderboard" className="text-xs text-zinc-500 hover:text-accent">
            Leaderboards →
          </a>
        </div>

        {searching ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-edge border-t-accent" />
            <p className="text-sm text-zinc-300">
              Searching for a {MODES.find((m) => m.id === mode)?.label} opponent…
            </p>
            <p className="font-mono text-xs text-zinc-500">
              {language}
              {sameLang && " · same-language"} · waited {waited}s
            </p>
            <button
              onClick={cancelSearch}
              className="mt-1 rounded border border-edge px-4 py-1.5 text-sm text-zinc-300 hover:border-red-500 hover:text-red-400"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`rounded border px-2 py-2 text-left transition-colors ${
                    mode === m.id
                      ? "border-accent bg-accent/10"
                      : "border-edge hover:border-zinc-600"
                  }`}
                >
                  <span className="block text-xs font-semibold text-zinc-200">{m.label}</span>
                  <span className="block text-[10px] leading-tight text-zinc-500">{m.blurb}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="flex-1 rounded border border-edge bg-surface px-2 py-2 font-mono text-xs text-zinc-300 focus:border-accent focus:outline-none"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                    {sameLang ? " (matchmaking)" : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={findMatch}
                disabled={busy}
                className="rounded bg-accent px-5 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "…" : "Find match"}
              </button>
            </div>
          </>
        )}
      </section>

      <div className="flex w-full items-center gap-3 text-xs text-zinc-600">
        <div className="h-px flex-1 bg-edge" />
        or play a friend
        <div className="h-px flex-1 bg-edge" />
      </div>

      {/* Private rooms */}
      <div className="w-full space-y-4">
        <button
          onClick={handleCreate}
          disabled={busy}
          className="w-full rounded-md border border-edge px-4 py-3 font-medium text-zinc-200 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {busy ? "Working…" : "Create private room"}
        </button>

        <form onSubmit={handleJoin} className="flex w-full gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Invite code"
            className="flex-1 rounded-md border border-edge bg-panel px-3 py-2 font-mono text-sm placeholder:text-zinc-600 focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="rounded-md border border-edge px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Join
          </button>
        </form>
      </div>

      {error && (
        <p className="w-full rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
