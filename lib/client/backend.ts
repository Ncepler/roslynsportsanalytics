// The calls the Analyze flow makes. The real backend talks to Gemini through
// the app's API routes; the /test page swaps in a simulator (lib/demo).

import type { PossessionLog } from "@/lib/gemini/log-types";
import type { AppearanceResult, GameSetup } from "@/lib/gemini/prompt";
import { api, deleteFromGemini, uploadToGemini, waitForActive, type GeminiFile } from "./api";
import { runAppearanceNotes, runGate, runPossessionLog, type GateOutcome, type Resolution, type RunUsage } from "./run";
import type { Range, Segment } from "./segments";

export type VideoOpts = { file: GeminiFile; resolution: Resolution; fps?: number; clearance?: string };

export type Backend = {
  /** False for the simulator: its timings shouldn't calibrate real estimates. */
  calibrates: boolean;
  upload(file: File, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<GeminiFile>;
  waitForActive(name: string, signal: AbortSignal): Promise<GeminiFile>;
  deleteFile(name: string): Promise<unknown>;
  /** Real token count for a range, or null when unavailable. */
  countTokens(file: GeminiFile, range: Range, resolution: Resolution): Promise<number | null>;
  /** The Roslyn-game check. Every later request needs the clearance it returns. */
  gate(file: GeminiFile, range: Range, sportId: string, signal: AbortSignal): Promise<GateOutcome>;
  appearance(range: Range, video: VideoOpts, setup: GameSetup, signal: AbortSignal): Promise<AppearanceResult>;
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
  gate: runGate,
  appearance: runAppearanceNotes,
  possessionLog: runPossessionLog,
};
