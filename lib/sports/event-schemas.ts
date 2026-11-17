// Hand-written event schemas for the sports that have one. The AI logs events only; code computes every stat.
// Sports without an entry here get only their registry `eventsNote` (see request-builder.ts).
//
// Every event the model returns has the same envelope: timestampSeconds, period, team, type, fields.
// `team` is the jersey colour the user picked for that side (null for events that belong to no team).

export type EventFieldDef = {
  name: string;
  type: "string" | "integer" | "boolean";
  /** Allowed values (strings or integers). */
  values?: (string | number)[];
  description: string;
};

export type EventTypeDef = {
  type: string;
  description: string;
  fields: EventFieldDef[];
};

export type SportEventSchema = {
  sportId: string;
  /** Allowed values for `period`. */
  periods: string[];
  events: EventTypeDef[];
};

const periods4 = ["Q1", "Q2", "Q3", "Q4", "OT"];

export const BASKETBALL_EVENTS: SportEventSchema = {
  sportId: "basketball",
  periods: periods4,
  events: [
    {
      type: "possession_start",
      description: "A team gains control of the ball.",
      fields: [{ name: "startedBy", type: "string", values: ["made_basket", "defensive_rebound", "steal", "turnover", "jump_ball", "start_of_period", "other"], description: "How the team got the ball." }],
    },
    {
      type: "possession_end",
      description: "The possession ends.",
      fields: [{ name: "endedBy", type: "string", values: ["made_shot", "defensive_rebound", "turnover", "end_of_period", "other"], description: "How it ended. An offensive rebound does NOT end a possession." }],
    },
    {
      type: "shot",
      description: "A field-goal attempt (not a free throw).",
      fields: [
        { name: "zone", type: "string", values: ["at_rim", "paint", "mid_range", "corner_three", "above_break_three"], description: "Where the shot came from. Never guess an exact spot." },
        { name: "points", type: "integer", values: [2, 3], description: "2 or 3, by whether the shooter's foot was behind the arc." },
        { name: "made", type: "boolean", description: "True if it went in." },
        { name: "context", type: "string", values: ["fast_break", "vs_man", "vs_zone"], description: "Defense the shot came against: fast break (no set defense), man, or zone." },
      ],
    },
    {
      type: "free_throw",
      description: "A free-throw attempt.",
      fields: [{ name: "made", type: "boolean", description: "True if it went in." }],
    },
    {
      type: "turnover",
      description: "A possession ends without a shot or free throw.",
      fields: [
        { name: "turnoverType", type: "string", values: ["bad_pass", "travel", "steal", "offensive_foul", "shot_clock_violation", "out_of_bounds", "other"], description: "What kind of turnover." },
        { name: "ballState", type: "string", values: ["live", "dead"], description: "live = the other team gets the ball with play still going (steal, loose ball); dead = play stopped." },
      ],
    },
    {
      type: "rebound",
      description: "A missed shot is controlled.",
      fields: [{ name: "reboundType", type: "string", values: ["off", "def"], description: "off = by the team that shot; def = by the other team." }],
    },
    {
      type: "foul",
      description: "A foul is called.",
      fields: [{ name: "foulType", type: "string", values: ["shooting", "reach_in", "off_ball", "loose_ball", "offensive", "other"], description: "What kind of foul." }],
    },
    {
      type: "scoreboard_reading",
      description: "The scoreboard is clearly readable. Use team = null. Read it; never work the score out yourself.",
      fields: [
        { name: "home", type: "integer", description: "Home team score on the scoreboard." },
        { name: "away", type: "integer", description: "Away team score on the scoreboard." },
        { name: "clock", type: "string", description: 'Game clock as "M:SS".' },
      ],
    },
  ],
};

export const LACROSSE_EVENTS: SportEventSchema = {
  sportId: "lacrosse",
  periods: ["Q1", "Q2", "Q3", "Q4", "OT"],
  events: [
    {
      type: "possession",
      description: "One team's possession from the moment it gains the ball until it loses it or scores.",
      fields: [
        { name: "startedBy", type: "string", values: ["faceoff", "ground_ball", "caused_turnover", "save", "clear", "other"], description: "How the team got the ball." },
        { name: "endedBy", type: "string", values: ["goal", "saved_shot", "missed_shot", "turnover", "penalty", "end_of_period", "other"], description: "How it ended." },
      ],
    },
    {
      type: "shot",
      description: "A shot attempt.",
      fields: [
        { name: "result", type: "string", values: ["goal", "saved", "missed", "blocked"], description: "What happened to the shot." },
        { name: "onGoal", type: "boolean", description: "True if it hit the goal or the goalie." },
      ],
    },
    {
      type: "faceoff",
      description: "A faceoff.",
      fields: [{ name: "winner", type: "string", values: ["roslyn", "opponent"], description: "Which team came away with possession." }],
    },
    {
      type: "ground_ball",
      description: "A loose ball is picked up.",
      fields: [{ name: "wonBy", type: "string", values: ["roslyn", "opponent"], description: "Which team picked it up." }],
    },
    {
      type: "turnover",
      description: "A team loses the ball. The period field is the quarter it happened in.",
      fields: [{ name: "kind", type: "string", values: ["forced", "unforced"], description: "forced = poke check, stick check or pressure; unforced = bad pass, drop, offsides." }],
    },
    {
      type: "clear",
      description: "A team tries to clear the ball out of its defensive end.",
      fields: [{ name: "success", type: "boolean", description: "True if it got across midfield with the ball." }],
    },
    {
      type: "ride",
      description: "A team tries to stop the other team's clear.",
      fields: [{ name: "success", type: "boolean", description: "True if the clear failed (the ride worked)." }],
    },
    {
      type: "penalty",
      description: "A penalty is called.",
      fields: [
        { name: "penaltyType", type: "string", description: "Short name, e.g. slash, push, holding, offside." },
        { name: "minutes", type: "integer", description: "Minutes in the penalty box (0 if none shown)." },
      ],
    },
    {
      type: "defensive_possession",
      description: "One opponent possession, tagged with the defense Roslyn played. Use the club's labels.",
      fields: [
        { name: "defense", type: "string", values: ["M", "Z", "F"], description: "M = man defense, Z = zone, F = fast break (no set defense)." },
        { name: "result", type: "string", values: ["goal", "no_goal"], description: "Whether the opponent scored on that possession." },
      ],
    },
    {
      type: "scoreboard_reading",
      description: "The scoreboard is clearly readable. Use team = null. Read it; never work the score out yourself.",
      fields: [
        { name: "home", type: "integer", description: "Home team score on the scoreboard." },
        { name: "away", type: "integer", description: "Away team score on the scoreboard." },
        { name: "clock", type: "string", description: 'Game clock as "M:SS".' },
      ],
    },
  ],
};

/** Scoreboard-only sports (gymnastics, fencing): the AI may only read the scoreboard. */
export const SCOREBOARD_ONLY_EVENTS: Omit<SportEventSchema, "sportId"> = {
  periods: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  events: [
    {
      type: "scoreboard_reading",
      description: "A score or result shown on the scoreboard. Read exactly what is displayed; if nothing is readable, log nothing.",
      fields: [
        { name: "home", type: "integer", description: "Home team / first competitor score as displayed." },
        { name: "away", type: "integer", description: "Away team / second competitor score as displayed." },
        { name: "clock", type: "string", description: "Clock or period label as displayed, if any." },
      ],
    },
  ],
};

const SCHEMAS: Record<string, SportEventSchema> = {
  basketball: BASKETBALL_EVENTS,
  lacrosse: LACROSSE_EVENTS,
};

export const getEventSchema = (sportId: string): SportEventSchema | undefined => SCHEMAS[sportId];
