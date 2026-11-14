import { NextResponse } from "next/server";
import { allowAttempt, clientIp } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE, canUseSite, isAdminRole, verifySessionToken } from "@/lib/auth/session";
import { DbError } from "@/lib/db/errors";
import { diagnoseGemini, GeminiConfigError } from "@/lib/gemini/client";

// Shared wrapper for the Gemini API routes: rate limit plus uniform JSON
// errors. Auth is enforced by proxy.ts before a request reaches a route.
// Never logs request bodies (they can describe players; CLAUDE.md section 14).

const API_LIMIT_PER_MINUTE = 120; // the client polls every few seconds

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

async function roleOf(request: Request) {
  const raw = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(request.headers.get("cookie") ?? "")?.[1];
  return verifySessionToken(raw);
}

/** Second lock for routes that do not use guarded(): a Response to return if the caller is not a member/admin, else null. */
export async function refuseUnlessMember(request: Request): Promise<Response | null> {
  const role = await roleOf(request);
  if (!role) return jsonError(401, "Not signed in.");
  return canUseSite(role) ? null : jsonError(403, "The demo can't use this. Log in with the club password.");
}

/** Rate limit, JSON errors, and a second role check (members and admins only; the demo role is refused). */
export async function guarded(request: Request, handler: () => Promise<Response>): Promise<Response> {
  const role = await roleOf(request);
  if (!role) return jsonError(401, "Not signed in.");
  if (!canUseSite(role)) return jsonError(403, "The demo can't use this. Log in with the club password.");
  return guardedInner(request, handler);
}

async function guardedInner(request: Request, handler: () => Promise<Response>): Promise<Response> {
  if (!allowAttempt(`api:${clientIp(request)}`, API_LIMIT_PER_MINUTE)) {
    return jsonError(429, "Too many requests. Wait a minute and try again.");
  }
  try {
    return await handler();
  } catch (err) {
    if (err instanceof DbError) return NextResponse.json(err.code ? { error: err.message, code: err.code } : { error: err.message }, { status: err.status });
    if (err instanceof GeminiConfigError) return jsonError(503, "Gemini isn't set up yet (missing API key).");
    const status = (err as { status?: number }).status;
    if (status === 402) return jsonError(402, "Gemini credits are used up. Add credits in Google AI Studio.");
    if (status === 429) return jsonError(429, "Gemini rate limit hit. Wait a minute and try again.");
    if (status === 400 || status === 401 || status === 403) {
      // Say what Google actually said (error.message and error.status from its reply), not a guess about the key.
      const why = await diagnoseGemini(err);
      const said = why.google?.message ? ` Google said: "${why.google.message}"${why.google.status ? ` (${why.google.status})` : ""}.` : "";
      console.error("Gemini rejected a request:", why.kind, `HTTP ${status}`, why.google?.status ?? "", why.google?.reason ?? "", why.google?.message ?? "");
      if (why.kind === "key") return jsonError(503, `Gemini rejected the API key.${said} Check GEMINI_API_KEY in Vercel (paste the whole key, nothing cut off), then redeploy.`);
      if (why.kind === "model") {
        const list = why.available.length ? ` Models this key can use include: ${why.available.join(", ")}.` : "";
        return jsonError(503, `Gemini doesn't have a model called "${why.model}".${said} Change GEMINI_MODEL in Vercel and redeploy.${list}`);
      }
      return jsonError(502, `Gemini refused this request (HTTP ${status}).${said || " The key and model look fine, but Google gave no reason."}`);
    }
    console.error("Gemini route error:", err instanceof Error ? err.message : "unknown");
    return jsonError(502, "Gemini request failed. Try again.");
  }
}

/** Like guarded(), but admins only (proxy.ts checks too; this is the second lock). */
export async function adminGuarded(request: Request, handler: () => Promise<Response>): Promise<Response> {
  const role = await roleOf(request);
  if (!role) return jsonError(401, "Not signed in.");
  if (!isAdminRole(role)) return jsonError(403, "Admins only.");
  return guardedInner(request, handler);
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
