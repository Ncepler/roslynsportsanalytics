// Cost and time estimates. Rates come from the model registry (lib/sports/models.ts), never from this file.
import { OUTPUT_TOKENS_PER_GAME } from "@/lib/sports/estimate";
import { rates } from "@/lib/sports/models";
import type { ModelConfig } from "@/lib/sports/registry-types";

/**
 * Cost of a run given its input tokens. Output tokens scale the registry's per-game assumption by how much
 * video is watched compared with a typical game of this sport (`footageMinutes`).
 */
export function estimateCostUsd(inputTokens: number, videoSeconds: number, model: ModelConfig, footageMinutes: number, date: Date | string): number {
  const r = rates(model, date);
  const outputTokens = OUTPUT_TOKENS_PER_GAME * (videoSeconds / (footageMinutes * 60));
  return (inputTokens / 1e6) * r.inputPerMillion + (outputTokens / 1e6) * r.outputPerMillion;
}

const CALIBRATION_KEY = "analysis-seconds-per-video-second";
/** Starting guess before any run has been timed on this browser. */
const DEFAULT_SECONDS_PER_VIDEO_SECOND = 0.35;

export function secondsPerVideoSecond(): number {
  try {
    const v = Number(localStorage.getItem(CALIBRATION_KEY));
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_SECONDS_PER_VIDEO_SECOND;
  } catch {
    return DEFAULT_SECONDS_PER_VIDEO_SECOND;
  }
}

/** Blend a finished run's real speed into the stored estimate. */
export function recordRunSpeed(elapsedSeconds: number, longestSegmentSeconds: number) {
  if (longestSegmentSeconds <= 0) return;
  const measured = elapsedSeconds / longestSegmentSeconds;
  const next = (secondsPerVideoSecond() + measured) / 2;
  try {
    localStorage.setItem(CALIBRATION_KEY, String(next));
  } catch {
    /* storage blocked: keep the default */
  }
}
