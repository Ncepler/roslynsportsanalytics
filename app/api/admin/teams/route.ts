import { NextResponse } from "next/server";
import { adminGuarded, readJson } from "@/lib/api";
import { createTeam, listTeams } from "@/lib/db/admin";
import { parse, teamCreate } from "@/lib/db/schemas";

export async function GET(request: Request) {
  return adminGuarded(request, async () => NextResponse.json({ teams: await listTeams() }));
}

export async function POST(request: Request) {
  return adminGuarded(request, async () => {
    const input = parse(teamCreate, await readJson(request));
    return NextResponse.json({ team: await createTeam(input) }, { status: 201 });
  });
}
