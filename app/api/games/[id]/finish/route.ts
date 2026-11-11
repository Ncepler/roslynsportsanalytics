import { NextResponse } from "next/server";
import { guarded, jsonError } from "@/lib/api";
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
    let body: { token?: unknown; statIds?: unknown; sheets?: unknown } | null = null;
    try {
      body = JSON.parse(raw);
    } catch {}
    const sheets = cleanSheets(body?.sheets);
    const statIds = Array.isArray(body?.statIds) ? body.statIds.filter((s): s is string => typeof s === "string").slice(0, 60) : null;
    if (!validGameId(id) || typeof body?.token !== "string" || body.token.length > 200 || !sheets || !statIds) return jsonError(400, "Invalid request.");
    await finishGame(id, body.token, { statIds, sheets });
    return NextResponse.json({ ok: true });
  });
}
