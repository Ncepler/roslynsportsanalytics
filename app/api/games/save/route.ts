import { NextResponse } from "next/server";
import { guarded, jsonError, readJson } from "@/lib/api";
import { verifyToken } from "@/lib/auth/session";
import { getTeam, saveAnalysis } from "@/lib/db/games";
import { parse } from "@/lib/db/schemas";
import { saveBody } from "@/lib/db/save-schema";
import type { Clearance } from "@/lib/gemini/gate";

export const maxDuration = 30;

// Saves the reviewed possession log (jersey numbers only; nothing derived, no video, no appearance notes).
// Members and admins only. A new analysis must carry the pass from the real Roslyn-game check (the owner's
// bypass pass is refused, so a test run can never become a real game). Editing an already saved game
// (`reopen`) has no video, so it skips the check but can only touch a game that already passed it once.
export async function POST(request: Request) {
  return guarded(request, async () => {
    const body = parse(saveBody, await readJson(request));
    if (!body.reopen) {
      const clearance = (await verifyToken(body.clearance)) as Clearance | null;
      if (!clearance || clearance.t !== "clear" || clearance.bypass) {
        return jsonError(403, "Only games that passed the Roslyn-game check can be saved. Test runs are never saved.");
      }
      const team = await getTeam(body.team_id);
      if (clearance.sport !== team.sport) return jsonError(403, "That check was for a different sport.");
    }
    const model = process.env.GEMINI_MODEL || "gemini";
    const { gameId } = await saveAnalysis(body, model);
    return NextResponse.json({ ok: true, game_id: gameId });
  });
}
