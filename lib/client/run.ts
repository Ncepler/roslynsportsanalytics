// Runs an analysis from the browser tab (no database: job state lives here,
// CLAUDE.md section 6.8). Starts background interactions, polls them, and
// merges the segment logs.

import type { PossessionLog } from "@/lib/gemini/log-types";
import type { LogEvent, Possession } from "@/lib/gemini/log-types";
import { passesNeeded, type AppearanceResult, type GameSetup, type PossessionRef } from "@/lib/gemini/prompt";
import { getSport } from "@/lib/sports";
import { api, ApiError, sleep, type GeminiFile } from "./api";
import { mergeLogs, MAX_PARALLEL, type Range, type Segment } from "./segments";

export type Resolution = "low" | "high";

type PollResult =
  | { status: "running" }
  | { status: "failed"; error: string }
  | { status: "done"; text: string; inputTokens: number | null; outputTokens: number | null };

const POLL_MS = 4000;
/** One part of the game should never take this long; stop polling instead of waiting forever. */
const RUN_TIMEOUT_MS = 30 * 60 * 1000;

type VideoOpts = { file: GeminiFile; resolution: Resolution; fps?: number; clearance?: string };

async function runOne(
  kind: "log" | "appearance" | "events",
  range: Range,
  video: VideoOpts,
  setup: GameSetup,
  signal: AbortSignal,
  extra?: { pass: 2 | 3; possessions: PossessionRef[] },
) {
  const { id } = await api<{ id: string }>("/api/gemini/analyze", {
    body: {
      kind,
      ...extra,
      uri: video.file.uri,
      mimeType: video.file.mimeType,
      start: range.start,
      end: range.end,
      resolution: video.resolution,
      fps: video.fps,
      setup,
      clearance: video.clearance,
    },
  });
  const giveUpAt = Date.now() + RUN_TIMEOUT_MS;
  for (;;) {
    if (signal.aborted) throw new ApiError("Cancelled.", 0);
    if (Date.now() > giveUpAt) throw new ApiError("The analysis took too long and was stopped. Try again, or trim the video shorter.", 0);
    await sleep(POLL_MS);
    const r = await api<PollResult>(`/api/gemini/analyze/${encodeURIComponent(id)}`);
    if (r.status === "done") return r;
    if (r.status === "failed") throw new ApiError(r.error, 0);
  }
}

export type GateOutcome = { pass: true; evidence: string; clearance: string } | { pass: false; reason: string };

/** The Roslyn-game check (lib/gemini/gate.ts): a short look at three clips before anything expensive runs. */
export async function runGate(file: GeminiFile, range: Range, sportId: string, signal: AbortSignal, adminToken?: string): Promise<GateOutcome> {
  const first = await api<{ id?: string; ticket?: string; bypass?: boolean; clearance?: string }>("/api/gemini/gate", {
    body: { uri: file.uri, mimeType: file.mimeType, start: range.start, end: range.end, sportId, adminToken },
  });
  if (first.bypass && first.clearance) return { pass: true, evidence: "Owner unlock", clearance: first.clearance };
  const { id, ticket } = first as { id: string; ticket: string };
  const giveUpAt = Date.now() + 10 * 60 * 1000;
  for (;;) {
    if (signal.aborted) throw new ApiError("Cancelled.", 0);
    if (Date.now() > giveUpAt) throw new ApiError("The Roslyn-game check took too long. Try again.", 0);
    await sleep(3000);
    const r = await api<{ status: string; error?: string } & Partial<{ pass: boolean; evidence: string; clearance: string; reason: string }>>(
      `/api/gemini/gate/${encodeURIComponent(id)}?ticket=${encodeURIComponent(ticket)}`,
    );
    if (r.status === "failed") throw new ApiError(r.error ?? "The Roslyn-game check failed. Try again.", 0);
    if (r.status !== "done") continue;
    return r.pass && r.clearance ? { pass: true, evidence: r.evidence ?? "", clearance: r.clearance } : { pass: false, reason: r.reason ?? "This video didn't pass the Roslyn-game check." };
  }
}

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("Gemini returned something that wasn't valid JSON. Try running it again.", 0);
  }
}

const jerseys = (v: unknown) => (Array.isArray(v) ? v.map((x) => (typeof x === "string" || typeof x === "number" ? String(x).replace(/^#/, "").trim() : "")) : []);

/** Quick pass on the start of the game: starters' notes, their numbers, and whether the scoreboard reads. */
export async function runAppearanceNotes(range: Range, video: VideoOpts, setup: GameSetup, signal: AbortSignal): Promise<AppearanceResult> {
  const r = await runOne("appearance", range, video, setup, signal);
  const parsed = parseJson<{ notes?: unknown; starters?: { roslyn?: unknown; opponent?: unknown }; scoreboard?: Record<string, unknown> }>(r.text);
  const sb = parsed.scoreboard;
  return {
    notes: Array.isArray(parsed.notes) ? parsed.notes.filter((n): n is string => typeof n === "string").join("\n") : "",
    starters: { roslyn: jerseys(parsed.starters?.roslyn), opponent: jerseys(parsed.starters?.opponent) },
    scoreboard: sb ? { visible: sb.visible === true, quarter: sb.quarter === true, clock: sb.clock === true, score: sb.score === true } : null,
  };
}

export type RunUsage = { inputTokens: number; outputTokens: number };

/**
 * Adds a later pass's events to pass 1's possessions. Each event names its
 * possession by number; if that number is missing or wrong, the event goes to
 * the possession whose video time contains it, or is dropped with a warning.
 */
export function attachEvents(possessions: Possession[], events: (LogEvent & { possession?: unknown })[], warnings: string[]) {
  let dropped = 0;
  for (const raw of events) {
    const { possession, ...e } = raw;
    let target = typeof possession === "number" && Number.isInteger(possession) ? possessions[possession] : undefined;
    if (!target || e.videoTime < target.videoStart - 3 || e.videoTime > target.videoEnd + 3) {
      target = possessions.find((p) => e.videoTime >= p.videoStart - 1 && e.videoTime <= p.videoEnd + 1);
    }
    if (target) target.events.push(e as LogEvent);
    else dropped++;
  }
  if (dropped) warnings.push(`${dropped} event${dropped === 1 ? "" : "s"} couldn't be matched to a possession and ${dropped === 1 ? "was" : "were"} left out.`);
}

/** Logs every segment (MAX_PARALLEL at a time) and merges the results. */
export async function runPossessionLog(
  segments: Segment[],
  video: VideoOpts,
  setup: GameSetup,
  signal: AbortSignal,
  onSegmentDone: (done: number, total: number) => void,
): Promise<{ log: PossessionLog; usage: RunUsage; raw: string[]; noteUpdates: string[] }> {
  const results: { segment: Segment; log: PossessionLog; text: string; noteUpdates: string[] }[] = new Array(segments.length);
  const usage: RunUsage = { inputTokens: 0, outputTokens: 0 };
  let next = 0;
  let done = 0;

  // Section 6.3: stats are split into passes; later passes add events to pass 1's possessions.
  const sport = getSport(setup.sportId);
  const passes = sport ? passesNeeded(sport, setup.statIds) : [1];
  const later = passes.filter((p): p is 2 | 3 => p !== 1);
  const total = segments.length * passes.length;
  const tick = () => onSegmentDone(++done, total);
  const count = (r: { inputTokens: number | null; outputTokens: number | null }) => {
    usage.inputTokens += r.inputTokens ?? 0;
    usage.outputTokens += r.outputTokens ?? 0;
  };

  async function worker() {
    while (next < segments.length) {
      const i = next++;
      const r = await runOne("log", segments[i].watch, video, setup, signal);
      count(r);
      const parsed = parseJson<Partial<PossessionLog> & { playerNoteUpdates?: unknown }>(r.text);
      const log: PossessionLog = {
        possessions: Array.isArray(parsed.possessions) ? parsed.possessions.map((p) => ({ ...p, events: Array.isArray(p.events) ? p.events : [] })) : [],
        scoreboard: Array.isArray(parsed.scoreboard) ? parsed.scoreboard : [],
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      };
      const texts = [r.text];
      tick();
      if (later.length && log.possessions.length) {
        const refs: PossessionRef[] = log.possessions.map((p) => ({ team: p.team, videoStart: p.videoStart, videoEnd: p.videoEnd, quarter: p.quarter, clockStart: p.clockStart }));
        const extras = await Promise.all(later.map((pass) => runOne("events", segments[i].watch, video, setup, signal, { pass, possessions: refs })));
        for (const x of extras) {
          count(x);
          texts.push(x.text);
          const ev = parseJson<{ events?: unknown; warnings?: unknown }>(x.text);
          attachEvents(log.possessions, Array.isArray(ev.events) ? ev.events : [], log.warnings);
          if (Array.isArray(ev.warnings)) log.warnings.push(...ev.warnings.filter((w): w is string => typeof w === "string"));
          tick();
        }
        for (const p of log.possessions) p.events.sort((a, b) => a.videoTime - b.videoTime);
      } else for (let k = 0; k < later.length; k++) tick();
      results[i] = {
        segment: segments[i],
        text: texts.join("\n\n"),
        noteUpdates: Array.isArray(parsed.playerNoteUpdates) ? parsed.playerNoteUpdates.filter((n): n is string => typeof n === "string") : [],
        log,
      };
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, segments.length) }, worker));
  // Segments run in parallel, so each reports what changed in its stretch; keep them in game order.
  const noteUpdates = [...new Set(results.flatMap((r) => r.noteUpdates))];
  return { log: mergeLogs(results), usage, raw: results.map((r) => r.text), noteUpdates };
}
