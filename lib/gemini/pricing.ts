// Cost and time estimates. UNVERIFIED: prices came from a summary Noah
// pasted (CLAUDE.md section 16), not from Google's pricing page. Check
// ai.google.dev/gemini-api/docs/pricing and update these before relying on them.

/** USD per million input tokens (Gemini Flash, through Dec 31, 2026). */
export const INPUT_USD_PER_MILLION = 0.75;
/** USD per million output tokens. */
export const OUTPUT_USD_PER_MILLION = 3.75;
/** Rough output size: about 25 tokens per second of game (a possession log is verbose JSON). */
export const OUTPUT_TOKENS_PER_SECOND = 25;

export function estimateCostUsd(inputTokens: number, videoSeconds: number): number {
  const outputTokens = videoSeconds * OUTPUT_TOKENS_PER_SECOND;
  return (inputTokens / 1e6) * INPUT_USD_PER_MILLION + (outputTokens / 1e6) * OUTPUT_USD_PER_MILLION;
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
