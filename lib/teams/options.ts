// The ONE place that defines what a team can be. Every dropdown, every server validator and every
// display name reads from here. The database stores the lowercase `value`s and has no CHECK on sport,
// so adding a sport is an edit to this file only (no migration).

export const GENDERS = [
  { value: "boys", label: "Boys" },
  { value: "girls", label: "Girls" },
] as const;

export const LEVELS = [
  { value: "varsity", label: "Varsity" },
  { value: "jv", label: "JV" },
  { value: "jv2", label: "JV2" },
  { value: "jhs", label: "JHS" },
] as const;

// Edit this list freely. Values are lowercase, letters and hyphens only.
export const SPORTS = [
  { value: "basketball", label: "Basketball" },
  { value: "lacrosse", label: "Lacrosse" },
  { value: "volleyball", label: "Volleyball" },
  { value: "soccer", label: "Soccer" },
  { value: "football", label: "Football" },
  { value: "flag-football", label: "Flag Football" },
  { value: "baseball", label: "Baseball" },
  { value: "softball", label: "Softball" },
  { value: "tennis", label: "Tennis" },
  { value: "track", label: "Track" },
  { value: "cross-country", label: "Cross Country" },
  { value: "swimming", label: "Swimming" },
  { value: "wrestling", label: "Wrestling" },
  { value: "water-polo", label: "Water Polo" },
  { value: "field-hockey", label: "Field Hockey" },
  { value: "ice-hockey", label: "Ice Hockey" },
  { value: "golf", label: "Golf" },
  { value: "badminton", label: "Badminton" },
  { value: "bowling", label: "Bowling" },
  { value: "fencing", label: "Fencing" },
  { value: "gymnastics", label: "Gymnastics" },
  { value: "cheerleading", label: "Cheerleading" },
] as const;

export type Gender = (typeof GENDERS)[number]["value"];
export type Level = (typeof LEVELS)[number]["value"];
export type Sport = (typeof SPORTS)[number]["value"];

/** Sports that have a stat config in lib/sports. Other sports get a team and a schedule, but no Analyze yet. */
export const SPORTS_WITH_STATS: readonly Sport[] = ["basketball", "lacrosse"];

const has = (list: readonly { value: string }[], v: unknown) => typeof v === "string" && list.some((o) => o.value === v);
export const isGender = (v: unknown): v is Gender => has(GENDERS, v);
export const isLevel = (v: unknown): v is Level => has(LEVELS, v);
export const isSport = (v: unknown): v is Sport => has(SPORTS, v);
export const hasStats = (sport: string): boolean => (SPORTS_WITH_STATS as readonly string[]).includes(sport);

const labelOf = (list: readonly { value: string; label: string }[], v: string) => list.find((o) => o.value === v)?.label ?? v;

export type TeamKey = { gender: string; level: string; sport: string };

/** "Boys Varsity Basketball". Always built from the options, never typed. */
export function teamName(t: TeamKey): string {
  return `${labelOf(GENDERS, t.gender)} ${labelOf(LEVELS, t.level)} ${labelOf(SPORTS, t.sport)}`;
}

/** "boys-varsity-basketball" */
export function teamSlug(t: TeamKey): string {
  return `${t.gender}-${t.level}-${t.sport}`;
}
