import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyzeFlow } from "@/components/analyze/analyze-flow";
import { NoStats } from "@/components/nav/no-stats";
import { requireMember } from "@/lib/auth/server";
import { getTeamBySlug, tryDb } from "@/lib/db/read";
import { hasStats } from "@/lib/teams/options";

export const metadata: Metadata = { title: "Analyze a game · Roslyn Film Analyzer" };

async function Analyze({ params }: { params: PageProps<"/t/[slug]/analyze">["params"] }) {
  await requireMember();
  const { slug } = await params;
  const result = await tryDb(() => getTeamBySlug(slug));
  if (!result.ok || !result.data) return null; // the layout shows the problem or the 404
  if (!hasStats(result.data.sport)) return <NoStats />;
  return (
    <>
      <p className="max-w-[38rem] text-muted">Upload a game video, trim it, set up the teams, and review the log.</p>
      <div className="mt-8">
        <AnalyzeFlow />
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
