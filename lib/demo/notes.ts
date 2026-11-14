// SIMULATION ONLY (the /test page). The practice demo never calls the AI, so its game notes are filled in from the
// computed numbers with fixed sentence templates, in the same analytical voice the real notes use. Never used on a
// real game.

import type { GameNotesInput, GameNotesOutput } from "@/lib/game/notes";

export function simulatedNotes(input: GameNotesInput): GameNotesOutput {
  const opp = input.opponent;
  const worked: string[] = [];
  const opponentBetter: string[] = [];
  const takeaways: string[] = [];

  const top = (team: "roslyn" | "opponent", n: number) => input.sources[team].items.slice(0, n);
  for (const s of top("roslyn", 2)) worked.push(`Roslyn scored ${s.sharePercent}% of its points (${s.points}) from ${s.label}.`);
  for (const s of top("opponent", 2)) opponentBetter.push(`${opp} scored ${s.sharePercent}% of its points (${s.points}) from ${s.label}.`);

  // For turnovers and fouls a lower number is better, so a higher one is not "leading".
  const led = input.compare.filter((r) => r.unit === "count" && r.roslyn !== null && r.opponent !== null && !/turnover|foul/i.test(r.label));
  const roslynLed = led.filter((r) => r.roslyn! > r.opponent!).sort((a, b) => b.roslyn! - b.opponent! - (a.roslyn! - a.opponent!));
  const oppLed = led.filter((r) => r.opponent! > r.roslyn!).sort((a, b) => b.opponent! - b.roslyn! - (a.opponent! - a.roslyn!));
  if (roslynLed[0]) worked.push(`Roslyn led in ${roslynLed[0].label.toLowerCase()}, ${roslynLed[0].roslyn} to ${roslynLed[0].opponent}.`);
  if (oppLed[0]) opponentBetter.push(`${opp} led in ${oppLed[0].label.toLowerCase()}, ${oppLed[0].opponent} to ${oppLed[0].roslyn}.`);

  const oppTop = top("opponent", 1)[0];
  if (oppTop) takeaways.push(`When ${opp} scores from ${oppTop.label}, that source accounts for ${oppTop.sharePercent}% of its points, so limiting it removes the largest share of its scoring.`);
  const rosTop = top("roslyn", 1)[0];
  if (rosTop) takeaways.push(`When Roslyn scores from ${rosTop.label}, that source accounts for ${rosTop.sharePercent}% of its points, the largest share in this game.`);

  return { worked, opponent_better: opponentBetter, takeaways };
}
