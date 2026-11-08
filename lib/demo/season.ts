// SIMULATION ONLY (the /test page). A made-up season of basketball games so
// the Season trends screen can be shown before real sheets exist. The real
// Season tab must never use this.

import type { Context } from "@/lib/gemini/log-types";
import { MIN_ABS_R, MIN_GAMES, mean, pearson } from "@/lib/season/stats";

export type SeasonGame = {
  /** Tab name, as in the club's sheets. Opponent names here are invented. */
  tab: string;
  date: string;
  byContext: Record<Context, { possessions: number; points: number }>;
  turnovers: number;
  offRebounds: number;
  opponentPoints: number;
};

const OPPONENTS = [
  "Northfield",
  "Bayview",
  "Glen Hollow",
  "Cedar Park",
  "Harbor Point",
  "Westbrook",
  "Maple Ridge",
  "Lakeside",
  "Oak Valley",
  "Pine Hill",
  "Riverton",
  "Stonegate",
  "Summit Heights",
  "Elm Grove",
  "Fairhaven",
  "Brookside",
  "Kingsley",
  "Willow Creek",
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateSeason(): SeasonGame[] {
  const rand = rng(2026);
  const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));
  return OPPONENTS.map((opp, i) => {
    const f = between(6, 20);
    const m = between(28, 42);
    const z = between(12, 26);
    // Fast breaks are efficient; turnovers hurt. Built in so a real-looking pattern exists.
    const fPts = Math.round(f * (1.15 + rand() * 0.35));
    const mPts = Math.round(m * (0.78 + rand() * 0.3));
    const zPts = Math.round(z * (0.7 + rand() * 0.35));
    const turnovers = between(8, 22);
    const ours = fPts + mPts + zPts;
    const opponentPoints = Math.max(28, Math.round(ours + 9 - f * 0.9 + (turnovers - 14) * 0.9 + (rand() - 0.5) * 14));
    const day = new Date(Date.UTC(2026, 11, 2 + i * 4));
    return {
      tab: `${opp} ${101 + i * 3}`,
      date: day.toISOString().slice(0, 10),
      byContext: { M: { possessions: m, points: mPts }, Z: { possessions: z, points: zPts }, F: { possessions: f, points: fPts } },
      turnovers,
      offRebounds: between(4, 15),
      opponentPoints,
    };
  });
}

export const totals = (g: SeasonGame) => {
  const poss = g.byContext.M.possessions + g.byContext.Z.possessions + g.byContext.F.possessions;
  const pts = g.byContext.M.points + g.byContext.Z.points + g.byContext.F.points;
  return { possessions: poss, points: pts, efficiency: (pts / poss) * 100, margin: pts - g.opponentPoints };
};

export type Metric = { id: string; label: string; value: (g: SeasonGame) => number };

/** Per-game measures the trend search compares against each other. */
export const METRICS: Metric[] = [
  { id: "fbShare", label: "Share of possessions on fast breaks (%)", value: (g) => (g.byContext.F.possessions / totals(g).possessions) * 100 },
  { id: "zoneShare", label: "Share of possessions vs zone (%)", value: (g) => (g.byContext.Z.possessions / totals(g).possessions) * 100 },
  { id: "turnovers", label: "Turnovers", value: (g) => g.turnovers },
  { id: "oreb", label: "Offensive rebounds", value: (g) => g.offRebounds },
  { id: "pace", label: "Possessions", value: (g) => totals(g).possessions },
];

export const OUTCOMES: Metric[] = [
  { id: "margin", label: "Point margin", value: (g) => totals(g).margin },
  { id: "efficiency", label: "Offensive efficiency", value: (g) => totals(g).efficiency },
];

export type PairResult = { x: Metric; y: Metric; r: number | null; n: number; passes: boolean };

/** Every metric × outcome pair, all reported (no cherry-picking), strongest first. */
export function testAllPairs(games: SeasonGame[]): PairResult[] {
  const out: PairResult[] = [];
  for (const x of METRICS)
    for (const y of OUTCOMES) {
      const r = pearson(games.map(x.value), games.map(y.value));
      out.push({ x, y, r, n: games.length, passes: r !== null && games.length >= MIN_GAMES && Math.abs(r) >= MIN_ABS_R });
    }
  return out.sort((a, b) => Math.abs(b.r ?? 0) - Math.abs(a.r ?? 0));
}

export function efficiencyByContext(games: SeasonGame[]) {
  return (["M", "Z", "F"] as const).map((c) => {
    const poss = games.reduce((s, g) => s + g.byContext[c].possessions, 0);
    const pts = games.reduce((s, g) => s + g.byContext[c].points, 0);
    return { context: c, possessions: poss, points: pts, efficiency: poss ? (pts / poss) * 100 : null };
  });
}

export const record = (games: SeasonGame[]) => {
  const w = games.filter((g) => totals(g).margin > 0).length;
  return { wins: w, losses: games.length - w, avgEfficiency: mean(games.map((g) => totals(g).efficiency)) };
};
