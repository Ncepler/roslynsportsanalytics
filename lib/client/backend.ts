// The calls the Analyze flow makes. The real backend talks to Gemini through
// the app's API routes; the /test page swaps in a simulator (lib/demo).

import type { PossessionLog } from "@/lib/gemini/log-types";
import type { GameSetup } from "@/lib/gemini/prompt";
import { api, deleteFromGemini, uploadToGemini, waitForActive, type GeminiFile } from "./api";
import { runAppearanceNotes, runPossessionLog, type Resolution, type RunUsage } from "./run";
import type { Range, Segment } from "./segments";

export type VideoOpts = { file: GeminiFile; resolution: Resolution; fps?: number };

export type Backend = {
  /** False for the simulator: its timings shouldn't calibrate real estimates. */
  calibrates: boolean;
  upload(file: File, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<GeminiFile>;
  waitForActive(name: string, signal: AbortSignal): Promise<GeminiFile>;
  deleteFile(name: string): Promise<unknown>;
  /** Real token count for a range, or null when unavailable. */
  countTokens(file: GeminiFile, range: Range, resolution: Resolution): Promise<number | null>;
  appearance(range: Range, video: VideoOpts, setup: GameSetup, signal: AbortSignal): Promise<string>;
  possessionLog(
    segments: Segment[],
    video: VideoOpts,
    setup: GameSetup,
    signal: AbortSignal,
    onSegmentDone: (done: number, total: number) => void,
  ): Promise<{ log: PossessionLog; usage: RunUsage; raw: string[]; noteUpdates: string[] }>;
};

export const realBackend: Backend = {
  calibrates: true,
  upload: uploadToGemini,
  waitForActive,
  deleteFile: deleteFromGemini,
  async countTokens(file, range, resolution) {
    const r = await api<{ tokens: number | null }>("/api/gemini/tokens", {
      body: { uri: file.uri, mimeType: file.mimeType, start: range.start, end: range.end, resolution },
    });
    return r.tokens;
  },
  appearance: runAppearanceNotes,
  possessionLog: runPossessionLog,
};
