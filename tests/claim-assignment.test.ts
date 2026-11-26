import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { patch: Record<string, unknown>; filters: string[] };
const calls: Call[] = [];
let claimRows: unknown[] = [{ id: "g1" }];

// A recording stand-in for the Supabase query builder: every update is logged with its filters.
vi.mock("@/lib/db/client", () => ({
  db: () => ({
    from: () => ({
      update(patch: Record<string, unknown>) {
        const call: Call = { patch, filters: [] };
        calls.push(call);
        const q: Record<string, unknown> = {
          eq: (c: string, v: string) => (call.filters.push(`eq:${c}=${v}`), q),
          is: (c: string, v: unknown) => (call.filters.push(`is:${c}=${v}`), q),
          lt: (c: string) => (call.filters.push(`lt:${c}`), q),
          or: (f: string) => (call.filters.push(`or:${f}`), q),
          select: () => q,
          then: (res: (v: unknown) => void) => res({ data: "analyzing_token" in patch && patch.analyzing_token ? claimRows : null, error: null }),
        };
        return q;
      },
    }),
  }),
}));
vi.mock("server-only", () => ({}));

import { claimGame, releaseGame } from "@/lib/db/games";

beforeEach(() => {
  calls.length = 0;
  claimRows = [{ id: "g1" }];
});

describe("who is in charge survives claims and releases", () => {
  it("claims with one update that never carries assigned_to", async () => {
    expect(await claimGame("g1", "tok", "Sam", "working")).toBe(true);
    expect(calls[0].patch).toEqual({ analyzing_token: "tok", analyzing_since: expect.any(String), analysis_state: "working" });
    expect("assigned_to" in calls[0].patch).toBe(false);
  });
  it("writes the name only when nobody is in charge or it is already this member", async () => {
    await claimGame("g1", "tok", "Sam");
    const who = calls[1];
    expect(who.patch).toEqual({ assigned_to: "Sam" });
    expect(who.filters.some((f) => f.startsWith("or:assigned_to.is.null,assigned_to.eq."))).toBe(true);
  });
  it("does not touch the name when the claim is lost", async () => {
    claimRows = [];
    expect(await claimGame("g1", "tok", "Sam")).toBe(false);
    expect(calls.every((c) => !("assigned_to" in c.patch))).toBe(true);
  });
  it("tries free, then mine, then stale, as three separate updates (no .or() on the claim: PostgREST 12.2.x rejects it)", async () => {
    claimRows = [];
    await claimGame("g1", "tok", "Sam");
    expect(calls).toHaveLength(3);
    expect(calls[0].filters).toContain("is:analyzing_token=null");
    expect(calls[1].filters).toContain("eq:analyzing_token=tok");
    expect(calls[2].filters).toContain("lt:analyzing_since");
    expect(calls.every((c) => c.filters.includes("eq:status=scheduled") && !c.filters.some((f) => f.startsWith("or:")))).toBe(true);
  });
  it("stops at the first update that wins", async () => {
    await claimGame("g1", "tok", "Sam");
    expect(calls.filter((c) => "analyzing_token" in c.patch)).toHaveLength(1);
  });
  it("release never clears assigned_to", async () => {
    await releaseGame("g1", "tok");
    expect(calls).toHaveLength(1);
    expect("assigned_to" in calls[0].patch).toBe(false);
    expect(calls[0].patch).toEqual({ analyzing_token: null, analyzing_since: null, analysis_state: null });
  });
});
