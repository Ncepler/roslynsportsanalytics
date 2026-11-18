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

/** Every stat is on by default. In scoreboard-only sports only the universal stats can be on. */
export function defaultRegistryStatIds(sport: Sport): string[] {
  return sport.stats.filter((s) => isStatSelectable(sport, s)).map((s) => s.id);
}

/** Scoreboard-only sports let you pick only the universal stats; the rest are listed but disabled. */
export const isStatSelectable = (sport: Sport, stat: { universal: boolean }): boolean => sport.analysis.mode !== "scoreboard-only" || stat.universal;

/** Just what the Roslyn-game check needs to know about a sport. Works for all 22 sports. */
export function gateSportOf(id: string): { id: string; label: string } | undefined {
  const s = getRegistrySport(id);
  return s ? { id: s.id, label: s.name } : undefined;
}
