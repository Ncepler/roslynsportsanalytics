import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/api";
import { assignGame } from "@/lib/db/games";
import { assignBody, idParam, parse } from "@/lib/db/schemas";

// "I'll take this game" (name) or "give it up" (null). Display only: it doesn't lock anything, the claim does.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return guarded(request, async () => {
    const id = parse(idParam, (await ctx.params).id);
    const { name } = parse(assignBody, await readJson(request));
    await assignGame(id, name);
    return NextResponse.json({ ok: true });
  });
}
