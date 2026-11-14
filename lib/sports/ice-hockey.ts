import type { SportConfig } from "./types";

// Ice hockey (Noah, Nov 14: shots only for now). More stats are one entry each in `stats`.
// A hockey "possession" is an attack sequence: from a team gaining the puck and carrying it up the ice
// until a shot, a turnover, or a clear. There is no man/zone/fast-break context in hockey.
export const iceHockey: SportConfig = {
  id: "ice-hockey",
  label: "Ice Hockey",
  periods: ["1", "2", "3", "OT"],
  periodName: "Period",
  playersPerSide: 6,
  surface: "rink",
  shotPoints: [1],
  shotPointsHelp: "Every shot is 1 (a goal counts as 1 goal). Set made to true only for a goal.",
  sheets: ["hockey-shots"],
  possessionDefinition:
    "An attack sequence starts when a team gains control of the puck and ends on a shot, a turnover, a clear, a whistle, or the end of a period. Log one row per sequence for both teams, in order. A rebound that is shot again stays in the same sequence.",
  shotZones: [
    { id: "slot", label: "Slot" },
    { id: "left circle", label: "Left circle" },
    { id: "right circle", label: "Right circle" },
    { id: "point", label: "Point" },
    { id: "behind net / outside", label: "Wide / behind the net" },
  ],
  stats: [
    {
      id: "shots",
      pass: 1,
      label: "Shots (goal, saved, missed, blocked)",
      tier: "reliable",
      source: "logged",
      description:
        "Every shot attempt by either team. shotResult: goal (set made to true), saved (the goalie stopped it), missed (wide or high), or blocked (a skater blocked it). Use null if the result is not clear.",
      events: ["shot"],
      fields: ["shotResult", "shotZone"],
      sheets: ["hockey-shots"],
      defaultOn: true,
      required: true,
    },
    {
      id: "shots-taken",
      label: "Shots taken (all attempts)",
      tier: "reliable",
      source: "derived",
      description: "Every shot attempt: goals, saves, misses and blocks.",
      sheets: ["hockey-shots"],
      defaultOn: true,
    },
    {
      id: "score-by-quarter",
      label: "Goals by period",
      tier: "reliable",
      source: "derived",
      description: "Goals each team scored in each period, from the shots log.",
      defaultOn: true,
    },
    {
      id: "scoreboard-check",
      label: "Scoreboard check",
      tier: "reliable",
      source: "derived",
      description: "Compares logged goals with the scoreboard so mistakes are flagged.",
      defaultOn: true,
    },
  ],
};
