"use client";

import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { buildNotesInput, type GameNotesOutput } from "@/lib/game/notes";
import type { PossessionLog } from "@/lib/gemini/log-types";

type Result = GameNotesOutput & { removed: number };

const SECTIONS: { key: keyof GameNotesOutput; title: string; blurb: string }[] = [
  { key: "worked", title: "What worked for Roslyn", blurb: "Scoring patterns that went with Roslyn's best stretches." },
  { key: "opponent_better", title: "Where the opponent was more effective", blurb: "Where the other team's numbers were stronger." },
  { key: "takeaways", title: "What the numbers point to", blurb: "Statistical conditions for the matchup." },
];

// Game notes written by Gemini from numbers the code already computed. Every note with a number that isn't in
// those inputs is removed on the server. Written on a button press (it costs a little), and not stored.
export function StrategyNotes({ log, sportId, statIds, away }: { log: PossessionLog; sportId: string; statIds: string[]; away: string }) {
  const input = useMemo(() => buildNotesInput(log, sportId, statIds, away || "the opponent"), [log, sportId, statIds, away]);
  const [state, setState] = useState<{ status: "idle" } | { status: "loading" } | { status: "done"; result: Result } | { status: "error"; message: string }>({ status: "idle" });

  async function write() {
    if (!input) return;
    setState({ status: "loading" });
    try {
      setState({ status: "done", result: await api<Result>("/api/games/notes", { body: input }) });
    } catch (err) {
      setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't write the notes. Try again." });
    }
  }

  if (!input) return <p className="text-sm text-muted">There isn&apos;t enough logged data for this game to write notes from.</p>;

  return (
    <div>
      {state.status !== "done" && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={state.status === "loading"} onClick={() => void write()}>
            {state.status === "loading" ? "Writing…" : "Write the game notes"}
          </button>
          <p className="text-sm text-muted">Gemini writes these from the numbers on this page. It costs a fraction of a cent.</p>
        </div>
      )}
      {state.status === "error" && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <div>
          <div className="grid gap-4 lg:grid-cols-3">
            {SECTIONS.map((s) => (
              <section key={s.key} className="rounded-[0.75rem] border border-border bg-surface p-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.06em]">{s.title}</h3>
                <p className="mt-1 text-xs text-muted">{s.blurb}</p>
                {state.result[s.key].length === 0 ? (
                  <p className="mt-3 text-sm text-muted">Nothing the numbers support.</p>
                ) : (
                  <ul className="mt-3 space-y-2.5 text-[0.9375rem] leading-snug">
                    {state.result[s.key].map((n, i) => (
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
            Written by AI from the numbers on this page; every note was checked against them
            {state.result.removed > 0 ? ` (${state.result.removed} removed for quoting a number that isn't in the data)` : ""}. One game describes what happened, not why.
          </p>
          <button type="button" className="btn btn-ghost mt-2 min-h-9 px-2 text-sm" onClick={() => void write()}>
            Write them again
          </button>
        </div>
      )}
    </div>
  );
}
