"use client";

import { useState, type FormEvent } from "react";
import { formatGameDate } from "@/components/games/status-chip";
import { ApiError } from "@/lib/client/api";
import { loadSavedGame, type ReopenedGame } from "@/lib/client/save";
import type { PickableGame } from "@/lib/db/games";

export type TeamGameChoice =
  | { kind: "scheduled"; id: string; opponent: string; date: string; homeAway: "home" | "away" }
  | { kind: "quick"; opponent: string; date: string; homeAway: "home" | "away" };

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the user's own time zone

// First step of the real flow: which of this team's games is on the video? Pick a scheduled game,
// add one that isn't on the schedule, or open an already analyzed game to review and edit it.
export function TeamGameStep({
  scheduled,
  analyzed,
  opponents,
  onChoose,
  onReopen,
}: {
  scheduled: PickableGame[];
  analyzed: PickableGame[];
  opponents: string[];
  onChoose: (choice: TeamGameChoice) => void;
  onReopen: (game: ReopenedGame) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState(today);
  const [homeAway, setHomeAway] = useState<"home" | "away">("home");
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addQuick(e: FormEvent) {
    e.preventDefault();
    if (!opponent.trim()) return setError("Enter the opponent.");
    onChoose({ kind: "quick", opponent: opponent.trim(), date, homeAway });
  }

  async function open(id: string) {
    setOpening(id);
    setError(null);
    try {
      onReopen(await loadSavedGame(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't open that game.");
      setOpening(null);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-[-0.01em]">Which game is this?</h2>
      <p className="hint mt-1 max-w-[38rem]">Pick the game from this team&apos;s schedule. It is saved to that game when you finish the review.</p>

      {scheduled.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No games waiting to be analyzed. Add the game below, or ask an admin to add it to the schedule.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-[0.75rem] border border-border">
          {scheduled.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left [@media(hover:hover)_and_(pointer:fine)]:hover:bg-surface-sunken"
                onClick={() => onChoose({ kind: "scheduled", id: g.id, opponent: g.opponent, date: g.date, homeAway: g.home_away })}
              >
                <span>
                  <span className="tabular-nums">{formatGameDate(g.date)}</span> · {g.home_away === "home" ? "vs" : "at"} {g.opponent}
                  {g.location && <span className="text-sm text-muted"> · {g.location}</span>}
                </span>
                <span className="text-sm font-medium text-accent">Use this game</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        {!adding ? (
          <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
            Game not on the schedule? Add it
          </button>
        ) : (
          <form onSubmit={addQuick} className="flex flex-wrap items-end gap-3 rounded-[0.75rem] border border-border bg-surface-sunken p-4">
            <label className="block min-w-0 flex-1 basis-48">
              <span className="label">Opponent</span>
              <input className="field" list="known-opponents" value={opponent} onChange={(e) => setOpponent(e.target.value)} maxLength={80} required />
              <datalist id="known-opponents">
                {opponents.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
            <label className="block flex-1 basis-40">
              <span className="label">Date</span>
              <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label className="block flex-1 basis-32">
              <span className="label">Home or away</span>
              <select className="field" value={homeAway} onChange={(e) => setHomeAway(e.target.value as "home" | "away")}>
                <option value="home">Home</option>
                <option value="away">Away</option>
              </select>
            </label>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary">
                Use this game
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
      <p role="alert" className="mt-2 min-h-5 text-sm text-danger">
        {error}
      </p>

      {analyzed.length > 0 && (
        <section className="mt-8 border-t border-border pt-6">
          <h3 className="text-base font-semibold">Already analyzed</h3>
          <p className="hint mt-1">Open one to check it or fix mistakes. Saving again replaces what was saved.</p>
          <ul className="mt-3 divide-y divide-border rounded-[0.75rem] border border-border">
            {analyzed.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span>
                  <span className="tabular-nums">{formatGameDate(g.date)}</span> · {g.home_away === "home" ? "vs" : "at"} {g.opponent}
                </span>
                <button type="button" className="btn btn-secondary min-h-9 px-3" disabled={opening === g.id} onClick={() => void open(g.id)}>
                  {opening === g.id ? "Opening…" : "Open"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
