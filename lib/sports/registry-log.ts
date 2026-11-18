// Generic event log for sports without a possession pipeline. The AI logs events and says which wanted stats each
// counts toward; code counts them. Nothing here computes a percentage: the registry's formulas need more than
// event counts, so this screen shows how many supporting events were logged per stat, and a person reviews them.
import type { LoggedEvent } from "./request-builder";
import type { Sport, Stat } from "./registry-types";

export type Side = "roslyn" | "opponent";
export type RegistryEvent = Omit<LoggedEvent, "team"> & { team: Side | null };
export type RegistryLog = { events: RegistryEvent[]; warnings: string[] };

const asText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Checks every event the AI sent. Anything unreadable is dropped and counted; nothing is guessed. */
export function sanitizeRegistryEvents(raw: unknown, sport: Sport, allowedStatIds: string[], colours: { roslyn: string; opponent: string }, chunkSeconds: number): { events: RegistryEvent[]; dropped: number } {
  const list = Array.isArray(raw) ? raw : [];
  const allowed = new Set(allowedStatIds);
  const known = new Set(sport.stats.map((s) => s.id));
  const sideOf = (v: unknown): Side | null => {
    const t = asText(v, 40).toLowerCase();
    if (!t) return null;
    if (t === colours.roslyn.trim().toLowerCase() || t === "roslyn") return "roslyn";
    if (t === colours.opponent.trim().toLowerCase() || t === "opponent") return "opponent";
    return null;
  };
  const events: RegistryEvent[] = [];
  let dropped = 0;
  for (const r of list) {
    const e = (r ?? {}) as Record<string, unknown>;
    const t = typeof e.timestampSeconds === "number" ? e.timestampSeconds : Number(e.timestampSeconds);
    const type = asText(e.type, 60).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_|_$/g, "");
    if (!Number.isFinite(t) || t < -2 || t > chunkSeconds + 2 || !type) {
      dropped++;
      continue;
    }
    const statIds = Array.isArray(e.statIds) ? [...new Set(e.statIds.filter((x): x is string => typeof x === "string" && allowed.has(x) && known.has(x)))] : [];
    events.push({
      timestampSeconds: Math.min(Math.max(t, 0), chunkSeconds),
      period: asText(e.period, 8) || null,
      team: sideOf(e.team),
      type,
      statIds,
      detail: asText(e.detail, 200) || null,
    });
  }
  return { events, dropped };
}

export type StatTally = { stat: Stat; roslyn: number; opponent: number; unassigned: number };

/** Counts, per wanted stat, the logged events that count toward it, by team. */
export function tallyByStat(events: RegistryEvent[], stats: Stat[]): StatTally[] {
  return stats.map((stat) => {
    const mine = events.filter((e) => e.statIds?.includes(stat.id));
    return {
      stat,
      roslyn: mine.filter((e) => e.team === "roslyn").length,
      opponent: mine.filter((e) => e.team === "opponent").length,
      unassigned: mine.filter((e) => e.team === null).length,
    };
  });
}

export const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** Tab-separated rows for pasting into Google Sheets. */
export function eventsToTsv(events: RegistryEvent[]): string {
  const rows = [["Video time", "Period", "Team", "Event", "Counts toward", "Needs review"], ...events.map((e) => [formatClock(e.timestampSeconds), e.period ?? "", e.team ?? "", e.type, (e.statIds ?? []).join(", "), e.needsReview ? "yes" : ""])];
  return rows.map((r) => r.join("\t")).join("\n");
}
