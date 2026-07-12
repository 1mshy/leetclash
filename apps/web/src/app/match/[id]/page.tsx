"use client";

import { use, useEffect } from "react";
import CodeEditor from "@/components/CodeEditor";
import OpponentProgress from "@/components/OpponentProgress";
import { joinMatch } from "@/lib/socket";
import { useMatchStore } from "@/stores/match";

/** Placeholder statement until problems come from the api service. */
const PLACEHOLDER_STATEMENT = {
  title: "Problem statement",
  body: [
    "The problem statement will be revealed here when the match goes live.",
    "It arrives from the api service after the `problem_revealed` match event — statements are Markdown and will be rendered properly once a renderer is wired up.",
  ],
};

export default function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const status = useMatchStore((s) => s.status);
  const myLastResult = useMatchStore((s) => s.myLastResult);
  const setMatch = useMatchStore((s) => s.setMatch);
  const applyMatchEvent = useMatchStore((s) => s.applyMatchEvent);

  useEffect(() => {
    // TODO: pass the real user id from the auth session once auth exists.
    setMatch(id, null);
    const leave = joinMatch(id, applyMatchEvent);
    return leave;
  }, [id, setMatch, applyMatchEvent]);

  function handleRun() {
    // TODO: POST SubmissionRequest (kind: "run") to the api; public tests only.
    console.warn("Run not implemented yet — needs the api + judge services.");
  }

  function handleSubmit() {
    // TODO: POST SubmissionRequest (kind: "submit"); hidden suite, counts
    // toward the match. Respect the 1-submit-per-10s throttle client-side too.
    console.warn("Submit not implemented yet — needs the api + judge services.");
  }

  return (
    <div className="flex h-[calc(100vh-49px)] flex-col">
      <div className="flex items-center justify-between border-b border-edge bg-panel px-4 py-1.5 font-mono text-xs text-zinc-500">
        <span>
          match <span className="text-zinc-300">{id}</span>
        </span>
        <span>
          status <span className="text-accent">{status ?? "connecting…"}</span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: problem statement */}
        <section className="w-1/2 overflow-y-auto border-r border-edge p-6">
          <h1 className="text-xl font-bold text-zinc-100">
            {PLACEHOLDER_STATEMENT.title}
          </h1>
          {PLACEHOLDER_STATEMENT.body.map((p) => (
            <p key={p} className="mt-4 text-sm leading-relaxed text-zinc-400">
              {p}
            </p>
          ))}
        </section>

        {/* Right: editor + actions + opponent strip */}
        <section className="flex w-1/2 min-w-0 flex-col">
          <div className="min-h-0 flex-1">
            <CodeEditor />
          </div>

          <div className="flex items-center gap-2 border-t border-edge bg-panel px-4 py-2">
            <button
              onClick={handleRun}
              className="rounded border border-edge px-4 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:border-accent hover:text-accent"
            >
              Run
            </button>
            <button
              onClick={handleSubmit}
              className="rounded bg-accent px-4 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
            >
              Submit
            </button>
            {myLastResult && (
              <span className="ml-2 font-mono text-xs text-zinc-400">
                last: {myLastResult.verdict ?? myLastResult.status} (
                {myLastResult.testsPassed}/{myLastResult.testsTotal})
              </span>
            )}
          </div>

          <OpponentProgress />
        </section>
      </div>
    </div>
  );
}
