// SIMULATION ONLY. Made-up events for the /test page, for any sport that uses the registry event log.
// Every event is generated from the sport's own stat list (lib/sports/registry), so a hockey run shows hockey
// stats and nothing else. Nothing here is real data.
import type { GameSetup } from "@/lib/gemini/prompt";
import { getRegistrySport } from "@/lib/sports/registry";
import type { RegistryEvent } from "@/lib/sports/registry-log";
import { normalizeEvents, type Chunk } from "@/lib/sports/request-builder";

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One event roughly every 25 seconds of game, each counting toward 1-2 of the wanted stats. */
export function simulateRegistryEvents(chunk: Chunk, whole: Chunk, setup: GameSetup): RegistryEvent[] {
  const sport = getRegistrySport(setup.sportId);
  if (!sport) return [];
  const wanted = new Set(setup.registryStatIds ?? sport.stats.map((s) => s.id));
  // Skip "L" stats like the real AI would (hard to see from one camera), and the universal rows that are pure math.
  const pool = sport.stats.filter((s) => wanted.has(s.id) && s.video !== "L" && !s.universal);
  if (pool.length === 0) return [];
  const rand = mulberry32(hash(`${setup.awayName}|${setup.sportId}|${chunk.start}`));
  const length = chunk.end - chunk.start;
  const count = Math.max(1, Math.round(length / 25));
  const total = whole.end - whole.start || 1;
  const events: RegistryEvent[] = [];
  for (let i = 0; i < count; i++) {
    const stat = pool[Math.floor(rand() * pool.length)];
    const second = rand() * length;
    const other = rand() < 0.3 ? pool[Math.floor(rand() * pool.length)] : null;
    const gameFraction = (chunk.start - whole.start + second) / total;
    events.push({
      timestampSeconds: second,
      period: String(Math.min(4, 1 + Math.floor(gameFraction * 4))),
      team: rand() < 0.5 ? "roslyn" : "opponent",
      type: stat.id.replace(/-/g, "_"),
      statIds: other && other.id !== stat.id ? [stat.id, other.id] : [stat.id],
      detail: `Simulated: ${stat.name}`,
    });
  }
  return events.sort((a, b) => a.timestampSeconds - b.timestampSeconds);
}

/** Simulated chunk events with the chunk start added back and edge events flagged, like the real run. */
export const simulateChunk = (chunk: Chunk, whole: Chunk, setup: GameSetup): RegistryEvent[] => normalizeEvents(simulateRegistryEvents(chunk, whole, setup), chunk, whole);
