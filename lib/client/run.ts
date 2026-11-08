// Runs an analysis from the browser tab (no database: job state lives here,
// CLAUDE.md section 6.8). Starts background interactions, polls them, and
// merges the segment logs.

import type { PossessionLog } from "@/lib/gemini/log-types";
import type { GameSetup } from "@/lib/gemini/prompt";
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

type VideoOpts = { file: GeminiFile; resolution: Resolution; fps?: number };

async function runOne(kind: "log" | "appearance", range: Range, video: VideoOpts, setup: GameSetup, signal: AbortSignal) {
  const { id } = await api<{ id: string }>("/api/gemini/analyze", {
    body: {
      kind,
      uri: video.file.uri,
      mimeType: video.file.mimeType,
      start: range.start,
      end: range.end,
      resolution: video.resolution,
      fps: video.fps,
      setup,
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

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("Gemini returned something that wasn't valid JSON. Try running it again.", 0);
  }
}

/** Quick pass on the first couple of minutes: plain-text notes for the user to correct. */
export async function runAppearanceNotes(range: Range, video: VideoOpts, setup: GameSetup, signal: AbortSignal): Promise<string> {
  const r = await runOne("appearance", range, video, setup, signal);
  const parsed = parseJson<{ notes?: unknown }>(r.text);
  return Array.isArray(parsed.notes) ? parsed.notes.filter((n): n is string => typeof n === "string").join("\n") : "";
}

export type RunUsage = { inputTokens: number; outputTokens: number };

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

  async function worker() {
    while (next < segments.length) {
      const i = next++;
      const r = await runOne("log", segments[i].watch, video, setup, signal);
      const parsed = parseJson<Partial<PossessionLog> & { playerNoteUpdates?: unknown }>(r.text);
      results[i] = {
        segment: segments[i],
        text: r.text,
        noteUpdates: Array.isArray(parsed.playerNoteUpdates) ? parsed.playerNoteUpdates.filter((n): n is string => typeof n === "string") : [],
        log: {
          possessions: Array.isArray(parsed.possessions) ? parsed.possessions : [],
          scoreboard: Array.isArray(parsed.scoreboard) ? parsed.scoreboard : [],
          warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
        },
      };
      usage.inputTokens += r.inputTokens ?? 0;
      usage.outputTokens += r.outputTokens ?? 0;
      onSegmentDone(++done, segments.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, segments.length) }, worker));
  // Segments run in parallel, so each reports what changed in its stretch; keep them in game order.
  const noteUpdates = [...new Set(results.flatMap((r) => r.noteUpdates))];
  return { log: mergeLogs(results), usage, raw: results.map((r) => r.text), noteUpdates };
}
