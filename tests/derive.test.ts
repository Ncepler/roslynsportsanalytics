import { describe, expect, it } from "vitest";
import {
  defenseByContext,
  fastBreakPoints,
  flaggedQuarters,
  foulsByQuarter,
  percentages,
  pointsOffTurnovers,
  possessionPoints,
  scoreboardCheck,
  scoreByQuarter,
  secondChancePoints,
  statLine,
  summaryByContext,
  turnoversByQuarter,
} from "@/lib/derive";
import { plusMinus } from "@/lib/derive/plus-minus";
import type { Context, Possession } from "@/lib/gemini/log-types";
import { board, ev, log, poss, shot } from "./helpers";

/** n possessions in one context scoring `points` in total, as 2s then a 1 if odd. */
function block(context: Context, n: number, points: number, startAt: number): Possession[] {
  const out: Possession[] = [];
  let left = points;
  for (let i = 0; i < n; i++) {
    const t = startAt + i * 10;
    const events = [];
    if (left >= 2) {
      events.push(shot("roslyn", t + 1, 2, true));
      left -= 2;
    } else if (left === 1) {
      events.push(shot("roslyn", t + 1, 1, true));
      left -= 1;
    } else events.push(shot("roslyn", t + 1, 2, false));
    out.push(poss("roslyn", t, t + 9, events, { context }));
  }
  if (left !== 0) throw new Error("fixture can't fit the points");
  return out;
}

describe("club formulas (CLAUDE.md section 10)", () => {
  it("points = 2 x 2PT made + 3 x 3PT made + FT made, misses count 0", () => {
    const p = poss("roslyn", 0, 10, [shot("roslyn", 1, 2, true), shot("roslyn", 2, 3, true), shot("roslyn", 3, 1, true), shot("roslyn", 4, 3, false), shot("roslyn", 5, 1, false)]);
    expect(possessionPoints(p)).toBe(6);
    const line = statLine([p]);
    expect(line.points).toBe(6);
    expect(line.fg2).toEqual({ att: 1, made: 1 });
    expect(line.fg3).toEqual({ att: 2, made: 1 });
    expect(line.ft).toEqual({ att: 2, made: 1 });
  });

  it("a shot with unknown make or unknown value scores nothing (never a guess)", () => {
    const p = poss("roslyn", 0, 10, [shot("roslyn", 1, 2, true, { made: null }), shot("roslyn", 2, 2, true, { points: null })]);
    expect(possessionPoints(p)).toBe(0);
  });

  it("a shot logged for the defending team doesn't count for the team with the ball", () => {
    expect(possessionPoints(poss("roslyn", 0, 10, [shot("opponent", 1, 2, true)]))).toBe(0);
  });

  it("matches the sample sheet: 39 + 20 + 10 = 69 points on 38 + 20 + 14 = 72 possessions, efficiency 95.8333", () => {
    const l = log([...block("M", 38, 39, 0), ...block("Z", 20, 20, 1000), ...block("F", 14, 10, 2000)]);
    const s = summaryByContext(l, "roslyn");
    expect(s.rows.map((r) => [r.context, r.line.possessions, r.line.points])).toEqual([
      ["M", 38, 39],
      ["Z", 20, 20],
      ["F", 14, 10],
    ]);
    expect(s.total.points).toBe(69);
    expect(s.total.possessions).toBe(72);
    expect(s.total.efficiency).toBeCloseTo(95.8333, 4);
  });

  it("efficiency is null, not 0, with no possessions", () => {
    expect(statLine([]).efficiency).toBeNull();
    expect(percentages(statLine([])).fgPct).toBeNull();
  });

  it("percentages: FG%, 3P%, FT%, eFG%", () => {
    const p = poss("roslyn", 0, 10, [shot("roslyn", 1, 2, true), shot("roslyn", 2, 3, true), shot("roslyn", 3, 3, false), shot("roslyn", 4, 2, false), shot("roslyn", 5, 1, true)]);
    const pc = percentages(statLine([p]));
    expect(pc.fgPct).toBe(0.5);
    expect(pc.fg3Pct).toBe(0.5);
    expect(pc.ftPct).toBe(1);
    expect(pc.efgPct).toBeCloseTo((2 + 0.5) / 4);
  });
});

describe("by quarter", () => {
  const l = log([
    poss("roslyn", 0, 10, [shot("roslyn", 1, 2, true), ev("turnover", "roslyn", 5), ev("foul", "opponent", 6)], { quarter: "1" }),
    poss("opponent", 10, 20, [shot("opponent", 11, 3, true)], { quarter: "1" }),
    poss("roslyn", 20, 30, [shot("roslyn", 21, 2, true)], { quarter: "2" }),
  ]);
  it("score by quarter", () => {
    expect(scoreByQuarter(l)).toEqual({ "1": { roslyn: 2, opponent: 3 }, "2": { roslyn: 2, opponent: 0 } });
  });
  it("turnovers go to the team with the ball, fouls to the team that committed them", () => {
    expect(turnoversByQuarter(l)["1"]).toEqual({ roslyn: 1, opponent: 0 });
    expect(foulsByQuarter(l)["1"]).toEqual({ roslyn: 0, opponent: 1 });
  });
});

describe("points by source", () => {
  it("second-chance points only count after the offensive rebound", () => {
    const p = poss("roslyn", 0, 20, [shot("roslyn", 1, 2, false), ev("rebound", "roslyn", 2, { reboundType: "offensive" }), shot("roslyn", 3, 2, true)]);
    const before = poss("roslyn", 30, 40, [shot("roslyn", 31, 3, true), ev("rebound", "roslyn", 35, { reboundType: "offensive" })]);
    expect(secondChancePoints(log([p, before]), "roslyn")).toBe(2);
  });
  it("points off turnovers: the possession right after the other team's turnover", () => {
    const l = log([poss("opponent", 0, 10, [ev("turnover", "opponent", 5)]), poss("roslyn", 10, 20, [shot("roslyn", 12, 2, true)]), poss("roslyn", 20, 30, [shot("roslyn", 22, 2, true)])]);
    expect(pointsOffTurnovers(l, "roslyn")).toBe(2);
  });
  it("fast-break points = points on F possessions", () => {
    const l = log([poss("roslyn", 0, 10, [shot("roslyn", 1, 2, true)], { context: "F" }), poss("roslyn", 10, 20, [shot("roslyn", 11, 3, true)], { context: "M" })]);
    expect(fastBreakPoints(l, "roslyn")).toBe(2);
  });
});

describe("scoreboard check (the main accuracy safeguard)", () => {
  const plays = [poss("roslyn", 10, 20, [shot("roslyn", 15, 2, true)]), poss("opponent", 20, 30, [shot("opponent", 25, 3, true)])];
  it("passes when the logged points match the scoreboard change", () => {
    const checks = scoreboardCheck(log(plays, [board(0, 10, 10), board(40, 12, 13)]));
    expect(checks).toHaveLength(1);
    expect(checks[0].ok).toBe(true);
    expect(flaggedQuarters(checks)).toEqual([]);
  });
  it("flags the quarter when a basket is missing from the log", () => {
    const checks = scoreboardCheck(log(plays, [board(0, 10, 10), board(40, 14, 13)]));
    expect(checks[0].ok).toBe(false);
    expect(flaggedQuarters(checks)).toEqual(["1"]);
  });
  it("does not flag a quarter when a reading just landed on the wrong side of a basket (it nets out)", () => {
    // Board at 14 says 0-0 (the basket at 15 is not on it yet), board at 16 says 2-0... but the reading at 14 was
    // taken a second late and already shows 2-0. Stretch 1 is +2 off, stretch 2 is -2 off, the quarter is right.
    const checks = scoreboardCheck(log(plays, [board(0, 10, 10), board(14, 12, 10), board(40, 12, 13)]));
    expect(checks.some((c) => !c.ok)).toBe(true);
    expect(flaggedQuarters(checks)).toEqual([]);
  });
  it("ignores half-read scoreboards", () => {
    const l = log(plays, [board(0, 10, 10), { videoTime: 30, quarter: "1", clock: null, roslyn: null, opponent: 11 }, board(40, 12, 13)]);
    expect(scoreboardCheck(l)).toHaveLength(1);
  });
});

describe("lacrosse defense by M / Z / F", () => {
  it("counts the other team's possessions by the defense Roslyn played", () => {
    const l = log([
      poss("opponent", 0, 10, [shot("opponent", 5, 1, true)], { context: "M" }),
      poss("opponent", 10, 20, [shot("opponent", 15, 1, false)], { context: "M" }),
      poss("opponent", 20, 30, [], { context: "Z" }),
      poss("roslyn", 30, 40, [shot("roslyn", 35, 1, true)], { context: "F" }),
    ]);
    const d = defenseByContext(l, "roslyn");
    expect(d.rows.find((r) => r.context === "M")).toEqual({ context: "M", possessions: 2, goals: 1, noGoals: 1 });
    expect(d.rows.find((r) => r.context === "Z")).toEqual({ context: "Z", possessions: 1, goals: 0, noGoals: 1 });
    expect(d.total.possessions).toBe(3);
  });
});

describe("plus/minus", () => {
  it("credits points to whoever is on the court and Total = sum of quarters", () => {
    const l = log([
      poss("roslyn", 0, 10, [shot("roslyn", 5, 2, true)], { quarter: "1" }),
      poss("opponent", 10, 20, [ev("substitution", "roslyn", 11, { playerOut: "5", playerIn: "12" }), shot("opponent", 15, 3, true)], { quarter: "1" }),
      poss("roslyn", 20, 30, [shot("roslyn", 25, 2, true)], { quarter: "2" }),
    ]);
    const { rows, hadOT } = plusMinus(l, ["5", "10", "11", "13", "14"]);
    const five = rows.find((r) => r.number === "5")!;
    const ten = rows.find((r) => r.number === "10")!;
    expect(five.total).toBe(2);
    expect(ten.byPeriod["1"]).toBe(-1);
    expect(ten.byPeriod["2"]).toBe(2);
    expect(ten.total).toBe(1);
    expect(hadOT).toBe(false);
    expect(ten.byPeriod.OT).toBeNull();
  });
});
