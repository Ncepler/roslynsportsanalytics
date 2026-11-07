// Splitting a trimmed game into parallel segments and merging the results
// (CLAUDE.md section 6.5). Pure functions.

import type { Possession, PossessionLog, ScoreboardReading } from "@/lib/gemini/log-types";

export type Range = { start: number; end: number };

export type Segment = {
  /** What Gemini watches: the core plus overlap on each side. */
  watch: Range;
  /** Possessions starting inside the core belong to this segment. */
  core: Range;
};

export const OVERLAP_SECONDS = 30;
/** Aim for this much game per segment (about a quarter). */
const TARGET_SEGMENT_SECONDS = 12 * 60;
export const MAX_PARALLEL = 4;

/** Kept ranges = the trim minus skipped stretches (halftime, timeouts). */
export function keptRanges(trim: Range, skips: Range[]): Range[] {
  let ranges: Range[] = [{ ...trim }];
  for (const s of [...skips].sort((a, b) => a.start - b.start)) {
    ranges = ranges.flatMap((r) => {
      if (s.end <= r.start || s.start >= r.end) return [r];
      const out: Range[] = [];
      if (s.start > r.start) out.push({ start: r.start, end: s.start });
      if (s.end < r.end) out.push({ start: s.end, end: r.end });
      return out;
    });
  }
  return ranges.filter((r) => r.end - r.start >= 5);
}

export const totalSeconds = (ranges: Range[]) => ranges.reduce((s, r) => s + (r.end - r.start), 0);

export function planSegments(ranges: Range[]): Segment[] {
  const segments: Segment[] = [];
  for (const r of ranges) {
    const n = Math.max(1, Math.round((r.end - r.start) / TARGET_SEGMENT_SECONDS));
    const len = (r.end - r.start) / n;
    for (let i = 0; i < n; i++) {
      const core = { start: r.start + i * len, end: i === n - 1 ? r.end : r.start + (i + 1) * len };
      segments.push({
        core,
        watch: { start: Math.max(r.start, core.start - (i === 0 ? 0 : OVERLAP_SECONDS)), end: Math.min(r.end, core.end + (i === n - 1 ? 0 : OVERLAP_SECONDS)) },
      });
    }
  }
  return segments;
}

const clockKey = (p: Possession) => (p.quarter && p.clockStart ? `${p.team}|${p.quarter}|${p.clockStart}` : null);

/**
 * Merges segment logs. A possession is kept only from the segment whose core
 * contains its start, which removes overlap duplicates. Then any remaining
 * duplicates with the same team + quarter + starting clock are dropped.
 * All times are already relative to the original file.
 */
export function mergeLogs(parts: { segment: Segment; log: PossessionLog }[]): PossessionLog {
  const possessions: Possession[] = [];
  const seenClock = new Set<string>();
  const scoreboard: ScoreboardReading[] = [];
  const warnings: string[] = [];

  for (const { segment, log } of parts) {
    for (const p of log.possessions) {
      const inCore = p.videoStart >= segment.core.start - 0.5 && p.videoStart < segment.core.end;
      if (!inCore && parts.length > 1) continue;
      const key = clockKey(p);
      if (key && seenClock.has(key)) continue;
      if (key) seenClock.add(key);
      possessions.push(p);
    }
    scoreboard.push(...log.scoreboard);
    warnings.push(...log.warnings);
  }

  possessions.sort((a, b) => a.videoStart - b.videoStart);
  scoreboard.sort((a, b) => a.videoTime - b.videoTime);
  const dedupedBoard = scoreboard.filter((r, i) => i === 0 || r.videoTime - scoreboard[i - 1].videoTime > 2);
  return { possessions, scoreboard: dedupedBoard, warnings: [...new Set(warnings)] };
}
