import { describe, expect, it } from "vitest";
import { keptRanges, mergeLogs, planSegments } from "@/lib/client/segments";
import { attachEvents } from "@/lib/client/run";
import { decideGate, withinClearance } from "@/lib/gemini/gate";
import { clipRelativeShift, sanitizeEvents, sanitizeLog } from "@/lib/gemini/sanitize";
import { possessionPoints } from "@/lib/derive";
import { allowedNumbers, verifyList, verifyText } from "@/lib/season/verify";
import { SPORTS } from "@/lib/sports";
import { log, poss, shot } from "./helpers";

const bb = SPORTS.basketball;
const lax = SPORTS.lacrosse;
const watch = { start: 0, end: 600 };

describe("cleaning up what the AI sends back", () => {
  it("keeps a good possession as it is", () => {
    const l = sanitizeLog(
      { possessions: [{ team: "roslyn", quarter: "1", clockStart: "7:45", clockEnd: "7:20", videoStart: 10, videoEnd: 35, context: "Z", confidence: "high", note: null, events: [{ type: "shot", team: "roslyn", videoTime: 30, clock: "7:21", player: "23", points: 3, made: true, description: "Corner three." }] }], scoreboard: [{ videoTime: 5, quarter: "1", clock: "8:00", roslyn: 0, opponent: 0 }], warnings: [] },
      bb,
      watch,
    );
    expect(l.possessions).toHaveLength(1);
    expect(l.possessions[0].confidence).toBe("high");
    expect(possessionPoints(l.possessions[0])).toBe(3);
    expect(l.warnings).toEqual([]);
  });

  it("reads numbers sent as text and quarters written as Q2 / 2nd / OT", () => {
    const l = sanitizeLog({ possessions: [{ team: "opponent", quarter: "Q2", videoStart: "12.5", videoEnd: "20", context: "m", confidence: "medium", events: [] }, { team: "opponent", quarter: "OT", videoStart: 30, videoEnd: 40, context: "F", confidence: "high", events: [] }] }, bb, watch);
    expect(l.possessions[0]).toMatchObject({ quarter: "2", videoStart: 12.5, videoEnd: 20, context: "M" });
    expect(l.possessions[1].quarter).toBe("OT");
  });

  it("drops possessions with no team or no time, and says so", () => {
    const l = sanitizeLog({ possessions: [{ team: "us", videoStart: 1, videoEnd: 2, events: [] }, { team: "roslyn", events: [] }, "junk", null] }, bb, watch);
    expect(l.possessions).toHaveLength(0);
    expect(l.warnings.join(" ")).toMatch(/4 possessions .* left out/);
  });

  it("a basketball shot without a 1/2/3 scores nothing and marks the possession for review", () => {
    const l = sanitizeLog({ possessions: [{ team: "roslyn", quarter: "1", videoStart: 0, videoEnd: 9, confidence: "high", events: [{ type: "shot", team: "roslyn", videoTime: 5, points: 5, made: true }] }] }, bb, watch);
    expect(l.possessions[0].events[0].points).toBeNull();
    expect(possessionPoints(l.possessions[0])).toBe(0);
    expect(l.possessions[0].confidence).toBe("low");
  });

  it("a lacrosse goal that arrives without its point is still worth 1", () => {
    const l = sanitizeLog({ possessions: [{ team: "roslyn", quarter: "1", videoStart: 0, videoEnd: 9, confidence: "high", events: [{ type: "shot", team: "roslyn", videoTime: 5, points: null, made: true }] }] }, lax, watch);
    expect(possessionPoints(l.possessions[0])).toBe(1);
    expect(l.possessions[0].confidence).toBe("high");
  });

  it("unknown values become null, never a guess", () => {
    const l = sanitizeLog({ possessions: [{ team: "roslyn", quarter: "7", clockStart: "noon", videoStart: 0, videoEnd: 9, context: "press", confidence: "sure", events: [{ type: "shot", team: "roslyn", videoTime: 5, points: 2, made: "maybe", player: "Jaylen" }] }] }, bb, watch);
    const p = l.possessions[0];
    expect(p).toMatchObject({ quarter: null, clockStart: null, context: null, confidence: "low" });
    expect(p.events[0]).toMatchObject({ made: null, player: null });
  });

  it("never keeps a name in a jersey field", () => {
    const l = sanitizeLog({ possessions: [{ team: "roslyn", quarter: "1", videoStart: 0, videoEnd: 9, confidence: "high", events: [{ type: "substitution", team: "roslyn", videoTime: 5, playerIn: "#12", playerOut: "Sam" }] }] }, bb, watch);
    expect(l.possessions[0].events[0]).toMatchObject({ playerIn: "12", playerOut: null });
  });

  it("a scoreboard reading with only one team's score is not used", () => {
    const l = sanitizeLog({ scoreboard: [{ videoTime: 10, quarter: "1", roslyn: 4, opponent: null }, { videoTime: "x" }] }, bb, watch);
    expect(l.scoreboard).toEqual([{ videoTime: 10, quarter: "1", clock: null, roslyn: null, opponent: null }]);
  });

  it("moves times back when a section's times were counted from the start of that section", () => {
    const section = { start: 1200, end: 1950 };
    const raw = { possessions: [0, 40, 80, 300].map((t) => ({ team: "roslyn", quarter: "2", videoStart: t, videoEnd: t + 20, confidence: "high", events: [{ type: "shot", team: "roslyn", videoTime: t + 10, points: 2, made: true }] })) };
    const l = sanitizeLog(raw, bb, section);
    expect(l.possessions.map((p) => p.videoStart)).toEqual([1200, 1240, 1280, 1500]);
    expect(l.possessions[0].events[0].videoTime).toBe(1210);
    expect(l.warnings.join(" ")).toMatch(/moved to match the full video/);
  });

  it("leaves correct full-video times alone", () => {
    expect(clipRelativeShift([1210, 1300, 1500, 1900], { start: 1200, end: 1950 })).toBe(0);
    expect(clipRelativeShift([10, 40, 90], { start: 0, end: 750 })).toBe(0);
  });

  it("later-pass events: unreadable ones are counted, good ones keep their possession number", () => {
    const r = sanitizeEvents([{ type: "steal", team: "opponent", videoTime: 12, possession: 0 }, { type: "dunk", team: "roslyn", videoTime: 3 }, { type: "foul", team: "roslyn" }], bb, watch);
    expect(r.dropped).toBe(2);
    expect(r.events).toHaveLength(1);
    expect(r.events[0].possession).toBe(0);
  });

  it("attaches later-pass events by number, else by time, else drops them with a warning", () => {
    const ps = [poss("roslyn", 0, 10, []), poss("opponent", 10, 20, [])];
    const warnings: string[] = [];
    attachEvents(ps, [{ type: "steal", team: "opponent", videoTime: 5, clock: null, player: null, description: "", possession: 0 }, { type: "foul", team: "roslyn", videoTime: 15, clock: null, player: null, description: "", possession: 9 }, { type: "foul", team: "roslyn", videoTime: 500, clock: null, player: null, description: "" }], warnings);
    expect(ps[0].events).toHaveLength(1);
    expect(ps[1].events).toHaveLength(1);
    expect(warnings[0]).toMatch(/1 event couldn't be matched/);
  });
});

describe("splitting and merging long games", () => {
  it("skipped breaks are cut out of the game", () => {
    expect(keptRanges({ start: 0, end: 3000 }, [{ start: 1400, end: 2000 }])).toEqual([
      { start: 0, end: 1400 },
      { start: 2000, end: 3000 },
    ]);
  });

  it("segments cover the whole game and overlap by 30 s", () => {
    const segs = planSegments([{ start: 0, end: 2880 }]);
    expect(segs.length).toBe(4);
    expect(segs[0].core.start).toBe(0);
    expect(segs.at(-1)!.core.end).toBe(2880);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].core.start).toBe(segs[i - 1].core.end);
      expect(segs[i].watch.start).toBe(segs[i].core.start - 30);
    }
  });

  it("a possession seen by two overlapping segments is kept once", () => {
    const segs = planSegments([{ start: 0, end: 1440 }]);
    const edge = segs[0].core.end;
    const dup = poss("roslyn", edge + 5, edge + 15, [shot("roslyn", edge + 10, 2, true)], { quarter: "2", clockStart: "7:00" });
    const merged = mergeLogs([
      { segment: segs[0], log: log([poss("roslyn", 10, 20, []), { ...dup, events: [...dup.events] }]) },
      { segment: segs[1], log: log([dup]) },
    ]);
    expect(merged.possessions).toHaveLength(2);
  });
});

describe("Roslyn-game check", () => {
  const good = { sportSeen: "basketball", isOrganizedGame: true, roslynSeen: true, roslynEvidence: "ROSLYN on the scoreboard", reason: "" };
  it("passes only with the sport, a real game, and Roslyn named in the evidence", () => {
    expect(decideGate(bb, good).pass).toBe(true);
    expect(decideGate(bb, { ...good, sportSeen: "lacrosse" }).pass).toBe(false);
    expect(decideGate(bb, { ...good, isOrganizedGame: false }).pass).toBe(false);
    expect(decideGate(bb, { ...good, roslynEvidence: "blue jerseys" }).pass).toBe(false);
    expect(decideGate(bb, { ...good, roslynSeen: "yes" }).pass).toBe(false);
    expect(decideGate(bb, null).pass).toBe(false);
  });
  it("a pass only covers the file, sport and time range it was issued for", () => {
    const c = { t: "clear" as const, uri: "u", sport: "basketball", start: 100, end: 2000 };
    expect(withinClearance(c, "u", "basketball", 100, 2000)).toBe(true);
    expect(withinClearance(c, "other", "basketball", 100, 2000)).toBe(false);
    expect(withinClearance(c, "u", "lacrosse", 100, 2000)).toBe(false);
    expect(withinClearance(c, "u", "basketball", 0, 2000)).toBe(false);
  });
});

describe("AI text may only quote numbers the code computed (rule 8)", () => {
  const allowed = allowedNumbers({ points: 54, turnovers: 12, share: 0.62, r: 0.71 });
  it("keeps sentences whose numbers are in the data", () => {
    expect(verifyText("Roslyn scored 54 points with 12 turnovers. 62% came in the paint.", allowed).removed).toEqual([]);
  });
  it("removes a sentence with a number that isn't in the data", () => {
    const v = verifyText("Roslyn scored 54 points. The opponent had 19 steals.", allowed);
    expect(v.text).toBe("Roslyn scored 54 points.");
    expect(v.removed).toHaveLength(1);
  });
  it("catches numbers written as words", () => {
    expect(verifyText("Roslyn had twelve turnovers.", allowed).removed).toEqual([]);
    expect(verifyText("Roslyn had fifteen turnovers.", allowed).removed).toHaveLength(1);
    expect(verifyText("Roslyn had three turnovers.", allowed).removed).toHaveLength(1);
    expect(verifyText("Roslyn had fifty-four points.", allowed).removed).toEqual([]);
  });
  it("basketball words like 3-pointers, Q3 and three-pointers are not data", () => {
    expect(verifyText("Roslyn went with more 3-pointers in Q3 and more three-pointers in the 4th.", allowed).removed).toEqual([]);
  });
  it("a correlation is never quoted as a percent", () => {
    expect(verifyList(["Shooting went with winning (71%)."], allowed).removed).toHaveLength(1);
  });
});
