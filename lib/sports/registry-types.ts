// Contract for the sport registry (generated from docs/sports/*.md by scripts/build-sports.ts).

export type VideoReliability = "H" | "M" | "L";

export type Stat = {
  /** Slug, unique within the sport. */
  id: string;
  /** Stat name with bold markers stripped, e.g. "eFG%". */
  name: string;
  /** Text after " = " in the name cell, if any. */
  formula?: string;
  tier: 1 | 2 | 3 | null;
  group: string;
  /** The "What to look for in the video" cell. */
  lookFor: string;
  /** Least reliable letter present in the Video cell (parentheticals ignored). */
  video: VideoReliability;
  /** The Video cell exactly as written, e.g. "L-M" or "H (computed)". */
  videoRaw: string;
  /** True for the "applies to every sport" rows. */
  universal: boolean;
};

export type SportAnalysis = {
  fps: number;
  /** ModelConfig.id */
  defaultModel: string;
  footageMinutes: number;
  mode: "events" | "scoreboard-only";
};

export type Sport = {
  /** Matches lib/teams/options.ts values, e.g. "flag-football". */
  id: string;
  name: string;
  order: number;
  /** The "What decides games" line. */
  summary: string;
  /** The "Log these events" line. */
  eventsNote: string;
  stats: Stat[];
  analysis: SportAnalysis;
  clubFootage: "yes" | "no-video" | "no-team";
  hudlNote?: string;
};

export type PriceRow = {
  /** ISO date (YYYY-MM-DD) the rates start; null = in force before any listed change. */
  effectiveFrom: string | null;
  /** USD per 1M tokens. */
  inputPerMillion: number;
  outputPerMillion: number;
  /** Rates for a single request above 200k input tokens (3.1 Pro only). */
  inputPerMillionOver200k?: number;
  outputPerMillionOver200k?: number;
};

export type ModelConfig = {
  /** Internal key, referenced by SportAnalysis.defaultModel. */
  id: string;
  displayName: string;
  /** String sent to the Gemini API. */
  apiModelId: string;
  /** False when apiModelId could not be checked against Google's pricing page. */
  apiModelIdConfirmed: boolean;
  /** Tokens per sampled frame at default (low) resolution. */
  tokensPerFrame: number;
  /** Audio tokens per second of video. */
  audioTokensPerSecond: number;
  supportsAgentic: boolean;
  freeTier: boolean;
  /** Batch discount as a fraction off (0.5 = 50%). */
  batchDiscount: number;
  /** Sorted oldest to newest by effectiveFrom. */
  prices: PriceRow[];
  notes?: string;
};
