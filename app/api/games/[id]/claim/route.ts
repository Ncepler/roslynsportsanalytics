import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/api";
import { DbError } from "@/lib/db/errors";
import { claimGame } from "@/lib/db/games";
import { claimBody, idParam, parse } from "@/lib/db/schemas";

// "I'm analyzing this game." Also the heartbeat that keeps the claim fresh and reports what the analysis is doing
// (the dot). The first caller wins atomically; anyone else is refused while that claim is fresh.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return guarded(request, async () => {
    const id = parse(idParam, (await ctx.params).id);
    const { token, name, state } = parse(claimBody, await readJson(request));
    if (!(await claimGame(id, token, name, state))) throw new DbError(409, "Someone else is analyzing this game right now. Pick a different game, or try again in a few minutes.", "game_busy");
    return NextResponse.json({ ok: true });
  });
}
