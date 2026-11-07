// Shared types for sport configs (CLAUDE.md section 8).
// Adding a stat = one StatDef entry in the sport's config file.

export type Tier = "reliable" | "decent" | "experimental";

/** Event kinds the AI can log inside a possession. */
export type EventType = "shot" | "rebound" | "assist" | "steal" | "block" | "turnover" | "foul";

/** Optional event fields the AI fills only when a stat that needs them is checked. */
export type EventField = "player" | "shotType" | "shotZone" | "turnoverType" | "contested";

export type StatDef = {
  id: string;
  label: string;
  tier: Tier;
  /** "logged" = the AI records it; "derived" = code computes it from logged rows. */
  source: "logged" | "derived";
  /** Plain wording given to Gemini (logged stats) or shown as help text (derived). */
  description: string;
  /** Event types the AI must log for this stat (logged stats only). */
  events?: EventType[];
  /** Extra event fields the AI must fill for this stat. */
  fields?: EventField[];
  /** Which sheet layouts this stat feeds (ids from lib/sheets). */
  sheets?: string[];
  defaultOn: boolean;
};

export type SportConfig = {
  id: string;
  label: string;
  periods: string[];
  /** What the AI is told a possession is. */
  possessionDefinition: string;
  stats: StatDef[];
};
