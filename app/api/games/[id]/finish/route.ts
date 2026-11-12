import { NextResponse } from "next/server";
import { guarded, jsonError } from "@/lib/api";
import { verifyToken } from "@/lib/auth/session";
import type { Clearance } from "@/lib/gemini/gate";
import { validGameId } from "@/lib/games/logic";
import { finishGame } from "@/lib/games/service";
import { MAX_RESULT_BYTES } from "@/lib/games/types";
import { cleanSheets } from "@/lib/games/validate";

export const maxDuration = 30;

// Saves the finished sheets (numbers and blanks in the club's layouts, no video,
// no player notes) and locks the game. Needs the holder's token.
export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/finish">) {
  return guarded(request, async () => {
    const { id } = await ctx.params;
    const raw = await request.text();
    if (raw.length > MAX_RESULT_BYTES * 2) return jsonError(413, "These results are too big to save.");
    let body: { token?: unknown; statIds?: unknown; sheets?: unknown; clearance?: unknown } | null = null;
    try {
      body = JSON.parse(raw);
    } catch {}
    const sheets = cleanSheets(body?.sheets);
    const statIds = Array.isArray(body?.statIds) ? body.statIds.filter((s): s is string => typeof s === "string").slice(0, 60) : null;
    if (!validGameId(id) || typeof body?.token !== "string" || body.token.length > 200 || !sheets || !statIds) return jsonError(400, "Invalid request.");
    // Only a run that passed the real Roslyn-game check can be saved. The owner
    // unlock (bypass) is for the test on /admin and can never become a real game.
    const clearance = (await verifyToken(body.clearance)) as Clearance | null;
    if (!clearance || clearance.t !== "clear" || clearance.bypass) return jsonError(403, "Only games that passed the Roslyn-game check can be saved. Test runs are never saved.");
    const expectSport = clearance.sport === "basketball" || clearance.sport === "lacrosse" ? clearance.sport : undefined;
    if (!expectSport) return jsonError(403, "Only games that passed the Roslyn-game check can be saved.");
    await finishGame(id, body.token, { statIds, sheets, expectSport });
    return NextResponse.json({ ok: true });
  });
}
