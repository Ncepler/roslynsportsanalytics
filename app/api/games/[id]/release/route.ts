import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/api";
import { releaseGame } from "@/lib/db/games";
import { idParam, parse, releaseBody } from "@/lib/db/schemas";

// Gives the game back (changed game, closed the page). Only clears a claim that carries this tab's own token.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return guarded(request, async () => {
    const id = parse(idParam, (await ctx.params).id);
    const { token } = parse(releaseBody, await readJson(request));
    await releaseGame(id, token);
    return NextResponse.json({ ok: true });
  });
}
