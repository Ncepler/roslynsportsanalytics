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
  /** Starters' jersey numbers, checked by the user (plus/minus needs who started). */
  starters?: { roslyn: string[]; opponent: string[] };
};

/** What the starters request returns (section 6.1 scoreboard check folded in). */
export type AppearanceResult = {
  notes: string;
  starters: { roslyn: string[]; opponent: string[] };
  scoreboard: { visible: boolean; quarter: boolean; clock: boolean; score: boolean } | null;
};

const nullable = (type: string | string[], extra: Record<string, unknown> = {}) => ({
  type: [...(Array.isArray(type) ? type : [type]), "null"],
  ...extra,
});

const passOf = (s: { pass?: 1 | 2 | 3 }) => s.pass ?? 1;

/** The passes a run needs for the checked stats, always including pass 1 (section 6.3). */
export function passesNeeded(sport: SportConfig, statIds: string[]): (1 | 2 | 3)[] {
  const passes = new Set<1 | 2 | 3>([1]);
  for (const s of sport.stats) if (s.source === "logged" && statIds.includes(s.id)) passes.add(passOf(s));
  return [...passes].sort();
}

/** Which event types and fields the checked stats of one pass need. */
export function requestedShape(sport: SportConfig, statIds: string[], pass: 1 | 2 | 3 = 1) {
  const checked = sport.stats.filter((s) => statIds.includes(s.id) && s.source === "logged" && passOf(s) === pass);
  const events = new Set<EventType>(checked.flatMap((s) => s.events ?? []));
  const fields = new Set<EventField>(checked.flatMap((s) => s.fields ?? []));
  // The scoreboard check needs points for both teams, so pass 1 always logs shots.
  if (pass === 1) events.add("shot");
  return { checked, events: [...events], fields: [...fields] };
}

function eventProperties(sport: SportConfig, events: EventType[], fields: EventField[]) {
  const eventProps: Record<string, unknown> = {
    type: { type: "string", enum: events },
    team: { type: "string", enum: ["roslyn", "opponent"] },
    videoTime: { type: "number", description: "Seconds from the start of the full video file." },
    clock: nullable("string", { description: 'Game clock on the scoreboard as "M:SS", or null if unreadable.' }),
    player: nullable("string", { description: "Jersey number, or null if unreadable." }),
    points: nullable("integer", { enum: [...sport.shotPoints, null], description: `Shots only. ${sport.shotPointsHelp}` }),
    made: nullable("boolean", { description: sport.id === "lacrosse" ? "Shots only: true if it was a goal." : "Shots only." }),
    description: { type: "string", description: "One short line describing what you saw." },
  };
  if (events.includes("substitution")) {
    eventProps.playerIn = nullable("string", { description: "Substitutions only: jersey number of the player coming in, or null if unreadable." });
    eventProps.playerOut = nullable("string", { description: "Substitutions only: jersey number of the player going out, or null if unreadable." });
  }
  if (events.includes("rebound")) eventProps.reboundType = nullable("string", { enum: ["offensive", "defensive", null] });
  if (fields.includes("shotType")) eventProps.shotType = nullable("string", { enum: ["drive", "catch-and-shoot", "pull-up", "post", "putback", "other", null] });
  if (fields.includes("shotZone")) eventProps.shotZone = nullable("string", { enum: ["paint", "mid-range", "corner 3", "above-the-break 3", null] });
  if (fields.includes("turnoverType")) eventProps.turnoverType = nullable("string", { enum: ["steal", "bad pass", "travel", "offensive foul", "out of bounds", "violation", "other", null] });
  if (fields.includes("contested")) eventProps.contested = nullable("boolean");
  return eventProps;
}

const EVENT_REQUIRED = ["type", "team", "videoTime", "clock", "player", "description"];

/** JSON schema for the possession log (pass 1), built from the checked stats. */
export function possessionLogSchema(sport: SportConfig, statIds: string[]) {
  const { events, fields } = requestedShape(sport, statIds, 1);
  const eventProps = eventProperties(sport, events, fields);

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
              items: { type: "object", properties: eventProps, required: EVENT_REQUIRED },
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
      playerNoteUpdates: {
        type: "array",
        description:
          'Changes to the player notes you noticed in this section, one line each, e.g. "Roslyn #12 came in for #5: white jersey, knee brace" or "Opponent player with the headband is #22". Empty if nothing changed.',
        items: { type: "string" },
      },
    },
    required: ["possessions", "scoreboard", "warnings", "playerNoteUpdates"],
  };
}

export function possessionLogPrompt(sport: SportConfig, setup: GameSetup, segment: { start: number; end: number }) {
  const { checked } = requestedShape(sport, setup.statIds, 1);
  const roster = (label: string, list: string) => (list.trim() ? `${label} jersey numbers: ${list.trim()}.` : "");

  return [
    `You are logging a ${sport.label.toLowerCase()} game from video for a high school stats club. Log what you SEE. Never guess.`,
    "",
    "Teams:",
    `- "roslyn": Roslyn, wearing ${setup.roslynColor}. ${roster("Roslyn", setup.roslynRoster)}`,
    `- "opponent": ${setup.awayName}, wearing ${setup.awayColor}. ${roster(setup.awayName, setup.awayRoster)}`,
    setup.appearanceNotes?.trim() ? `\nPlayer appearance notes (the starters, checked by a person):\n${setup.appearanceNotes.trim()}` : "",
    "Keep these notes up to date as you watch: in playerNoteUpdates, add a line for each substitute who comes in (team, number, features, who they replaced if clear) and any number you can now read that the notes had as unreadable.",
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
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");
}

/** Appearance-notes pass (section 6.2): short, plain-text notes for one run only. */
export const appearanceSchema = {
  type: "object",
  properties: {
    notes: {
      type: "array",
      description: 'One line per player, e.g. "Roslyn #5: white jersey, headband, tallest on court".',
      items: { type: "string" },
    },
    starters: {
      type: "object",
      description: "Jersey numbers of the starters, as text. Use an empty string for a starter whose number you can't read.",
      properties: { roslyn: { type: "array", items: { type: "string" } }, opponent: { type: "array", items: { type: "string" } } },
      required: ["roslyn", "opponent"],
    },
    scoreboard: {
      type: "object",
      description: "Whether the scoreboard graphic is visible and each part is readable at this video quality.",
      properties: {
        visible: { type: "boolean" },
        quarter: { type: "boolean", description: "Period/quarter readable" },
        clock: { type: "boolean", description: "Game clock readable" },
        score: { type: "boolean", description: "Both teams' scores readable" },
      },
      required: ["visible", "quarter", "clock", "score"],
    },
  },
  required: ["notes", "starters", "scoreboard"],
};

export function appearancePrompt(sport: SportConfig, setup: GameSetup, segment: { start: number; end: number }) {
  const n = sport.playersPerSide;
  return [
    `Watch this stretch of a high school ${sport.label.toLowerCase()} game and write short notes that would help someone tell the players apart later in the same video.`,
    `Describe every starter: the ${n} players on the ${sport.surface} for each team at the start. Write exactly ${n} lines for Roslyn, then ${n} for the opponent, even if a number is unreadable.`,
    `Roslyn wears ${setup.roslynColor}. ${setup.awayName} wears ${setup.awayColor}.`,
    `Watch from ${segment.start.toFixed(1)}s to ${segment.end.toFixed(1)}s.`,
    "For each player: team, jersey number if readable, and visible distinguishing features (headband, sleeve, shoe color, height relative to others, position).",
    "Do not describe faces. Do not guess names. If a jersey number is unreadable, say so.",
    "Also list the starters' jersey numbers, and say whether the scoreboard is visible and whether its period, clock, and both scores are readable. Only say readable if you could actually read them.",
  ].join("\n");
}

// ---------- passes 2 and 3: add events to pass 1's possessions ----------

export type PossessionRef = { team: "roslyn" | "opponent"; videoStart: number; videoEnd: number; quarter: string | null; clockStart: string | null };

export function eventsPassSchema(sport: SportConfig, statIds: string[], pass: 2 | 3) {
  const { events, fields } = requestedShape(sport, statIds, pass);
  return {
    type: "object",
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            possession: { type: "integer", description: "The # of the possession (from the list) this event belongs to." },
            ...eventProperties(sport, events, fields),
          },
          required: ["possession", ...EVENT_REQUIRED],
        },
      },
      warnings: { type: "array", items: { type: "string" } },
    },
    required: ["events", "warnings"],
  };
}

export function eventsPassPrompt(sport: SportConfig, setup: GameSetup, segment: { start: number; end: number }, pass: 2 | 3, possessions: PossessionRef[]) {
  const { checked } = requestedShape(sport, setup.statIds, pass);
  return [
    `You are adding detail to a ${sport.label.toLowerCase()} possession log that was already made from this video. Log what you SEE. Never guess.`,
    `Roslyn wears ${setup.roslynColor}. ${setup.awayName} wears ${setup.awayColor}.`,
    setup.appearanceNotes?.trim() ? `Player notes (checked by a person):\n${setup.appearanceNotes.trim()}` : "",
    pass === 3 && setup.starters && (setup.starters.roslyn.length || setup.starters.opponent.length)
      ? `Starters: Roslyn #${setup.starters.roslyn.join(", #") || "?"}; ${setup.awayName} #${setup.starters.opponent.join(", #") || "?"}.`
      : "",
    `Watch only from ${segment.start.toFixed(1)}s to ${segment.end.toFixed(1)}s. Report every videoTime in seconds from the start of the FULL video file.`,
    "",
    "Possessions already logged (# · team · video seconds · quarter · clock):",
    ...possessions.map((p, i) => `#${i} · ${p.team} · ${p.videoStart.toFixed(1)}-${p.videoEnd.toFixed(1)}s · Q${p.quarter ?? "?"} · ${p.clockStart ?? "?"}`),
    "",
    "Log ONLY these, each tagged with the # of the possession it happened in:",
    ...checked.map((s) => `- ${s.label}: ${s.description}`),
    "",
    "Rules:",
    "- Do not add up or total anything. One entry per event.",
    "- If you cannot tell which possession an event belongs to, or cannot see it clearly, leave it out and say so in warnings. Omission beats a guess.",
    "- Do not log shots again; they are already in the log.",
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");
}
