import { NextResponse } from "next/server";
import { adminGuarded, readJson } from "@/lib/api";
import { makeSeasonCurrent } from "@/lib/db/admin";
import { idParam, parse, seasonPatch } from "@/lib/db/schemas";

// PATCH { is_current: true } makes this the one current season.
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/seasons/[id]">) {
  return adminGuarded(request, async () => {
    const id = parse(idParam, (await ctx.params).id);
    parse(seasonPatch, await readJson(request));
    return NextResponse.json({ season: await makeSeasonCurrent(id) });
  });
}
