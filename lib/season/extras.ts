// Per-game numbers for Season trends that the club's sheets don't carry (Noah, Nov 14: more stats that matter to the
// season). Computed in code from each saved possession log, for Roslyn AND the opponent, so the Season tab can look at
// defense too. A stat that wasn't tracked for a game is null, never 0 and never a guess.

import { fastBreakPoints, percentages, pointsOffTurnovers, secondChancePoints, summaryByContext } from "@/lib/derive";
import { pointsInPaint, rawPointSources, shotsTaken } from "@/lib/derive/game-stats";
import type { PossessionLog, Team } from "@/lib/gemini/log-types";

export type TeamExtras = {
  points: number | null;
  possessions: number;
  /** Percent values are 0-100. */
  fgPct: number | null;
  efgPct: number | null;
  fg3Pct: number | null;
  ftPct: number | null;
  tovRate: number | null;
  turnovers: number | null;
  pointsOffTurnovers: number | null;
  secondChance: number | null;
  fastBreakPoints: number | null;
  paintPoints: number | null;
  shotsTaken: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  fouls: number | null;
};

export type SourceTotals = { total: number; items: { id: string; label: string; points: number }[] };

export type GameExtras = {
  roslyn: TeamExtras;
  opponent: TeamExtras;
  sources: { roslyn: SourceTotals; opponent: SourceTotals };
};

const pct = (r: number | null) => (r === null ? null : r * 100);

function teamExtras(log: PossessionLog, team: Team, on: (id: string) => boolean): TeamExtras {
  const line = summaryByContext(log, team).total;
  const p = percentages(line);
  const shots = on("shots");
  return {
    points: shots ? line.points : null,
    possessions: line.possessions,
    fgPct: shots ? pct(p.fgPct) : null,
    efgPct: shots ? pct(p.efgPct) : null,
    fg3Pct: shots ? pct(p.fg3Pct) : null,
    ftPct: shots ? pct(p.ftPct) : null,
    tovRate: on("turnovers") ? pct(p.tovRate) : null,
    turnovers: on("turnovers") ? line.turnovers : null,
    pointsOffTurnovers: shots && on("turnovers") ? pointsOffTurnovers(log, team) : null,
    secondChance: shots && on("rebounds") ? secondChancePoints(log, team) : null,
    fastBreakPoints: shots && on("context") ? fastBreakPoints(log, team) : null,
    paintPoints: shots && on("shot-zone") ? pointsInPaint(log, team) : null,
    shotsTaken: shots ? shotsTaken(log, team, "basketball") : null,
    assists: on("assists") ? line.assists : null,
    steals: on("steals") ? line.steals : null,
    blocks: on("blocks") ? line.blocks : null,
    fouls: on("fouls") ? line.fouls : null,
  };
}

/** Basketball only for now (hockey has no Season model yet). */
export function buildExtras(log: PossessionLog, statIds: string[]): GameExtras {
  const on = (id: string) => statIds.includes(id);
  const sources = (team: Team): SourceTotals => {
    const r = rawPointSources(log, team, "basketball");
    return { total: on("shots") ? r.totalPoints : 0, items: on("shots") ? r.raw : [] };
  };
  return { roslyn: teamExtras(log, "roslyn", on), opponent: teamExtras(log, "opponent", on), sources: { roslyn: sources("roslyn"), opponent: sources("opponent") } };
}

export type SeasonSource = { id: string; label: string; points: number; share: number };

/** Where a team's points came from across the season. A source is shown only with enough points behind it. */
export function seasonSources(games: GameExtras[], team: Team, minTotal = 30, minSource = 10): { total: number; items: SeasonSource[] } {
  const total = games.reduce((s, g) => s + g.sources[team].total, 0);
  if (total < minTotal) return { total, items: [] };
  const acc = new Map<string, { label: string; points: number }>();
  for (const g of games) for (const it of g.sources[team].items) acc.set(it.id, { label: it.label, points: (acc.get(it.id)?.points ?? 0) + it.points });
  return {
    total,
    items: [...acc.entries()]
      .filter(([, v]) => v.points >= minSource)
      .map(([id, v]) => ({ id, label: v.label, points: v.points, share: v.points / total }))
      .sort((a, b) => b.share - a.share),
  };
}
