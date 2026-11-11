import { NextResponse } from "next/server";
import { guarded, jsonError } from "@/lib/api";
import { validGameId } from "@/lib/games/logic";
import { claimGame } from "@/lib/games/service";

export const maxDuration = 30;

// Takes a game. Only one caller can win; everyone else gets a 409. The token
// returned here is the holder's secret for heartbeat, release and save.
export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/claim">) {
  return guarded(request, async () => {
    const { id } = await ctx.params;
    if (!validGameId(id)) return jsonError(400, "Invalid game.");
    return NextResponse.json({ token: await claimGame(id) });
  });
}
