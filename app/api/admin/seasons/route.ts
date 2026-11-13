import { NextResponse } from "next/server";
import { adminGuarded, readJson } from "@/lib/api";
import { createSeason, listSeasons } from "@/lib/db/admin";
import { parse, seasonCreate } from "@/lib/db/schemas";

export async function GET(request: Request) {
  return adminGuarded(request, async () => NextResponse.json({ seasons: await listSeasons() }));
}

export async function POST(request: Request) {
  return adminGuarded(request, async () => {
    const input = parse(seasonCreate, await readJson(request));
    return NextResponse.json({ season: await createSeason(input) }, { status: 201 });
  });
}
