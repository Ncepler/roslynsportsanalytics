import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalysisHub } from "@/components/analysis/analysis-hub";
import { NoStats } from "@/components/nav/no-stats";
import { requireMember } from "@/lib/auth/server";
import { listTeamGames } from "@/lib/db/games";
import { getTeamBySlug, tryDb } from "@/lib/db/read";
import { hasStats, teamName } from "@/lib/teams/options";

export const metadata: Metadata = { title: "Analyze a game · Roslyn Film Analyzer" };

// The Analyze tab: pick a game and start an analysis. Running analyses are mounted above the pages
// (components/analysis/sessions-provider.tsx), so moving around the site never stops one.
async function Analyze({ params }: { params: PageProps<"/t/[slug]/analyze">["params"] }) {
  await requireMember();
  const { slug } = await params;
  const result = await tryDb(() => getTeamBySlug(slug));
  if (!result.ok || !result.data) return null; // the layout shows the problem or the 404
  const team = result.data;
  if (team.archived) return <p className="text-muted">This team is archived.</p>;
  if (!hasStats(team.sport)) return <NoStats />;
  const games = await tryDb(() => listTeamGames(team.id));
  if (!games.ok) return <p role="alert" className="text-sm text-warning-text">{games.message}</p>;
  return <AnalysisHub team={{ id: team.id, slug: team.slug, sport: team.sport, name: teamName(team) }} {...games.data} />;
}

export default function AnalyzePage({ params }: PageProps<"/t/[slug]/analyze">) {
  return (
    <Suspense fallback={null}>
      <Analyze params={params} />
    </Suspense>
  );
}
