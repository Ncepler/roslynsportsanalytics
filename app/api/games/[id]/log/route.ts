import { NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { getGameLog } from "@/lib/db/games";
import { idParam, parse } from "@/lib/db/schemas";
import { fromRows } from "@/lib/db/save-schema";
import type { ScoreboardReading } from "@/lib/gemini/log-types";

// A saved game's reviewed log, for re-opening it in the Review table.
export async function GET(request: Request, ctx: RouteContext<"/api/games/[id]/log">) {
  return guarded(request, async () => {
    const id = parse(idParam, (await ctx.params).id);
    const { game, rows } = await getGameLog(id);
    const meta = game.meta ?? {};
    return NextResponse.json({
      game: { id: game.id, date: game.game_date, opponent: game.opponent?.name ?? "Unknown", our_score: game.our_score, opp_score: game.opp_score },
      statIds: meta.stat_ids ?? [],
      starters: meta.starters ?? [],
      log: fromRows(rows as never, (meta.scoreboard ?? []) as ScoreboardReading[]),
    });
  });
}
