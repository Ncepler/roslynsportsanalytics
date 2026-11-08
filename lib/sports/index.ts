import { basketball } from "./basketball";
import { lacrosse } from "./lacrosse";
import type { SportConfig } from "./types";

// Register a new sport by importing its config and adding it here.
export const SPORTS: Record<string, SportConfig> = {
  basketball,
  lacrosse,
};

export function getSport(id: string): SportConfig | undefined {
  return SPORTS[id];
}

export function defaultStatIds(sport: SportConfig): string[] {
  return sport.stats.filter((s) => s.defaultOn).map((s) => s.id);
}
