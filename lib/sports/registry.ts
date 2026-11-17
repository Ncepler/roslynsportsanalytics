// Read access to the sport registry. All sport, stat, fps and model data lives in ./generated and ./models.
import { SPORT_REGISTRY } from "./generated/sports";
import { getModel } from "./models";
import { MODEL_OVERRIDES } from "./overrides";
import type { ModelConfig, Sport } from "./registry-types";

export { SPORT_REGISTRY } from "./generated/sports";

export const getRegistrySport = (id: string): Sport | undefined => SPORT_REGISTRY.find((s) => s.id === id);

/** The model a sport runs on. Throws if the registry names a model that has no config. */
export function modelForSport(sport: Sport): ModelConfig {
  const id = MODEL_OVERRIDES[sport.id] ?? sport.analysis.defaultModel;
  const m = getModel(id);
  if (!m) throw new Error(`Sport ${sport.id} names unknown model ${id}`);
  return m;
}

/** Stats checked by default: tier 1 stats the AI can read reliably. In scoreboard-only sports, the universal stats. */
export function defaultRegistryStatIds(sport: Sport): string[] {
  const scoreboardOnly = sport.analysis.mode === "scoreboard-only";
  return sport.stats.filter((s) => (scoreboardOnly ? s.universal : s.tier === 1 && s.video !== "L")).map((s) => s.id);
}

/** Scoreboard-only sports let you pick only the universal stats; the rest are listed but disabled. */
export const isStatSelectable = (sport: Sport, stat: { universal: boolean }): boolean => sport.analysis.mode !== "scoreboard-only" || stat.universal;
