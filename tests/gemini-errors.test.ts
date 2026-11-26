// Gemini failures, with the Gemini SDK mocked: no real call, no cost. Covers out of credit (402), rate limit
// (429, retried a few times), and a refused key (401/403).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  PartMediaResolutionLevel: { MEDIA_RESOLUTION_HIGH: "HIGH", MEDIA_RESOLUTION_LOW: "LOW" },
  GoogleGenAI: class {
    interactions = { create: sdk.create, get: sdk.get };
    files = { get: vi.fn(), delete: sdk.deleteFile };
    models = { countTokens: vi.fn(), list: async function* () {} };
  },
}));

import { guarded } from "@/lib/api";
import { createSessionToken } from "@/lib/auth/session";
import { generateJson, getVideoInteraction } from "@/lib/gemini/client";
import { BAD_KEY_MESSAGE, geminiStatusMessage, OUT_OF_CREDIT_MESSAGE, plainGeminiFailure, RATE_LIMIT_MESSAGE, RETRY_DELAYS_MS, withGeminiRetry } from "@/lib/gemini/errors";

const apiError = (status: number, body?: unknown) => Object.assign(new Error(`HTTP ${status}`), { status, ...(body ? { body: JSON.stringify(body) } : {}) });
const call = { prompt: "x", schema: {} };

beforeEach(() => {
  process.env.SESSION_SECRET = "x".repeat(48);
  process.env.CLUB_PASSWORD = "club-pass";
  process.env.GEMINI_API_KEY = "test-key-not-real";
  sdk.create.mockReset();
  sdk.get.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Runs a Gemini call the way an API route does (signed in, through guarded()), with retry waits skipped. */
async function viaRoute(run: () => Promise<unknown>) {
  const cookie = await createSessionToken("member", { kind: "password", password: "club-pass" });
  const request = new Request("https://club.example/api/x", { method: "POST", headers: { cookie: `session=${cookie}`, "x-forwarded-for": `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  vi.useFakeTimers({ toFake: ["setTimeout"] }); // only the retry waits are fake; crypto and promises stay real
  let finished = false;
  const pending = guarded(request, async () => Response.json(await run())).finally(() => (finished = true));
  while (!finished) {
    await new Promise((r) => setImmediate(r));
    await vi.advanceTimersByTimeAsync(10_000);
  }
  return pending;
}

describe("withGeminiRetry", () => {
  it("429 then success: retried once, returns the result", async () => {
    const fn = vi.fn().mockRejectedValueOnce(apiError(429)).mockResolvedValueOnce("ok");
    const waits: number[] = [];
    expect(await withGeminiRetry(fn, async (ms) => void waits.push(ms))).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([RETRY_DELAYS_MS[0]]);
  });

  it("429 forever: gives up after the capped number of retries, with growing waits", async () => {
    const fn = vi.fn().mockRejectedValue(apiError(429));
    const waits: number[] = [];
    await expect(withGeminiRetry(fn, async (ms) => void waits.push(ms))).rejects.toMatchObject({ status: 429 });
    expect(fn).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1);
    expect(waits).toEqual([...RETRY_DELAYS_MS]);
    expect(RETRY_DELAYS_MS.length).toBeLessThanOrEqual(3);
    expect(waits.reduce((a, b) => a + b, 0)).toBeLessThan(30_000);
  });

  it.each([402, 401, 403, 400, 500])("%i is never retried", async (status) => {
    const fn = vi.fn().mockRejectedValue(apiError(status));
    const waits: number[] = [];
    await expect(withGeminiRetry(fn, async (ms) => void waits.push(ms))).rejects.toMatchObject({ status });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });
});

describe("through the Gemini client and the route wrapper", () => {
  it("out of credit (402): one call, no retry, a plain message", async () => {
    sdk.create.mockRejectedValue(apiError(402));
    const res = await viaRoute(() => generateJson(call));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe(OUT_OF_CREDIT_MESSAGE);
    expect(sdk.create).toHaveBeenCalledTimes(1);
  });

  it("429 then success: the route succeeds and the member never sees the rate limit", async () => {
    sdk.create.mockRejectedValueOnce(apiError(429)).mockResolvedValueOnce({ output_text: '{"a":1}' });
    const res = await viaRoute(() => generateJson(call));
    expect(res.status).toBe(200);
    expect(await res.json()).toBe('{"a":1}');
    expect(sdk.create).toHaveBeenCalledTimes(2);
  });

  it("429 forever: retries a few times, then says so in plain words (HTTP 429)", async () => {
    sdk.create.mockRejectedValue(apiError(429));
    const res = await viaRoute(() => generateJson(call));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe(RATE_LIMIT_MESSAGE);
    expect(sdk.create).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1);
  });

  it.each([401, 403])("a refused key (%i): a plain message that names GEMINI_API_KEY and never shows the key", async (status) => {
    sdk.create.mockRejectedValue(apiError(status, { error: { code: status, status: status === 401 ? "UNAUTHENTICATED" : "PERMISSION_DENIED", message: "API key not valid. Please pass a valid API key.", details: [{ reason: "API_KEY_INVALID" }] } }));
    const res = await viaRoute(() => generateJson(call));
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.error).toMatch(/Gemini rejected the API key/);
    expect(body.error).toMatch(/GEMINI_API_KEY/);
    expect(body.error).not.toContain(process.env.GEMINI_API_KEY!);
    expect(sdk.create).toHaveBeenCalledTimes(1);
  });

  it("a background run that ended with a quota or billing error is turned into plain words", async () => {
    sdk.get.mockResolvedValueOnce({ status: "failed", errors: [{ message: "RESOURCE_EXHAUSTED: quota exceeded" }] });
    expect(await getVideoInteraction("abc")).toEqual({ status: "failed", error: RATE_LIMIT_MESSAGE });
    sdk.get.mockResolvedValueOnce({ status: "failed", errors: [{ message: "Billing account has insufficient funds" }] });
    expect(await getVideoInteraction("abc")).toEqual({ status: "failed", error: OUT_OF_CREDIT_MESSAGE });
  });
});

describe("plain messages", () => {
  it("maps each status to its message, and leaves other statuses alone", () => {
    expect(geminiStatusMessage(402)).toBe(OUT_OF_CREDIT_MESSAGE);
    expect(geminiStatusMessage(429)).toBe(RATE_LIMIT_MESSAGE);
    expect(geminiStatusMessage(401)).toBe(BAD_KEY_MESSAGE);
    expect(geminiStatusMessage(403)).toBe(BAD_KEY_MESSAGE);
    expect(geminiStatusMessage(500)).toBeNull();
    expect(plainGeminiFailure("The video had no audio track")).toBe("The video had no audio track");
  });
});
