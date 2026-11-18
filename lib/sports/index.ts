import { basketball } from "./basketball";
import { iceHockey } from "./ice-hockey";
import { lacrosse } from "./lacrosse";
import type { SportConfig } from "./types";

// Register a new sport by importing its config and adding it here.
export const SPORTS: Record<string, SportConfig> = {
  basketball,
  lacrosse,
  "ice-hockey": iceHockey,
};

export function getSport(id: string): SportConfig | undefined {
  return SPORTS[id];
}

export function defaultStatIds(sport: SportConfig): string[] {
  // Every stat is on by default (Noah, Nov 18).
  return sport.stats.map((s) => s.id);
}

/** Stat ids Season trends needs; these are always tracked. */
export function requiredStatIds(sport: SportConfig): string[] {
  return sport.stats.filter((s) => s.required).map((s) => s.id);
}

/**
 * Sports analyzed with the possession log (own derivations, review sheets, saved games, Season trends).
 * Every other sport is analyzed with the registry event log (lib/sports/registry-log.ts). Ice hockey's older
 * shots-only config stays registered so games saved with it still open, but new hockey runs use the registry log.
 */
export const POSSESSION_LOG_SPORTS: readonly string[] = ["basketball", "lacrosse"];
export const usesPossessionLog = (sportId: string): boolean => POSSESSION_LOG_SPORTS.includes(sportId);
