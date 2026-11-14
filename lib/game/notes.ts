// Per-game strategy notes (Noah, Nov 14). Code computes every number (lib/derive/game-stats.ts); Gemini only turns those
// numbers into short analytical notes. The reply is checked against the input numbers (lib/season/verify.ts) before
// anyone sees it, so the AI can never introduce a figure (CLAUDE.md section 3, rule 8).

import { scoreStrip, pointSources, teamCompare, type PointSource } from "@/lib/derive/game-stats";
import type { PossessionLog } from "@/lib/gemini/log-types";
import { getSport } from "@/lib/sports";

export type GameNotesInput = {
  sport: string;
  sportLabel: string;
  periodName: string;
  opponent: string;
  score: { roslyn: number; opponent: number };
  byPeriod: { period: string; roslyn: number; opponent: number }[];
  /** Head-to-head team stats. "percent" rows are whole numbers (65 means 65%). */
  compare: { label: string; roslyn: number | null; opponent: number | null; unit: "count" | "percent" }[];
  /** Where each team's points came from (basketball) or goals came from (lacrosse, hockey). Small samples are already left out. */
  sources: { roslyn: { totalPoints: number; items: { label: string; points: number; sharePercent: number }[] }; opponent: { totalPoints: number; items: { label: string; points: number; sharePercent: number }[] } };
};

export type GameNotesOutput = { worked: string[]; opponent_better: string[]; takeaways: string[] };

const items = (sources: PointSource[]) => sources.map((s) => ({ label: s.label, points: s.points, sharePercent: Math.round(s.share * 100) }));

/** Everything the notes may quote, computed from the reviewed log. Null when there is nothing worth writing about. */
export function buildNotesInput(log: PossessionLog, sportId: string, statIds: string[], opponent: string): GameNotesInput | null {
  const sport = getSport(sportId);
  if (!sport) return null;
  const strip = scoreStrip(log);
  const compare = teamCompare(log, sportId, statIds).map((r) => ({
    label: r.label,
    roslyn: r.roslyn === null ? null : r.format === "pct" ? Math.round(r.roslyn * 100) : r.roslyn,
    opponent: r.opponent === null ? null : r.format === "pct" ? Math.round(r.opponent * 100) : r.opponent,
    unit: r.format === "pct" ? ("percent" as const) : ("count" as const),
  }));
  const roslyn = pointSources(log, "roslyn", sportId);
  const opp = pointSources(log, "opponent", sportId);
  if (compare.length === 0 && roslyn.sources.length === 0 && opp.sources.length === 0) return null;
  return {
    sport: sportId,
    sportLabel: sport.label,
    periodName: sport.periodName ?? "Quarter",
    opponent,
    score: strip.total,
    byPeriod: strip.periods.map((p) => ({ period: p, roslyn: strip.byPeriod[p].roslyn, opponent: strip.byPeriod[p].opponent })),
    compare,
    sources: { roslyn: { totalPoints: roslyn.totalPoints, items: items(roslyn.sources) }, opponent: { totalPoints: opp.totalPoints, items: items(opp.sources) } },
  };
}

export const NOTES_SCHEMA = {
  type: "object",
  properties: {
    worked: { type: "array", items: { type: "string" }, description: "2 to 4 notes on what Roslyn did that went with its best scoring in this game." },
    opponent_better: { type: "array", items: { type: "string" }, description: "2 to 4 notes on where the opponent was more effective than Roslyn in this game." },
    takeaways: { type: "array", items: { type: "string" }, description: "2 to 4 impersonal conditional statements: when a pattern shows up, what it means for the matchup." },
  },
  required: ["worked", "opponent_better", "takeaways"],
  additionalProperties: false,
};

export function notesPrompt(input: GameNotesInput): string {
  return [
    `You are writing the analytical notes section of a stats report for one ${input.sportLabel.toLowerCase()} game, Roslyn vs. ${input.opponent}, for a high school sports analytics club. The app's code already computed every number below.`,
    "",
    "Tone and voice:",
    '- Purely analytical. Third person only: write "Roslyn" and "' + input.opponent + '". Never use "I", "we", "you" or "our". No opinions, praise, blame, jokes or insults.',
    "- Plain, neutral wording a coach could read aloud. Short sentences.",
    '- Describe what the numbers show, in the form "When ..., ..." or "X accounted for N% of Y". Takeaways are impersonal conditionals, for example "When the opponent scores from a given source, limiting that source reduces its share of points."',
    '- Say "went with" or "accounted for", never "caused" or "because of". Patterns in one game are descriptive, not proof.',
    "",
    "Number rules:",
    "- Quote only numbers that appear in the data below. Do not add, subtract, average, round differently, or estimate anything new. If you want a number that is not there, leave it out.",
    "- For turnovers and fouls, a lower number is better; do not describe a higher count as an advantage.",
    '- "sources" lists where each team\'s points came from, with sharePercent of that team\'s total. Use it for statements like "The opponent scored 65% of its points on X". Only mention sources that are listed; listed items already meet a minimum sample size.',
    '- Do not mention anything the data does not cover (individual players, strategy names, coaching decisions).',
    "- If the data is too thin for a section, return fewer notes (or an empty list) instead of padding.",
    "",
    "Sections:",
    "- worked: what Roslyn did that went with its best scoring (largest source shares, stats where Roslyn led).",
    "- opponent_better: where the opponent was more effective (its largest source shares, stats where it led).",
    "- takeaways: 2 to 4 impersonal conditional statements that follow from the numbers.",
    "",
    "Data (JSON):",
    JSON.stringify(input),
  ].join("\n");
}
