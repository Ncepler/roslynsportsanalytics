"use client";

import { useCallback, useEffect, useState } from "react";
import { formatGameDate, StatusChip } from "@/components/games/status-chip";
import { ApiError } from "@/lib/client/api";
import { claimGame, fetchGames } from "@/lib/client/games";
import type { GameSport, PublicGame } from "@/lib/games/types";

const SPORTS: { id: GameSport; label: string }[] = [
  { id: "basketball", label: "Basketball" },
  { id: "lacrosse", label: "Lacrosse" },
];

const choiceClass = (selected: boolean) =>
  `btn border ${selected ? "border-accent bg-[oklch(from_var(--accent)_l_c_h/0.1)] text-text" : "border-border-strong bg-surface"}`;

const REFRESH_MS = 15_000;

// First step of the real flow: pick the sport, then the game. Picking a game
// claims it for this person, so nobody else can start the same game and a
// finished game can't be done again. Statuses refresh while this is open.
export function GameStep({ onChosen }: { onChosen: (game: PublicGame, token: string) => void }) {
  const [sport, setSport] = useState<GameSport>("basketball");
  const [games, setGames] = useState<PublicGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  // `clear` is false right after a failed pick, so the refresh doesn't wipe the message explaining it.
  const load = useCallback(async (clear = true) => {
    try {
      setGames(await fetchGames(sport));
      if (clear) setError(null);
    } catch (err) {
      setGames((g) => g ?? []);
      setError(err instanceof Error ? err.message : "Couldn't load the schedule.");
    }
  }, [sport]);

  useEffect(() => {
    // Fetching from the server; setState happens after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(false), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function choose(game: PublicGame) {
    setClaiming(game.id);
    setError(null);
    try {
      onChosen(game, await claimGame(game.id));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? `${err.message} The list has been updated.` : err instanceof Error ? err.message : "Couldn't pick that game.");
      await load(false);
      setClaiming(null);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-[-0.01em]">Which game?</h2>
      <p className="hint mt-1 max-w-[38rem]">Each game is analyzed once. Picking it holds it for you while you work.</p>

      <div role="radiogroup" aria-label="Sport" className="mt-5 flex gap-2">
        {SPORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={sport === s.id}
            className={`${choiceClass(sport === s.id)} min-w-32`}
            onClick={() => {
              if (s.id === sport) return;
              setGames(null);
              setSport(s.id);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {games === null ? (
        <p className="mt-6 text-muted">Loading the schedule…</p>
      ) : games.length === 0 ? (
        <p className="mt-6 max-w-[34rem] text-muted">No {sport} games are scheduled yet. Ask an admin to add the schedule.</p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-[0.875rem] border border-border">
          {games.map((g) => {
            const open = g.status === "open";
            return (
              <li key={g.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${open ? "" : "bg-surface-sunken"}`}>
                <div className="min-w-[12rem] flex-1">
                  <p className={`font-medium break-words ${open ? "" : "text-muted"}`}>{g.opponent}</p>
                  <p className="text-sm text-muted tabular-nums">
                    {formatGameDate(g.date)}
                    {g.note ? ` · ${g.note}` : ""}
                  </p>
                </div>
                <StatusChip status={g.status} />
                {open ? (
                  <button type="button" className="btn btn-primary min-h-10 px-4" disabled={claiming !== null} onClick={() => void choose(g)}>
                    {claiming === g.id ? "Picking…" : "Pick this game"}
                  </button>
                ) : (
                  <span className="w-36 text-sm text-muted">{g.status === "done" ? "Already analyzed" : "Someone is working on it"}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p role="alert" className="mt-3 min-h-5 text-sm text-danger">
        {error}
      </p>
    </div>
  );
}
