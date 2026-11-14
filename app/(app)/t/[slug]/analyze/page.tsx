import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyzeFlow } from "@/components/analyze/analyze-flow";
import { NoStats } from "@/components/nav/no-stats";
import { requireMember } from "@/lib/auth/server";
import { listTeamGames } from "@/lib/db/games";
import { getTeamBySlug, tryDb } from "@/lib/db/read";
import { hasStats } from "@/lib/teams/options";

export const metadata: Metadata = { title: "Analyze a game · Roslyn Film Analyzer" };

async function Analyze({ params }: { params: PageProps<"/t/[slug]/analyze">["params"] }) {
  await requireMember();
  const { slug } = await params;
  const result = await tryDb(async () => {
    const team = await getTeamBySlug(slug);
    return team && hasStats(team.sport) ? { team, games: await listTeamGames(team.id) } : { team, games: null };
  });
  if (!result.ok || !result.data.team) return null; // the layout shows the problem or the 404
  const { team, games } = result.data;
  if (!games || team.archived) return team.archived ? <p className="text-muted">This team is archived.</p> : <NoStats />;
  return (
    <>
      <p className="max-w-[38rem] text-muted">Upload a game video, trim it, set up the teams, review the log, and save it to the schedule.</p>
      <div className="mt-8">
        <AnalyzeFlow team={{ id: team.id, slug: team.slug, sport: team.sport as "basketball" | "lacrosse", ...games }} />
      </div>
    </>
  );
}

export default function AnalyzePage({ params }: PageProps<"/t/[slug]/analyze">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Analyze params={params} />
    </Suspense>
  );
}
