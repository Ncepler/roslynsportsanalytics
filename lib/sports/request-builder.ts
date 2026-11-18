// Builds Gemini requests from the sport registry: 10-minute chunks, a prompt from the selected stats'
// "look for" text, and a JSON response schema made of events only. The AI never returns a percentage,
// total or efficiency; code computes those from the events.
import { CHUNK_MINUTES } from "./estimate";
import { getEventSchema, SCOREBOARD_ONLY_EVENTS, type EventTypeDef, type SportEventSchema } from "./event-schemas";
import type { Sport, Stat } from "./registry-types";

/** An event within this many seconds of an inner chunk edge is marked for review (never deduped). */
export const BOUNDARY_REVIEW_SECONDS = 15;

export type Chunk = { start: number; end: number };

export type TeamColours = { roslyn: string; opponent: string };

export type RequestSpec = {
  chunk: Chunk;
  prompt: string;
  schema: Record<string, unknown>;
};

/** One event as returned by the model, then fixed up by `normalizeEvents`. */
export type LoggedEvent = {
  timestampSeconds: number;
  period: string | null;
  team: string | null;
  type: string;
  /** Events from a hand-written event schema carry their values here. */
  fields?: Record<string, unknown>;
  /** Generic events (sports with no hand-written schema): which wanted stats this event counts toward. */
  statIds?: string[];
  /** Generic events: one line describing what was seen. Shown on Review only, never stored. */
  detail?: string | null;
  /** Set by normalizeEvents. */
  needsReview?: boolean;
  reviewReason?: string;
};

/** Splits [start, end] (seconds) into consecutive chunks of at most `chunkMinutes`. No overlap. */
export function planChunks(start: number, end: number, chunkMinutes: number = CHUNK_MINUTES): Chunk[] {
  const size = chunkMinutes * 60;
  const chunks: Chunk[] = [];
  for (let s = start; s < end; s += size) chunks.push({ start: s, end: Math.min(s + size, end) });
  return chunks;
}

function eventSchemaFor(sport: Sport): SportEventSchema | null {
  if (sport.analysis.mode === "scoreboard-only") return { sportId: sport.id, ...SCOREBOARD_ONLY_EVENTS };
  return getEventSchema(sport.id) ?? null;
}

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, "null"], ...extra });

function fieldSchema(f: EventTypeDef["fields"][number]) {
  return nullable(f.type, { ...(f.values ? { enum: [...f.values, null] } : {}), description: f.description });
}

/** JSON schema for one chunk's response. Sports with no event schema get a generic envelope with a free-text detail. */
export function buildResponseSchema(sport: Sport, teams: TeamColours, statIds: string[] = []): Record<string, unknown> {
  const es = eventSchemaFor(sport);
  const teamEnum = [teams.roslyn, teams.opponent];
  const base = {
    timestampSeconds: { type: "number", description: "Seconds from the START OF THIS CLIP (0 = first frame you are shown)." },
    period: nullable("string", { ...(es ? { enum: [...es.periods, null] } : {}), description: "Period or quarter from the scoreboard, or null if unreadable." }),
    team: nullable("string", { enum: [...teamEnum, null], description: "The team by jersey colour, or null if the event belongs to neither." }),
  };
  if (!es) {
    return {
      type: "object",
      properties: {
        events: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ...base,
              type: { type: "string", description: "Short snake_case event name taken from the list of events to log." },
              statIds: { type: "array", items: { type: "string", enum: statIds }, description: "The ids of the wanted stats this event counts toward (one event can count toward several)." },
              detail: nullable("string", { description: "One line describing what was seen." }),
            },
            required: ["timestampSeconds", "period", "team", "type", "statIds", "detail"],
          },
        },
      },
      required: ["events"],
    };
  }
  // `fields` holds the union of every event type's fields, all optional; the prompt says which belong to which type.
  const fieldProps: Record<string, unknown> = {};
  for (const e of es.events) for (const f of e.fields) fieldProps[f.name] ??= fieldSchema(f);
  return {
    type: "object",
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: { ...base, type: { type: "string", enum: es.events.map((e) => e.type) }, fields: { type: "object", properties: fieldProps } },
          required: ["timestampSeconds", "period", "team", "type", "fields"],
        },
      },
    },
    required: ["events"],
  };
}

const statLine = (s: Stat, withId: boolean) => `- ${withId ? `[${s.id}] ` : ""}${s.name}: ${s.lookFor}`;

/** The prompt for one chunk. Contains only registry text, the event schema, and the colours the user picked. */
export function buildPrompt(sport: Sport, selectedStats: Stat[], teams: TeamColours, chunk: Chunk): string {
  const es = eventSchemaFor(sport);
  const minutes = ((chunk.end - chunk.start) / 60).toFixed(1);
  const lines: string[] = [
    `You are logging events from ${minutes} minutes of a ${sport.name.toLowerCase()} game. Teams are identified by jersey colour: "${teams.roslyn}" (Roslyn) and "${teams.opponent}" (the opponent).`,
    `Return JSON only. Log events, never statistics: do not compute percentages, totals, averages or efficiencies. Every timestampSeconds counts from the start of this clip. If you cannot see or read something, use null; do not guess.`,
    "",
    `What decides games in this sport: ${sport.summary}`,
    `Events to log: ${sport.eventsNote}`,
  ];
  if (selectedStats.length > 0) lines.push("", "The stats wanted (code computes them from your events; log the events they need):", ...selectedStats.map((s) => statLine(s, !es)));
  if (es) {
    lines.push("", "Event types and their fields (put the fields in `fields`; leave others out or null):");
    for (const e of es.events) {
      lines.push(`- ${e.type}: ${e.description}`);
      for (const f of e.fields) lines.push(`    ${f.name}${f.values ? ` (${f.values.join(" | ")})` : ` (${f.type})`}: ${f.description}`);
    }
  } else {
    lines.push("", "Log one event each time something happens that counts toward a wanted stat. Use a short snake_case name for `type`, put the ids (in square brackets above) of every stat the event counts toward in `statIds`, and a one-line description in `detail`. Only log what you can see; a stat you cannot see in this footage simply gets no events.");
  }
  return lines.join("\n");
}

/** Everything needed to send one game: a request per 10-minute chunk. */
export function buildRequests(sport: Sport, selectedStatIds: string[], teams: TeamColours, range: Chunk, chunkMinutes: number = CHUNK_MINUTES): RequestSpec[] {
  const wanted = new Set(selectedStatIds);
  const selected = sport.stats.filter((s) => wanted.has(s.id));
  const schema = buildResponseSchema(sport, teams, selectedStatIds);
  return planChunks(range.start, range.end, chunkMinutes).map((chunk) => ({ chunk, prompt: buildPrompt(sport, selected, teams, chunk), schema }));
}

/**
 * Turns a chunk's raw events into whole-game events: adds the chunk start to each timestamp and marks events
 * near an inner chunk edge for review. Events are NOT merged or deduplicated: a person decides.
 */
export function normalizeEvents<T extends { timestampSeconds: number; needsReview?: boolean; reviewReason?: string }>(events: T[], chunk: Chunk, range: Chunk): T[] {
  return events.map((e) => {
    const t = chunk.start + e.timestampSeconds;
    const nearStart = chunk.start > range.start && t - chunk.start <= BOUNDARY_REVIEW_SECONDS;
    const nearEnd = chunk.end < range.end && chunk.end - t <= BOUNDARY_REVIEW_SECONDS;
    const out: T = { ...e, timestampSeconds: t };
    if (nearStart || nearEnd) {
      out.needsReview = true;
      out.reviewReason = `Near a ${CHUNK_MINUTES}-minute chunk edge: may repeat or miss an event in the neighbouring chunk.`;
    }
    return out;
  });
}
