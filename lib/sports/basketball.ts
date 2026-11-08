import type { SportConfig } from "./types";

// Basketball stats (CLAUDE.md section 9). Tiers are untested guesses until
// checked on real footage.
export const basketball: SportConfig = {
  id: "basketball",
  label: "Basketball",
  periods: ["1", "2", "3", "4", "OT"],
  playersPerSide: 5,
  surface: "court",
  shotPoints: [1, 2, 3],
  shotPointsHelp: "1 = free throw, 2 = two-pointer, 3 = three-pointer.",
  sheets: ["offense-summary", "possession-log", "roslyn-offense"],
  possessionDefinition:
    "A possession starts when a team gains control of the ball and ends on a made basket (or the last made free throw of a trip), a turnover, a defensive rebound by the other team, or the end of a period. An offensive rebound does NOT start a new possession: the missed shot and the offensive rebound stay in the same possession.",
  stats: [
    // Reliable, logged
    {
      id: "shots",
      label: "Shot attempts and makes (2PT, 3PT, FT)",
      tier: "reliable",
      source: "logged",
      description: "Every field goal attempt (2 or 3 points) and free throw, and whether it went in.",
      events: ["shot"],
      sheets: ["offense-summary", "possession-log", "roslyn-offense"],
      defaultOn: true,
    },
    {
      id: "context",
      label: "Possession context (vs man, vs zone, fast break)",
      tier: "reliable",
      source: "logged",
      description:
        "For each possession, the defense faced: M = man-to-man, Z = zone, F = fast break (attack before the defense is set). Use null if you cannot tell.",
      sheets: ["offense-summary", "roslyn-offense"],
      defaultOn: true,
    },
    {
      id: "turnovers",
      label: "Turnovers",
      tier: "reliable",
      source: "logged",
      description: "Any loss of possession without a shot: bad pass, travel, steal, offensive foul, out of bounds, violation.",
      events: ["turnover"],
      sheets: ["offense-summary", "possession-log"],
      defaultOn: true,
    },
    {
      id: "fouls",
      label: "Fouls",
      tier: "reliable",
      source: "logged",
      description: "Every foul called, and which team committed it.",
      events: ["foul"],
      sheets: ["offense-summary", "possession-log"],
      defaultOn: true,
    },

    // Reliable, derived in code
    { id: "points", label: "Points", tier: "reliable", source: "derived", description: "2 × 2PT made + 3 × 3PT made + FT made.", sheets: ["offense-summary", "possession-log"], defaultOn: true },
    { id: "efficiency", label: "Offensive efficiency", tier: "reliable", source: "derived", description: "Points ÷ possessions × 100.", sheets: ["offense-summary"], defaultOn: true },
    { id: "ppp", label: "Points per possession", tier: "reliable", source: "derived", description: "Points ÷ possessions.", defaultOn: true },
    { id: "pace", label: "Pace (possessions per quarter)", tier: "reliable", source: "derived", description: "Possessions counted per quarter.", defaultOn: true },
    { id: "score-by-quarter", label: "Score by quarter", tier: "reliable", source: "derived", description: "Points per quarter for both teams.", defaultOn: true },
    { id: "scoreboard-check", label: "Scoreboard check", tier: "reliable", source: "derived", description: "Logged points compared with the scoreboard each quarter.", defaultOn: true },
    { id: "second-chance", label: "Second-chance points", tier: "reliable", source: "derived", description: "Points scored after an offensive rebound in the same possession.", defaultOn: true },
    { id: "off-turnovers", label: "Points off turnovers", tier: "reliable", source: "derived", description: "Points on possessions that start right after the other team's turnover.", defaultOn: true },
    { id: "fast-break-points", label: "Fast-break points", tier: "reliable", source: "derived", description: "Points on F possessions.", defaultOn: true },
    { id: "by-quarter", label: "Turnovers and fouls by quarter", tier: "reliable", source: "derived", description: "Counts per quarter.", defaultOn: true },
    { id: "fg-pct", label: "FG%, 3P%, FT%", tier: "reliable", source: "derived", description: "Makes ÷ attempts.", defaultOn: true },
    { id: "efg", label: "Effective FG%", tier: "reliable", source: "derived", description: "(FG made + 0.5 × 3PT made) ÷ FG attempts.", defaultOn: true },
    { id: "tov-rate", label: "Turnover rate", tier: "reliable", source: "derived", description: "Turnovers ÷ possessions.", defaultOn: true },

    // Decent, logged (review recommended)
    {
      id: "turnover-type",
      label: "Turnover type",
      tier: "decent",
      source: "logged",
      description: "For each turnover: steal, bad pass, travel, offensive foul, out of bounds, or other violation.",
      events: ["turnover"],
      fields: ["turnoverType"],
      defaultOn: true,
    },
    { id: "steals", label: "Steals", tier: "decent", source: "logged", description: "A defender takes the ball away.", events: ["steal"], sheets: ["offense-summary", "possession-log"], defaultOn: true },
    {
      id: "rebounds",
      label: "Offensive and defensive rebounds",
      tier: "decent",
      source: "logged",
      description: "Who secures each missed shot: offensive (shooting team keeps it) or defensive.",
      events: ["rebound"],
      sheets: ["offense-summary", "possession-log", "roslyn-offense"],
      defaultOn: true,
    },
    { id: "assists", label: "Assists", tier: "decent", source: "logged", description: "The pass directly before a made field goal.", events: ["assist"], sheets: ["offense-summary", "possession-log", "roslyn-offense"], defaultOn: true },
    { id: "blocks", label: "Blocks", tier: "decent", source: "logged", description: "A defender deflects a shot attempt.", events: ["block"], sheets: ["offense-summary", "possession-log"], defaultOn: true },
    { id: "shot-type", label: "Shot type", tier: "decent", source: "logged", description: "For each field goal attempt: drive, catch-and-shoot, pull-up, post, putback, or other.", events: ["shot"], fields: ["shotType"], defaultOn: true },
    { id: "shot-zone", label: "Shot zone", tier: "decent", source: "logged", description: "For each field goal attempt: paint, mid-range, corner 3, or above-the-break 3.", events: ["shot"], fields: ["shotZone"], defaultOn: true },
    { id: "shooter", label: "Shooter jersey number", tier: "decent", source: "logged", description: "Jersey number of the player for each event, or null if you cannot read it.", fields: ["player"], defaultOn: true },

    // Experimental
    { id: "contested", label: "Contested vs open shots", tier: "experimental", source: "logged", description: "For each field goal attempt: contested (a defender within arm's reach, hand up) or open.", events: ["shot"], fields: ["contested"], defaultOn: false },
    { id: "possession-time", label: "Exact possession time", tier: "experimental", source: "derived", description: "Possession length from video time. Expect ±1–2 seconds at 1 frame per second.", sheets: ["possession-log"], defaultOn: false },
  ],
};
