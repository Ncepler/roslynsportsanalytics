import { describe, expect, test } from "vitest";
import { decideGate } from "@/lib/gemini/gate";
import { estimate } from "@/lib/sports/estimate";
import { getModel, rates } from "@/lib/sports/models";
import { defaultRegistryStatIds, gateSportOf, getRegistrySport, isStatSelectable, SPORT_REGISTRY } from "@/lib/sports/registry";
import { sanitizeRegistryEvents, tallyByStat } from "@/lib/sports/registry-log";
import { buildRequests, normalizeEvents, planChunks } from "@/lib/sports/request-builder";

const r2 = (n: number) => Math.round(n * 100) / 100;

describe("registry", () => {
  test("all 22 sports, every stat on by default", () => {
    expect(SPORT_REGISTRY).toHaveLength(22);
    for (const s of SPORT_REGISTRY) {
      const on = defaultRegistryStatIds(s);
      expect(on.length).toBeGreaterThanOrEqual(8);
      expect(on.every((id) => s.stats.some((x) => x.id === id))).toBe(true);
    }
  });
  test("scoreboard-only sports only allow the universal stats", () => {
    const g = getRegistrySport("gymnastics")!;
    expect(g.analysis.mode).toBe("scoreboard-only");
    expect(defaultRegistryStatIds(g).every((id) => g.stats.find((s) => s.id === id)!.universal)).toBe(true);
    expect(isStatSelectable(g, g.stats.find((s) => !s.universal)!)).toBe(false);
  });
});

describe("estimate and prices", () => {
  const bb = getRegistrySport("basketball")!;
  const run = (m: string, fps: number, min: number, d: string) => estimate(bb, getModel(m)!, fps, min, d);
  test("matches the Gemini doc's published per-game costs", () => {
    expect(r2(run("gemini-3.8-flash", 3, 90, "2026-11-17").costUsd)).toBe(1.08);
    expect(r2(run("gemini-3.1-pro-preview", 5, 90, "2026-11-17").costUsd)).toBe(8.54); // 10-minute chunks pass 200k tokens
    expect(r2(run("gemini-3.8-flash", 3, 90, "2027-01-02").costUsd)).toBe(2.16);
    expect(r2(run("gemini-4-argon", 1, 90, "2026-12-02").costUsd)).toBe(2.92);
  });
  test("warns about a price change within 60 days only", () => {
    expect(run("gemini-3.8-flash", 3, 90, "2026-11-17").priceChange?.effectiveFrom).toBe("2027-01-01");
    expect(run("gemini-3.8-flash", 3, 90, "2026-10-01").priceChange).toBeNull();
    expect(run("gemini-3.5-flash-lite", 1, 90, "2026-11-17").priceChange).toBeNull();
  });
  test("rates(model, date) picks the row in force", () => {
    const m = getModel("gemini-3.8-flash")!;
    expect(rates(m, "2026-12-31").inputPerMillion).toBe(0.75);
    expect(rates(m, "2027-01-01").inputPerMillion).toBe(1.5);
  });
});

describe("registry event log", () => {
  const hockey = getRegistrySport("ice-hockey")!;
  const colours = { roslyn: "Blue", opponent: "Red" };
  const ids = hockey.stats.map((s) => s.id);
  test("sanitizing keeps valid events, nulls unknown teams, drops the unreadable", () => {
    const { events, dropped } = sanitizeRegistryEvents(
      [
        { timestampSeconds: 12, period: "1", team: "blue", type: "Blocked Shot!", statIds: [ids[0], "nope"], detail: "x" },
        { timestampSeconds: 20, period: "1", team: "green", type: "faceoff", statIds: [], detail: null },
        { timestampSeconds: 9999, period: "1", team: "red", type: "late", statIds: [] },
        { timestampSeconds: "abc", type: "bad" },
        null,
      ],
      hockey,
      ids,
      colours,
      600,
    );
    expect(dropped).toBe(3);
    expect(events[0]).toMatchObject({ team: "roslyn", type: "blocked_shot", statIds: [ids[0]] });
    expect(events[1].team).toBeNull();
  });
  test("only stats the user picked can be counted", () => {
    const { events } = sanitizeRegistryEvents([{ timestampSeconds: 1, team: "Blue", type: "t", statIds: [ids[0], ids[1]] }], hockey, [ids[0]], colours, 600);
    expect(events[0].statIds).toEqual([ids[0]]);
  });
  test("tallies by stat and team (code counts, not the AI)", () => {
    const { events } = sanitizeRegistryEvents(
      [
        { timestampSeconds: 1, team: "Blue", type: "a", statIds: [ids[0]] },
        { timestampSeconds: 2, team: "Red", type: "a", statIds: [ids[0]] },
        { timestampSeconds: 3, team: "Blue", type: "a", statIds: [ids[0]] },
      ],
      hockey,
      ids,
      colours,
      600,
    );
    const t = tallyByStat(events, hockey.stats.slice(0, 2));
    expect([t[0].roslyn, t[0].opponent, t[1].roslyn]).toEqual([2, 1, 0]);
  });
});

describe("request builder", () => {
  test("10-minute chunks, chunk start added back, edge events flagged not merged", () => {
    const chunks = planChunks(0, 1500);
    expect(chunks).toEqual([{ start: 0, end: 600 }, { start: 600, end: 1200 }, { start: 1200, end: 1500 }]);
    const out = normalizeEvents<{ timestampSeconds: number; needsReview?: boolean }>([{ timestampSeconds: 3 }, { timestampSeconds: 300 }], chunks[1], { start: 0, end: 1500 });
    expect(out.map((e) => e.timestampSeconds)).toEqual([603, 900]);
    expect(out[0].needsReview).toBe(true);
    expect(out[1].needsReview).toBeUndefined();
  });
  test("generic sports get an events-only schema listing the wanted stat ids", () => {
    const vb = getRegistrySport("volleyball")!;
    const [req] = buildRequests(vb, [vb.stats[0].id], { roslyn: "Blue", opponent: "Red" }, { start: 0, end: 300 });
    expect(JSON.stringify(req.schema)).toContain(vb.stats[0].id);
    expect(req.prompt).toContain("do not compute percentages");
    // The AI's reply has only event fields: never a percentage, total or efficiency.
    const item = ((req.schema as { properties: { events: { items: { properties: Record<string, unknown> } } } }).properties.events.items);
    expect(Object.keys(item.properties).sort()).toEqual(["detail", "period", "statIds", "team", "timestampSeconds", "type"]);
  });
});

describe("Roslyn-game check works for every sport", () => {
  test("a volleyball video passes as volleyball and fails as hockey", () => {
    const good = { sportSeen: "volleyball", isOrganizedGame: true, roslynSeen: true, roslynEvidence: "ROSLYN on jerseys", reason: "" };
    expect(decideGate(gateSportOf("volleyball")!, good).pass).toBe(true);
    expect(decideGate(gateSportOf("ice-hockey")!, good).pass).toBe(false);
    expect(gateSportOf("curling")).toBeUndefined();
  });
});
