import { NextResponse } from "next/server";
import { adminGuarded, jsonError, readJson } from "@/lib/api";
import { listGames, saveSchedule } from "@/lib/games/service";
import { cleanSchedule, isGameSport } from "@/lib/games/validate";

export const maxDuration = 30;

// Admin only (proxy.ts and adminGuarded both check). Lists every game with its status.
export async function GET(request: Request) {
  return adminGuarded(request, async () => {
    const sport = new URL(request.url).searchParams.get("sport");
    if (sport !== null && !isGameSport(sport)) return jsonError(400, "Unknown sport.");
    return NextResponse.json({ games: await listGames(sport ?? undefined) });
  });
}

// Saves a checked schedule. Merges by sport + date + opponent, so it never
// removes a game or touches a claim or a saved result.
export async function PUT(request: Request) {
  return adminGuarded(request, async () => {
    const body = await readJson<{ sport?: unknown; games?: unknown }>(request);
    if (!isGameSport(body?.sport)) return jsonError(400, "Pick basketball or lacrosse.");
    const items = cleanSchedule(body.sport, body.games);
    if (!items) return jsonError(400, "That schedule has too many rows or isn't valid.");
    if (items.length === 0) return jsonError(400, "Add at least one game with an opponent.");
    return NextResponse.json(await saveSchedule(items));
  });
}
