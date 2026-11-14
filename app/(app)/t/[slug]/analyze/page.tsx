import type { Metadata } from "next";
import { Suspense } from "react";
import { NoStats } from "@/components/nav/no-stats";
import { requireMember } from "@/lib/auth/server";
import { getTeamBySlug, tryDb } from "@/lib/db/read";
import { hasStats } from "@/lib/teams/options";

export const metadata: Metadata = { title: "Analyze a game · Roslyn Film Analyzer" };

// The Analyze flow itself is mounted by the team layout (components/analyze/persistent-analyze.tsx) so that
// switching tabs doesn't throw away a run in progress. This page only covers the cases where there is nothing to analyze.
async function Analyze({ params }: { params: PageProps<"/t/[slug]/analyze">["params"] }) {
  await requireMember();
  const { slug } = await params;
  const result = await tryDb(() => getTeamBySlug(slug));
  if (!result.ok || !result.data) return null; // the layout shows the problem or the 404
  const team = result.data;
  if (team.archived) return <p className="text-muted">This team is archived.</p>;
  if (!hasStats(team.sport)) return <NoStats />;
  return null;
}

export default function AnalyzePage({ params }: PageProps<"/t/[slug]/analyze">) {
  return (
    <Suspense fallback={null}>
      <Analyze params={params} />
    </Suspense>
  );
}
