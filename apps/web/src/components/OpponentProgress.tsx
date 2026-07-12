"use client";

import { useMatchStore } from "@/stores/match";

/**
 * Opponent progress strip (PLAN §1.1): tests passed, submission count and
 * last verdict — never the opponent's code. State comes from the Zustand
 * match store; it will be fed by socket.io `progress` events. Until the
 * realtime service exists, everything shows its zero/empty state.
 */
export default function OpponentProgress() {
  const opponent = useMatchStore((s) => s.opponent);

  return (
    <div className="flex items-center gap-6 border-t border-edge bg-panel px-4 py-2 font-mono text-xs">
      <span className="font-semibold uppercase tracking-wider text-zinc-500">
        Opponent
      </span>
      <span className="text-zinc-300">
        tests{" "}
        <span className="text-accent">
          {opponent.testsPassed}/{opponent.testsTotal || "?"}
        </span>
      </span>
      <span className="text-zinc-300">
        submissions <span className="text-accent">{opponent.submissionCount}</span>
      </span>
      <span className="text-zinc-300">
        last verdict{" "}
        <span
          className={
            opponent.lastVerdict === "accepted"
              ? "text-green-400"
              : opponent.lastVerdict
                ? "text-red-400"
                : "text-zinc-600"
          }
        >
          {opponent.lastVerdict ?? "—"}
        </span>
      </span>
    </div>
  );
}
