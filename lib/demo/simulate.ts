// SIMULATION ONLY (the /test page). Generates a random but internally
// consistent basketball game so the whole flow can be shown without Gemini.
// Never used by the real Analyze page. Jersey numbers only, no names.

import type { Range } from "@/lib/client/segments";
import type { Context, LogEvent, Possession, PossessionLog, ScoreboardReading, Team } from "@/lib/gemini/log-types";
import type { GameSetup } from "@/lib/gemini/prompt";

/** Small seeded PRNG so a given setup always produces the same game. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFAULT_ROSLYN = ["3", "5", "11", "14", "23"];
const DEFAULT_AWAY = ["1", "4", "10", "22", "32"];

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

const roster = (text: string, fallback: string[]) => {
  const nums = text.split(/[^0-9]+/).filter(Boolean);
  return nums.length >= 3 ? nums : fallback;
};

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const QUARTER_SECONDS = 8 * 60;

export type SimulatedGame = { possessions: Possession[]; scoreboard: ScoreboardReading[]; warnings: string[] };

function simulateBasketball(ranges: Range[], setup: GameSetup): SimulatedGame {
  const rand = mulberry32(hash(JSON.stringify(ranges.map((r) => [Math.round(r.start), Math.round(r.end)])) + setup.awayName + setup.roslynColor));
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
  const chance = (p: number) => rand() < p;

  const players: Record<Team, string[]> = {
    roslyn: roster(setup.roslynRoster, DEFAULT_ROSLYN),
    opponent: roster(setup.awayRoster, DEFAULT_AWAY),
  };
  const other = (t: Team): Team => (t === "roslyn" ? "opponent" : "roslyn");

  // Map kept video time onto four quarters of game time.
  const kept = ranges.reduce((s, r) => s + (r.end - r.start), 0);
  const quarterAt = (elapsed: number) => String(Math.min(4, Math.floor((elapsed / kept) * 4) + 1));
  const clockAt = (elapsed: number) => {
    const perQuarter = kept / 4;
    const into = elapsed % perQuarter;
    return fmtClock(QUARTER_SECONDS * (1 - into / perQuarter));
  };

  const possessions: Possession[] = [];
  const scoreboard: ScoreboardReading[] = [];
  const score: Record<Team, number> = { roslyn: 0, opponent: 0 };
  let team: Team = "roslyn";
  let elapsed = 0;
  let lastReading = -999;
  let lastQuarter = "1";

  for (const r of ranges) {
    let t = r.start + 2;
    while (t < r.end - 6) {
      const quarter = quarterAt(elapsed);
      if (quarter !== lastQuarter) {
        scoreboard.push({ videoTime: Math.max(r.start, t - 1), quarter: lastQuarter, clock: "0:00", roslyn: score.roslyn, opponent: score.opponent });
        lastQuarter = quarter;
      }
      const context: Context | null = chance(0.04) ? null : pick<Context>(["M", "M", "M", "M", "M", "Z", "Z", "Z", "F", "F"]);
      const length = context === "F" ? 4 + rand() * 4 : 9 + rand() * 15;
      const start = t;
      const end = Math.min(r.end - 1, t + length);
      const at = (frac: number) => Math.round((start + (end - start) * frac) * 10) / 10;
      const ev = (type: LogEvent["type"], who: Team, frac: number, extra: Partial<LogEvent> = {}): LogEvent => ({
        type,
        team: who,
        videoTime: at(frac),
        clock: clockAt(elapsed + (end - start) * frac),
        player: chance(0.12) ? null : pick(players[who]),
        description: "",
        ...extra,
      });
      const def = other(team);
      const events: LogEvent[] = [];

      const shot = (frac: number, made: boolean, forceThree?: boolean) => {
        const three = forceThree ?? chance(0.3);
        const zone = three ? pick(["corner 3", "above-the-break 3"]) : pick(["paint", "paint", "mid-range"]);
        const e = ev("shot", team, frac, {
          points: three ? 3 : 2,
          made,
          shotType: three ? pick(["catch-and-shoot", "pull-up"]) : pick(["drive", "pull-up", "post", "catch-and-shoot"]),
          shotZone: zone,
        });
        e.description = `${made ? "Makes" : "Misses"} a ${three ? "three" : "two"} from the ${zone}${e.player ? ` (#${e.player})` : ""}.`;
        events.push(e);
        if (made) {
          score[team] += three ? 3 : 2;
          if (chance(0.55)) events.push({ ...ev("assist", team, frac - 0.05), description: "Pass leads directly to the basket." });
        }
        return made;
      };

      const roll = rand();
      if (roll < 0.43) {
        shot(0.85, true);
      } else if (roll < 0.66) {
        shot(0.8, false);
        if (chance(0.1)) events.push({ ...ev("block", def, 0.8), description: "Shot blocked at the rim." });
        events.push({ ...ev("rebound", def, 0.92, { reboundType: "defensive" }), description: "Defensive rebound." });
      } else if (roll < 0.73) {
        shot(0.55, false);
        events.push({ ...ev("rebound", team, 0.65, { reboundType: "offensive" }), description: "Offensive rebound, kept alive." });
        if (!shot(0.9, chance(0.6), false)) {
          events.push({ ...ev("rebound", def, 0.97, { reboundType: "defensive" }), description: "Defensive rebound." });
        }
      } else if (roll < 0.9) {
        const type = pick(["steal", "bad pass", "travel", "out of bounds", "offensive foul"]);
        events.push({ ...ev("turnover", team, 0.7, { turnoverType: type }), description: `Turnover: ${type}.` });
        if (type === "steal") events.push({ ...ev("steal", def, 0.7), description: "Ball stolen." });
        if (type === "offensive foul") events.push({ ...ev("foul", team, 0.7), description: "Offensive foul called." });
      } else {
        events.push({ ...ev("foul", def, 0.6), description: "Shooting foul." });
        for (const frac of [0.8, 0.9]) {
          const made = chance(0.7);
          events.push({ ...ev("shot", team, frac, { points: 1, made }), description: made ? "Free throw good." : "Free throw missed." });
          if (made) score[team] += 1;
        }
        // A missed last free throw is rebounded by the defense here.
        if (events[events.length - 1].made === false) {
          events.push({ ...ev("rebound", def, 0.97, { reboundType: "defensive" }), description: "Defensive rebound off the free throw." });
        }
      }

      const lowConfidence = chance(0.07);
      possessions.push({
        team,
        quarter,
        clockStart: clockAt(elapsed),
        clockEnd: clockAt(elapsed + (end - start)),
        videoStart: Math.round(start * 10) / 10,
        videoEnd: Math.round(end * 10) / 10,
        context,
        events,
        confidence: lowConfidence ? "low" : chance(0.15) ? "medium" : "high",
        note: lowConfidence ? "Players blocked the view of the ball for part of this possession." : null,
      });

      if (end - lastReading > 150) {
        scoreboard.push({ videoTime: Math.round((end + 1) * 10) / 10, quarter, clock: clockAt(elapsed + (end - start) + 1), roslyn: score.roslyn, opponent: score.opponent });
        lastReading = end;
      }

      elapsed += end - start + 2 + rand() * 3;
      t = end + 2 + rand() * 3;
      // An offensive rebound stays in the same possession, so the ball always changes hands here.
      team = def;
    }
  }
  scoreboard.push({ videoTime: ranges[ranges.length - 1].end - 1, quarter: lastQuarter, clock: "0:00", roslyn: score.roslyn, opponent: score.opponent });

  // Plant one AI-style miss so the scoreboard check has something to catch:
  // drop a made two in the third quarter from the log (the scoreboard still has it).
  const warnings = ["The scoreboard was partly hidden by a player for about 20 seconds in the second quarter."];
  const q3 = plantTarget(possessions, (e) => e.type === "shot" && e.points === 2 && e.made === true);
  if (q3) {
    const idx = q3.events.findIndex((e) => e.type === "shot" && e.points === 2 && e.made);
    q3.events.splice(idx, 1);
    q3.events = q3.events.filter((e) => e.type !== "assist");
  }


  return { possessions, scoreboard, warnings };
}

/** The part of the game a segment's request would have "seen". */
export function sliceForSegment(game: SimulatedGame, watch: Range): PossessionLog {
  return {
    possessions: game.possessions.filter((p) => p.videoStart >= watch.start && p.videoStart < watch.end),
    scoreboard: game.scoreboard.filter((r) => r.videoTime >= watch.start && r.videoTime <= watch.end),
    warnings: game.warnings,
  };
}

/**
 * The possession that loses a scoring event for the planted mistake: the third
 * quarter if it has one, otherwise the latest quarter that does.
 */
function plantTarget(possessions: Possession[], isScore: (e: LogEvent) => boolean): Possession | undefined {
  const scoring = possessions.filter((p) => p.events.some(isScore));
  return scoring.find((p) => p.quarter === "3") ?? scoring[scoring.length - 1];
}

export function simulateGame(ranges: Range[], setup: GameSetup): SimulatedGame {
  return setup.sportId === "lacrosse" ? simulateLacrosse(ranges, setup) : simulateBasketball(ranges, setup);
}

const DEFAULT_LAX_ROSLYN = ["2", "4", "7", "9", "12", "15", "18", "21", "24", "30"];
const DEFAULT_LAX_AWAY = ["1", "3", "5", "8", "11", "14", "17", "20", "22", "33"];

/** Lacrosse: 12-minute quarters, goals worth 1, possessions end on a goal, a save/miss recovered by the defense, or a turnover. */
function simulateLacrosse(ranges: Range[], setup: GameSetup): SimulatedGame {
  const rand = mulberry32(hash("lax" + JSON.stringify(ranges.map((r) => [Math.round(r.start), Math.round(r.end)])) + setup.awayName + setup.roslynColor));
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
  const chance = (p: number) => rand() < p;
  const players: Record<Team, string[]> = {
    roslyn: roster(setup.roslynRoster, DEFAULT_LAX_ROSLYN),
    opponent: roster(setup.awayRoster, DEFAULT_LAX_AWAY),
  };
  const kept = ranges.reduce((s, r) => s + (r.end - r.start), 0);
  const quarterAt = (elapsed: number) => String(Math.min(4, Math.floor((elapsed / kept) * 4) + 1));
  const clockAt = (elapsed: number) => {
    const per = kept / 4;
    return fmtClock(12 * 60 * (1 - (elapsed % per) / per));
  };

  const possessions: Possession[] = [];
  const scoreboard: ScoreboardReading[] = [];
  const score: Record<Team, number> = { roslyn: 0, opponent: 0 };
  let team: Team = chance(0.5) ? "roslyn" : "opponent";
  let elapsed = 0;
  let lastReading = -999;
  let lastQuarter = "1";

  for (const r of ranges) {
    let t = r.start + 3;
    while (t < r.end - 10) {
      const quarter = quarterAt(elapsed);
      if (quarter !== lastQuarter) {
        scoreboard.push({ videoTime: Math.max(r.start, t - 1), quarter: lastQuarter, clock: "0:00", roslyn: score.roslyn, opponent: score.opponent });
        lastQuarter = quarter;
      }
      const context: Context | null = chance(0.06) ? null : pick<Context>(["M", "M", "M", "M", "M", "M", "Z", "Z", "F", "F"]);
      const length = context === "F" ? 5 + rand() * 5 : 14 + rand() * 26;
      const start = t;
      const end = Math.min(r.end - 1, t + length);
      const def: Team = team === "roslyn" ? "opponent" : "roslyn";
      const at = (frac: number) => Math.round((start + (end - start) * frac) * 10) / 10;
      const ev = (type: LogEvent["type"], who: Team, frac: number, extra: Partial<LogEvent> = {}): LogEvent => ({
        type,
        team: who,
        videoTime: at(frac),
        clock: clockAt(elapsed + (end - start) * frac),
        player: chance(0.3) ? null : pick(players[who]),
        description: "",
        ...extra,
      });
      const events: LogEvent[] = [];
      const roll = rand();
      if (roll < 0.33) {
        events.push({ ...ev("shot", team, 0.9, { points: 1, made: true }), description: "Shot finds the back of the net." });
        score[team] += 1;
      } else if (roll < 0.62) {
        if (chance(0.3)) events.push({ ...ev("shot", team, 0.5, { points: 1, made: false }), description: "Shot wide, backed up by the attack." });
        events.push({ ...ev("shot", team, 0.9, { points: 1, made: false }), description: chance(0.5) ? "Shot saved, goalie clears." : "Shot misses, defense picks up the ground ball." });
      } else {
        const type = pick(["interception", "ground ball lost", "out of bounds", "failed clear", "penalty"]);
        events.push({ ...ev("turnover", team, 0.7, { turnoverType: type }), description: `Turnover: ${type}. Play moves to the other end.` });
      }
      const low = chance(0.12);
      possessions.push({
        team,
        quarter,
        clockStart: clockAt(elapsed),
        clockEnd: clockAt(elapsed + (end - start)),
        videoStart: Math.round(start * 10) / 10,
        videoEnd: Math.round(end * 10) / 10,
        context,
        events,
        confidence: low ? "low" : chance(0.2) ? "medium" : "high",
        note: low ? "Ball hard to see while the camera panned across the field." : null,
      });
      if (end - lastReading > 180) {
        scoreboard.push({ videoTime: Math.round((end + 1) * 10) / 10, quarter, clock: clockAt(elapsed + (end - start) + 1), roslyn: score.roslyn, opponent: score.opponent });
        lastReading = end;
      }
      elapsed += end - start + 3 + rand() * 4;
      t = end + 3 + rand() * 4;
      team = def;
    }
  }
  scoreboard.push({ videoTime: ranges[ranges.length - 1].end - 1, quarter: lastQuarter, clock: "0:00", roslyn: score.roslyn, opponent: score.opponent });

  // Planted miss for the scoreboard check: drop one third-quarter goal from the log.
  const q3 = plantTarget(possessions, (e) => e.type === "shot" && e.made === true);
  if (q3) q3.events = q3.events.filter((e) => !(e.type === "shot" && e.made));

  return { possessions, scoreboard, warnings: ["The ball was hard to follow on long clears; a few turnovers were judged by play moving to the other end."] };
}

const FEATURES = [
  "headband",
  "long sleeves under the jersey",
  "black arm sleeve",
  "bright orange shoes",
  "white shoes",
  "tallest on the team",
  "shortest on the team",
  "knee brace",
  "taped fingers",
  "socks pulled high",
  "goggles",
  "different-colored helmet stripe",
];

/** Sample appearance notes (what the notes pass would show): one line per player on the field or court, per team. */
export function appearanceNotes(setup: GameSetup): string {
  const lax = setup.sportId === "lacrosse";
  const n = lax ? 10 : 5;
  const r = roster(setup.roslynRoster, lax ? DEFAULT_LAX_ROSLYN : DEFAULT_ROSLYN);
  const a = roster(setup.awayRoster, lax ? DEFAULT_LAX_AWAY : DEFAULT_AWAY);
  const rand = mulberry32(hash(setup.awayName + setup.sportId));
  const feature = () => FEATURES[Math.floor(rand() * FEATURES.length)];
  const posLax = ["goalie", "defense", "defense", "defense", "midfield", "midfield", "midfield", "attack", "attack", "attack"];
  const posBb = ["usually brings the ball up", "plays on the wing", "plays on the wing", "plays near the basket", "plays near the basket"];
  const line = (team: string, color: string, num: string | undefined, i: number) =>
    num === undefined || (i === n - 1 && rand() < 0.5)
      ? `${team}: one player's number (${feature()}) was never readable.`
      : `${team} #${num}: ${color} jersey, ${feature()}, ${lax ? posLax[i] : posBb[i]}.`;
  const away = setup.awayName || "Opponent";
  return [
    ...Array.from({ length: n }, (_, i) => line("Roslyn", setup.roslynColor || "home", r[i], i)),
    ...Array.from({ length: n }, (_, i) => line(away, setup.awayColor || "away", a[i], i)),
  ].join("\n");
}
