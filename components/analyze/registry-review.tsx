"use client";

import { useMemo, useState } from "react";
import type { GameSetup } from "@/lib/gemini/prompt";
import { getRegistrySport, isStatSelectable } from "@/lib/sports/registry";
import { eventsToTsv, formatClock, tallyByStat, type RegistryLog } from "@/lib/sports/registry-log";
import { CopyButton } from "./copy-button";

const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted";
const FIRST_ROWS = 15;

/**
 * Review for sports that use the registry event log. The AI logged events and said which wanted stats each counts
 * toward; this screen counts them (code does all counting) so every selected stat shows up, including ones the AI
 * found nothing for. Percentages need more than event counts and are not computed here.
 */
export function RegistryReview({ log, onLog, setup, onSeek, demo }: { log: RegistryLog; onLog: (l: RegistryLog) => void; setup: GameSetup; onSeek: (t: number) => void; demo: boolean }) {
  const sport = getRegistrySport(setup.sportId)!;
  const away = setup.awayName || "Opponent";
  const [showAll, setShowAll] = useState(false);
  const wanted = useMemo(() => new Set(setup.registryStatIds ?? sport.stats.map((s) => s.id)), [setup.registryStatIds, sport]);
  const stats = useMemo(() => sport.stats.filter((s) => wanted.has(s.id) && isStatSelectable(sport, s)), [sport, wanted]);
  const tallies = useMemo(() => tallyByStat(log.events, stats), [log.events, stats]);
  const flagged = log.events.filter((e) => e.needsReview).length;
  const rows = showAll ? log.events : log.events.slice(0, FIRST_ROWS);

  return (
    <div className="space-y-10">
      <p role="status" className="rounded-[0.75rem] border border-border bg-surface-sunken px-4 py-3 text-sm text-muted">
        {sport.name} results are an event log you can check and copy. Saving {sport.name.toLowerCase()} games to the team&apos;s season isn&apos;t available yet.
        {demo ? " (This run is simulated.)" : ""}
      </p>

      {log.warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {log.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <section>
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Stats</h2>
        <p className="hint mt-1 mb-3">How many logged events count toward each stat you picked, by team. The app counts them from the log below. Fix the log and these update.</p>
        <div className="overflow-x-auto rounded-[0.75rem] border border-border">
          <table className="w-full border-collapse text-sm tabular-nums">
            <thead className="bg-surface-sunken">
              <tr>
                <th className={th}>Stat</th>
                <th className={`${th} text-right`}>Roslyn</th>
                <th className={`${th} text-right`}>{away}</th>
                <th className={`${th} text-right`}>Unclear team</th>
              </tr>
            </thead>
            <tbody>
              {tallies.map(({ stat, roslyn, opponent, unassigned }) => (
                <tr key={stat.id} className="border-t border-border">
                  <td className="px-3 py-2" title={stat.lookFor}>
                    {stat.name}
                    {stat.video === "L" && <span className="ml-2 text-xs text-warning-text">Needs manual review</span>}
                  </td>
                  {stat.universal ? (
                    // All-sports stats come from the scoreboard and the whole log, not from counting one kind of event.
                    <td colSpan={3} className="px-3 py-2 text-right text-muted">
                      From the whole log
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right">{roslyn}</td>
                      <td className="px-3 py-2 text-right">{opponent}</td>
                      <td className="px-3 py-2 text-right text-muted">{unassigned}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold tracking-[-0.01em]">Event log</h2>
          <CopyButton text={() => eventsToTsv(log.events)} />
        </div>
        <p className="hint mt-1 mb-3">
          {log.events.length} event{log.events.length === 1 ? "" : "s"}
          {flagged > 0 ? `, ${flagged} near a chunk edge (check for repeats)` : ""}. Tap a time to jump the video there. Remove any event that is wrong.
        </p>
        <div className="overflow-x-auto rounded-[0.75rem] border border-border">
          <table className="w-full border-collapse text-sm tabular-nums">
            <thead className="bg-surface-sunken">
              <tr>
                <th className={th}>Time</th>
                <th className={th}>Period</th>
                <th className={th}>Team</th>
                <th className={th}>Event</th>
                <th className={th}>What was seen</th>
                <th className={th}>
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={`${e.timestampSeconds}-${e.type}-${e.team}`} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <button type="button" className="text-accent underline-offset-2 [@media(hover:hover)_and_(pointer:fine)]:hover:underline" onClick={() => onSeek(e.timestampSeconds)}>
                      {formatClock(e.timestampSeconds)}
                    </button>
                  </td>
                  <td className="px-3 py-2">{e.period ?? "?"}</td>
                  <td className="px-3 py-2">{e.team === "roslyn" ? "Roslyn" : e.team === "opponent" ? away : "?"}</td>
                  <td className="px-3 py-2">
                    {e.type.replace(/_/g, " ")}
                    {e.needsReview && (
                      <span className="ml-2 rounded-full border border-warning-border bg-warning-bg px-2 py-0.5 text-xs text-warning-text" title={e.reviewReason}>
                        Check
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">{e.detail ?? ""}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" className="btn btn-ghost min-h-8 px-2 text-sm" onClick={() => onLog({ ...log, events: log.events.filter((x) => x !== e) })}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {log.events.length > FIRST_ROWS && (
          <button type="button" className="btn btn-ghost mt-2" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show fewer" : `Show all ${log.events.length} events`}
          </button>
        )}
        {log.events.length === 0 && <p className="mt-3 text-sm text-muted">The AI didn&apos;t log any events in this video.</p>}
      </section>
    </div>
  );
}
