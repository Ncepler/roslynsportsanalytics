"use client";

import { useMemo, useState } from "react";
import type { RunUsage } from "@/lib/client/run";
import { formatTime } from "@/lib/client/time";
import {
  defenseByContext,
  fastBreakPoints,
  flaggedQuarters,
  foulsByQuarter,
  paceByQuarter,
  percentages,
  pointsOffTurnovers,
  possessionPoints,
  quartersIn,
  scoreboardCheck,
  scoreByQuarter,
  secondChancePoints,
  summaryByContext,
  turnoversByQuarter,
  type ByQuarter,
} from "@/lib/derive";
import type { Context, LogEvent, Possession, PossessionLog, Team } from "@/lib/gemini/log-types";
import type { GameSetup } from "@/lib/gemini/prompt";
import { plusMinus } from "@/lib/derive/plus-minus";
import { allSheets, toCSV, toTSV, type Sheet } from "@/lib/sheets";
import { CopyButton } from "./copy-button";

/** Possession rows shown before "Show all". */
const INITIAL_ROWS = 5;

const pct = (v: number | null) => (v === null ? "–" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null, d = 2) => (v === null ? "–" : v.toFixed(d));

export function ReviewStep({
  log,
  onLog,
  setup,
  onSeek,
  usage,
  raw,
  playerNotes,
  starters = [],
}: {
  playerNotes: { start: string; updates: string[] } | null;
  /** Roslyn starters' numbers, for plus/minus and minutes. */
  starters?: string[];
  log: PossessionLog;
  onLog: (l: PossessionLog) => void;
  setup: GameSetup;
  onSeek: (t: number) => void;
  usage: RunUsage | null;
  raw: string[];
}) {
  const on = (id: string) => setup.statIds.includes(id);
  const away = setup.awayName || "Opponent";
  const checks = useMemo(() => scoreboardCheck(log), [log]);
  const flagged = flaggedQuarters(checks);
  const lax = setup.sportId === "lacrosse";
  const sheets = useMemo(() => allSheets(log, setup.statIds, away, setup.sportId, starters), [log, setup.statIds, away, setup.sportId, starters]);
  const roslyn = summaryByContext(log, "roslyn").total;
  const opp = summaryByContext(log, "opponent").total;

  function updatePossession(i: number, next: Possession | null) {
    const possessions = [...log.possessions];
    if (next) possessions[i] = next;
    else possessions.splice(i, 1);
    onLog({ ...log, possessions });
  }

  return (
    <div className="space-y-10">
      <ScoreboardBanner checks={checks} flagged={flagged} />

      {playerNotes && <PlayerNotesCheck notes={playerNotes} />}

      {log.warnings.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">The AI flagged {log.warnings.length} thing{log.warnings.length === 1 ? "" : "s"} it couldn&apos;t see clearly</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {log.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      <section>
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Game numbers</h2>
        <p className="hint mt-1">Every number is worked out by the app from the possession log below. Fix the log and these update.</p>
        <div className="mt-4 grid gap-8 lg:grid-cols-2">
          {on("score-by-quarter") && <QuarterTable title="Score by quarter" data={scoreByQuarter(log)} quarters={quartersIn(log)} away={away} total />}
          {on("pace") && <QuarterTable title="Possessions by quarter" data={paceByQuarter(log)} quarters={quartersIn(log)} away={away} total />}
          {on("by-quarter") && on("turnovers") && <QuarterTable title="Turnovers by quarter" data={turnoversByQuarter(log)} quarters={quartersIn(log)} away={away} total />}
          {on("by-quarter") && on("fouls") && <QuarterTable title="Fouls by quarter" data={foulsByQuarter(log)} quarters={quartersIn(log)} away={away} total />}
          {lax && on("defense") && on("context") && <DefenseTable log={log} />}
          {!lax && (on("plus-minus") || on("minutes")) && <PlusMinusTable log={log} starters={starters} showPm={on("plus-minus")} showMinutes={on("minutes")} />}
          <TeamTable
            away={away}
            rows={[
              on("ppp") && ["Points per possession", num(percentages(roslyn).ppp), num(percentages(opp).ppp)],
              on("efficiency") && ["Offensive efficiency", num(roslyn.efficiency, 1), num(opp.efficiency, 1)],
              on("fg-pct") && ["FG%", pct(percentages(roslyn).fgPct), pct(percentages(opp).fgPct)],
              on("fg-pct") && ["3P%", pct(percentages(roslyn).fg3Pct), pct(percentages(opp).fg3Pct)],
              on("fg-pct") && ["FT%", pct(percentages(roslyn).ftPct), pct(percentages(opp).ftPct)],
              on("efg") && ["Effective FG%", pct(percentages(roslyn).efgPct), pct(percentages(opp).efgPct)],
              on("tov-rate") && on("turnovers") && ["Turnover rate", pct(percentages(roslyn).tovRate), pct(percentages(opp).tovRate)],
              on("second-chance") && on("rebounds") && ["Second-chance points", secondChancePoints(log, "roslyn"), secondChancePoints(log, "opponent")],
              on("off-turnovers") && on("turnovers") && ["Points off turnovers", pointsOffTurnovers(log, "roslyn"), pointsOffTurnovers(log, "opponent")],
              on("fast-break-points") && ["Fast-break points", fastBreakPoints(log, "roslyn"), fastBreakPoints(log, "opponent")],
            ]}
          />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Possession log</h2>
        <p className="hint mt-1">
          Click a row to jump the video there. Rows marked <span className="font-medium text-warning-text">Check</span> are low-confidence or in a quarter that failed the scoreboard check.
        </p>
        <PossessionEditor log={log} flagged={flagged} away={away} lax={lax} onSeek={onSeek} onChange={updatePossession} />
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Sheets</h2>
        <p className="hint mt-1">Copy pastes straight into the matching cells of the club&apos;s Google Sheet. Blank means the stat wasn&apos;t tracked.</p>
        <div className="mt-4 space-y-8">
          {sheets.map((s) => (
            <SheetPreview key={s.id} sheet={s} fileStem={`${away} - ${s.id}`} />
          ))}
        </div>
      </section>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-muted">Run details (raw AI output, tokens)</summary>
        {usage && (
          <p className="mt-2 tabular-nums text-muted">
            Input tokens: {usage.inputTokens.toLocaleString()} · Output tokens: {usage.outputTokens.toLocaleString()}
          </p>
        )}
        {raw.map((r, i) => (
          <pre key={i} className="mt-2 max-h-80 overflow-auto rounded-[0.625rem] bg-surface-sunken p-3 text-xs">
            {r}
          </pre>
        ))}
      </details>
    </div>
  );
}

/**
 * The player notes after the run: the starters the user confirmed, plus what
 * the AI added while watching. The user checks them here because jersey
 * numbers drive the per-player columns.
 */
function PlayerNotesCheck({ notes }: { notes: { start: string; updates: string[] } }) {
  const [checked, setChecked] = useState(false);
  return (
    <section className={`rounded-[0.75rem] border px-4 py-3 ${checked ? "border-border bg-surface" : "border-warning-border bg-warning-bg text-warning-text"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{checked ? "Player notes checked" : "Check the player notes"}</h2>
        <button type="button" className="btn btn-secondary min-h-9 text-sm" onClick={() => setChecked(!checked)}>
          {checked ? "Undo" : "They look right"}
        </button>
      </div>
      {!checked && (
        <>
          <p className="mt-1 text-sm">
            The AI updated these while it watched. Make sure the new players and numbers are right. If a jersey number is wrong, fix that player&apos;s rows in the possession log below.
          </p>
          <div className="mt-3 grid gap-4 text-sm text-text sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Starters (you checked)</p>
              <ul className="mt-1 space-y-0.5">
                {notes.start.split("\n").filter(Boolean).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Added during the game</p>
              {notes.updates.length === 0 ? (
                <p className="mt-1 text-muted">No changes noticed.</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {notes.updates.map((line, i) => (
                    <li key={i} className="font-medium">
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Fixing a possession the AI gave to the wrong team: every event in it
 * flips sides too, so the shots score for the right team.
 */
function switchTeam(p: Possession, team: Team): Possession {
  if (team === p.team) return p;
  const flip = (t: Team): Team => (t === "roslyn" ? "opponent" : "roslyn");
  return { ...p, team, events: p.events.map((e) => ({ ...e, team: flip(e.team) })) };
}

function PlusMinusTable({ log, starters, showPm, showMinutes }: { log: PossessionLog; starters: string[]; showPm: boolean; showMinutes: boolean }) {
  if (starters.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold">Starters</h3>
        <p className="mt-2 text-sm text-muted">No starter numbers were entered, so plus/minus and minutes can&apos;t be worked out.</p>
      </div>
    );
  }
  const pm = plusMinus(log, starters);
  const periods: ("1" | "2" | "3" | "4" | "OT")[] = pm.hadOT ? ["1", "2", "3", "4", "OT"] : ["1", "2", "3", "4"];
  return (
    <div className="overflow-x-auto">
      <h3 className="text-sm font-semibold">Roslyn starters</h3>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={th}>Player</th>
            {showPm && (
              <>
                <th className={`${th} text-right`}>+/-</th>
                {periods.map((q) => (
                  <th key={q} className={`${th} text-right`}>
                    {q === "OT" ? "OT" : `Q${q}`}
                  </th>
                ))}
              </>
            )}
            {showMinutes && <th className={`${th} text-right`}>Min</th>}
          </tr>
        </thead>
        <tbody>
          {pm.rows.map((r) => (
            <tr key={r.number} className="border-b border-border last:border-0">
              <td className="px-3 py-2">#{r.number}</td>
              {showPm && (
                <>
                  <td className={`${td} text-right font-semibold`}>{r.total > 0 ? `+${r.total}` : r.total}</td>
                  {periods.map((q) => (
                    <td key={q} className={`${td} text-right`}>
                      {r.byPeriod[q]}
                    </td>
                  ))}
                </>
              )}
              {showMinutes && <td className={`${td} text-right`}>{r.minutes === null ? "–" : r.minutes.toFixed(1)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint mt-2">
        Long shot: needs every substitution seen correctly.
        {pm.unknownSubs > 0 && ` ${pm.unknownSubs} substitution number${pm.unknownSubs === 1 ? " was" : "s were"} unreadable, so these may be off.`}
        {showMinutes && pm.rows.some((r) => r.minutes === null) && " Minutes are blank because the game clock couldn't be read often enough."}
      </p>
    </div>
  );
}

function DefenseTable({ log }: { log: PossessionLog }) {
  const d = defenseByContext(log, "roslyn");
  const rows = [...d.rows, ...(d.unknown.possessions > 0 ? [d.unknown] : [])];
  return (
    <div className="overflow-x-auto">
      <h3 className="text-sm font-semibold">Roslyn defense</h3>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={th}>vs</th>
            <th className={`${th} text-right`}>Possessions</th>
            <th className={`${th} text-right`}>No goal</th>
            <th className={`${th} text-right`}>Goal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.context ?? "?"} className="border-b border-border last:border-0">
              <td className="px-3 py-2">{r.context === "M" ? "Man (M)" : r.context === "Z" ? "Zone (Z)" : r.context === "F" ? "Fast break (F)" : "Unclassified"}</td>
              <td className={`${td} text-right`}>{r.possessions}</td>
              <td className={`${td} text-right`}>{r.noGoals}</td>
              <td className={`${td} text-right`}>{r.goals}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="px-3 py-2">Total</td>
            <td className={`${td} text-right`}>{d.total.possessions}</td>
            <td className={`${td} text-right`}>{d.total.noGoals}</td>
            <td className={`${td} text-right`}>{d.total.goals}</td>
          </tr>
        </tbody>
      </table>
      <p className="hint mt-2">Efficiency is left blank until the club confirms its formula.</p>
    </div>
  );
}

function ScoreboardBanner({ checks, flagged }: { checks: ReturnType<typeof scoreboardCheck>; flagged: string[] }) {
  if (checks.length === 0) {
    return (
      <div role="status" className="rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-warning-text">
        <p className="font-semibold">Scoreboard not checked</p>
        <p className="mt-0.5 text-sm">The AI couldn&apos;t read the score at least twice, so the totals below aren&apos;t verified. Review them by hand.</p>
      </div>
    );
  }
  if (flagged.length === 0) {
    return (
      <div role="status" className="rounded-[0.75rem] border border-border bg-surface px-4 py-3">
        <p className="font-semibold">Scoreboard check passed</p>
        <p className="mt-0.5 text-sm text-muted tabular-nums">Logged points matched the scoreboard in all {checks.length} stretches checked.</p>
      </div>
    );
  }
  const bad = checks.filter((c) => !c.ok);
  return (
    <div role="alert" className="rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-warning-text">
      <p className="font-semibold">Scoreboard mismatch in quarter {flagged.join(", ")}. Review before copying.</p>
      <ul className="mt-1 space-y-0.5 text-sm tabular-nums">
        {bad.map((c, i) => (
          <li key={i}>
            Q{c.quarter}, {formatTime(c.from.videoTime)}–{formatTime(c.to.videoTime)}: logged Roslyn +{c.logged.roslyn}, opponent +{c.logged.opponent}; scoreboard Roslyn +{c.scoreboard.roslyn}, opponent +{c.scoreboard.opponent}
          </li>
        ))}
      </ul>
    </div>
  );
}

const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.04em] text-muted";
const td = "px-3 py-2 tabular-nums";

function QuarterTable({ title, data, quarters, away, total }: { title: string; data: ByQuarter; quarters: string[]; away: string; total?: boolean }) {
  const row = (team: Team) => quarters.map((q) => data[q]?.[team] ?? 0);
  return (
    <div className="overflow-x-auto">
      <h3 className="text-sm font-semibold">{title}</h3>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={th}>Team</th>
            {quarters.map((q) => (
              <th key={q} className={`${th} text-right`}>
                {q === "OT" || q === "?" ? q : `Q${q}`}
              </th>
            ))}
            {total && <th className={`${th} text-right`}>Total</th>}
          </tr>
        </thead>
        <tbody>
          {(["roslyn", "opponent"] as const).map((team) => (
            <tr key={team} className="border-b border-border last:border-0">
              <td className="px-3 py-2">{team === "roslyn" ? "Roslyn" : away}</td>
              {row(team).map((v, i) => (
                <td key={i} className={`${td} text-right`}>
                  {v}
                </td>
              ))}
              {total && <td className={`${td} text-right font-semibold`}>{row(team).reduce((a, b) => a + b, 0)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamTable({ rows, away }: { rows: (false | [string, string | number, string | number])[]; away: string }) {
  const shown = rows.filter((r): r is [string, string | number, string | number] => Boolean(r));
  if (shown.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <h3 className="text-sm font-semibold">Team stats</h3>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={th}>Stat</th>
            <th className={`${th} text-right`}>Roslyn</th>
            <th className={`${th} text-right`}>{away}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(([label, a, b]) => (
            <tr key={label} className="border-b border-border last:border-0">
              <td className="px-3 py-2">{label}</td>
              <td className={`${td} text-right`}>{a}</td>
              <td className={`${td} text-right`}>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function eventLabel(e: LogEvent, lax = false): string {
  if (e.type === "shot" && lax) return e.made === true ? "Goal" : e.made === false ? "Shot, no goal" : "Shot ?";
  if (e.type === "shot") return `${e.points === 1 ? "FT" : `${e.points ?? "?"}PT`} ${e.made === true ? "made" : e.made === false ? "miss" : "?"}`;
  if (e.type === "rebound") return e.reboundType === "offensive" ? "Off reb" : e.reboundType === "defensive" ? "Def reb" : "Reb";
  if (e.type === "turnover") return e.turnoverType ? `TO (${e.turnoverType})` : "Turnover";
  return e.type[0].toUpperCase() + e.type.slice(1);
}

function PossessionEditor({
  log,
  flagged,
  away,
  lax,
  onSeek,
  onChange,
}: {
  log: PossessionLog;
  flagged: string[];
  away: string;
  lax: boolean;
  onSeek: (t: number) => void;
  onChange: (i: number, p: Possession | null) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  if (log.possessions.length === 0) return <p className="mt-4 text-muted">The AI didn&apos;t log any possessions in this stretch.</p>;
  const shown = showAll ? log.possessions : log.possessions.slice(0, INITIAL_ROWS);
  const hidden = log.possessions.length - shown.length;

  return (
    <>
    <div className="relative mt-4 overflow-x-auto rounded-[0.75rem] border border-border">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <thead className="bg-surface-sunken">
          <tr>
            <th className={th}>#</th>
            <th className={th}>Video</th>
            <th className={th}>Team</th>
            <th className={th}>Q</th>
            <th className={th}>Clock</th>
            <th className={th}>vs</th>
            <th className={th}>What happened</th>
            <th className={`${th} text-right`}>{lax ? "Goals" : "Pts"}</th>
            <th className={th}>
              <span className="sr-only">Status</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p, i) => {
            const review = p.confidence === "low" || flagged.includes(p.quarter ?? "?");
            return (
              <PossessionRow
                key={i}
                index={i}
                p={p}
                away={away}
                lax={lax}
                review={review}
                open={open === i}
                onToggle={() => setOpen(open === i ? null : i)}
                onSeek={onSeek}
                onChange={(next) => onChange(i, next)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
    {(hidden > 0 || showAll) && log.possessions.length > INITIAL_ROWS && (
      <button type="button" className="btn btn-secondary mt-3 text-sm" onClick={() => setShowAll(!showAll)}>
        {showAll ? "Show fewer" : `Show all ${log.possessions.length} possessions`}
      </button>
    )}
    </>
  );
}

function PossessionRow({
  index,
  p,
  away,
  lax,
  review,
  open,
  onToggle,
  onSeek,
  onChange,
}: {
  index: number;
  p: Possession;
  away: string;
  lax: boolean;
  review: boolean;
  open: boolean;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onChange: (p: Possession | null) => void;
}) {
  const setEvent = (j: number, e: LogEvent | null) => {
    const events = [...p.events];
    if (e) events[j] = e;
    else events.splice(j, 1);
    onChange({ ...p, events });
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <tr
        onClick={() => onSeek(p.videoStart)}
        className={`cursor-pointer border-t border-border ${review ? "bg-warning-bg" : ""} [@media(hover:hover)_and_(pointer:fine)]:hover:bg-surface-sunken`}
      >
        <td className={td}>{index + 1}</td>
        <td className={td}>{formatTime(p.videoStart)}</td>
        <td className="px-3 py-1.5" onClick={stop}>
          <select className="rounded-md bg-transparent py-1" value={p.team} onChange={(e) => onChange(switchTeam(p, e.target.value as Team))} aria-label="Team">
            <option value="roslyn">Roslyn</option>
            <option value="opponent">{away}</option>
          </select>
        </td>
        <td className={td}>{p.quarter ?? "?"}</td>
        <td className={td}>{p.clockStart ?? "–"}</td>
        <td className="px-3 py-1.5" onClick={stop}>
          <select
            className="rounded-md bg-transparent py-1"
            value={p.context ?? ""}
            onChange={(e) => onChange({ ...p, context: (e.target.value || null) as Context | null })}
            aria-label="Context"
          >
            <option value="M">M</option>
            <option value="Z">Z</option>
            <option value="F">F</option>
            <option value="">?</option>
          </select>
        </td>
        <td className="px-3 py-2">{p.events.map((e) => eventLabel(e, lax)).join(", ") || "–"}</td>
        <td className={`${td} text-right font-medium`}>{possessionPoints(p)}</td>
        <td className="px-3 py-1.5 text-right" onClick={stop}>
          <span className="inline-flex items-center gap-2">
            {review && <span className="text-xs font-semibold text-warning-text">Check</span>}
            <button type="button" className="btn btn-ghost min-h-8 px-2 text-xs" onClick={onToggle} aria-expanded={open}>
              {open ? "Done" : "Edit"}
            </button>
          </span>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-border bg-surface">
          <td colSpan={9} className="px-3 py-3">
            {p.note && <p className="mb-2 text-sm text-muted">AI note: {p.note}</p>}
            <ul className="space-y-2">
              {p.events.map((e, j) => (
                <li key={j} className="flex flex-wrap items-center gap-2 text-sm">
                  <button type="button" className="tabular-nums text-accent underline-offset-2 hover:underline" onClick={() => onSeek(e.videoTime)}>
                    {formatTime(e.videoTime)}
                  </button>
                  <span className="min-w-24 font-medium">{eventLabel(e, lax)}</span>
                  {e.type === "shot" && (
                    <>
                      {!lax && (
                      <select className="field min-h-8 w-auto py-0 text-sm" value={e.points ?? ""} onChange={(ev) => setEvent(j, { ...e, points: (Number(ev.target.value) || null) as LogEvent["points"] })} aria-label="Shot value">
                        <option value="1">FT</option>
                        <option value="2">2PT</option>
                        <option value="3">3PT</option>
                      </select>
                      )}
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          className="accent-[var(--accent)]"
                          checked={e.made === true}
                          onChange={(ev) => setEvent(j, { ...e, made: ev.target.checked, points: lax ? 1 : e.points })}
                        />
                        {lax ? "Goal" : "Made"}
                      </label>
                    </>
                  )}
                  <span className="text-muted">
                    {e.team === "roslyn" ? "Roslyn" : away}
                    {e.player ? ` #${e.player}` : ""} · {e.description}
                  </span>
                  <button type="button" className="btn btn-ghost ml-auto min-h-8 px-2 text-xs" onClick={() => setEvent(j, null)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-ghost mt-3 min-h-8 px-2 text-xs text-danger" onClick={() => onChange(null)}>
              Delete this possession
            </button>
          </td>
        </tr>
      )}
    </>
  );
}

/** Downloads are named "<Opponent> - <sheet-id>.csv" so the Season tab can read them back as one game. */
function SheetPreview({ sheet, fileStem }: { sheet: Sheet; fileStem: string }) {
  function download() {
    const blob = new Blob([toCSV(sheet)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileStem.replace(/[\\/:*?"<>|]/g, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{sheet.title}</h3>
        <div className="flex gap-2">
          <CopyButton text={() => toTSV(sheet)} />
          <button type="button" className="btn btn-ghost min-h-10 text-sm" onClick={download}>
            Download CSV
          </button>
        </div>
      </div>
      <div className="mt-2 max-h-96 overflow-auto rounded-[0.75rem] border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-surface-sunken">
            {sheet.header.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <th key={j} className="whitespace-nowrap px-2.5 py-1.5 text-left text-xs font-medium text-muted">
                    {c}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {sheet.rows.map((r, i) => (
              <tr key={i} className={`border-t border-border ${r.includes("Team Totals") ? "font-semibold" : ""}`}>
                {r.map((c, j) => (
                  <td key={j} className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
