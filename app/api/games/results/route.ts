import { NextResponse } from "next/server";
import { guarded, jsonError } from "@/lib/api";
import { listResults } from "@/lib/games/service";
import { isGameSport } from "@/lib/games/validate";

export const maxDuration = 30;

// Finished games as Season-tab tabs: one per sheet, named "<Opponent> <date> - <sheet-id>",
// the same naming the app's CSV downloads use, so the existing parser joins them by game.
export async function GET(request: Request) {
  return guarded(request, async () => {
    const sport = new URL(request.url).searchParams.get("sport");
    if (!isGameSport(sport)) return jsonError(400, "Unknown sport.");
    const results = await listResults(sport);
    const tabs = results.flatMap((r) => {
      const label = `${r.opponent}${r.date ? ` ${r.date}` : ""}`;
      return r.sheets.map((s) => ({ file: "Saved games", name: `${label} - ${s.id}`, rows: [...s.header, ...s.rows] }));
    });
    return NextResponse.json({ tabs, games: results.length });
  });
}
