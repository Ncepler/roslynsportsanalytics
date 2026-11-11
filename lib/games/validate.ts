// Input checks for the schedule and saved results. Everything from the browser
// is untrusted, and everything Claude returns is too.

import { GAME_SPORTS, type GameSport, type ScheduleInput, type SheetCell, type StoredSheet } from "./types";

export const isGameSport = (v: unknown): v is GameSport => typeof v === "string" && (GAME_SPORTS as string[]).includes(v);

/** A real calendar date in YYYY-MM-DD form, or null. */
export function cleanDate(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
};

export const MAX_SCHEDULE_ROWS = 100;

/** Rows the admin saved. Rows without an opponent are dropped; a bad date becomes null (never guessed). */
export function cleanSchedule(sport: GameSport, rows: unknown): ScheduleInput[] | null {
  if (!Array.isArray(rows) || rows.length > MAX_SCHEDULE_ROWS) return null;
  const out: ScheduleInput[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    const opponent = cleanText(row.opponent, 80);
    if (!opponent) continue;
    out.push({ sport, date: cleanDate(row.date), opponent, note: cleanText(row.note, 80) });
  }
  return out;
}

const cell = (v: unknown): v is SheetCell => v === null || typeof v === "string" || (typeof v === "number" && Number.isFinite(v));
const grid = (v: unknown): v is SheetCell[][] => Array.isArray(v) && v.length <= 400 && v.every((r) => Array.isArray(r) && r.length <= 60 && r.every(cell));

/** The sheets to save: only strings, numbers and blanks, in the club's layouts. */
export function cleanSheets(v: unknown): StoredSheet[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 8) return null;
  const out: StoredSheet[] = [];
  for (const s of v) {
    if (!s || typeof s !== "object") return null;
    const x = s as Record<string, unknown>;
    if (typeof x.id !== "string" || typeof x.title !== "string" || !grid(x.header) || !grid(x.rows)) return null;
    out.push({ id: x.id.slice(0, 60), title: x.title.slice(0, 120), header: x.header, rows: x.rows });
  }
  return out;
}
