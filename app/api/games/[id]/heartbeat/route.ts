import { NextResponse } from "next/server";
import { guarded, jsonError, readJson } from "@/lib/api";
import { validGameId } from "@/lib/games/logic";
import { heartbeat } from "@/lib/games/service";

export const maxDuration = 30;

export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/heartbeat">) {
  return guarded(request, async () => {
    const { id } = await ctx.params;
    const body = await readJson<{ token?: unknown }>(request);
    if (!validGameId(id) || typeof body?.token !== "string" || body.token.length > 200) return jsonError(400, "Invalid request.");
    await heartbeat(id, body.token);
    return NextResponse.json({ ok: true });
  });
}
