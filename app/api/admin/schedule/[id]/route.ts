import { NextResponse } from "next/server";
import { adminGuarded, jsonError } from "@/lib/api";
import { validGameId } from "@/lib/games/logic";
import { deleteGame, reopenGame } from "@/lib/games/service";

export const maxDuration = 30;

// POST = reopen (frees a claimed or finished game and removes its saved results).
export async function POST(request: Request, ctx: RouteContext<"/api/admin/schedule/[id]">) {
  return adminGuarded(request, async () => {
    const { id } = await ctx.params;
    if (!validGameId(id)) return jsonError(400, "Invalid game.");
    await reopenGame(id);
    return NextResponse.json({ ok: true });
  });
}

// DELETE removes a game that is open (not claimed, not finished).
export async function DELETE(request: Request, ctx: RouteContext<"/api/admin/schedule/[id]">) {
  return adminGuarded(request, async () => {
    const { id } = await ctx.params;
    if (!validGameId(id)) return jsonError(400, "Invalid game.");
    await deleteGame(id);
    return NextResponse.json({ ok: true });
  });
}
