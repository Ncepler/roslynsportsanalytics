import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/redirect";
import { createOwnerToken, createSessionToken, signToken, verifyOwnerToken, verifySessionToken, verifyToken } from "@/lib/auth/session";
import { saveBody, toRows } from "@/lib/db/save-schema";
import { normalizeSupabaseUrl } from "@/lib/db/client";
import { proxy } from "@/proxy";

const SECRET = "x".repeat(48);

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.CLUB_PASSWORD = "club-pass";
  process.env.ADMIN_PASSWORD = "admin-pass";
  process.env.ALLOW_TEST_LOGIN = "false";
  delete process.env.TEST_LOGIN_ROLE;
});

describe("login cookies", () => {
  it("a cookie from the right password works", async () => {
    const t = await createSessionToken("member", { kind: "password", password: "club-pass" });
    expect(await verifySessionToken(t)).toBe("member");
  });

  it("changing the club password logs out everyone who used the old one", async () => {
    const t = await createSessionToken("member", { kind: "password", password: "club-pass" });
    process.env.CLUB_PASSWORD = "new-pass";
    expect(await verifySessionToken(t)).toBeNull();
  });

  it("turning the Test button off logs out everyone who got in with it", async () => {
    process.env.ALLOW_TEST_LOGIN = "true";
    process.env.TEST_LOGIN_ROLE = "admin";
    const t = await createSessionToken("admin", { kind: "test" });
    expect(await verifySessionToken(t)).toBe("admin");
    process.env.TEST_LOGIN_ROLE = "demo";
    expect(await verifySessionToken(t)).toBeNull();
    process.env.TEST_LOGIN_ROLE = "admin";
    process.env.ALLOW_TEST_LOGIN = "false";
    expect(await verifySessionToken(t)).toBeNull();
  });

  it("a member cookie can't be edited into an admin cookie", async () => {
    const t = await createSessionToken("member", { kind: "password", password: "club-pass" });
    const [body, sig] = t.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    const forged = Buffer.from(JSON.stringify({ ...payload, role: "admin" })).toString("base64url");
    expect(await verifySessionToken(`${forged}.${sig}`)).toBeNull();
  });

  it("old cookies without a fingerprint, junk, and other token types are rejected", async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("abc")).toBeNull();
    expect(await verifySessionToken("a.b.c")).toBeNull();
    expect(await verifySessionToken(await signToken({ role: "admin" }, 60))).toBeNull();
    expect(await verifySessionToken(await createOwnerToken())).toBeNull();
  });

  it("a session cookie can't be used as a Roslyn-check pass or an owner token", async () => {
    const t = await createSessionToken("admin", { kind: "password", password: "admin-pass" });
    expect(await verifyToken(t)).toBeNull();
    expect(await verifyOwnerToken(t)).toBe(false);
  });

  it("expired passes are rejected", async () => {
    expect(await verifyToken(await signToken({ t: "clear" }, -1))).toBeNull();
  });
});

describe("after-login redirect only goes to this site", () => {
  it.each([["//evil.com"], ["/\\evil.com"], ["https://evil.com"], ["javascript:alert(1)"], ["/login"], ["/api/admin/export"], [""], [42]])("refuses %s", (v) => {
    expect(safeNext(v)).toBeNull();
  });
  it("allows a normal page", () => {
    expect(safeNext("/t/boys-varsity-basketball/season?x=1")).toBe("/t/boys-varsity-basketball/season?x=1");
  });
});

describe("what a save may contain", () => {
  const base = {
    team_id: "00000000-0000-4000-8000-000000000001",
    stat_ids: ["shots"],
    starters: ["5", "Jaylen"],
    log: {
      possessions: [{ team: "roslyn", quarter: "1", clockStart: null, clockEnd: null, videoStart: 1, videoEnd: 5, context: "M", confidence: "high", note: "Jaylen drove", events: [{ type: "shot", team: "roslyn", videoTime: 2, clock: null, player: "Jaylen", points: 2, made: true, description: "Jaylen layup" }] }],
      scoreboard: [],
    },
  };
  const quick = { opponent_name: "Port Washington", game_date: "2026-12-05", home_away: "home" };

  it("editing a saved game can never create a new game (that would skip the Roslyn-game check)", () => {
    expect(saveBody.safeParse({ ...base, reopen: true, quick }).success).toBe(false);
    expect(saveBody.safeParse({ ...base, reopen: true }).success).toBe(false);
    expect(saveBody.safeParse({ ...base, reopen: true, game_id: "00000000-0000-4000-8000-000000000002" }).success).toBe(true);
  });

  it("names are stripped: players become null, notes and descriptions are not stored", () => {
    const parsed = saveBody.parse({ ...base, quick });
    expect(parsed.starters).toEqual(["5", null]);
    const rows = toRows(parsed.log.possessions);
    expect(rows[0].note).toBeNull();
    expect(rows[0].events[0].player).toBeNull();
    expect(JSON.stringify(rows)).not.toContain("Jaylen");
  });

  it("derived numbers and unknown fields sent by the browser are dropped", () => {
    const parsed = saveBody.parse({ ...base, quick, efficiency: 999, log: { ...base.log, possessions: [{ ...base.log.possessions[0], points: 50 }] } });
    expect(JSON.stringify(parsed)).not.toContain("999");
    expect(parsed.log.possessions[0]).not.toHaveProperty("points");
  });
});

describe("SUPABASE_URL cleanup", () => {
  it.each([
    ["https://abcdefghijklmnopqrst.supabase.co/rest/v1/", "https://abcdefghijklmnopqrst.supabase.co"],
    ["abcdefghijklmnopqrst", "https://abcdefghijklmnopqrst.supabase.co"],
    ["https://supabase.com/dashboard/project/abcdefghijklmnopqrst/settings", "https://abcdefghijklmnopqrst.supabase.co"],
    ["not a url", null],
  ])("%s", (raw, want) => {
    expect(normalizeSupabaseUrl(raw)).toBe(want);
  });
});

describe("the gate in front of every page and API route", () => {
  const cookieFor = async (role: "member" | "admin" | "demo") => {
    if (role === "demo") {
      process.env.ALLOW_TEST_LOGIN = "true";
      process.env.TEST_LOGIN_ROLE = "demo";
      return createSessionToken("demo", { kind: "test" });
    }
    return createSessionToken(role, { kind: "password", password: role === "admin" ? "admin-pass" : "club-pass" });
  };
  const req = (path: string, opts: { cookie?: string; method?: string; origin?: string } = {}) =>
    new NextRequest(`https://club.example${path}`, {
      method: opts.method ?? "GET",
      headers: { host: "club.example", ...(opts.cookie ? { cookie: `session=${opts.cookie}` } : {}), ...(opts.origin ? { origin: opts.origin } : {}) },
    });

  it("signed out: pages go to login, API routes say 401", async () => {
    const page = await proxy(req("/t/boys-varsity-basketball"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/login?next=");
    expect((await proxy(req("/api/admin/export"))).status).toBe(401);
    expect((await proxy(req("/api/games/save", { method: "POST" }))).status).toBe(401);
  });

  it("the demo role only sees /test and gets no data", async () => {
    const c = await cookieFor("demo");
    expect((await proxy(req("/test", { cookie: c }))).status).toBe(200);
    expect((await proxy(req("/", { cookie: c }))).headers.get("location")).toBe("https://club.example/test");
    expect((await proxy(req("/api/games/save", { cookie: c, method: "POST" }))).status).toBe(403);
  });

  it("a member can't reach admin pages or admin API routes", async () => {
    const c = await cookieFor("member");
    expect((await proxy(req("/t/x", { cookie: c }))).status).toBe(200);
    expect((await proxy(req("/admin", { cookie: c }))).status).toBe(403);
    expect((await proxy(req("/api/admin/export", { cookie: c }))).status).toBe(403);
    expect((await proxy(req("/api/admin/teams", { cookie: c, method: "POST", origin: "https://club.example" }))).status).toBe(403);
  });

  it("an admin gets in", async () => {
    const c = await cookieFor("admin");
    expect((await proxy(req("/admin", { cookie: c }))).status).toBe(200);
    expect((await proxy(req("/api/admin/export", { cookie: c }))).status).toBe(200);
  });

  it("another website can't make a signed-in browser change anything", async () => {
    const c = await cookieFor("admin");
    expect((await proxy(req("/api/admin/games/1", { cookie: c, method: "DELETE", origin: "https://evil.example" }))).status).toBe(403);
    expect((await proxy(req("/api/auth/login", { method: "POST", origin: "https://evil.example" }))).status).toBe(403);
    expect((await proxy(req("/api/admin/teams", { cookie: c, method: "POST", origin: "https://club.example" }))).status).toBe(200);
  });

  it("no file-extension trick gets past the gate", async () => {
    expect((await proxy(req("/api/admin/export.json"))).status).toBe(401);
  });
});
