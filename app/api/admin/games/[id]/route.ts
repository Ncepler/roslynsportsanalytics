import { NextResponse } from "next/server";
import { adminGuarded, readJson } from "@/lib/api";
import { deleteGame, updateGame } from "@/lib/db/admin";
import { gamePatch, idParam, parse } from "@/lib/db/schemas";

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/games/[id]">) {
  return adminGuarded(request, async () => {
    const id = parse(idParam, (await ctx.params).id);
    const patch = parse(gamePatch, await readJson(request));
    return NextResponse.json({ game: await updateGame(id, patch) });
  });
}

// DELETE ?confirm=1 is required when the game has saved analysis.
export async function DELETE(request: Request, ctx: RouteContext<"/api/admin/games/[id]">) {
  return adminGuarded(request, async () => {
    const id = parse(idParam, (await ctx.params).id);
    await deleteGame(id, new URL(request.url).searchParams.get("confirm") === "1");
    return NextResponse.json({ ok: true });
  });
}
