"use client";

import { useMemo, useState } from "react";
import { formatGameDate } from "@/components/games/status-chip";
import type { StoredSeasonData } from "@/lib/db/season";
import { buildGames } from "@/lib/season/model";
import { readTabs } from "@/lib/season/parse";
import { SeasonResults } from "./season-tab";

// Season trends for one team and season, from the games saved in the database. The saved possession logs become
// the club's sheets, which go through the same reader and math as before. Every number is computed in code.
export function StoredSeason({ data }: { data: StoredSeasonData }) {
  const { read } = useMemo(() => readTabs(data.tabs), [data.tabs]);
  const games = useMemo(() => buildGames(read).filter((g) => g.sport === data.sport), [read, data.sport]);
  const [scores] = useState(data.scores);
  const usable = games.length;

  if (data.games.length === 0) {
    return (
      <p className="rounded-[0.75rem] border border-border bg-surface-sunken px-5 py-8 text-center text-muted">
        No analyzed games in {data.seasonLabel} yet. Analyze a game and save it, and it appears here automatically.
      </p>
    );
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Games included</h2>
        <p className="mt-1 text-sm text-muted tabular-nums">
          {data.games.length} saved game{data.games.length === 1 ? "" : "s"} in {data.seasonLabel}. Every saved game is included automatically.
        </p>
        {data.needsReview.games > 0 ? (
          <p role="status" className="mt-3 rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-text tabular-nums">
            <span className="font-medium">
              {data.needsReview.games} of {data.games.length} game{data.games.length === 1 ? "" : "s"} still need a second look
            </span>
            : {data.needsReview.rows} possession{data.needsReview.rows === 1 ? "" : "s"} marked low confidence, or a quarter that fails the scoreboard check. Open those games in Analyze to fix them.
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">No games have rows flagged for review.</p>
        )}
        <ul className="mt-3 divide-y divide-border rounded-[0.75rem] border border-border text-[0.9375rem]">
          {data.games.map((g) => (
            <li key={g.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5">
              <span>
                <span className="tabular-nums">{formatGameDate(g.date)}</span> · {g.opponent}
              </span>
              <span className="flex flex-wrap gap-1.5 text-xs">
                {g.lowRows > 0 && <span className="rounded-full border border-warning-border bg-warning-bg px-2.5 py-0.5 font-medium text-warning-text tabular-nums">{g.lowRows} to check</span>}
                {g.mismatchedQuarters.length > 0 && <span className="rounded-full border border-warning-border bg-warning-bg px-2.5 py-0.5 font-medium text-warning-text">Scoreboard mismatch: Q{g.mismatchedQuarters.join(", Q")}</span>}
                {g.hasScore && <span className="rounded-full border border-border-strong px-2.5 py-0.5 text-muted">Score entered</span>}
              </span>
            </li>
          ))}
        </ul>
        {usable < data.games.length && (
          <p className="mt-2 text-sm text-muted tabular-nums">
            {data.games.length - usable} game{data.games.length - usable === 1 ? " has" : "s have"} no usable stats yet, so {data.games.length - usable === 1 ? "it isn't" : "they aren't"} counted below.
          </p>
        )}
      </section>

      <SeasonResults games={games} sport={data.sport} scores={scores} setScores={() => {}} demo={false} readOnlyScores />
    </div>
  );
}
