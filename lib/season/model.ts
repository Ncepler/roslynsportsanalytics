// Per-game numbers for the Season tab, built only from rows the club's sheets
// contain. Every value is computed here in code (CLAUDE.md section 3, rule 2);
// a value the sheets don't support is null, never guessed.

import type { Context } from "@/lib/gemini/log-types";
import { MIN_ABS_R, MIN_GAMES, pearson } from "./stats";
import { gameKey, KIND_LABEL, type ContextLine, type ReadTab, type SheetKind, type SkippedTab } from "./parse";

export const CONTEXTS: Context[] = ["M", "Z", "F"];
export type Sport = "basketball" | "lacrosse";

export type BasketballGame = {
  /** Possessions and points by context (from the offense summary, or the Roslyn template for points). */
  byContext: Record<Context, { possessions: number | null; points: number | null }>;
  fga: number | null;
  fgm: number | null;
  fg3a: number | null;
  fg3m: number | null;
  fta: number | null;
  ftm: number | null;
  oreb: number | null;
  dreb: number | null;
  ast: number | null;
  tov: number | null;
  /** From the possession log, when present. */
  logPossessions: number | null;
  logPoints: number | null;
  avgPossessionSeconds: number | null;
};

export type LacrosseGame = {
  roslynTurnovers: (number | null)[] | null;
  opponentTurnovers: (number | null)[] | null;
  defense: Record<Context, { possessions: number | null; goals: number | null }> | null;
};

export type Game = {
  key: string;
  name: string;
  sport: Sport;
  sheets: SheetKind[];
  basketball: BasketballGame | null;
  lacrosse: LacrosseGame | null;
  plusMinus: { number: string; total: number | null }[] | null;
};

export type Score = { roslyn: number | null; opponent: number | null };

const sum = (xs: (number | null)[]) => (xs.some((x) => x !== null) ? xs.reduce<number>((a, b) => a + (b ?? 0), 0) : null);
const add = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));

function emptyBasketball(): BasketballGame {
  const ctx = () => ({ possessions: null, points: null });
  return { byContext: { M: ctx(), Z: ctx(), F: ctx() }, fga: null, fgm: null, fg3a: null, fg3m: null, fta: null, ftm: null, oreb: null, dreb: null, ast: null, tov: null, logPossessions: null, logPoints: null, avgPossessionSeconds: null };
}

const pointsOf = (l: { fg2m: number | null; fg3m: number | null; ftm: number | null }) =>
  l.fg2m === null && l.fg3m === null && l.ftm === null ? null : 2 * (l.fg2m ?? 0) + 3 * (l.fg3m ?? 0) + (l.ftm ?? 0);

export function buildGames(read: ReadTab[]): Game[] {
  const byKey = new Map<string, Game>();
  for (const tab of read) {
    const key = gameKey(tab.game);
    const sport: Sport = tab.sheet.kind.startsWith("lax") ? "lacrosse" : "basketball";
    let g = byKey.get(key);
    if (!g) {
      g = { key, name: tab.game.replace(/\s+/g, " ").trim(), sport, sheets: [], basketball: null, lacrosse: null, plusMinus: null };
      byKey.set(key, g);
    }
    g.sheets.push(tab.sheet.kind);
    const s = tab.sheet;
    if (s.kind === "bb-offense-summary") {
      const b = (g.basketball ??= emptyBasketball());
      const lines = CONTEXTS.map((c) => s.byContext[c]).filter((l): l is ContextLine => Boolean(l));
      for (const c of CONTEXTS) {
        const l = s.byContext[c];
        if (l) b.byContext[c] = { possessions: l.possessions, points: pointsOf(l) };
      }
      const total = (k: keyof ContextLine) => sum(lines.map((l) => l[k]));
      b.fga = add(total("fg2a"), total("fg3a"));
      b.fgm = add(total("fg2m"), total("fg3m"));
      b.fg3a = total("fg3a");
      b.fg3m = total("fg3m");
      b.fta = total("fta");
      b.ftm = total("ftm");
      b.oreb = total("oreb");
      b.dreb = total("dreb");
      b.ast = total("ast");
      b.tov = total("tov");
    } else if (s.kind === "bb-roslyn-offense") {
      const b = (g.basketball ??= emptyBasketball());
      for (const c of CONTEXTS) {
        const l = s.byContext[c];
        // The template has no possession counts; it only fills points if the summary didn't.
        if (l && b.byContext[c].points === null) b.byContext[c].points = pointsOf(l);
      }
    } else if (s.kind === "bb-possession-log") {
      const b = (g.basketball ??= emptyBasketball());
      b.logPossessions = s.rows.length;
      b.logPoints = sum(s.rows.map((r) => r.points));
      const secs = s.rows.map((r) => r.seconds).filter((x): x is number => x !== null);
      b.avgPossessionSeconds = secs.length ? secs.reduce((a, c) => a + c, 0) / secs.length : null;
    } else if (s.kind === "bb-plus-minus") {
      g.plusMinus = s.players.map((p) => ({ number: p.number, total: p.total }));
    } else if (s.kind === "lax-turnovers") {
      const l = (g.lacrosse ??= { roslynTurnovers: null, opponentTurnovers: null, defense: null });
      l.roslynTurnovers = s.roslyn;
      l.opponentTurnovers = s.opponent;
    } else if (s.kind === "lax-defense") {
      const l = (g.lacrosse ??= { roslynTurnovers: null, opponentTurnovers: null, defense: null });
      const row = (c: Context) => ({ possessions: s.byContext[c]?.possessions ?? null, goals: s.byContext[c]?.goals ?? null });
      l.defense = { M: row("M"), Z: row("Z"), F: row("F") };
    }
  }
  return [...byKey.values()];
}

// ---------- per-game measures ----------

export type Measure = {
  id: string;
  label: string;
  sport: Sport;
  value: (g: Game, score?: Score) => number | null;
  /** Outcomes this metric is built into (e.g. efficiency = points ÷ possessions), so testing them would "find" arithmetic, not a trend. */
  linkedTo?: string[];
};

const totalPossessions = (b: BasketballGame) => {
  const fromSummary = sum(CONTEXTS.map((c) => b.byContext[c].possessions));
  return fromSummary ?? b.logPossessions;
};
/** Points from the summary's context rows; the possession log's points when there's no summary. */
const totalPoints = (b: BasketballGame) => sum(CONTEXTS.map((c) => b.byContext[c].points)) ?? b.logPoints;
const ratio = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b);
const pct = (a: number | null, b: number | null) => {
  const r = ratio(a, b);
  return r === null ? null : r * 100;
};

export const efficiencyOf = (b: BasketballGame) => pct(totalPoints(b), totalPossessions(b));
const margin = (s?: Score) => (s && s.roslyn !== null && s.opponent !== null ? s.roslyn - s.opponent : null);
const laxTotal = (xs: (number | null)[] | null) => (xs ? sum(xs) : null);
const laxDefTotal = (l: LacrosseGame, k: "possessions" | "goals") => (l.defense ? sum(CONTEXTS.map((c) => l.defense![c][k])) : null);

/** Stats that might move with an outcome. */
export const METRICS: Measure[] = [
  { id: "fb-share", label: "Share of possessions on fast breaks (%)", sport: "basketball", value: (g) => (g.basketball ? pct(g.basketball.byContext.F.possessions, totalPossessions(g.basketball)) : null) },
  { id: "zone-share", label: "Share of possessions vs zone (%)", sport: "basketball", value: (g) => (g.basketball ? pct(g.basketball.byContext.Z.possessions, totalPossessions(g.basketball)) : null) },
  { id: "tov", label: "Turnovers", sport: "basketball", value: (g) => g.basketball?.tov ?? null },
  { id: "oreb", label: "Offensive rebounds", sport: "basketball", value: (g) => g.basketball?.oreb ?? null },
  { id: "fg3-share", label: "Share of shots that are 3s (%)", sport: "basketball", value: (g) => (g.basketball ? pct(g.basketball.fg3a, g.basketball.fga) : null) },
  { id: "fta", label: "Free throw attempts", sport: "basketball", value: (g) => g.basketball?.fta ?? null },
  { id: "pace", label: "Possessions", sport: "basketball", value: (g) => (g.basketball ? totalPossessions(g.basketball) : null), linkedTo: ["points", "efficiency"] },
  { id: "poss-time", label: "Average possession length (s)", sport: "basketball", value: (g) => g.basketball?.avgPossessionSeconds ?? null },
  { id: "lax-tov", label: "Roslyn turnovers", sport: "lacrosse", value: (g) => (g.lacrosse ? laxTotal(g.lacrosse.roslynTurnovers) : null) },
  { id: "lax-opp-tov", label: "Opponent turnovers", sport: "lacrosse", value: (g) => (g.lacrosse ? laxTotal(g.lacrosse.opponentTurnovers) : null) },
  { id: "lax-def-poss", label: "Opponent possessions", sport: "lacrosse", value: (g) => (g.lacrosse ? laxDefTotal(g.lacrosse, "possessions") : null), linkedTo: ["lax-goal-rate"] },
  {
    id: "lax-zone-share",
    label: "Share of defense played in zone (%)",
    sport: "lacrosse",
    value: (g) => (g.lacrosse?.defense ? pct(g.lacrosse.defense.Z.possessions, laxDefTotal(g.lacrosse, "possessions")) : null),
  },
];

/** What the metrics are compared against. Margin needs the optional final scores. */
export const OUTCOMES: Measure[] = [
  { id: "efficiency", label: "Offensive efficiency", sport: "basketball", value: (g) => (g.basketball ? efficiencyOf(g.basketball) : null) },
  { id: "points", label: "Points scored", sport: "basketball", value: (g) => (g.basketball ? totalPoints(g.basketball) : null) },
  { id: "margin", label: "Point margin", sport: "basketball", value: (_g, s) => margin(s) },
  {
    id: "lax-goal-rate",
    label: "Goals allowed per opponent possession (%)",
    sport: "lacrosse",
    value: (g) => (g.lacrosse ? pct(laxDefTotal(g.lacrosse, "goals"), laxDefTotal(g.lacrosse, "possessions")) : null),
  },
  { id: "lax-margin", label: "Goal margin", sport: "lacrosse", value: (_g, s) => margin(s) },
];

export type PairResult = { x: Measure; y: Measure; r: number | null; n: number; games: string[]; passes: boolean };

/** Every metric × outcome pair for the sport, all reported, strongest first (no cherry-picking). */
export function testPairs(games: Game[], sport: Sport, scores: Record<string, Score>): PairResult[] {
  const gs = games.filter((g) => g.sport === sport);
  const out: PairResult[] = [];
  for (const x of METRICS.filter((m) => m.sport === sport))
    for (const y of OUTCOMES.filter((m) => m.sport === sport && !x.linkedTo?.includes(m.id))) {
      const pts = gs
        .map((g) => ({ g, xv: x.value(g, scores[g.key]), yv: y.value(g, scores[g.key]) }))
        .filter((p): p is { g: Game; xv: number; yv: number } => p.xv !== null && p.yv !== null);
      if (pts.length < 3) continue; // nothing to test
      const r = pearson(
        pts.map((p) => p.xv),
        pts.map((p) => p.yv),
      );
      out.push({ x, y, r, n: pts.length, games: pts.map((p) => p.g.name), passes: r !== null && pts.length >= MIN_GAMES && Math.abs(r) >= MIN_ABS_R });
    }
  return out.sort((a, b) => Math.abs(b.r ?? 0) - Math.abs(a.r ?? 0));
}

/** Season-wide comparison by context: basketball efficiency, lacrosse goals allowed rate. */
export function byContextSeason(games: Game[], sport: Sport) {
  return CONTEXTS.map((c) => {
    if (sport === "basketball") {
      const lines = games.filter((g) => g.basketball).map((g) => g.basketball!.byContext[c]);
      const poss = sum(lines.map((l) => l.possessions));
      const pts = sum(lines.map((l) => (l.possessions === null ? null : l.points)));
      return { context: c, possessions: poss, value: pct(pts, poss), detail: pts };
    }
    const lines = games.filter((g) => g.lacrosse?.defense).map((g) => g.lacrosse!.defense![c]);
    const poss = sum(lines.map((l) => l.possessions));
    const goals = sum(lines.map((l) => (l.possessions === null ? null : l.goals)));
    return { context: c, possessions: poss, value: pct(goals, poss), detail: goals };
  });
}

export function sheetSummary(read: ReadTab[], skipped: SkippedTab[]) {
  const counts = new Map<SheetKind, number>();
  for (const r of read) counts.set(r.sheet.kind, (counts.get(r.sheet.kind) ?? 0) + 1);
  return { recognized: [...counts.entries()].map(([kind, n]) => ({ kind, label: KIND_LABEL[kind], tabs: n })), skipped };
}

export { totalPoints, totalPossessions };
