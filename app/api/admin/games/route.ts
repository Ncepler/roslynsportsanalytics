import { NextResponse } from "next/server";
import { adminGuarded, readJson } from "@/lib/api";
import { createGame, listGames } from "@/lib/db/admin";
import { gameCreate, idParam, parse } from "@/lib/db/schemas";

// GET ?team_id=&season_id= (both optional) lists scheduled and analyzed games.
export async function GET(request: Request) {
  return adminGuarded(request, async () => {
    const url = new URL(request.url);
    const team = url.searchParams.get("team_id");
    const season = url.searchParams.get("season_id");
    const games = await listGames({
      team_id: team ? parse(idParam, team) : undefined,
      season_id: season ? parse(idParam, season) : undefined,
    });
    return NextResponse.json({ games });
  });
}

export async function POST(request: Request) {
  return adminGuarded(request, async () => {
    const input = parse(gameCreate, await readJson(request));
    return NextResponse.json({ game: await createGame(input) }, { status: 201 });
  });
}
