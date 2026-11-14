// Cleans up what Gemini sends back before anything is computed from it (CLAUDE.md section 3, rules 1 and 2).
// A JSON schema makes Gemini's reply mostly right, not always right: a number can come back as text, a value
// can be outside the allowed list, a lacrosse goal can arrive without its 1 point. Every value here is checked.
// A value that can't be trusted becomes null (never a guess); a possession with anything doubtful is marked
// low confidence so the Review table flags it; a row that can't be placed at all is dropped and counted.

import type { SportConfig } from "@/lib/sports/types";
import type { Confidence, Context, LogEvent, Possession, PossessionLog, ScoreboardReading, Team } from "./log-types";

const EVENT_TYPES = new Set<LogEvent["type"]>(["shot", "rebound", "assist", "steal", "block", "turnover", "foul", "substitution"]);
const TEAMS = new Set<Team>(["roslyn", "opponent"]);
const CONTEXTS = new Set<Context>(["M", "Z", "F"]);
const CONFIDENCES = new Set<Confidence>(["high", "medium", "low"]);
const SHOT_RESULTS = new Set(["goal", "saved", "missed", "blocked"]);
const REBOUND_TYPES = new Set(["offensive", "defensive"]);

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null);

/** A finite number, also from numeric text ("12.5"). Null otherwise. */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return null;
}

const text = (v: unknown, max = 300): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

const bool = (v: unknown): boolean | null => (v === true || v === "true" ? true : v === false || v === "false" ? false : null);

/** Jersey number as text ("23", "#23" -> "23"). Anything that isn't a jersey number becomes null. */
export function jersey(v: unknown): string | null {
  const t = text(v, 12)?.replace(/^#/, "").trim();
  return t && /^\d{1,3}[A-Za-z]?$/.test(t) ? t : null;
}

/** "1", 1, "Q1", "1st" -> "1"; "OT", "OT1", "overtime" -> "OT". Anything else -> null. */
export function quarter(v: unknown, sport: SportConfig): string | null {
  const t = text(v, 12)?.toUpperCase();
  if (!t) return null;
  if (/^(OT\d*|OVERTIME)$/.test(t)) return sport.periods.includes("OT") ? "OT" : null;
  const m = /^(?:Q|P|H)?\s*(\d)(?:ST|ND|RD|TH)?$/.exec(t);
  return m && sport.periods.includes(m[1]) ? m[1] : null;
}

/** "5:42", "0:07", "12:00", "45.3" (under a minute). Anything else -> null. */
export function clock(v: unknown): string | null {
  const t = text(v, 8);
  return t && /^(\d{1,2}:[0-5]\d(\.\d)?|\d{1,2}(\.\d)?)$/.test(t) ? t : null;
}

const MAX_TIME = 6 * 60 * 60;
const time = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n >= 0 && n <= MAX_TIME ? n : null;
};

type Doubt = { doubtful: boolean };

function cleanEvent(raw: unknown, sport: SportConfig, doubt: Doubt, fallbackTime: number): LogEvent | null {
  const e = obj(raw);
  if (!e) return null;
  const type = e.type as LogEvent["type"];
  const team = e.team as Team;
  if (!EVENT_TYPES.has(type) || !TEAMS.has(team)) return null;
  let videoTime = time(e.videoTime);
  if (videoTime === null) {
    videoTime = fallbackTime;
    doubt.doubtful = true;
  }
  const out: LogEvent = { type, team, videoTime, clock: clock(e.clock), player: jersey(e.player), description: text(e.description) ?? "" };

  if (type === "shot") {
    const made = bool(e.made);
    let points = num(e.points);
    // A sport where every scoring shot is worth the same (lacrosse, hockey: a goal is 1) can't have a wrong value.
    if (sport.shotPoints.length === 1) points = sport.shotPoints[0];
    else if (points === null || !sport.shotPoints.includes(points)) {
      points = null;
      doubt.doubtful = true; // a basketball shot with no 1/2/3 can't be counted: flag it, don't guess
    }
    if (made === null) doubt.doubtful = true;
    out.points = points as 1 | 2 | 3 | null;
    out.made = made;
    const shotResult = text(e.shotResult, 12);
    if (shotResult && SHOT_RESULTS.has(shotResult)) {
      out.shotResult = shotResult as LogEvent["shotResult"];
      // A goal is a made shot and nothing else is; when the two disagree the made flag can't be trusted.
      if (made !== null && made !== (shotResult === "goal")) doubt.doubtful = true;
    }
    const shotType = text(e.shotType, 40);
    if (shotType) out.shotType = shotType;
    const zone = text(e.shotZone, 40);
    if (zone) out.shotZone = !sport.shotZones || sport.shotZones.some((z) => z.id === zone) ? zone : null;
    const contested = bool(e.contested);
    if (contested !== null) out.contested = contested;
  }
  if (type === "rebound") {
    const r = text(e.reboundType, 12);
    out.reboundType = r && REBOUND_TYPES.has(r) ? (r as LogEvent["reboundType"]) : null;
  }
  if (type === "turnover") {
    const t = text(e.turnoverType, 40);
    if (t) out.turnoverType = t;
  }
  if (type === "substitution") {
    out.playerIn = jersey(e.playerIn);
    out.playerOut = jersey(e.playerOut);
  }
  return out;
}

/** Cleans one possession. Null when it can't be placed (no team, no usable video time). */
export function cleanPossession(raw: unknown, sport: SportConfig, stats: { droppedEvents: number }): Possession | null {
  const p = obj(raw);
  if (!p) return null;
  const team = p.team as Team;
  if (!TEAMS.has(team)) return null;
  let start = time(p.videoStart);
  let end = time(p.videoEnd);
  if (start === null && end === null) return null;
  const doubt: Doubt = { doubtful: false };
  if (start === null || end === null) {
    start ??= end!;
    end ??= start;
    doubt.doubtful = true;
  }
  if (end < start) [start, end] = [end, start];

  const events: LogEvent[] = [];
  for (const rawEvent of Array.isArray(p.events) ? p.events : []) {
    const e = cleanEvent(rawEvent, sport, doubt, start);
    if (e) events.push(e);
    else {
      stats.droppedEvents++;
      doubt.doubtful = true;
    }
  }
  events.sort((a, b) => a.videoTime - b.videoTime);

  const ctx = text(p.context, 2)?.toUpperCase() as Context | undefined;
  const q = quarter(p.quarter, sport);
  if (q === null && p.quarter != null) doubt.doubtful = true;
  const confidence = CONFIDENCES.has(p.confidence as Confidence) ? (p.confidence as Confidence) : "low";
  return {
    team,
    quarter: q,
    clockStart: clock(p.clockStart),
    clockEnd: clock(p.clockEnd),
    videoStart: start,
    videoEnd: end,
    context: ctx && CONTEXTS.has(ctx) ? ctx : null,
    events,
    confidence: doubt.doubtful ? "low" : confidence,
    note: text(p.note),
  };
}

function cleanReading(raw: unknown, sport: SportConfig): ScoreboardReading | null {
  const r = obj(raw);
  if (!r) return null;
  const videoTime = time(r.videoTime);
  if (videoTime === null) return null;
  const score = (v: unknown) => {
    const n = num(v);
    return n !== null && Number.isInteger(n) && n >= 0 && n <= 300 ? n : null;
  };
  const roslyn = score(r.roslyn);
  const opponent = score(r.opponent);
  // Half a reading is no reading: the scoreboard check compares both teams at once.
  const both = roslyn !== null && opponent !== null;
  return { videoTime, quarter: quarter(r.quarter, sport), clock: clock(r.clock), roslyn: both ? roslyn : null, opponent: both ? opponent : null };
}

/**
 * Gemini is told to report seconds from the start of the whole file. If a section's times instead look counted
 * from the start of that section (most fall between 0 and the section's length, almost none inside the section),
 * they are shifted back by the section's start, with a warning. Without this the merge would throw that whole
 * section away. Returns the shift applied (0 when none).
 */
export function clipRelativeShift(times: number[], watch: { start: number; end: number }): number {
  if (watch.start < 60 || times.length < 3) return 0;
  const len = watch.end - watch.start;
  const inside = times.filter((t) => t >= watch.start - 5 && t <= watch.end + 5).length;
  const relative = times.filter((t) => t >= 0 && t <= len + 5).length;
  return inside / times.length < 0.2 && relative / times.length >= 0.8 ? watch.start : 0;
}

function shiftLog(log: PossessionLog, by: number) {
  for (const p of log.possessions) {
    p.videoStart += by;
    p.videoEnd += by;
    for (const e of p.events) e.videoTime += by;
  }
  for (const r of log.scoreboard) r.videoTime += by;
}

/** Cleans one section's pass-1 reply. `watch` is the stretch of video that section covered. */
export function sanitizeLog(raw: unknown, sport: SportConfig, watch: { start: number; end: number }): PossessionLog {
  const o = obj(raw) ?? {};
  const stats = { droppedEvents: 0 };
  const rawPossessions = Array.isArray(o.possessions) ? o.possessions : [];
  const possessions = rawPossessions.map((p) => cleanPossession(p, sport, stats)).filter((p): p is Possession => p !== null);
  const scoreboard = (Array.isArray(o.scoreboard) ? o.scoreboard : []).map((r) => cleanReading(r, sport)).filter((r): r is ScoreboardReading => r !== null);
  const warnings = (Array.isArray(o.warnings) ? o.warnings : []).map((w) => text(w)).filter((w): w is string => w !== null);

  const droppedPossessions = rawPossessions.length - possessions.length;
  if (droppedPossessions) warnings.push(`${droppedPossessions} possession${droppedPossessions === 1 ? "" : "s"} from the AI had no team or no video time and ${droppedPossessions === 1 ? "was" : "were"} left out.`);
  if (stats.droppedEvents) warnings.push(`${stats.droppedEvents} event${stats.droppedEvents === 1 ? "" : "s"} from the AI couldn't be read and ${stats.droppedEvents === 1 ? "was" : "were"} left out. Those possessions are marked for review.`);

  const log: PossessionLog = { possessions, scoreboard, warnings };
  const shift = clipRelativeShift([...possessions.map((p) => p.videoStart), ...scoreboard.map((r) => r.videoTime)], watch);
  if (shift) {
    shiftLog(log, shift);
    warnings.push(`The AI's times for the section starting at ${Math.round(shift)}s looked counted from the start of that section, so they were moved to match the full video. Spot-check a few rows in that section.`);
  }
  return log;
}

/** Cleans a later pass's events (each may name a possession number). Unreadable events are counted in `dropped`. */
export function sanitizeEvents(raw: unknown, sport: SportConfig, watch: { start: number; end: number }): { events: (LogEvent & { possession?: number })[]; dropped: number } {
  const list = Array.isArray(raw) ? raw : [];
  const events: (LogEvent & { possession?: number })[] = [];
  let dropped = 0;
  for (const r of list) {
    const doubt: Doubt = { doubtful: false };
    const e = cleanEvent(r, sport, doubt, -1);
    if (!e || e.videoTime < 0) {
      dropped++;
      continue;
    }
    const n = num(obj(r)?.possession);
    events.push(n !== null && Number.isInteger(n) ? { ...e, possession: n } : e);
  }
  const shift = clipRelativeShift(events.map((e) => e.videoTime), watch);
  if (shift) for (const e of events) e.videoTime += shift;
  return { events, dropped };
}
