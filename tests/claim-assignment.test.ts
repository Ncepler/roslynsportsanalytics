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
    expect(calls).toHaveLength(1);
  });
  it("release never clears assigned_to", async () => {
    await releaseGame("g1", "tok");
    expect(calls).toHaveLength(1);
    expect("assigned_to" in calls[0].patch).toBe(false);
    expect(calls[0].patch).toEqual({ analyzing_token: null, analyzing_since: null, analysis_state: null });
  });
});
