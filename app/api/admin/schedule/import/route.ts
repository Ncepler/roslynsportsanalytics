import { NextResponse } from "next/server";
import { adminGuarded, readJson } from "@/lib/api";
import { importGames } from "@/lib/db/schedule-import";
import { importBody, parse } from "@/lib/db/schemas";

export const maxDuration = 30;

// Adds games to one team's schedule. Insert-only: never changes or removes anything (lib/db/schedule-import.ts).
export async function POST(request: Request) {
  return adminGuarded(request, async () => {
    const input = parse(importBody, await readJson(request));
    return NextResponse.json(await importGames(input));
  });
}
