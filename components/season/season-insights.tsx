"use client";

import { useMemo } from "react";
import { AccuracyNote } from "@/components/accuracy-note";
import { seasonSources, type GameExtras, type SeasonSource } from "@/lib/season/extras";
import { MIN_ABS_R, MIN_GAMES } from "@/lib/season/stats";
import type { WorkedItem } from "@/lib/season/model";

// "What has worked this season and what hasn't" and "where the points came from". Every figure is computed in code from
// the saved games (lib/season); these sections only lay it out. "Went with" never means "caused".

function Column({ title, tone, items, empty }: { title: string; tone: "good" | "bad"; items: WorkedItem[]; empty: string }) {
  return (
    <section className="rounded-[1rem] border border-border bg-surface p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.06em]">
        <span aria-hidden className={`inline-block h-4 w-1.5 rounded-full ${tone === "good" ? "bg-team-a" : "bg-team-b"}`} />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((w) => (
            <li key={`${w.stat}-${w.outcome}`} className="py-2.5">
              <p className="font-semibold leading-snug">{w.stat}</p>
              <p className="mt-0.5 text-sm text-muted tabular-nums">
                {w.text} · r = {w.r.toFixed(2)} · {w.n} games
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function WorkedAndNot({ worked, notWorked, games, withScores }: { worked: WorkedItem[]; notWorked: WorkedItem[]; games: number; withScores: number }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-[-0.01em]">What has worked this season, and what hasn&apos;t</h2>
      <AccuracyNote className="mt-1" />
      <p className="mt-1 max-w-[44rem] text-sm text-muted tabular-nums">
        From the trends tested below, shown only with at least {MIN_GAMES} games and a correlation of at least {MIN_ABS_R}. Compared against the point margin when final scores are entered ({withScores} of {games} games), otherwise against offensive efficiency.
        &quot;Went with&quot; never means one caused the other.
      </p>
      {games < MIN_GAMES ? (
        <p className="mt-4 tabular-nums">
          Not enough data yet: this needs at least {MIN_GAMES} analyzed games and there {games === 1 ? "is" : "are"} {games}.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Column title="What has worked" tone="good" items={worked} empty="No stat is strong enough to show yet." />
          <Column title="What hasn't" tone="bad" items={notWorked} empty="No stat is strong enough to show yet." />
        </div>
      )}
    </section>
  );
}

function SourceBars({ team, name, items, total }: { team: "a" | "b"; name: string; items: SeasonSource[]; total: number }) {
  return (
    <section className="rounded-[1rem] border border-border bg-surface p-4 sm:p-5">
      <h3 className="text-sm font-extrabold uppercase tracking-[0.06em]">{name}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted tabular-nums">Not enough points yet ({total} logged).</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((s) => (
            <li key={s.id}>
              <div className="flex items-baseline justify-between gap-3 tabular-nums">
                <span className="text-[0.9375rem] font-semibold first-letter:uppercase">{s.label}</span>
                <span className="text-sm">
                  <span className="text-[1.125rem] font-bold">{Math.round(s.share * 100)}%</span> <span className="text-muted">({s.points} pts)</span>
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-border" aria-hidden>
                <div className={`h-full rounded-full ${team === "a" ? "bg-team-a" : "bg-team-b"}`} style={{ width: `${Math.min(100, s.share * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ScoringSources({ extras, opponentLabel = "Opponents" }: { extras: GameExtras[]; opponentLabel?: string }) {
  const roslyn = useMemo(() => seasonSources(extras, "roslyn"), [extras]);
  const opp = useMemo(() => seasonSources(extras, "opponent"), [extras]);
  if (extras.length === 0) return null;
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-[-0.01em]">Where the points came from, all season</h2>
      <AccuracyNote className="mt-1" />
      <p className="mt-1 max-w-[44rem] text-sm text-muted tabular-nums">
        Share of each team&apos;s points from each source, {extras.length} games combined ({roslyn.total} Roslyn points, {opp.total} for opponents). One shot can count in more than one source (a 3-pointer from above the break is both), so shares add up to more than 100%. Sources with under 10 points are left out.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SourceBars team="a" name="Roslyn" items={roslyn.items} total={roslyn.total} />
        <SourceBars team="b" name={opponentLabel} items={opp.items} total={opp.total} />
      </div>
    </section>
  );
}
