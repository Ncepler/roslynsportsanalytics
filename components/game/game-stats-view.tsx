"use client";

import { useMemo, type ReactNode } from "react";
import { AccuracyNote } from "@/components/accuracy-note";
import { scoreStrip, teamCompare } from "@/lib/derive/game-stats";
import type { PossessionLog } from "@/lib/gemini/log-types";
import { getSport } from "@/lib/sports";
import { ShotChart } from "./shot-chart";
import { StrategyNotes } from "./strategy-notes";
import { TeamStatsCompare } from "./team-stats-compare";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[1rem] border border-border bg-surface p-4 sm:p-6">
      <h2 className="border-b border-border pb-2 text-sm font-extrabold uppercase tracking-[0.06em]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** The scoreboard strip: team names, score by period, and the total in large type. */
function ScoreStrip({ log, away, periodName }: { log: PossessionLog; away: string; periodName: string }) {
  const strip = scoreStrip(log);
  const label = (p: string) => (p === "OT" || p === "?" ? p : `${periodName[0]}${p}`);
  const rows = [
    { key: "roslyn" as const, name: "Roslyn", color: "bg-team-a" },
    { key: "opponent" as const, name: away, color: "bg-team-b" },
  ];
  return (
    <div className="overflow-x-auto rounded-[1rem] border border-border bg-surface">
      <table className="w-full min-w-[18rem] border-collapse tabular-nums">
        <thead>
          <tr className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
            <th className="px-3 py-2 text-left sm:px-4">Final (logged)</th>
            {strip.periods.map((p) => (
              <th key={p} className="px-1.5 py-2 text-right sm:px-3">
                {label(p)}
              </th>
            ))}
            <th className="px-3 py-2 text-right sm:px-4">T</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-border">
              <th scope="row" className="px-3 py-3 text-left text-[1.0625rem] font-bold sm:px-4">
                <span className="flex items-center gap-2.5">
                  <span aria-hidden className={`inline-block h-5 w-1.5 rounded-full ${r.color}`} />
                  {r.name}
                </span>
              </th>
              {strip.periods.map((p) => (
                <td key={p} className="px-1.5 py-3 text-right text-[1.0625rem] sm:px-3">
                  {strip.byPeriod[p][r.key]}
                </td>
              ))}
              <td className="px-3 py-3 text-right text-[1.5rem] font-extrabold leading-none sm:px-4 sm:text-[1.75rem]">{strip.total[r.key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The game stats page: score strip, head-to-head team stats, shot chart by zone, and the strategy notes. Every
 * number comes from the possession log (lib/derive/game-stats.ts), so editing the log updates all of it.
 */
export function GameStatsView({ log, sportId, statIds, away, demo = false, checkMarkers }: { log: PossessionLog; sportId: string; statIds: string[]; away: string; demo?: boolean; /** The "needs a second look" markers, shown next to the accuracy note. */ checkMarkers?: ReactNode }) {
  const sport = getSport(sportId);
  const rows = useMemo(() => teamCompare(log, sportId, statIds), [log, sportId, statIds]);
  const showChart = Boolean(sport?.shotZones && (sportId === "ice-hockey" || statIds.includes("shot-zone")));
  return (
    <div className="space-y-6">
      <AccuracyNote className="space-y-3">{checkMarkers}</AccuracyNote>
      <ScoreStrip log={log} away={away} periodName={sport?.periodName ?? "Quarter"} />
      <Block title="Team stats">
        <TeamStatsCompare rows={rows} away={away} />
      </Block>
      {showChart && (
        <Block title="Shot chart">
          <ShotChart log={log} sportId={sportId} away={away} />
        </Block>
      )}
      <Block title="Game notes">
        <StrategyNotes log={log} sportId={sportId} statIds={statIds} away={away} demo={demo} />
      </Block>
    </div>
  );
}
