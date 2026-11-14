"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { simulatedNotes } from "@/lib/demo/notes";
import { buildNotesInput, type GameNotesOutput } from "@/lib/game/notes";
import type { PossessionLog } from "@/lib/gemini/log-types";

type Result = GameNotesOutput & { removed: number };

const SECTIONS: { key: keyof GameNotesOutput; title: string; blurb: string }[] = [
  { key: "worked", title: "What worked for Roslyn", blurb: "Scoring patterns that went with Roslyn's best stretches." },
  { key: "opponent_better", title: "Where the opponent was more effective", blurb: "Where the other team's numbers were stronger." },
  { key: "takeaways", title: "What the numbers point to", blurb: "Statistical conditions for the matchup." },
];

// Game notes written by Gemini from numbers the code already computed. Every note with a number that isn't in
// those inputs is removed on the server. Written automatically (no button), once per set of numbers, and not stored.
export function StrategyNotes({ log, sportId, statIds, away, demo = false }: { log: PossessionLog; sportId: string; statIds: string[]; away: string; /** The /test simulation never calls the AI. */ demo?: boolean }) {
  const input = useMemo(() => buildNotesInput(log, sportId, statIds, away || "the opponent"), [log, sportId, statIds, away]);
  const key = useMemo(() => (input ? JSON.stringify(input) : null), [input]);
  const [state, setState] = useState<{ status: "loading" } | { status: "done"; result: Result } | { status: "error"; message: string }>({ status: "loading" });
  // Notes for numbers already written about are kept, so scrolling or re-rendering never asks Gemini again.
  const cache = useRef(new Map<string, Result>());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (demo || !input || !key) return;
    const cached = cache.current.get(key);
    if (cached) {
      setState({ status: "done", result: cached });
      return;
    }
    // Wait a moment so a burst of edits in the possession log makes one request, not many.
    let cancelled = false;
    setState({ status: "loading" });
    const timer = setTimeout(async () => {
      try {
        const result = await api<Result>("/api/games/notes", { body: input });
        if (cancelled) return;
        cache.current.set(key, result);
        setState({ status: "done", result });
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't write the notes." });
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input, key, demo, attempt]);

  if (!input) return <p className="text-sm text-muted">There isn&apos;t enough logged data for this game to write notes from.</p>;
  const result = demo ? simulatedNotes(input) : state.status === "done" ? state.result : null;
  if (!demo && state.status === "loading")
    return (
      <p role="status" className="text-sm text-muted">
        Writing the game notes from the numbers above…
      </p>
    );
  if (!demo && state.status === "error")
    return (
      <div>
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
        <button type="button" className="btn btn-secondary mt-2 min-h-9" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <section key={s.key} className="rounded-[0.75rem] border border-border bg-surface p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.06em]">{s.title}</h3>
            <p className="mt-1 text-xs text-muted">{s.blurb}</p>
            {(result?.[s.key] ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nothing the numbers support.</p>
            ) : (
              <ul className="mt-3 space-y-2.5 text-[0.9375rem] leading-snug">
                {(result?.[s.key] ?? []).map((n, i) => (
                  <li key={i} className="border-l-2 border-border-strong pl-3">
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <p className="hint mt-3">
        {demo ? (
          <>Simulated: the practice demo fills these in from the numbers with fixed sentences and no AI. On a real game, Gemini writes them automatically in the same style. </>
        ) : (
          <>
            Written by AI from the numbers on this page; every note was checked against them
            {state.status === "done" && state.result.removed > 0 ? ` (${state.result.removed} removed for quoting a number that isn't in the data)` : ""}.{" "}
          </>
        )}
        One game describes what happened, not why.
      </p>
    </div>
  );
}
