import type { LogEvent, Possession, PossessionLog, ScoreboardReading, Team } from "@/lib/gemini/log-types";

export const shot = (team: Team, t: number, points: 1 | 2 | 3, made: boolean, extra: Partial<LogEvent> = {}): LogEvent => ({
  type: "shot",
  team,
  videoTime: t,
  clock: null,
  player: null,
  points,
  made,
  description: "",
  ...extra,
});

export const ev = (type: LogEvent["type"], team: Team, t: number, extra: Partial<LogEvent> = {}): LogEvent => ({
  type,
  team,
  videoTime: t,
  clock: null,
  player: null,
  description: "",
  ...extra,
});

export const poss = (team: Team, start: number, end: number, events: LogEvent[], extra: Partial<Possession> = {}): Possession => ({
  team,
  quarter: "1",
  clockStart: null,
  clockEnd: null,
  videoStart: start,
  videoEnd: end,
  context: "M",
  events,
  confidence: "high",
  note: null,
  ...extra,
});

export const board = (t: number, roslyn: number, opponent: number, quarter = "1"): ScoreboardReading => ({ videoTime: t, quarter, clock: null, roslyn, opponent });

export const log = (possessions: Possession[], scoreboard: ScoreboardReading[] = []): PossessionLog => ({ possessions, scoreboard, warnings: [] });
