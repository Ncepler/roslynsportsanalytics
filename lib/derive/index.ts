// All math lives here (CLAUDE.md section 3, rule 2). Pure functions over the
// possession log; the AI never totals anything. A value that can't be
// computed is null, never a guess.

import type { Context, LogEvent, Possession, PossessionLog, ScoreboardReading, Team } from "@/lib/gemini/log-types";

export const CONTEXTS: Context[] = ["M", "Z", "F"];

export type ShotLine = { att: number; made: number };

export type StatLine = {
  possessions: number;
  fg2: ShotLine;
  fg3: ShotLine;
  ft: ShotLine;
  offReb: number;
  defReb: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  points: number;
  /** Points ÷ possessions × 100. Null with zero possessions. */
  efficiency: number | null;
};

const shots = (events: LogEvent[], team: Team) => events.filter((e) => e.type === "shot" && e.team === team);

/** Points = 2 × 2PT made + 3 × 3PT made + FT made (section 10). Unknown makes count as 0 and are flagged elsewhere. */
export function eventPoints(e: LogEvent): number {
  if (e.type !== "shot" || e.made !== true) return 0;
  return e.points === 1 || e.points === 2 || e.points === 3 ? e.points : 0;
}

export function possessionPoints(p: Possession): number {
  return shots(p.events, p.team).reduce((sum, e) => sum + eventPoints(e), 0);
}

export const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

/**
 * Stat line for a set of one team's possessions. Counts every event inside
 * those possessions ("what happened on these possessions"), matching how the
 * club's log rows hold a missed shot and its rebound together. Whose
 * rebounds the Off/Def columns should count is an open question (section 18).
 */
export function statLine(possessions: Possession[]): StatLine {
  const line: StatLine = {
    possessions: possessions.length,
    fg2: { att: 0, made: 0 },
    fg3: { att: 0, made: 0 },
    ft: { att: 0, made: 0 },
    offReb: 0,
    defReb: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fouls: 0,
    points: 0,
    efficiency: null,
  };
  for (const p of possessions) {
    for (const e of p.events) {
      switch (e.type) {
        case "shot": {
          if (e.team !== p.team) break;
          const bucket = e.points === 1 ? line.ft : e.points === 3 ? line.fg3 : e.points === 2 ? line.fg2 : null;
          if (!bucket) break;
          bucket.att += 1;
          if (e.made === true) bucket.made += 1;
          break;
        }
        case "rebound":
          if (e.reboundType === "offensive") line.offReb += 1;
          else if (e.reboundType === "defensive") line.defReb += 1;
          break;
        case "assist":
          line.assists += 1;
          break;
        case "steal":
          line.steals += 1;
          break;
        case "block":
          line.blocks += 1;
          break;
        case "turnover":
          line.turnovers += 1;
          break;
        case "foul":
          line.fouls += 1;
          break;
      }
    }
  }
  line.points = 2 * line.fg2.made + 3 * line.fg3.made + line.ft.made;
  const eff = ratio(line.points, line.possessions);
  line.efficiency = eff === null ? null : eff * 100;
  return line;
}

/** Sum of stat lines (the "Team Totals" row = column sums, section 10). */
export function sumLines(lines: StatLine[]): StatLine {
  const total = statLine([]);
  for (const l of lines) {
    total.possessions += l.possessions;
    for (const k of ["fg2", "fg3", "ft"] as const) {
      total[k].att += l[k].att;
      total[k].made += l[k].made;
    }
    total.offReb += l.offReb;
    total.defReb += l.defReb;
    total.assists += l.assists;
    total.steals += l.steals;
    total.blocks += l.blocks;
    total.turnovers += l.turnovers;
    total.fouls += l.fouls;
  }
  total.points = 2 * total.fg2.made + 3 * total.fg3.made + total.ft.made;
  const eff = ratio(total.points, total.possessions);
  total.efficiency = eff === null ? null : eff * 100;
  return total;
}

export type ContextSummary = {
  team: Team;
  rows: { context: Context; line: StatLine }[];
  /** Possessions the AI couldn't classify as M, Z, or F. Shown, not dropped. */
  unknown: StatLine;
  total: StatLine;
};

export function summaryByContext(log: PossessionLog, team: Team): ContextSummary {
  const mine = log.possessions.filter((p) => p.team === team);
  const rows = CONTEXTS.map((context) => ({ context, line: statLine(mine.filter((p) => p.context === context)) }));
  const unknown = statLine(mine.filter((p) => p.context === null));
  return { team, rows, unknown, total: sumLines([...rows.map((r) => r.line), unknown]) };
}

export type Percentages = {
  fgPct: number | null;
  fg3Pct: number | null;
  ftPct: number | null;
  efgPct: number | null;
  ppp: number | null;
  tovRate: number | null;
};

export function percentages(l: StatLine): Percentages {
  const fga = l.fg2.att + l.fg3.att;
  const fgm = l.fg2.made + l.fg3.made;
  return {
    fgPct: ratio(fgm, fga),
    fg3Pct: ratio(l.fg3.made, l.fg3.att),
    ftPct: ratio(l.ft.made, l.ft.att),
    efgPct: ratio(fgm + 0.5 * l.fg3.made, fga),
    ppp: ratio(l.points, l.possessions),
    tovRate: ratio(l.turnovers, l.possessions),
  };
}

const quarterKey = (q: string | null) => q ?? "?";

export function quartersIn(log: PossessionLog): string[] {
  const seen = new Set(log.possessions.map((p) => quarterKey(p.quarter)));
  for (const r of log.scoreboard) seen.add(quarterKey(r.quarter));
  const order = ["1", "2", "3", "4", "OT", "?"];
  return order.filter((q) => seen.has(q));
}

export type ByQuarter = Record<string, { roslyn: number; opponent: number }>;

function byQuarter(log: PossessionLog, value: (p: Possession, team: Team) => number): ByQuarter {
  const out: ByQuarter = {};
  for (const q of quartersIn(log)) out[q] = { roslyn: 0, opponent: 0 };
  for (const p of log.possessions) {
    const q = quarterKey(p.quarter);
    out[q] ??= { roslyn: 0, opponent: 0 };
    for (const team of ["roslyn", "opponent"] as const) out[q][team] += value(p, team);
  }
  return out;
}

export const scoreByQuarter = (log: PossessionLog) => byQuarter(log, (p, team) => (p.team === team ? possessionPoints(p) : 0));
export const paceByQuarter = (log: PossessionLog) => byQuarter(log, (p, team) => (p.team === team ? 1 : 0));
/** Turnovers are charged to the team that had the ball. */
export const turnoversByQuarter = (log: PossessionLog) =>
  byQuarter(log, (p, team) => (p.team === team ? p.events.filter((e) => e.type === "turnover").length : 0));
/** Fouls are charged to the team that committed them. */
export const foulsByQuarter = (log: PossessionLog) =>
  byQuarter(log, (p, team) => p.events.filter((e) => e.type === "foul" && e.team === team).length);

/** Points scored after an offensive rebound, within the same possession. */
export function secondChancePoints(log: PossessionLog, team: Team): number {
  let total = 0;
  for (const p of log.possessions) {
    if (p.team !== team) continue;
    const firstOreb = p.events.find((e) => e.type === "rebound" && e.reboundType === "offensive" && e.team === team);
    if (!firstOreb) continue;
    total += shots(p.events, team)
      .filter((e) => e.videoTime >= firstOreb.videoTime)
      .reduce((s, e) => s + eventPoints(e), 0);
  }
  return total;
}

/** Points on possessions that begin right after the other team's turnover. */
export function pointsOffTurnovers(log: PossessionLog, team: Team): number {
  let total = 0;
  log.possessions.forEach((p, i) => {
    const prev = log.possessions[i - 1];
    if (p.team === team && prev && prev.team !== team && prev.events.some((e) => e.type === "turnover")) {
      total += possessionPoints(p);
    }
  });
  return total;
}

export const fastBreakPoints = (log: PossessionLog, team: Team) =>
  log.possessions.filter((p) => p.team === team && p.context === "F").reduce((s, p) => s + possessionPoints(p), 0);

/** Possession length in seconds from video time (experimental: ±1–2 s at 1 fps). */
export const possessionSeconds = (p: Possession) => Math.max(0, Math.round(p.videoEnd - p.videoStart));

export const formatMSS = (totalSeconds: number) => `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;

export type ScoreCheck = {
  from: ScoreboardReading;
  to: ScoreboardReading;
  quarter: string;
  logged: { roslyn: number; opponent: number };
  scoreboard: { roslyn: number; opponent: number };
  ok: boolean;
};

/**
 * The main accuracy safeguard (section 6.6). Compares points logged between
 * two consecutive readable scoreboard readings with the change on the
 * scoreboard. Uses differences, so a clip that starts mid-game still works.
 */
export function scoreboardCheck(log: PossessionLog): ScoreCheck[] {
  const readings = log.scoreboard
    .filter((r) => r.roslyn !== null && r.opponent !== null)
    .sort((a, b) => a.videoTime - b.videoTime);
  const made = log.possessions.flatMap((p) => shots(p.events, p.team).filter((e) => e.made === true));

  const checks: ScoreCheck[] = [];
  for (let i = 1; i < readings.length; i++) {
    const from = readings[i - 1];
    const to = readings[i];
    const inRange = made.filter((e) => e.videoTime > from.videoTime && e.videoTime <= to.videoTime);
    const logged = {
      roslyn: inRange.filter((e) => e.team === "roslyn").reduce((s, e) => s + eventPoints(e), 0),
      opponent: inRange.filter((e) => e.team === "opponent").reduce((s, e) => s + eventPoints(e), 0),
    };
    const scoreboard = { roslyn: to.roslyn! - from.roslyn!, opponent: to.opponent! - from.opponent! };
    checks.push({
      from,
      to,
      quarter: quarterKey(to.quarter),
      logged,
      scoreboard,
      ok: logged.roslyn === scoreboard.roslyn && logged.opponent === scoreboard.opponent,
    });
  }
  return checks;
}

/** Quarters with at least one scoreboard mismatch: these need review. */
export const flaggedQuarters = (checks: ScoreCheck[]) => [...new Set(checks.filter((c) => !c.ok).map((c) => c.quarter))];

// ---------- lacrosse ----------

export type DefenseRow = { context: Context | null; possessions: number; goals: number; noGoals: number };

/**
 * A team's defense by the defense type it played (the context logged on the
 * other team's possessions): possessions, goals allowed, and stops.
 * Efficiency is not computed: the club's formula is unknown (section 18).
 */
export function defenseByContext(log: PossessionLog, defending: Team): { rows: DefenseRow[]; unknown: DefenseRow; total: DefenseRow } {
  const attacking = log.possessions.filter((p) => p.team !== defending);
  const row = (context: Context | null): DefenseRow => {
    const ps = attacking.filter((p) => p.context === context);
    const goals = ps.filter((p) => possessionPoints(p) > 0).length;
    return { context, possessions: ps.length, goals, noGoals: ps.length - goals };
  };
  const rows = CONTEXTS.map(row);
  const unknown = row(null);
  const all = [...rows, unknown];
  const sum = (k: "possessions" | "goals" | "noGoals") => all.reduce((s, r) => s + r[k], 0);
  return { rows, unknown, total: { context: null, possessions: sum("possessions"), goals: sum("goals"), noGoals: sum("noGoals") } };
}
