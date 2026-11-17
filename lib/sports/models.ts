// Gemini models and prices, from docs/sports/gemini-models-fps-by-sport.md (sections 1 and 4), checked 2026-11-17.
// Prices are USD per 1M tokens, paid tier, standard (not batch). Swap a sport's model by editing its
// `analysis.defaultModel` (generated from the doc table) or the override in lib/sports/overrides.ts.
//
// TODO: apiModelId strings could not be checked against ai.google.dev/gemini-api/docs/pricing (that host is
// not reachable from the build environment). Strings marked apiModelIdConfirmed: false are the names listed
// in CLAUDE.md section 16 or, where none is listed, the display name. Confirm each before relying on it.
import type { ModelConfig, PriceRow } from "./registry-types";

const DEFAULT_RES = { tokensPerFrame: 66, audioTokensPerSecond: 32, batchDiscount: 0.5 } as const;
const row = (effectiveFrom: string | null, inputPerMillion: number, outputPerMillion: number, over?: [number, number]): PriceRow => ({
  effectiveFrom,
  inputPerMillion,
  outputPerMillion,
  ...(over ? { inputPerMillionOver200k: over[0], outputPerMillionOver200k: over[1] } : {}),
});

export const MODELS: ModelConfig[] = [
  {
    id: "gemini-4-argon",
    displayName: "Gemini 4 Argon",
    apiModelId: "gemini-4-argon", // TODO confirm
    apiModelIdConfirmed: false,
    ...DEFAULT_RES,
    supportsAgentic: true,
    freeTier: false,
    prices: [row(null, 2, 10), row("2026-12-01", 4, 20)],
    notes: "Flagship. Price doubles Dec 1, 2026.",
  },
  {
    id: "gemini-3.8-flash",
    displayName: "Gemini 3.8 Flash",
    apiModelId: "gemini-3.8-flash", // TODO confirm
    apiModelIdConfirmed: false,
    ...DEFAULT_RES,
    supportsAgentic: true,
    freeTier: true,
    prices: [row(null, 0.75, 3.75), row("2027-01-01", 1.5, 7.5)],
    notes: "Best price-to-quality for most sports. Price doubles Jan 1, 2027.",
  },
  {
    id: "gemini-3.6-flash",
    displayName: "Gemini 3.6 Flash",
    apiModelId: "gemini-3.6-flash", // TODO confirm
    apiModelIdConfirmed: false,
    ...DEFAULT_RES,
    supportsAgentic: true,
    freeTier: true,
    prices: [row(null, 0.75, 3.75), row("2027-01-01", 1.5, 7.5)],
    notes: "Same price as 3.8 Flash; older.",
  },
  {
    id: "gemini-3.5-flash-lite",
    displayName: "Gemini 3.5 Flash-Lite",
    apiModelId: "gemini-3.5-flash-lite", // TODO confirm
    apiModelIdConfirmed: false,
    ...DEFAULT_RES,
    supportsAgentic: true,
    freeTier: true,
    prices: [row(null, 0.3, 2.5)],
    notes: "Cheap; weaker on fast action. Price not changing.",
  },
  {
    id: "gemini-3.1-flash-lite",
    displayName: "Gemini 3.1 Flash-Lite",
    apiModelId: "Gemini 3.1 Flash-Lite", // TODO confirm API string; display name used
    apiModelIdConfirmed: false,
    ...DEFAULT_RES,
    supportsAgentic: false,
    freeTier: true,
    prices: [row(null, 0.25, 1.5)],
    notes: "Cheapest current model; lowest expected accuracy.",
  },
  {
    id: "gemini-3.1-pro-preview",
    displayName: "Gemini 3.1 Pro (Preview)",
    apiModelId: "Gemini 3.1 Pro (Preview)", // TODO confirm API string; display name used
    apiModelIdConfirmed: false,
    ...DEFAULT_RES,
    supportsAgentic: false,
    freeTier: false,
    prices: [row(null, 2, 12, [4, 18])],
    notes: "Preview. Rates jump above 200k input tokens per request, so video must be chunked.",
  },
  {
    id: "gemini-3-flash-preview",
    displayName: "Gemini 3 Flash (Preview, legacy)",
    apiModelId: "Gemini 3 Flash (Preview)", // TODO confirm API string; display name used
    apiModelIdConfirmed: false,
    ...DEFAULT_RES,
    supportsAgentic: false,
    freeTier: true,
    prices: [row(null, 0.5, 3)],
    notes: "Legacy preview; may be retired.",
  },
  {
    id: "gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash-Lite (old)",
    apiModelId: "Gemini 2.5 Flash-Lite", // TODO confirm API string; display name used
    apiModelIdConfirmed: false,
    tokensPerFrame: 256, // older model: about 4x the tokens per frame
    audioTokensPerSecond: 32, // TODO confirm; the doc gives no separate figure for this model
    batchDiscount: 0.5,
    supportsAgentic: false,
    freeTier: true,
    prices: [row(null, 0.1, 0.4)],
    notes: "Lowest sticker price but not cheaper per frame than 3.1 Flash-Lite.",
  },
];

/** Model for requests that belong to no sport (schedule reading, game notes, season summary). */
export const DEFAULT_MODEL_ID = "gemini-3.8-flash";

export const getModel = (id: string): ModelConfig | undefined => MODELS.find((m) => m.id === id);

/** The one lookup: USD per 1M tokens in force for a model on a date (ISO date or Date). */
export function rates(model: ModelConfig, date: Date | string): PriceRow {
  const day = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  let current = model.prices[0];
  for (const p of model.prices) if (p.effectiveFrom === null || p.effectiveFrom <= day) current = p;
  return current;
}
