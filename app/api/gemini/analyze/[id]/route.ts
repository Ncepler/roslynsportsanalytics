import { NextResponse } from "next/server";
import { guarded, jsonError } from "@/lib/api";
import { getVideoInteraction } from "@/lib/gemini/client";

export const maxDuration = 15;

// Poll one background analysis. Returns the raw JSON text when done; the
// client parses it and all math happens in lib/derive.
export async function GET(request: Request, ctx: RouteContext<"/api/gemini/analyze/[id]">) {
  return guarded(request, async () => {
    const { id } = await ctx.params;
    if (!/^[\w.-]{1,200}$/.test(id)) return jsonError(400, "Invalid analysis id.");
    return NextResponse.json(await getVideoInteraction(id));
  });
}
