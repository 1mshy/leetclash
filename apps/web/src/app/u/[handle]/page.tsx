"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import type { ProfileDetail } from "@leetclash/shared";
import { getProfile } from "@/lib/api";

const MODE_LABEL: Record<string, string> = {
  speed_race: "Speed Race",
  code_golf: "Code Golf",
  fastest_runtime: "Fastest Runtime",
  memory_golf: "Memory Golf",
  scaling_duel: "Scaling Duel",
  blitz: "Blitz",
};

function ladderLabel(mode: string, language: string | null): string {
  return `${MODE_LABEL[mode] ?? mode}${language ? ` · ${language}` : ""}`;
}

export default function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProfile(handle).then((res) => {
      if (cancelled) return;
      if (res.ok) setProfile(res.data);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  if (error) {
    return <div className="mx-auto max-w-3xl px-6 py-10 text-red-400">{error}</div>;
  }
  if (!profile) {
    return <div className="mx-auto max-w-3xl px-6 py-10 text-zinc-500">Loading…</div>;
  }

  const recordFor = (mode: string, language: string | null) =>
    profile.records.find((r) => r.mode === mode && r.language === language);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-edge bg-panel font-mono text-lg text-accent">
          {profile.handle.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{profile.handle}</h1>
          <p className="text-xs text-zinc-500">
            joined {new Date(profile.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Ratings per ladder */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
        Ratings
      </h2>
      {profile.ratings.length === 0 ? (
        <p className="mb-8 text-sm text-zinc-500">No ranked games yet.</p>
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {profile.ratings.map((r) => {
            const rec = recordFor(r.mode, r.language);
            return (
              <div
                key={`${r.mode}:${r.language ?? "all"}`}
                className="rounded-lg border border-edge bg-panel p-3"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-zinc-300">{ladderLabel(r.mode, r.language)}</span>
                  <span className="font-mono text-lg text-accent">{Math.round(r.rating)}</span>
                </div>
                <div className="mt-1 flex justify-between font-mono text-[11px] text-zinc-500">
                  <span>±{Math.round(r.rd)} rd</span>
                  <span>
                    {rec ? `${rec.wins}W ${rec.losses}L ${rec.draws}D` : `${r.games} games`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent matches */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
        Recent matches
      </h2>
      {profile.recentMatches.length === 0 ? (
        <p className="text-sm text-zinc-500">No matches played.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-edge">
          <table className="w-full text-sm">
            <tbody>
              {profile.recentMatches.map((m) => {
                const delta =
                  m.ratingBefore != null && m.ratingAfter != null
                    ? Math.round(m.ratingAfter - m.ratingBefore)
                    : null;
                const resultColor =
                  m.result === "win"
                    ? "text-green-400"
                    : m.result === "draw"
                      ? "text-zinc-400"
                      : "text-red-400";
                return (
                  <tr key={m.matchId} className="border-t border-edge first:border-t-0">
                    <td className={`px-4 py-2 font-mono text-xs uppercase ${resultColor}`}>
                      {m.result ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {MODE_LABEL[m.mode] ?? m.mode}
                      {m.ranked ? "" : " (casual)"}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-500">
                      {m.problemTitle ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {m.opponentHandle ? (
                        <>
                          vs{" "}
                          <Link href={`/u/${m.opponentHandle}`} className="hover:text-accent">
                            {m.opponentHandle}
                          </Link>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {delta != null ? (
                        <span className={delta >= 0 ? "text-green-400" : "text-red-400"}>
                          {delta >= 0 ? "+" : ""}
                          {delta}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
