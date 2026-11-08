// SIMULATION ONLY (the /test page). A made-up season, written as rows in the
// club's own sheet layouts, so the /test Season tab runs through exactly the
// same parser and math as the real one. Never used on the real Season tab.

import { gameKey, type RawTab } from "@/lib/season/parse";
import type { Score } from "@/lib/season/model";

const BB_OPPONENTS = ["Northfield", "Bayview", "Glen Hollow", "Cedar Park", "Harbor Point", "Westbrook", "Maple Ridge", "Lakeside", "Oak Valley", "Pine Hill", "Riverton", "Stonegate", "Summit Heights", "Elm Grove", "Fairhaven", "Brookside", "Kingsley", "Willow Creek"];
const LAX_OPPONENTS = ["Northfield", "Bayview", "Cedar Park", "Harbor Point", "Westbrook", "Lakeside", "Oak Valley", "Riverton", "Stonegate", "Elm Grove", "Fairhaven", "Kingsley"];

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

export function simulateSeasonTabs(): { tabs: RawTab[]; scores: Record<string, Score> } {
  const rand = rng(2026);
  const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));
  const tabs: RawTab[] = [];
  const scores: Record<string, Score> = {};

  BB_OPPONENTS.forEach((opp, i) => {
    const name = `${opp} ${101 + i * 3}`;
    const poss = { M: between(28, 42), Z: between(12, 26), F: between(6, 20) };
    // Makes per context, built so fast breaks score well and turnovers hurt (a pattern for the demo to find).
    const line = (c: "M" | "Z" | "F") => {
      const p = poss[c];
      const rate = c === "F" ? 0.55 + rand() * 0.15 : c === "M" ? 0.36 + rand() * 0.12 : 0.32 + rand() * 0.12;
      const fga = Math.round(p * 0.85);
      const fgm = Math.round(fga * rate);
      const fg3a = Math.round(fga * (c === "Z" ? 0.4 : 0.25));
      const fg3m = Math.min(fgm, Math.round(fg3a * (0.28 + rand() * 0.12)));
      const fta = between(2, 8);
      const ftm = Math.round(fta * 0.7);
      return [p, c, fga - fg3a, fgm - fg3m, fg3a, fg3m, fta, ftm, between(2, 7), between(5, 11), between(3, 9), between(1, 5), between(0, 3), between(3, 8), between(3, 7), null, null];
    };
    const rows = [
      ["Possessions", "vs", "2-Point FG", null, "3-Point FG", null, "Free Throw", null, "Rebounds", null, "Assists", "Steals", "Blocks", "Turnovers", "Fouls", "Total Points", "Offensive Efficiency"],
      [null, null, "Att", "Made", "Att", "Made", "Att", "Made", "Off", "Def", null, null, null, null, null, null, null],
      line("M"),
      line("Z"),
      line("F"),
    ];
    tabs.push({ file: "Simulated offense summary.xlsx", name, rows });
    const pts = (r: (string | number | null)[]) => 2 * (r[3] as number) + 3 * (r[5] as number) + (r[7] as number);
    const ours = pts(rows[2]) + pts(rows[3]) + pts(rows[4]);
    const tov = (rows[2][13] as number) + (rows[3][13] as number) + (rows[4][13] as number);
    scores[gameKey(name)] = { roslyn: ours, opponent: Math.max(25, Math.round(ours + 4 - poss.F * 0.6 + (tov - 16) * 0.8 + (rand() - 0.5) * 12)) };
  });

  LAX_OPPONENTS.forEach((opp, i) => {
    const name = `${opp} lax ${i + 1}`;
    const tovR = [between(1, 5), between(1, 5), between(1, 5), between(1, 5)];
    const tovO = [between(1, 5), between(1, 5), between(1, 5), between(1, 5)];
    tabs.push({
      file: "Simulated lacrosse turnovers.xlsx",
      name,
      rows: [
        [null, "Q1", "Q2", "Q3", "Q4", "Total turnovers"],
        ["Roslyn", ...tovR, tovR.reduce((a, b) => a + b, 0)],
        [opp, ...tovO, tovO.reduce((a, b) => a + b, 0)],
      ],
    });
    const def = (lo: number, hi: number, rate: number) => {
      const p = between(lo, hi);
      const g = Math.round(p * (rate + rand() * 0.12));
      return [p, p - g, g];
    };
    const [mP, mN, mG] = def(14, 24, 0.18);
    const [zP, zN, zG] = def(5, 12, 0.22);
    const [fP, fN, fG] = def(3, 8, 0.38);
    tabs.push({
      file: "Simulated lacrosse defense.xlsx",
      name,
      rows: [
        ["Defensive Possession #", null, "Possession Result", null, "Efficiency", "Total Efficiency"],
        [null, null, "No Goal", "Goal", null, null],
        [mP, "M", mN, mG, null, null],
        [zP, "Z", zN, zG, null, null],
        [fP, "F", fN, fG, null, null],
      ],
    });
    const allowed = mG + zG + fG;
    scores[gameKey(name)] = { roslyn: Math.max(2, Math.round(allowed + 3 - tovR.reduce((a, b) => a + b, 0) * 0.4 + (rand() - 0.5) * 6)), opponent: allowed };
  });

  return { tabs, scores };
}
