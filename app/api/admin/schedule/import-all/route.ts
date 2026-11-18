import { NextResponse } from "next/server";
import { adminGuarded, readJson } from "@/lib/api";
import { importAllGames } from "@/lib/db/schedule-import";
import { importAllBody, parse } from "@/lib/db/schemas";

export const maxDuration = 120;

// Adds games to many teams' schedules at once. Insert-only: never changes or removes anything (lib/db/schedule-import.ts).
export async function POST(request: Request) {
  return adminGuarded(request, async () => {
    const input = parse(importAllBody, await readJson(request));
    return NextResponse.json(await importAllGames(input));
  });
}
