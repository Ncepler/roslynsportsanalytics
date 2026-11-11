// Reading a schedule picture or pasted text with Claude. Claude only copies
// rows out; the admin checks them before anything is saved (CLAUDE.md rule 1:
// unreadable means null, never a guess).

import { cleanDate } from "./validate";
import type { GameSport } from "./types";

export const SCHEDULE_SCHEMA = {
  type: "object",
  properties: {
    games: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: ["string", "null"], description: "YYYY-MM-DD, or null if the year or date isn't clear." },
          opponent: { type: "string", description: "Opponent school name exactly as written, without 'vs' or '@'." },
          note: { type: ["string", "null"], description: "Short extra text such as JV, Varsity, tournament, or time. null if none." },
        },
        required: ["date", "opponent", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["games"],
  additionalProperties: false,
};

export function schedulePrompt(sport: GameSport, today: string): string {
  return [
    `Copy the ${sport} games out of this school schedule. Today is ${today}.`,
    "",
    "Rules:",
    "- One entry per game, in the order shown. Opponent = the other school only (Roslyn is always our team).",
    "- Copy names as written. Do not fix spelling, expand abbreviations, or add schools.",
    "- date must be YYYY-MM-DD. If the year is not printed, use the school year that makes the month fit around today's date; if you still are not sure, use null.",
    "- Never invent a game or a date. If something is unreadable, use null for the date or skip the row.",
    "- Skip practices, byes, and games for other sports.",
    "- note: only short text printed with that game (for example JV, Varsity, tournament). Otherwise null.",
  ].join("\n");
}

export type ParsedRow = { date: string | null; opponent: string; note: string | null };

/** Checks Claude's reply: bad dates become null, rows without an opponent are dropped. */
export function readScheduleReply(text: string): ParsedRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const games = (parsed as { games?: unknown })?.games;
  if (!Array.isArray(games)) return [];
  const rows: ParsedRow[] = [];
  for (const g of games.slice(0, 100)) {
    if (!g || typeof g !== "object") continue;
    const x = g as Record<string, unknown>;
    const opponent = typeof x.opponent === "string" ? x.opponent.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    if (!opponent) continue;
    const note = typeof x.note === "string" ? x.note.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    rows.push({ date: cleanDate(x.date), opponent, note: note || null });
  }
  return rows;
}
