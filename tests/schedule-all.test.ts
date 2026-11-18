import { describe, expect, test } from "vitest";
import { importAllBody, readAllBody } from "@/lib/db/schemas";
import { matchTeam, scheduleAllPrompt, SCHEDULE_ALL_SCHEMA, toAllTeamDrafts, type KnownTeam } from "@/lib/schedule/read-all";

const season = { start_date: "2026-08-01", end_date: "2027-07-31" };
const teams: KnownTeam[] = [
  { id: "t-bvb", gender: "boys", level: "varsity", sport: "basketball", archived: false },
  { id: "t-gvb", gender: "girls", level: "varsity", sport: "basketball", archived: false },
  { id: "t-bjv", gender: "boys", level: "jv", sport: "basketball", archived: false },
  { id: "t-old", gender: "girls", level: "jv", sport: "soccer", archived: true },
];
const game = (o: Record<string, unknown>) => ({ team_label: "x", gender: "boys", level: "varsity", sport: "basketball", month: 12, day: 3, year: null, opponent: "Bellmore", home_away: "home", location: null, scrimmage: false, ...o });
const read = (games: unknown[]) => toAllTeamDrafts(JSON.stringify({ games }), season, teams);

describe("reading a schedule file for every team", () => {
  test("matches each game to the club's team and works out the year in code", () => {
    const { rows } = read([game({}), game({ gender: "girls", month: 1, day: 9, opponent: "Elmont", home_away: "away" })]);
    expect(rows.map((r) => [r.team_id, r.date, r.home_away])).toEqual([
      ["t-bvb", "2026-12-03", "home"],
      ["t-gvb", "2027-01-09", "away"],
    ]);
  });
  test("a team that isn't set up, or is archived, is left for an admin to pick", () => {
    const { rows } = read([game({ sport: "tennis" }), game({ gender: "girls", level: "jv", sport: "soccer" })]);
    expect(rows.every((r) => r.team_id === null)).toBe(true);
    expect(matchTeam(teams, "girls", "jv", "soccer")).toBeNull();
    expect(matchTeam(teams, null, "jv", "basketball")).toBeNull();
  });
  test("junior high / other-level rows are dropped and counted", () => {
    const { rows, skippedOther } = read([game({ level: "other" }), game({})]);
    expect(rows).toHaveLength(1);
    expect(skippedOther).toBe(1);
  });
  test("the same game listed twice for one team is merged; the same date for two teams is not", () => {
    const { rows, merged } = read([game({}), game({}), game({ gender: "girls" })]);
    expect(rows).toHaveLength(2);
    expect(merged).toBe(1);
  });
  test("a neutral site is stored as away; scrimmages are marked in the location; unknown sports become null", () => {
    const { rows } = read([game({ home_away: "neutral", location: "Holiday Classic", scrimmage: true }), game({ sport: "curling", day: 5 })]);
    expect(rows[0]).toMatchObject({ home_away: "away", location: "Holiday Classic (scrimmage)" });
    expect(rows[1].team_id).toBeNull();
  });
  test("a date outside the season is left blank, not guessed", () => {
    expect(read([game({ month: 6, day: 30, year: 2026 })]).rows[0].date).toBeNull();
  });
  test("an unreadable reply is an error, not an empty schedule", () => {
    expect(() => toAllTeamDrafts("not json", season, teams)).toThrow();
    expect(() => toAllTeamDrafts(JSON.stringify({ nope: 1 }), season, teams)).toThrow();
  });
  test("the prompt tells the AI to copy only, and the schema lists the real sports", () => {
    expect(scheduleAllPrompt("2026-27")).toContain("Never guess");
    expect(JSON.stringify(SCHEDULE_ALL_SCHEMA)).toContain("water-polo");
    expect(JSON.stringify(SCHEDULE_ALL_SCHEMA)).not.toContain("jhs");
  });
});

describe("request shapes", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  test("read-all takes exactly one of a file or text", () => {
    expect(readAllBody.safeParse({ season_id: id, text: "Boys Varsity Basketball Dec 3 vs Bellmore" }).success).toBe(true);
    expect(readAllBody.safeParse({ season_id: id }).success).toBe(false);
    expect(readAllBody.safeParse({ season_id: id, text: "hello there", file: { mediaType: "application/pdf", data: "x".repeat(40) } }).success).toBe(false);
    expect(readAllBody.safeParse({ season_id: id, file: { mediaType: "application/x-msdownload", data: "x".repeat(40) } }).success).toBe(false);
  });
  test("import-all needs a team on every game", () => {
    const g = { game_date: "2026-12-03", opponent_name: "Bellmore", home_away: "home", location: null };
    expect(importAllBody.safeParse({ season_id: id, games: [{ ...g, team_id: id }] }).success).toBe(true);
    expect(importAllBody.safeParse({ season_id: id, games: [g] }).success).toBe(false);
  });
});
