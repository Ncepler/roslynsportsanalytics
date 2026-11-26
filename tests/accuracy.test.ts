import { describe, expect, it } from "vitest";
import { ACCURACY, accuracyText } from "@/lib/accuracy";
import { allSheets, toCSV, toTSV } from "@/lib/sheets";
import { eventsToTsv } from "@/lib/sports/registry-log";
import { detect, parseDelimited } from "@/lib/season/parse";
import { ev, poss, shot } from "./helpers";

describe("accuracy note", () => {
  it("has no margin until one has been measured, and shows no number", () => {
    expect(ACCURACY.marginPercent).toBeNull();
    expect(accuracyText()).toBe(ACCURACY.note);
    expect(accuracyText()).not.toMatch(/\d|%|±/);
  });

  it("adds the margin only when one is set", () => {
    expect(accuracyText({ ...ACCURACY, marginPercent: 8 })).toBe(`${ACCURACY.note} Usually within ±8%.`);
    expect(accuracyText({ ...ACCURACY, marginPercent: 0 })).toBe(ACCURACY.note);
    expect(accuracyText({ ...ACCURACY, marginPercent: Number.NaN })).toBe(ACCURACY.note);
  });

  const log = {
    possessions: [poss("roslyn", 1, 9, [shot("roslyn", 3, 2, true), ev("rebound", "opponent", 8)], { context: "M" })],
    scoreboard: [],
    warnings: [],
  };

  it("every sheet export starts with the note (copy and CSV)", () => {
    const sheets = allSheets(log, ["shots", "context"], "Port", "basketball");
    expect(sheets.length).toBeGreaterThan(0);
    for (const s of sheets) {
      expect(toTSV(s).split("\n")[0]).toBe(ACCURACY.note);
      expect(toCSV(s).split("\r\n")[0]).toBe(ACCURACY.note.includes(",") ? `"${ACCURACY.note}"` : ACCURACY.note);
    }
  });

  it("the registry event log export starts with the note", () => {
    expect(eventsToTsv([]).split("\n")[0]).toBe(ACCURACY.note);
  });

  it("a CSV with the note row still reads as the same sheet when read back", () => {
    const sheet = allSheets(log, ["shots", "context"], "Port", "basketball").find((s) => s.id === "offense-summary-roslyn")!;
    const withNote = detect(parseDelimited(toCSV(sheet)));
    expect(withNote).not.toBeNull();
    expect(withNote).toBe(detect(parseDelimited(toCSV(sheet).split("\r\n").slice(1).join("\r\n"))));
  });
});
