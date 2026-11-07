import type { EventField, EventType, SportConfig } from "@/lib/sports/types";

export type GameSetup = {
  sportId: string;
  roslynColor: string;
  awayName: string;
  awayColor: string;
  roslynRoster: string;
  awayRoster: string;
  statIds: string[];
  /** Corrected appearance notes, plain text. Lives only for this run. */
  appearanceNotes?: string;
};

const nullable = (type: string | string[], extra: Record<string, unknown> = {}) => ({
  type: [...(Array.isArray(type) ? type : [type]), "null"],
  ...extra,
});

/** Which event types and fields the checked stats need. */
export function requestedShape(sport: SportConfig, statIds: string[]) {
  const checked = sport.stats.filter((s) => statIds.includes(s.id) && s.source === "logged");
  const events = new Set<EventType>(checked.flatMap((s) => s.events ?? []));
  const fields = new Set<EventField>(checked.flatMap((s) => s.fields ?? []));
  // The scoreboard check needs points for both teams, so shots are always logged.
  events.add("shot");
  return { checked, events: [...events], fields: [...fields] };
}

/** JSON schema for the possession log, built from the checked stats. */
export function possessionLogSchema(sport: SportConfig, statIds: string[]) {
  const { events, fields } = requestedShape(sport, statIds);

  const eventProps: Record<string, unknown> = {
    type: { type: "string", enum: events },
    team: { type: "string", enum: ["roslyn", "opponent"] },
    videoTime: { type: "number", description: "Seconds from the start of the full video file." },
    clock: nullable("string", { description: 'Game clock on the scoreboard as "M:SS", or null if unreadable.' }),
    player: nullable("string", { description: "Jersey number, or null if unreadable." }),
    points: nullable("integer", { enum: [1, 2, 3, null], description: "Shots only: 1 = free throw, 2, or 3." }),
    made: nullable("boolean", { description: "Shots only." }),
    reboundType: nullable("string", { enum: ["offensive", "defensive", null] }),
    description: { type: "string", description: "One short line describing what you saw." },
  };
  if (fields.includes("shotType")) eventProps.shotType = nullable("string", { enum: ["drive", "catch-and-shoot", "pull-up", "post", "putback", "other", null] });
  if (fields.includes("shotZone")) eventProps.shotZone = nullable("string", { enum: ["paint", "mid-range", "corner 3", "above-the-break 3", null] });
  if (fields.includes("turnoverType")) eventProps.turnoverType = nullable("string", { enum: ["steal", "bad pass", "travel", "offensive foul", "out of bounds", "violation", "other", null] });
  if (fields.includes("contested")) eventProps.contested = nullable("boolean");

  return {
    type: "object",
    properties: {
      possessions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            team: { type: "string", enum: ["roslyn", "opponent"] },
            quarter: nullable("string", { enum: [...sport.periods, null] }),
            clockStart: nullable("string"),
            clockEnd: nullable("string"),
            videoStart: { type: "number" },
            videoEnd: { type: "number" },
            context: nullable("string", { enum: ["M", "Z", "F", null] }),
            events: {
              type: "array",
              items: { type: "object", properties: eventProps, required: ["type", "team", "videoTime", "clock", "player", "description"] },
            },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            note: nullable("string"),
          },
          required: ["team", "quarter", "clockStart", "clockEnd", "videoStart", "videoEnd", "context", "events", "confidence", "note"],
        },
      },
      scoreboard: {
        type: "array",
        description: "Scoreboard readings: at least one per period (near its end) and any time the score is clearly visible after a change.",
        items: {
          type: "object",
          properties: {
            videoTime: { type: "number" },
            quarter: nullable("string"),
            clock: nullable("string"),
            roslyn: nullable("integer"),
            opponent: nullable("integer"),
          },
          required: ["videoTime", "quarter", "clock", "roslyn", "opponent"],
        },
      },
      warnings: { type: "array", items: { type: "string" } },
    },
    required: ["possessions", "scoreboard", "warnings"],
  };
}

export function possessionLogPrompt(sport: SportConfig, setup: GameSetup, segment: { start: number; end: number }) {
  const { checked } = requestedShape(sport, setup.statIds);
  const roster = (label: string, list: string) => (list.trim() ? `${label} jersey numbers: ${list.trim()}.` : "");

  return [
    `You are logging a ${sport.label.toLowerCase()} game from video for a high school stats club. Log what you SEE. Never guess.`,
    "",
    "Teams:",
    `- "roslyn": Roslyn, wearing ${setup.roslynColor}. ${roster("Roslyn", setup.roslynRoster)}`,
    `- "opponent": ${setup.awayName}, wearing ${setup.awayColor}. ${roster(setup.awayName, setup.awayRoster)}`,
    setup.appearanceNotes?.trim() ? `\nPlayer appearance notes (from earlier in this game):\n${setup.appearanceNotes.trim()}` : "",
    "",
    `Watch only from ${segment.start.toFixed(1)}s to ${segment.end.toFixed(1)}s of the video. Report every videoTime in seconds from the start of the FULL video file, not from the start of this section.`,
    "",
    `Possession rule: ${sport.possessionDefinition}`,
    "Log possessions for BOTH teams, in order.",
    "",
    "What to log:",
    ...checked.map((s) => `- ${s.label}: ${s.description}`),
    "",
    "Rules:",
    "- Do not add up, total, or average anything. Only record individual events.",
    "- If you cannot see or read something (a jersey number, the clock, whether a shot went in), use null and explain in the possession's note or in warnings. Omission beats a guess.",
    "- Read quarter, clock, and score from the scoreboard graphic. Record scoreboard readings near the end of each period and whenever the score is clearly visible after it changes.",
    "- Set confidence to low when the camera angle, a cut, or players blocking the view made the possession hard to follow.",
    "- Each event's description is one short line a person can check against the video.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}
