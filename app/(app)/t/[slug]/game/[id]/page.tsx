import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GameStatsView } from "@/components/game/game-stats-view";
import { formatGameDate } from "@/components/games/status-chip";
import { requireMember } from "@/lib/auth/server";
import { getGameLog } from "@/lib/db/games";
import { getTeamBySlug, tryDb } from "@/lib/db/read";
import { idParam } from "@/lib/db/schemas";
import { fromRows } from "@/lib/db/save-schema";
import { defaultStatIds, getSport } from "@/lib/sports";
import type { ScoreboardReading } from "@/lib/gemini/log-types";

export const metadata: Metadata = { title: "Game stats · Roslyn Film Analyzer" };

// A saved game's stats, read-only: the same game stats view as the Review step, built from the stored possession log.
async function Game({ params }: { params: Promise<{ slug: string; id: string }> }) {
  await requireMember();
  const { slug, id } = await params;
  if (!idParam.safeParse(id).success) return <p className="text-muted">That game wasn&apos;t found.</p>;
  const result = await tryDb(async () => {
    const team = await getTeamBySlug(slug);
    if (!team) return null;
    const { game, rows } = await getGameLog(id);
    return game.team_id === team.id ? { team, game, rows } : null;
  });
  if (!result.ok) return <p role="alert" className="text-sm text-warning-text">{result.message}</p>;
  if (!result.data) return <p className="text-muted">That game wasn&apos;t found.</p>;
  const { team, game, rows } = result.data;
  const meta = game.meta ?? {};
  const log = fromRows(rows as never, (meta.scoreboard ?? []) as ScoreboardReading[]);
  const sport = getSport(team.sport);
  const statIds = meta.stat_ids && meta.stat_ids.length > 0 ? meta.stat_ids : sport ? defaultStatIds(sport) : [];
  const opponent = game.opponent?.name ?? "Opponent";

  return (
    <div>
      <p className="text-sm text-muted">
        <Link href={`/t/${slug}`} className="underline-offset-2 hover:underline">
          Schedule
        </Link>
      </p>
      <h2 className="mt-1 text-[1.5rem] font-bold tracking-[-0.01em]">
        Roslyn vs. {opponent} <span className="text-base font-normal text-muted tabular-nums">{formatGameDate(game.game_date)}</span>
      </h2>
      <div className="mt-6">
        <GameStatsView log={log} sportId={team.sport} statIds={statIds} away={opponent} />
      </div>
    </div>
  );
}

export default function GamePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Game params={params} />
    </Suspense>
  );
}
