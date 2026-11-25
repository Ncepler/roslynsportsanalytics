import { describe, expect, it } from "vitest";
import { deriveStatus, serverState, statusText, type StatusInput } from "@/lib/analysis/status";
import { assignBody, claimBody, memberName, releaseBody } from "@/lib/db/schemas";
import { saveBody } from "@/lib/db/save-schema";
import { cleanName } from "@/lib/client/member";
import { autoSaveScore } from "@/lib/analysis/final-score";

const base: StatusInput = { phase: "idle", hasResults: false, saved: false, savable: true, saving: false, saveFailed: false };

describe("session status (the dot)", () => {
  it("is blue while the member still has setup to do or numbers to confirm", () => {
    expect(deriveStatus(base)).toBe("needs_you");
    expect(deriveStatus({ ...base, phase: "notes" })).toBe("needs_you");
  });
  it("is grey while the AI or the save is running", () => {
    for (const phase of ["uploading", "gate", "appearance", "logging", "checking", "building"] as const) expect(deriveStatus({ ...base, phase })).toBe("working");
    expect(deriveStatus({ ...base, phase: "done", hasResults: true, saving: true })).toBe("working");
  });
  it("is red when the run fails or the video isn't a Roslyn game", () => {
    expect(deriveStatus({ ...base, phase: "error" })).toBe("failed");
    expect(deriveStatus({ ...base, phase: "rejected" })).toBe("failed");
  });
  it("is green only once the stats are saved (so Season trends already have them)", () => {
    expect(deriveStatus({ ...base, phase: "done", hasResults: true, saved: true })).toBe("done");
  });
  it("is blue again if the results exist but didn't save, or were changed after saving", () => {
    expect(deriveStatus({ ...base, phase: "done", hasResults: true, saved: false, saveFailed: true })).toBe("needs_you");
    expect(deriveStatus({ ...base, phase: "done", hasResults: true, saved: false })).toBe("needs_you");
  });
  it("is green for a sport whose results can't be saved yet", () => {
    expect(deriveStatus({ ...base, phase: "done", hasResults: true, savable: false })).toBe("done");
  });
  it("describes each state in words, so colour is never the only signal", () => {
    expect(statusText({ ...base, step: 3, phase: "notes" })).toMatch(/confirm player numbers/i);
    expect(statusText({ ...base, step: 4, phase: "done", hasResults: true, saved: true })).toMatch(/saved to the season/i);
    expect(statusText({ ...base, step: 4, phase: "done", hasResults: true, saveFailed: true })).toMatch(/didn't save/i);
  });
  it("maps to what the database remembers, and clears it when done", () => {
    expect(serverState("working")).toBe("working");
    expect(serverState("needs_you")).toBe("needs_input");
    expect(serverState("failed")).toBe("failed");
    expect(serverState("done")).toBeNull();
  });
});

describe("member names and claim input", () => {
  it("accepts a plain name and refuses anything that isn't one", () => {
    expect(memberName.safeParse("  Noah C.  ").data).toBe("Noah C.");
    expect(memberName.safeParse("Zoë O'Neil-Smith").success).toBe(true);
    for (const bad of ["", "   ", "<b>x</b>", "Robert'); DROP TABLE games;--", "a".repeat(41), "123", "#23"]) expect(memberName.safeParse(bad).success).toBe(false);
  });
  it("the browser and the server agree on what a name is", () => {
    expect(cleanName("Noah   C.")).toBe("Noah C.");
    expect(cleanName("<script>")).toBeNull();
  });
  it("claim needs a token and a name, and nothing extra", () => {
    const token = crypto.randomUUID();
    expect(claimBody.safeParse({ token, name: "Noah", state: "needs_input" }).success).toBe(true);
    expect(claimBody.safeParse({ token, name: "Noah" }).success).toBe(true);
    expect(claimBody.safeParse({ token }).success).toBe(false);
    expect(claimBody.safeParse({ token, name: "Noah", state: "done" }).success).toBe(false);
    expect(claimBody.safeParse({ token, name: "Noah", extra: 1 }).success).toBe(false);
    expect(releaseBody.safeParse({ token }).success).toBe(true);
  });
  it("assigning takes a name or null (give up)", () => {
    expect(assignBody.safeParse({ name: "Noah" }).success).toBe(true);
    expect(assignBody.safeParse({ name: null }).success).toBe(true);
    expect(assignBody.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("saving from a session", () => {
  const log = { possessions: [], scoreboard: [] };
  it("accepts the claim token and the automatic-save flag", () => {
    const ok = saveBody.safeParse({ team_id: crypto.randomUUID(), game_id: crypto.randomUUID(), claim_token: crypto.randomUUID(), auto: true, reopen: true, stat_ids: [], starters: [], log });
    expect(ok.success).toBe(true);
  });
  it("refuses a claim token that isn't a UUID", () => {
    const bad = saveBody.safeParse({ team_id: crypto.randomUUID(), game_id: crypto.randomUUID(), reopen: true, claim_token: "me", stat_ids: [], starters: [], log });
    expect(bad.success).toBe(false);
  });
});

describe("automatic save keeps the final score", () => {
  const r = (roslyn: number | null, opponent: number | null) => ({ videoTime: 0, quarter: null, clock: null, roslyn, opponent });
  it("sends the game's typed score first", () => {
    expect(autoSaveScore({ roslyn: 61, opponent: 55 }, [r(10, 9)])).toEqual({ roslyn: 61, opponent: 55 });
  });
  it("falls back to the last scoreboard reading with both numbers", () => {
    expect(autoSaveScore({ roslyn: null, opponent: null }, [r(10, 9), r(40, 38), r(41, null)])).toEqual({ roslyn: 40, opponent: 38 });
  });
  it("is null when nothing is known, and never invents one", () => {
    expect(autoSaveScore({ roslyn: null, opponent: null }, [r(null, 3)])).toEqual({ roslyn: null, opponent: null });
  });
});

describe("an empty run is never saved", () => {
  const ids = () => ({ team_id: crypto.randomUUID(), game_id: crypto.randomUUID(), stat_ids: [], starters: [] });
  const empty = { possessions: [], scoreboard: [] };
  it("refuses a new (non-reopen) save with no possessions, in plain words", () => {
    const r = saveBody.safeParse({ ...ids(), auto: true, log: empty });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("This analysis found no possessions, so there is nothing to save.");
  });
  it("still lets a reopened (edited) game save an empty log", () => {
    expect(saveBody.safeParse({ ...ids(), reopen: true, log: empty }).success).toBe(true);
  });
});
