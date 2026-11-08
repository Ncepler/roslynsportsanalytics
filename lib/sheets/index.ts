// Sheet layouts matching the club's Google Sheets (CLAUDE.md section 10),
// plus tab-separated (Copy for Google Sheets) and CSV output.
// Numbers stay numbers; a stat that wasn't tracked stays blank, never 0.

import {
  defenseByContext,
  formatMSS,
  quartersIn,
  turnoversByQuarter,
  possessionSeconds,
  statLine,
  summaryByContext,
  sumLines,
  type StatLine,
} from "@/lib/derive";
import { plusMinus } from "@/lib/derive/plus-minus";
import type { PossessionLog, Team } from "@/lib/gemini/log-types";

export type Cell = string | number | null;
export type Sheet = { id: string; title: string; header: Cell[][]; rows: Cell[][] };

type Tracked = (statId: string) => boolean;

const round4 = (n: number | null) => (n === null ? null : Math.round(n * 10000) / 10000);

/** Cell value for a tracked stat; blank when the stat wasn't tracked. */
const v = (tracked: Tracked, statId: string, value: number | null): Cell => (tracked(statId) ? value : null);

function lineCells(l: StatLine, t: Tracked): Cell[] {
  return [
    v(t, "shots", l.fg2.att),
    v(t, "shots", l.fg2.made),
    v(t, "shots", l.fg3.att),
    v(t, "shots", l.fg3.made),
    v(t, "shots", l.ft.att),
    v(t, "shots", l.ft.made),
    v(t, "rebounds", l.offReb),
    v(t, "rebounds", l.defReb),
    v(t, "assists", l.assists),
    v(t, "steals", l.steals),
    v(t, "blocks", l.blocks),
    v(t, "turnovers", l.turnovers),
    v(t, "fouls", l.fouls),
    v(t, "shots", l.points),
    v(t, "shots", round4(l.efficiency)),
  ];
}

export function offenseSummary(log: PossessionLog, team: Team, tracked: Tracked, teamName: string): Sheet {
  const s = summaryByContext(log, team);
  const rows: Cell[][] = s.rows.map((r) => [r.line.possessions, r.context, ...lineCells(r.line, tracked)]);
  if (s.unknown.possessions > 0) rows.push([s.unknown.possessions, "Unclassified", ...lineCells(s.unknown, tracked)]);
  rows.push([s.total.possessions, "Team Totals", ...lineCells(s.total, tracked)]);
  return {
    id: `offense-summary-${team}`,
    title: `Offense summary: ${teamName}`,
    header: [
      ["Possessions", "vs", "2-Point FG", null, "3-Point FG", null, "Free Throw", null, "Rebounds", null, "Assists", "Steals", "Blocks", "Turnovers", "Fouls", "Total Points", "Offensive Efficiency"],
      [null, null, "Att", "Made", "Att", "Made", "Att", "Made", "Off", "Def", null, null, null, null, null, null, null],
    ],
    rows,
  };
}

export function possessionLogSheet(log: PossessionLog, team: Team, tracked: Tracked, teamName: string): Sheet {
  const mine = log.possessions.filter((p) => p.team === team);
  const lines = mine.map((p) => statLine([p]));
  const row = (label: Cell, time: Cell, l: StatLine): Cell[] => [
    label,
    time,
    v(tracked, "shots", l.fg2.made),
    v(tracked, "shots", l.fg3.made),
    v(tracked, "shots", l.ft.made),
    v(tracked, "rebounds", l.offReb + l.defReb),
    v(tracked, "assists", l.assists),
    v(tracked, "steals", l.steals),
    v(tracked, "blocks", l.blocks),
    v(tracked, "turnovers", l.turnovers),
    v(tracked, "fouls", l.fouls),
    v(tracked, "shots", l.points),
  ];
  const timeTracked = tracked("possession-time");
  return {
    id: `possession-log-${team}`,
    title: `Possession log: ${teamName}`,
    header: [["Offensive Possession #", "Time of possession", "2PT", "3PT", "FT", "Rebounds", "Assists", "Steals", "Blocks", "Turnovers", "Fouls", "Total Points"]],
    rows: [
      ...mine.map((p, i) => row(i + 1, timeTracked ? formatMSS(possessionSeconds(p)) : null, lines[i])),
      row("Team Totals", null, sumLines(lines)),
    ],
  };
}

/** The club's shorter blank template: rows M and Z only. */
export function roslynOffenseTemplate(log: PossessionLog, tracked: Tracked): Sheet {
  const s = summaryByContext(log, "roslyn");
  const rows = s.rows
    .filter((r) => r.context !== "F")
    .map((r) => [
      r.context,
      v(tracked, "shots", r.line.fg2.made),
      v(tracked, "shots", r.line.fg3.made),
      v(tracked, "shots", r.line.ft.made),
      v(tracked, "rebounds", r.line.offReb + r.line.defReb),
      v(tracked, "assists", r.line.assists),
    ]);
  return { id: "roslyn-offense", title: "Roslyn offense template", header: [[null, "2PT", "3PT", "FT", "Rebounds", "Assists"]], rows };
}

/** Lacrosse turnovers: rows Roslyn and the opponent, columns per quarter and a total. */
export function laxTurnovers(log: PossessionLog, tracked: Tracked, awayName: string): Sheet {
  const quarters = quartersIn(log).filter((q) => q !== "?");
  const cols = quarters.length > 0 ? quarters : ["1", "2", "3", "4"];
  const by = turnoversByQuarter(log);
  const row = (team: Team, label: string): Cell[] => {
    const values = cols.map((q) => by[q]?.[team] ?? 0);
    return [label, ...values.map((v) => (tracked("turnovers") ? v : null)), tracked("turnovers") ? values.reduce((a, b) => a + b, 0) : null];
  };
  return {
    id: "lax-turnovers",
    title: "Lacrosse turnovers",
    header: [[null, ...cols.map((q) => (q === "OT" ? "OT" : `Q${q}`)), "Total turnovers"]],
    rows: [row("roslyn", "Roslyn"), row("opponent", awayName)],
  };
}

/** Lacrosse defense: Roslyn's defensive possessions by M / Z / F, Goal or No Goal. Efficiency stays blank (formula unknown). */
export function laxDefense(log: PossessionLog, tracked: Tracked): Sheet {
  const d = defenseByContext(log, "roslyn");
  const on = tracked("shots") && tracked("context");
  const rows: Cell[][] = d.rows.map((r) => [on ? r.possessions : null, r.context, on ? r.noGoals : null, on ? r.goals : null, null, null]);
  if (on && d.unknown.possessions > 0) rows.push([d.unknown.possessions, "Unclassified", d.unknown.noGoals, d.unknown.goals, null, null]);
  return {
    id: "lax-defense",
    title: "Lacrosse defense (Roslyn)",
    header: [
      ["Defensive Possession #", null, "Possession Result", null, "Efficiency", "Total Efficiency"],
      [null, null, "No Goal", "Goal", null, null],
    ],
    rows,
  };
}

/** Basketball plus/minus (Long shots): rows are the starters; OT shows N/A when there was none. */
export function plusMinusSheet(log: PossessionLog, starters: string[]): Sheet {
  const pm = plusMinus(log, starters);
  return {
    id: "plus-minus",
    title: "Basketball plus/minus (Roslyn starters)",
    header: [[null, "Total +/-", "Q1", "Q2", "Q3", "Q4", "OT"]],
    rows: pm.rows.map((r) => [`#${r.number}`, r.total, r.byPeriod["1"], r.byPeriod["2"], r.byPeriod["3"], r.byPeriod["4"], pm.hadOT ? r.byPeriod.OT : "N/A"]),
  };
}

export function allSheets(log: PossessionLog, statIds: string[], awayName: string, sportId = "basketball", starters: string[] = []): Sheet[] {
  const tracked: Tracked = (id) => statIds.includes(id);
  if (sportId === "lacrosse") return [laxTurnovers(log, tracked, awayName || "Opponent"), laxDefense(log, tracked)];
  return [
    offenseSummary(log, "roslyn", tracked, "Roslyn"),
    possessionLogSheet(log, "roslyn", tracked, "Roslyn"),
    roslynOffenseTemplate(log, tracked),
    offenseSummary(log, "opponent", tracked, awayName || "Opponent"),
    possessionLogSheet(log, "opponent", tracked, awayName || "Opponent"),
    ...(tracked("plus-minus") && starters.length ? [plusMinusSheet(log, starters)] : []),
  ];
}

const cellText = (c: Cell) => (c === null ? "" : String(c));

/** Tab-separated: pastes straight into Google Sheets cells. */
export function toTSV(sheet: Sheet): string {
  return [...sheet.header, ...sheet.rows].map((r) => r.map((c) => cellText(c).replace(/[\t\n]/g, " ")).join("\t")).join("\n");
}

export function toCSV(sheet: Sheet): string {
  const esc = (c: Cell) => {
    const s = cellText(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [...sheet.header, ...sheet.rows].map((r) => r.map(esc).join(",")).join("\r\n");
}
