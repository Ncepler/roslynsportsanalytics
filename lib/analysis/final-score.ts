import type { ScoreboardReading } from "@/lib/gemini/log-types";

export type FinalScore = { roslyn: number | null; opponent: number | null };

/**
 * The score the automatic save sends, so it never blanks a score already on the game.
 * Order: the game's own typed score; else the last scoreboard reading with both numbers; else null.
 */
export function autoSaveScore(typed: FinalScore, scoreboard: ScoreboardReading[]): FinalScore {
  if (typed.roslyn !== null && typed.opponent !== null) return { roslyn: typed.roslyn, opponent: typed.opponent };
  for (let i = scoreboard.length - 1; i >= 0; i--) {
    const r = scoreboard[i];
    if (r.roslyn !== null && r.opponent !== null) return { roslyn: r.roslyn, opponent: r.opponent };
  }
  return { roslyn: typed.roslyn, opponent: typed.opponent };
}
