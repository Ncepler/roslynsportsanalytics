import { NextResponse } from "next/server";
import { guarded, jsonError, readJson } from "@/lib/api";
import { allowAttempt, clientIp } from "@/lib/auth/rate-limit";
import { signToken, verifyOwnerToken } from "@/lib/auth/session";
import { startClipsInteraction } from "@/lib/gemini/client";
import { CLEARANCE_TTL_SECONDS, gateClips, gatePrompt, gateSchema } from "@/lib/gemini/gate";
import { parseVideoRange } from "@/lib/gemini/validate";
import { getSport } from "@/lib/sports";

export const maxDuration = 30;

// Starts the Roslyn-game check (lib/gemini/gate.ts). Returns the interaction
// id plus a signed ticket tying that id to this file, sport, and range, so the
// poll route can issue a pass only for what was actually checked.
export async function POST(request: Request) {
  return guarded(request, async () => {
    if (!allowAttempt(`gate:${clientIp(request)}`, 6)) return jsonError(429, "Too many checks. Wait a minute and try again.");
    const body = await readJson<Record<string, unknown>>(request);
    const range = parseVideoRange(body ? { ...body, resolution: "high", fps: undefined } : null);
    if (typeof range === "string") return jsonError(400, range);
    const sport = typeof body?.sportId === "string" ? getSport(body.sportId) : undefined;
    if (!sport) return jsonError(400, "Unknown sport.");

    // Owner unlock (app/api/admin/unlock): skips the AI look. The pass is marked
    // `bypass`, and saving a game refuses bypassed passes, so a bypassed run can
    // never become a real game or season data.
    if (typeof body?.adminToken === "string" && (await verifyOwnerToken(body.adminToken))) {
      const clearance = await signToken({ t: "clear", bypass: true, uri: range.uri, sport: sport.id, start: range.start, end: range.end }, CLEARANCE_TTL_SECONDS);
      return NextResponse.json({ bypass: true, clearance });
    }

    const clips = gateClips(range);
    const id = await startClipsInteraction({ uri: range.uri, mimeType: range.mimeType, clips, resolution: "high", prompt: gatePrompt(sport, clips), schema: gateSchema });
    const ticket = await signToken({ t: "gate", id, uri: range.uri, sport: sport.id, start: range.start, end: range.end }, 2 * 60 * 60);
    return NextResponse.json({ id, ticket });
  });
}
