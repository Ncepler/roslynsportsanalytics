import { NextResponse } from "next/server";
import { allowAttempt, clientIp } from "@/lib/auth/rate-limit";
import { GeminiConfigError } from "@/lib/gemini/client";

// Shared wrapper for the Gemini API routes: rate limit plus uniform JSON
// errors. Auth is enforced by proxy.ts before a request reaches a route.
// Never logs request bodies (they can describe players; CLAUDE.md section 14).

const API_LIMIT_PER_MINUTE = 120; // the client polls every few seconds

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function guarded(request: Request, handler: () => Promise<Response>): Promise<Response> {
  if (!allowAttempt(`api:${clientIp(request)}`, API_LIMIT_PER_MINUTE)) {
    return jsonError(429, "Too many requests. Wait a minute and try again.");
  }
  try {
    return await handler();
  } catch (err) {
    if (err instanceof GeminiConfigError) return jsonError(503, "Gemini isn't set up yet (missing API key).");
    const status = (err as { status?: number }).status;
    if (status === 402) return jsonError(402, "Gemini credits are used up. Add credits in Google AI Studio.");
    if (status === 429) return jsonError(429, "Gemini rate limit hit. Wait a minute and try again.");
    console.error("Gemini route error:", err instanceof Error ? err.message : "unknown");
    return jsonError(502, "Gemini request failed. Try again.");
  }
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
