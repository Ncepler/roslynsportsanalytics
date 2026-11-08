// What the Season tab sends to Claude: only numbers the code computed
// (CLAUDE.md sections 3 rule 8, and 13). Shared by the client (to build it)
// and the server route (to check the reply against it).

export type SummaryInput = {
  sport: "basketball" | "lacrosse";
  games: number;
  /** Season-wide comparison by context, e.g. efficiency vs M / Z / F. */
  comparison: { label: string; rows: { context: string; value: number | null; possessions: number | null }[] };
  /** Every pair tested, strongest first. */
  pairs: { stat: string; outcome: string; r: number | null; n: number; shown: boolean }[];
  minGames: number;
  minAbsR: number;
};

export type SummaryOutput = { summary: string; hypotheses: string[] };

export const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "3 to 5 plain sentences for high school students." },
    hypotheses: { type: "array", items: { type: "string" }, description: "2 to 4 questions worth testing next, phrased as questions." },
  },
  required: ["summary", "hypotheses"],
  additionalProperties: false,
};

export function summaryPrompt(input: SummaryInput): string {
  return [
    `You are helping a high school sports analytics club read their ${input.sport} season. The app's code already computed every number below from the club's spreadsheets.`,
    "",
    "Rules:",
    "- Quote only numbers that appear in the data below. Do not compute, round differently, total, average, or estimate anything new. If you want a number that isn't there, leave it out.",
    '- Say "goes together with", never "causes" or "leads to".',
    `- Only mention a relationship as a trend if its "shown" is true (at least ${input.minGames} games and |r| of at least ${input.minAbsR}). Say plainly that others may be chance with this many games.`,
    "- Hypotheses are questions worth testing next, with no numbers in them.",
    "- Plain words, short sentences. No jargon.",
    "",
    "Data (JSON):",
    JSON.stringify(input),
  ].join("\n");
}
