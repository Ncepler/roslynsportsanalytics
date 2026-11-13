import { NextResponse } from "next/server";
import { adminGuarded, readJson } from "@/lib/api";
import { setTeamArchived } from "@/lib/db/admin";
import { idParam, parse, teamPatch } from "@/lib/db/schemas";

// PATCH { archived: boolean }. Teams are archived, never deleted.
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/teams/[id]">) {
  return adminGuarded(request, async () => {
    const id = parse(idParam, (await ctx.params).id);
    const { archived } = parse(teamPatch, await readJson(request));
    return NextResponse.json({ team: await setTeamArchived(id, archived) });
  });
}
