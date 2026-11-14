// Game-level numbers for the stats page and the strategy notes (CLAUDE.md section 3, rule 2: code does all the math).
// Pure functions over the possession log. Anything that can't be computed is null, never a guess.

import {
  eventPoints,
  fastBreakPoints,
  pointsOffTurnovers,
  possessionPoints,
  percentages,
  quartersIn,
  ratio,
  scoreByQuarter,
  secondChancePoints,
  summaryByContext,
  type ByQuarter,
} from "@/lib/derive";
import type { LogEvent, PossessionLog, Team } from "@/lib/gemini/log-types";
import { getSport } from "@/lib/sports";

const TEAMS: Team[] = ["roslyn", "opponent"];

/** A team's shot events. Basketball "shots taken" are field goal attempts, so free throws (1 point) are left out. */
export function shotEvents(log: PossessionLog, team: Team, sportId: string): LogEvent[] {
  const out: LogEvent[] = [];
  for (const p of log.possessions) {
    for (const e of p.events) {
      if (e.type !== "shot" || e.team !== team) continue;
      if (sportId === "basketball" && e.points === 1) continue;
      out.push(e);
    }
  }
  return out;
}

/** Shots taken: every attempt, made or missed (hockey: goals, saves, misses and blocks). */
export const shotsTaken = (log: PossessionLog, team: Team, sportId: string) => shotEvents(log, team, sportId).length;

const isGoal = (e: LogEvent, sportId: string) => (sportId === "ice-hockey" ? e.shotResult === "goal" || e.made === true : e.made === true);

export type ZoneRow = { id: string; label: string; att: number; made: number; pct: number | null };

/** Attempts and makes in each named zone of the sport, in the sport's order. Shots with no zone are returned separately (shown, not dropped). */
export function shotsByZone(log: PossessionLog, team: Team, sportId: string): { zones: ZoneRow[]; unknown: { att: number; made: number } } {
  const defs = getSport(sportId)?.shotZones ?? [];
  const zones: ZoneRow[] = defs.map((z) => ({ id: z.id, label: z.label, att: 0, made: 0, pct: null }));
  const unknown = { att: 0, made: 0 };
  for (const e of shotEvents(log, team, sportId)) {
    const row = zones.find((z) => z.id === e.shotZone);
    const bucket = row ?? unknown;
    bucket.att += 1;
    if (isGoal(e, sportId)) bucket.made += 1;
  }
  for (const z of zones) z.pct = ratio(z.made, z.att);
  return { zones, unknown };
}

/** Points scored on made shots in the paint (basketball). */
export function pointsInPaint(log: PossessionLog, team: Team): number {
  return shotEvents(log, team, "basketball")
    .filter((e) => e.shotZone === "paint")
    .reduce((s, e) => s + eventPoints(e), 0);
}

// ---------- hockey ----------

export type HockeyShotRow = { period: string; goals: number; saved: number; missed: number; blocked: number; unknown: number; total: number };

export function hockeyShotsByPeriod(log: PossessionLog, team: Team): { rows: HockeyShotRow[]; total: HockeyShotRow } {
  const blank = (period: string): HockeyShotRow => ({ period, goals: 0, saved: 0, missed: 0, blocked: 0, unknown: 0, total: 0 });
  const rows = new Map<string, HockeyShotRow>(quartersIn(log).map((q) => [q, blank(q)]));
  const total = blank("Total");
  for (const p of log.possessions) {
    for (const e of p.events) {
      if (e.type !== "shot" || e.team !== team) continue;
      const row = rows.get(p.quarter ?? "?") ?? blank(p.quarter ?? "?");
      rows.set(row.period, row);
      const kind = e.shotResult === "goal" || (e.shotResult == null && e.made === true) ? "goals" : e.shotResult === "saved" ? "saved" : e.shotResult === "missed" ? "missed" : e.shotResult === "blocked" ? "blocked" : "unknown";
      for (const r of [row, total]) {
        r[kind] += 1;
        r.total += 1;
      }
    }
  }
  return { rows: [...rows.values()], total };
}

// ---------- head-to-head team stats (the ESPN-style bars) ----------

export type CompareRow = {
  id: string;
  label: string;
  roslyn: number | null;
  opponent: number | null;
  /** How to show the numbers. "made-att" rows also carry "made-att" text in `detail`. */
  format: "count" | "pct";
  detail?: { roslyn: string; opponent: string };
};

/** Rows for the head-to-head view. A row whose stat wasn't tracked is left out. */
export function teamCompare(log: PossessionLog, sportId: string, statIds: string[]): CompareRow[] {
  const on = (id: string) => statIds.includes(id);
  const rows: CompareRow[] = [];
  const both = <T,>(f: (t: Team) => T) => ({ roslyn: f("roslyn"), opponent: f("opponent") });

  if (sportId === "ice-hockey") {
    const h = both((t) => hockeyShotsByPeriod(log, t).total);
    rows.push({ id: "shots-taken", label: "Shots taken", roslyn: h.roslyn.total, opponent: h.opponent.total, format: "count" });
    rows.push({ id: "goals", label: "Goals", roslyn: h.roslyn.goals, opponent: h.opponent.goals, format: "count" });
    rows.push({ id: "saved", label: "Saved by the goalie", roslyn: h.roslyn.saved, opponent: h.opponent.saved, format: "count" });
    rows.push({ id: "missed", label: "Missed the net", roslyn: h.roslyn.missed, opponent: h.opponent.missed, format: "count" });
    rows.push({ id: "blocked", label: "Blocked", roslyn: h.roslyn.blocked, opponent: h.opponent.blocked, format: "count" });
    rows.push({ id: "shooting-pct", label: "Shooting %", roslyn: ratio(h.roslyn.goals, h.roslyn.total), opponent: ratio(h.opponent.goals, h.opponent.total), format: "pct", detail: { roslyn: `${h.roslyn.goals}-${h.roslyn.total}`, opponent: `${h.opponent.goals}-${h.opponent.total}` } });
    return rows;
  }

  if (sportId === "lacrosse") {
    const taken = both((t) => shotEvents(log, t, sportId));
    const goals = both((t) => taken[t].filter((e) => e.made === true).length);
    rows.push({ id: "shots-taken", label: "Shots taken", roslyn: taken.roslyn.length, opponent: taken.opponent.length, format: "count" });
    rows.push({ id: "goals", label: "Goals", roslyn: goals.roslyn, opponent: goals.opponent, format: "count" });
    rows.push({ id: "shooting-pct", label: "Shooting %", roslyn: ratio(goals.roslyn, taken.roslyn.length), opponent: ratio(goals.opponent, taken.opponent.length), format: "pct", detail: { roslyn: `${goals.roslyn}-${taken.roslyn.length}`, opponent: `${goals.opponent}-${taken.opponent.length}` } });
    if (on("turnovers")) {
      const t = both((team) => log.possessions.filter((p) => p.team === team).reduce((s, p) => s + p.events.filter((e) => e.type === "turnover").length, 0));
      rows.push({ id: "turnovers", label: "Turnovers", ...t, format: "count" });
    }
    return rows;
  }

  // Basketball
  const line = both((t) => summaryByContext(log, t).total);
  const pct = both((t) => percentages(line[t]));
  const fgm = (t: Team) => line[t].fg2.made + line[t].fg3.made;
  const fga = (t: Team) => line[t].fg2.att + line[t].fg3.att;
  const made = (m: number, a: number) => `${m}-${a}`;
  if (on("shots")) {
    rows.push({ id: "fg", label: "Field goals", roslyn: fgm("roslyn"), opponent: fgm("opponent"), format: "count", detail: { roslyn: made(fgm("roslyn"), fga("roslyn")), opponent: made(fgm("opponent"), fga("opponent")) } });
    rows.push({ id: "fg-pct", label: "Field goal %", roslyn: pct.roslyn.fgPct, opponent: pct.opponent.fgPct, format: "pct" });
    rows.push({ id: "fg3", label: "3-pointers", roslyn: line.roslyn.fg3.made, opponent: line.opponent.fg3.made, format: "count", detail: { roslyn: made(line.roslyn.fg3.made, line.roslyn.fg3.att), opponent: made(line.opponent.fg3.made, line.opponent.fg3.att) } });
    rows.push({ id: "fg3-pct", label: "3-point %", roslyn: pct.roslyn.fg3Pct, opponent: pct.opponent.fg3Pct, format: "pct" });
    rows.push({ id: "ft", label: "Free throws", roslyn: line.roslyn.ft.made, opponent: line.opponent.ft.made, format: "count", detail: { roslyn: made(line.roslyn.ft.made, line.roslyn.ft.att), opponent: made(line.opponent.ft.made, line.opponent.ft.att) } });
    rows.push({ id: "ft-pct", label: "Free throw %", roslyn: pct.roslyn.ftPct, opponent: pct.opponent.ftPct, format: "pct" });
    rows.push({ id: "shots-taken", label: "Shots taken", roslyn: fga("roslyn"), opponent: fga("opponent"), format: "count" });
  }
  if (on("rebounds")) {
    rows.push({ id: "reb", label: "Rebounds", roslyn: line.roslyn.offReb + line.roslyn.defReb, opponent: line.opponent.offReb + line.opponent.defReb, format: "count" });
    rows.push({ id: "oreb", label: "Offensive rebounds", roslyn: line.roslyn.offReb, opponent: line.opponent.offReb, format: "count" });
    rows.push({ id: "dreb", label: "Defensive rebounds", roslyn: line.roslyn.defReb, opponent: line.opponent.defReb, format: "count" });
  }
  if (on("assists")) rows.push({ id: "ast", label: "Assists", ...both((t) => line[t].assists), format: "count" });
  if (on("steals")) rows.push({ id: "stl", label: "Steals", ...both((t) => line[t].steals), format: "count" });
  if (on("blocks")) rows.push({ id: "blk", label: "Blocks", ...both((t) => line[t].blocks), format: "count" });
  if (on("turnovers")) rows.push({ id: "tov", label: "Turnovers", ...both((t) => line[t].turnovers), format: "count" });
  if (on("shots")) {
    if (on("turnovers")) rows.push({ id: "pot", label: "Points off turnovers", ...both((t) => pointsOffTurnovers(log, t)), format: "count" });
    rows.push({ id: "second", label: "Second-chance points", ...both((t) => secondChancePoints(log, t)), format: "count" });
    if (on("context")) rows.push({ id: "fb", label: "Fast-break points", ...both((t) => fastBreakPoints(log, t)), format: "count" });
    if (on("shot-zone")) rows.push({ id: "paint", label: "Points in the paint", ...both((t) => pointsInPaint(log, t)), format: "count" });
  }
  if (on("fouls")) rows.push({ id: "foul", label: "Fouls", ...both((t) => line[t].fouls), format: "count" });
  return rows;
}

// ---------- where the points came from (evidence for the strategy notes) ----------

export type PointSource = { id: string; label: string; points: number; share: number };

/** A source needs at least this many points, and the team at least MIN_TEAM_POINTS, before it is reported. */
export const MIN_SOURCE_POINTS = 4;
export const MIN_TEAM_POINTS = 10;

/** Each team's points split by where they came from, as a share of that team's points. Small samples are left out. */
export function pointSources(log: PossessionLog, team: Team, sportId: string): { totalPoints: number; sources: PointSource[] } {
  const totalPoints = log.possessions.filter((p) => p.team === team).reduce((s, p) => s + possessionPoints(p), 0);
  if (totalPoints < MIN_TEAM_POINTS) return { totalPoints, sources: [] };
  const raw: { id: string; label: string; points: number }[] = [];

  if (sportId === "basketball") {
    const ctx = summaryByContext(log, team);
    const names = { M: "possessions against man-to-man defense", Z: "possessions against zone defense", F: "fast breaks" } as const;
    for (const r of ctx.rows) raw.push({ id: `context-${r.context}`, label: names[r.context], points: r.line.points });
    raw.push({ id: "off-turnovers", label: "points off turnovers", points: pointsOffTurnovers(log, team) });
    raw.push({ id: "second-chance", label: "second-chance points", points: secondChancePoints(log, team) });
    raw.push({ id: "paint", label: "shots in the paint", points: pointsInPaint(log, team) });
    const threes = shotEvents(log, team, sportId).filter((e) => e.points === 3).reduce((s, e) => s + eventPoints(e), 0);
    raw.push({ id: "threes", label: "3-point shots", points: threes });
    const ft = log.possessions.flatMap((p) => p.events).filter((e) => e.type === "shot" && e.team === team && e.points === 1).reduce((s, e) => s + eventPoints(e), 0);
    raw.push({ id: "free-throws", label: "free throws", points: ft });
    const zones = shotsByZone(log, team, sportId).zones;
    for (const z of zones) {
      if (z.id === "paint") continue;
      raw.push({ id: `zone-${z.id}`, label: `shots from ${z.label.toLowerCase()}`, points: shotEvents(log, team, sportId).filter((e) => e.shotZone === z.id).reduce((s, e) => s + eventPoints(e), 0) });
    }
  } else {
    // Lacrosse and hockey: goals by zone.
    for (const z of shotsByZone(log, team, sportId).zones) raw.push({ id: `zone-${z.id}`, label: `goals from ${z.label.toLowerCase()}`, points: z.made });
  }

  return {
    totalPoints,
    sources: raw
      .filter((r) => r.points >= MIN_SOURCE_POINTS)
      .map((r) => ({ ...r, share: r.points / totalPoints }))
      .sort((a, b) => b.share - a.share),
  };
}

// ---------- the header strip ----------

export type ScoreStrip = { periods: string[]; byPeriod: ByQuarter; total: { roslyn: number; opponent: number } };

export function scoreStrip(log: PossessionLog): ScoreStrip {
  const byPeriod = scoreByQuarter(log);
  const periods = Object.keys(byPeriod);
  const total = { roslyn: 0, opponent: 0 };
  for (const q of periods) for (const t of TEAMS) total[t] += byPeriod[q][t];
  return { periods, byPeriod, total };
}
