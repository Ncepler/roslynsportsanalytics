import { basketball } from "./basketball";
import type { SportConfig } from "./types";

// Register a new sport by importing its config and adding it here.
export const SPORTS: Record<string, SportConfig> = {
  basketball,
};

export function getSport(id: string): SportConfig | undefined {
  return SPORTS[id];
}

export function defaultStatIds(sport: SportConfig): string[] {
  return sport.stats.filter((s) => s.defaultOn).map((s) => s.id);
}
