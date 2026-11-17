// Token, cost and time estimate for one game. Inputs come from the registry (sport, model, fps, footage minutes);
// no rate or token figure is written here.
import { rates } from "./models";
import type { ModelConfig, Sport } from "./registry-types";

/** Output tokens assumed per game (stat log plus thinking). From the Gemini doc, section 4. */
export const OUTPUT_TOKENS_PER_GAME = 40_000;
/** Video is sent in chunks of this many minutes (also decides which 3.1 Pro rate applies). */
export const CHUNK_MINUTES = 10;
/** Requests above this many input tokens use the model's "over 200k" rates, where it has them. */
export const LONG_REQUEST_TOKENS = 200_000;
/** Processing time per second of video; the starting guess the app already used before any run is timed. */
export const PROCESSING_SECONDS_PER_VIDEO_SECOND = 0.35;
/** How far ahead to warn about a price change. */
export const PRICE_CHANGE_WARNING_DAYS = 60;

/** Tokens per frame at high resolution (Gemini doc, section 2): about 3.9x the default. */
export const HIGH_RES_TOKENS_PER_FRAME = 258;

/** Input tokens per second of video for a model at an fps and resolution (frames plus audio). */
export function tokensPerSecond(model: ModelConfig, fps: number, resolution: "low" | "high" = "low"): number {
  const perFrame = resolution === "high" ? HIGH_RES_TOKENS_PER_FRAME : model.tokensPerFrame;
  return perFrame * fps + model.audioTokensPerSecond;
}

export type Estimate = {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  processingMinutes: number;
  /** Set when a price change lands within 60 days of `date`. */
  priceChange: { effectiveFrom: string; costUsd: number; note: string } | null;
};

const isoDay = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

function costAt(model: ModelConfig, day: string, fps: number, minutes: number): { inputTokens: number; outputTokens: number; costUsd: number } {
  const r = rates(model, day);
  const perSecond = model.tokensPerFrame * fps + model.audioTokensPerSecond;
  let remaining = minutes;
  let inputTokens = 0;
  let costUsd = 0;
  while (remaining > 0) {
    const chunkMin = Math.min(CHUNK_MINUTES, remaining);
    remaining -= chunkMin;
    const tokens = chunkMin * 60 * perSecond;
    const out = OUTPUT_TOKENS_PER_GAME * (chunkMin / minutes);
    const long = tokens > LONG_REQUEST_TOKENS && r.inputPerMillionOver200k !== undefined;
    const inRate = long ? r.inputPerMillionOver200k! : r.inputPerMillion;
    const outRate = long ? (r.outputPerMillionOver200k ?? r.outputPerMillion) : r.outputPerMillion;
    inputTokens += tokens;
    costUsd += (tokens / 1e6) * inRate + (out / 1e6) * outRate;
  }
  return { inputTokens, outputTokens: minutes > 0 ? OUTPUT_TOKENS_PER_GAME : 0, costUsd };
}

export function estimate(_sport: Sport, model: ModelConfig, fps: number, minutes: number, date: Date | string): Estimate {
  const day = isoDay(date);
  const now = costAt(model, day, fps, minutes);

  let priceChange: Estimate["priceChange"] = null;
  const limit = new Date(day + "T00:00:00Z");
  limit.setUTCDate(limit.getUTCDate() + PRICE_CHANGE_WARNING_DAYS);
  const limitDay = limit.toISOString().slice(0, 10);
  const next = model.prices.find((p) => p.effectiveFrom !== null && p.effectiveFrom > day && p.effectiveFrom <= limitDay);
  if (next?.effectiveFrom) {
    const later = costAt(model, next.effectiveFrom, fps, minutes);
    priceChange = { effectiveFrom: next.effectiveFrom, costUsd: later.costUsd, note: `Price changes to $${later.costUsd.toFixed(2)} per game on ${next.effectiveFrom}.` };
  }

  return {
    inputTokens: now.inputTokens,
    outputTokens: now.outputTokens,
    costUsd: now.costUsd,
    processingMinutes: (minutes * 60 * PROCESSING_SECONDS_PER_VIDEO_SECOND) / 60,
    priceChange,
  };
}
