import type { SportConfig } from "./types";

// Lacrosse v1 (CLAUDE.md sections 9 and 10): the club's two sheets, turnovers
// by quarter and Roslyn's defense by M / Z / F with Goal / No Goal. Tiers are
// untested guesses; lacrosse is harder for the AI than basketball.
// Efficiency formulas are unknown (section 18) so those columns stay blank.
export const lacrosse: SportConfig = {
  id: "lacrosse",
  label: "Lacrosse",
  periods: ["1", "2", "3", "4", "OT"],
  playersPerSide: 10,
  surface: "field",
  shotPoints: [1],
  shotPointsHelp: "Always 1 (a goal is worth one).",
  sheets: ["lax-turnovers", "lax-defense"],
  possessionDefinition:
    "A possession starts when a team gains control (face-off win, ground ball, save and clear, or the other team's turnover) and ends on a goal, a turnover (interception, ground ball picked up by the other team, out of bounds, penalty), a save the goalie controls, or the end of a period. A missed shot that goes out of bounds and is awarded back to the shooting team (backed up) stays the same possession. The ball is small and hard to see: use which goal the play is at, the jersey colors, and the scoreboard, not which side of the frame the action is on.",
  stats: [
    {
      id: "shots",
      pass: 1,
      label: "Shots and goals",
      tier: "reliable",
      source: "logged",
      description: "Every shot on goal or wide, and whether it was a goal.",
      events: ["shot"],
      sheets: ["lax-defense"],
      defaultOn: true,
    },
    {
      id: "turnovers",
      pass: 2,
      label: "Turnovers",
      tier: "decent",
      source: "logged",
      description:
        "Any loss of possession without a shot: interception, ground ball won by the other team, out of bounds, failed clear, or a penalty that gives the ball away. Play suddenly moving to the other end is often a turnover.",
      events: ["turnover"],
      sheets: ["lax-turnovers"],
      defaultOn: true,
    },
    {
      id: "context",
      pass: 1,
      label: "Defense type (man, zone, fast break)",
      tier: "decent",
      source: "logged",
      description:
        "For each possession, the defense the attacking team faced: M = man-to-man, Z = zone, F = fast break or transition (attack before the defense is set). Use null if you cannot tell.",
      sheets: ["lax-defense"],
      defaultOn: true,
    },

    { id: "score-by-quarter", label: "Score by quarter", tier: "reliable", source: "derived", description: "Goals per quarter for both teams.", defaultOn: true },
    { id: "scoreboard-check", label: "Scoreboard check", tier: "reliable", source: "derived", description: "Logged goals compared with the scoreboard.", defaultOn: true },
    { id: "by-quarter", label: "Turnovers by quarter", tier: "decent", source: "derived", description: "Turnovers per quarter for both teams.", sheets: ["lax-turnovers"], defaultOn: true },
    { id: "defense", label: "Roslyn defense: goal or no goal by M / Z / F", tier: "decent", source: "derived", description: "Opponent possessions by defense type and result.", sheets: ["lax-defense"], defaultOn: true },
    { id: "pace", label: "Possessions by quarter", tier: "decent", source: "derived", description: "Possessions counted per quarter.", defaultOn: true },
  ],
};
