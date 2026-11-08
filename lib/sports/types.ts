// Shared types for sport configs (CLAUDE.md section 8).
// Adding a stat = one StatDef entry in the sport's config file.

export type Tier = "reliable" | "decent" | "experimental";

/** Event kinds the AI can log inside a possession. */
export type EventType = "shot" | "rebound" | "assist" | "steal" | "block" | "turnover" | "foul" | "substitution";

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
  /**
   * Which analysis pass logs this stat (CLAUDE.md section 6.3). Pass 1 builds
   * the possession list; passes 2 and 3 add events to it. Logged stats only.
   */
  pass?: 1 | 2 | 3;
};

export type SportConfig = {
  id: string;
  label: string;
  periods: string[];
  /** Players on the field or court per team (how many appearance notes to ask for). */
  playersPerSide: number;
  /** "court" or "field", used in prompts. */
  surface: "court" | "field";
  /** Allowed point values for a scoring shot (1 = free throw in basketball; a lacrosse goal is 1). */
  shotPoints: number[];
  /** How the AI should fill a shot's points. */
  shotPointsHelp: string;
  /** Sheet layouts this sport exports (ids from lib/sheets). */
  sheets: string[];
  /** What the AI is told a possession is. */
  possessionDefinition: string;
  stats: StatDef[];
};
