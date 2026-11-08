import { isNum } from "@/lib/api";
import { getSport } from "@/lib/sports";
import type { Resolution } from "./client";
import { GEMINI_HOST } from "./client";
import { MAX_RUN_SECONDS } from "./limits";
import type { GameSetup, PossessionRef } from "./prompt";

// Validates the video-range part of a request body. Shared by the analyze
// and tokens routes so both enforce the same limits.

export type VideoRange = {
  uri: string;
  mimeType: string;
  start: number;
  end: number;
  resolution: Resolution;
  fps?: number;
};

type Raw = Record<string, unknown> | null;

const MAX_TEXT = 200;
const text = (v: unknown, max = MAX_TEXT) => (typeof v === "string" ? v.slice(0, max) : "");

export function parseVideoRange(body: Raw): VideoRange | string {
  if (!body) return "Invalid request.";
  const { uri, mimeType, start, end, resolution, fps } = body;
  if (typeof uri !== "string" || !uri.startsWith(`${GEMINI_HOST}/v1beta/files/`)) return "Invalid file.";
  if (typeof mimeType !== "string" || !mimeType.startsWith("video/")) return "Invalid video type.";
  if (!isNum(start) || !isNum(end) || start < 0 || end <= start) return "Invalid start or end time.";
  if (end - start > MAX_RUN_SECONDS) return "That's over the 2-hour limit for one run. Trim it shorter.";
  if (resolution !== "low" && resolution !== "high") return "Invalid resolution.";
  if (fps !== undefined && (!isNum(fps) || fps <= 0 || fps > 5)) return "Frame rate must be between 0 and 5.";
  return { uri, mimeType, start, end, resolution, fps: fps as number | undefined };
}

export function parseSetup(raw: unknown): GameSetup | string {
  if (!raw || typeof raw !== "object") return "Missing game setup.";
  const s = raw as Record<string, unknown>;
  const sport = typeof s.sportId === "string" ? getSport(s.sportId) : undefined;
  if (!sport) return "Unknown sport.";
  const statIds = Array.isArray(s.statIds) ? s.statIds.filter((id): id is string => typeof id === "string") : [];
  const known = new Set(sport.stats.map((st) => st.id));
  const setup: GameSetup = {
    sportId: sport.id,
    roslynColor: text(s.roslynColor),
    awayName: text(s.awayName),
    awayColor: text(s.awayColor),
    roslynRoster: text(s.roslynRoster),
    awayRoster: text(s.awayRoster),
    statIds: statIds.filter((id) => known.has(id)),
    appearanceNotes: text(s.appearanceNotes, 4000),
  };
  if (!setup.roslynColor || !setup.awayName || !setup.awayColor) return "Fill in both jersey colors and the away team name.";
  return setup;
}

/** Pass 1's possession list, sent back for passes 2 and 3. Capped and type-checked. */
export function parsePossessionRefs(raw: unknown): PossessionRef[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 400) return null;
  const out: PossessionRef[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") return null;
    const x = p as Record<string, unknown>;
    if ((x.team !== "roslyn" && x.team !== "opponent") || !isNum(x.videoStart) || !isNum(x.videoEnd)) return null;
    out.push({
      team: x.team,
      videoStart: x.videoStart,
      videoEnd: x.videoEnd,
      quarter: typeof x.quarter === "string" ? x.quarter.slice(0, 4) : null,
      clockStart: typeof x.clockStart === "string" ? x.clockStart.slice(0, 8) : null,
    });
  }
  return out;
}
