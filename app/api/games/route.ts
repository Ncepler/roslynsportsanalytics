import { NextResponse } from "next/server";
import { guarded, jsonError } from "@/lib/api";
import { listGames } from "@/lib/games/service";
import { isGameSport } from "@/lib/games/validate";

export const maxDuration = 30;

// The schedule for the picker: GET ?sport=basketball. Members see status only, never claim details.
export async function GET(request: Request) {
  return guarded(request, async () => {
    const sport = new URL(request.url).searchParams.get("sport");
    if (!isGameSport(sport)) return jsonError(400, "Unknown sport.");
    return NextResponse.json({ games: await listGames(sport) });
  });
}
