"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRoom, joinRoom } from "@/lib/api";

export default function LobbyPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    const res = await createRoom();
    setBusy(false);
    if (res.ok) {
      router.push(`/match/${res.data.matchId}`);
    } else {
      setError(res.error);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    const res = await joinRoom(code.trim());
    setBusy(false);
    if (res.ok) {
      router.push(`/match/${res.data.matchId}`);
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-8 px-6 py-24">
      <div className="text-center">
        <h1 className="font-mono text-4xl font-bold tracking-tight">
          <span className="text-accent">leet</span>clash
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Real-time 1v1 coding duels. Same problem, live race.
        </p>
      </div>

      <button
        onClick={handleCreate}
        disabled={busy}
        className="w-full rounded-md bg-accent px-4 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Working…" : "Create room"}
      </button>

      <div className="flex w-full items-center gap-3 text-xs text-zinc-600">
        <div className="h-px flex-1 bg-edge" />
        or
        <div className="h-px flex-1 bg-edge" />
      </div>

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

      {error && (
        <p className="w-full rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
