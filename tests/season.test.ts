import { describe, expect, it } from "vitest";
import { simulateSeasonTabs } from "@/lib/demo/season";
import { buildGames } from "@/lib/season/model";
import { readTabs } from "@/lib/season/parse";

describe("Season trends is one team, one sport", () => {
  it("the practice season is a single basketball team", () => {
    const { tabs } = simulateSeasonTabs();
    const games = buildGames(readTabs(tabs).read);
    expect(games.length).toBe(18);
    expect(new Set(games.map((g) => g.sport))).toEqual(new Set(["basketball"]));
  });
});
