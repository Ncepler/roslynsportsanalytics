// The possession log: the one thing the AI produces (CLAUDE.md section 7).
// Every table and sheet is derived from it in code.

export type Team = "roslyn" | "opponent";
export type Context = "M" | "Z" | "F";
export type Confidence = "high" | "medium" | "low";

export type LogEvent = {
  type: "shot" | "rebound" | "assist" | "steal" | "block" | "turnover" | "foul" | "substitution";
  team: Team;
  /** Seconds from the start of the original video file. */
  videoTime: number;
  /** Game clock read from the scoreboard, "M:SS", or null if unreadable. */
  clock: string | null;
  /** Jersey number as text, or null if unreadable / not asked for. */
  player: string | null;
  /** Shots only. 1 = free throw. */
  points?: 1 | 2 | 3 | null;
  made?: boolean | null;
  shotType?: string | null;
  shotZone?: string | null;
  contested?: boolean | null;
  /** Rebounds only. */
  reboundType?: "offensive" | "defensive" | null;
  /** Turnovers only. */
  turnoverType?: string | null;
  /** Substitutions only: jersey numbers, null when unreadable. */
  playerIn?: string | null;
  playerOut?: string | null;
  description: string;
};

export type Possession = {
  team: Team;
  quarter: string | null;
  clockStart: string | null;
  clockEnd: string | null;
  videoStart: number;
  videoEnd: number;
  context: Context | null;
  events: LogEvent[];
  confidence: Confidence;
  note: string | null;
};

export type ScoreboardReading = {
  videoTime: number;
  quarter: string | null;
  clock: string | null;
  roslyn: number | null;
  opponent: number | null;
};

export type PossessionLog = {
  possessions: Possession[];
  scoreboard: ScoreboardReading[];
  /** Anything the AI could not see or was unsure about. */
  warnings: string[];
};
