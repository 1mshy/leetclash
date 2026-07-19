"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ESTABLISHED_RD_THRESHOLD } from "@leetclash/shared";
import type { GameMode, Language, LeaderboardEntry } from "@leetclash/shared";
import { getLeaderboard } from "@/lib/api";

const MODES: { id: GameMode; label: string; sameLang: boolean }[] = [
  { id: "speed_race", label: "Speed Race", sameLang: false },
  { id: "code_golf", label: "Code Golf", sameLang: false },
  { id: "fastest_runtime", label: "Fastest Runtime", sameLang: true },
  { id: "memory_golf", label: "Memory Golf", sameLang: true },
  { id: "scaling_duel", label: "Scaling Duel", sameLang: false },
];
const LANGUAGES: Language[] = ["python", "cpp", "javascript", "java", "go", "rust"];

export default function LeaderboardPage() {
  const [mode, setMode] = useState<GameMode>("speed_race");
  const [language, setLanguage] = useState<Language>("python");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const spec = MODES.find((m) => m.id === mode)!;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getLeaderboard(mode, spec.sameLang ? language : undefined).then((res) => {
      if (cancelled) return;
      if (res.ok) setEntries(res.data.entries);
      else setError(res.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, language, spec.sameLang]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-bold text-zinc-100">Leaderboards</h1>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              mode === m.id
                ? "border-accent bg-accent/10 text-accent"
                : "border-edge text-zinc-300 hover:border-zinc-600"
            }`}
          >
            {m.label}
          </button>
        ))}
        {spec.sameLang && (
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="ml-auto rounded border border-edge bg-surface px-2 py-1.5 font-mono text-xs text-zinc-300 focus:border-accent focus:outline-none"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-edge">
        <table className="w-full text-sm">
          <thead className="bg-panel text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">#</th>
              <th className="px-4 py-2 text-left font-medium">Player</th>
              <th className="px-4 py-2 text-right font-medium">Rating</th>
              <th className="px-4 py-2 text-right font-medium">W/L</th>
              <th className="px-4 py-2 text-right font-medium">Games</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-red-400">
                  {error}
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  No established players on this ladder yet — play ranked matches until your
                  rating settles (RD &le; {ESTABLISHED_RD_THRESHOLD}).
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.userId} className="border-t border-edge">
                  <td className="px-4 py-2 font-mono text-zinc-500">{e.rank}</td>
                  <td className="px-4 py-2">
                    <Link href={`/u/${e.handle}`} className="text-zinc-200 hover:text-accent">
                      {e.handle}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-accent">
                    {e.rating}
                    <span className="ml-1 text-[10px] text-zinc-600">±{e.rd}</span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-zinc-400">
                    {e.wins}/{e.losses}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-zinc-500">{e.games}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
