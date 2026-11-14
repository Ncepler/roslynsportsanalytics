import { z } from "zod";
import type { LogEvent, Possession, PossessionLog, ScoreboardReading } from "@/lib/gemini/log-types";
import { isoDate } from "./schemas";

// What a saved game may contain (CLAUDE.md, Nov 13): the reviewed possession log with jersey numbers only.
// Everything is whitelisted here, so anything else the browser sends (derived points, appearance notes,
// extra fields) is dropped before it reaches the database. Derived numbers are never stored.

const clock = z.string().max(8).nullable();
// Jersey numbers only: "23", "#23", "05", "7A". Anything else (a name, a description) becomes null.
const JERSEY = /^#?\d{1,3}[A-Za-z]?$/;
const jersey = z
  .string()
  .max(12)
  .nullish()
  .transform((v) => (v && JERSEY.test(v.trim()) ? v.trim() : null));

const event = z.object({
  type: z.enum(["shot", "rebound", "assist", "steal", "block", "turnover", "foul", "substitution"]),
  team: z.enum(["roslyn", "opponent"]),
  videoTime: z.number().finite().min(0).max(1e6),
  clock: clock.default(null),
  player: jersey,
  points: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullish(),
  made: z.boolean().nullish(),
  shotType: z.string().max(40).nullish(),
  shotZone: z.string().max(40).nullish(),
  contested: z.boolean().nullish(),
  reboundType: z.enum(["offensive", "defensive"]).nullish(),
  turnoverType: z.string().max(40).nullish(),
  playerIn: jersey,
  playerOut: jersey,
});

const possession = z.object({
  team: z.enum(["roslyn", "opponent"]),
  quarter: z.string().max(4).nullable(),
  clockStart: clock,
  clockEnd: clock,
  videoStart: z.number().finite().min(0).max(1e6),
  videoEnd: z.number().finite().min(0).max(1e6),
  context: z.enum(["M", "Z", "F"]).nullable(),
  events: z.array(event).max(60),
  confidence: z.enum(["high", "medium", "low"]),
  note: z.string().max(300).nullable(),
});

const reading = z.object({
  videoTime: z.number().finite().min(0).max(1e6),
  quarter: z.string().max(4).nullable(),
  clock: clock,
  roslyn: z.number().int().min(0).max(300).nullable(),
  opponent: z.number().int().min(0).max(300).nullable(),
});

const score = z.number().int().min(0).max(300).nullish();

export const saveBody = z
  .object({
    team_id: z.string().uuid(),
    game_id: z.string().uuid().optional(),
    quick: z
      .object({
        opponent_name: z.string().trim().min(1, "Enter the opponent.").max(80),
        game_date: isoDate,
        home_away: z.enum(["home", "away"]),
      })
      .optional(),
    /** Editing an already saved game from the review table (no video, so no Roslyn-game check). */
    reopen: z.boolean().optional(),
    confirm_replace: z.boolean().optional(),
    clearance: z.string().max(4000).optional(),
    our_score: score,
    opp_score: score,
    stat_ids: z.array(z.string().max(60)).max(60),
    starters: z.array(jersey).max(12),
    log: z.object({ possessions: z.array(possession).max(600), scoreboard: z.array(reading).max(400) }),
  })
  .refine((b) => Boolean(b.game_id) !== Boolean(b.quick), { message: "Choose a game or add one." });

export type SaveBody = z.infer<typeof saveBody>;

/** Possession rows for save_game_analysis(). Event descriptions are not stored; `points` here is only a shot's value. */
export function toRows(possessions: SaveBody["log"]["possessions"]) {
  return possessions.map((p) => ({
    team: p.team,
    quarter: p.quarter ?? "?",
    clock_start: p.clockStart,
    clock_end: p.clockEnd,
    video_start: p.videoStart,
    video_end: p.videoEnd,
    context: p.context,
    shooter: null,
    confidence: p.confidence,
    needs_review: false,
    // Free text (the AI's note, a typed note) could contain a student's name, so it is never stored.
    note: null,
    events: p.events,
  }));
}

type StoredRow = {
  team: "roslyn" | "opponent";
  quarter: string;
  clock_start: string | null;
  clock_end: string | null;
  video_start: number | string;
  video_end: number | string;
  context: "M" | "Z" | "F" | null;
  confidence: "high" | "medium" | "low";
  note: string | null;
  events: Partial<LogEvent>[] | null;
};

/** Stored rows back into the log the Review table edits. Descriptions were not stored, so they come back empty. */
export function fromRows(rows: StoredRow[], scoreboard: ScoreboardReading[]): PossessionLog {
  const possessions: Possession[] = rows.map((r) => ({
    team: r.team,
    quarter: r.quarter === "?" ? null : r.quarter,
    clockStart: r.clock_start,
    clockEnd: r.clock_end,
    videoStart: Number(r.video_start),
    videoEnd: Number(r.video_end),
    context: r.context,
    confidence: r.confidence,
    note: r.note,
    events: (r.events ?? []).map((e) => ({ ...e, clock: e.clock ?? null, player: e.player ?? null, description: "" }) as LogEvent),
  }));
  return { possessions, scoreboard, warnings: [] };
}
