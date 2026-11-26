import { describe, expect, it } from "vitest";
import { NO_VIDEO_SECONDS } from "@/lib/demo/constants";
import { simulateGame } from "@/lib/demo/simulate";
import { simulateChunk } from "@/lib/demo/simulate-registry";
import { defaultStatIds, SPORTS } from "@/lib/sports";
import type { GameSetup } from "@/lib/gemini/prompt";

const setup = (sportId: GameSetup["sportId"]): GameSetup => ({
  sportId,
  roslynColor: "blue",
  awayName: "Test",
  awayColor: "white",
  roslynRoster: "",
  awayRoster: "",
  statIds: SPORTS[sportId] ? defaultStatIds(SPORTS[sportId]) : [],
});

describe("the no-video demo is a 90-minute game", () => {
  it("is 90 minutes long", () => {
    expect(NO_VIDEO_SECONDS).toBe(90 * 60);
  });

  it.each(["basketball", "lacrosse"] as const)("the simulated %s log spans the whole 90 minutes and all four quarters", (sport) => {
    const game = simulateGame([{ start: 0, end: NO_VIDEO_SECONDS }], setup(sport));
    const last = game.possessions[game.possessions.length - 1];
    expect(game.possessions[0].videoStart).toBeLessThan(120);
    expect(last.videoEnd).toBeGreaterThan(NO_VIDEO_SECONDS - 300);
    expect(last.videoEnd).toBeLessThanOrEqual(NO_VIDEO_SECONDS);
    expect(new Set(game.possessions.map((p) => p.quarter))).toEqual(new Set(["1", "2", "3", "4"]));
  });

  it("the simulated registry events cover the whole 90 minutes", () => {
    const whole = { start: 0, end: NO_VIDEO_SECONDS };
    const events = Array.from({ length: 9 }, (_, i) => simulateChunk({ start: i * 600, end: (i + 1) * 600 }, whole, setup("volleyball"))).flat();
    expect(Math.max(...events.map((e) => e.timestampSeconds))).toBeGreaterThan(NO_VIDEO_SECONDS - 700);
  });
});
