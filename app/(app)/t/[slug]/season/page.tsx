import type { Metadata } from "next";
import { Suspense } from "react";
import { NoStats } from "@/components/nav/no-stats";
import { SeasonTab } from "@/components/season/season-tab";
import { requireMember } from "@/lib/auth/server";
import { getTeamBySlug, tryDb } from "@/lib/db/read";
import { hasStats } from "@/lib/teams/options";

export const metadata: Metadata = { title: "Season trends · Roslyn Film Analyzer" };

async function Season({ params }: { params: PageProps<"/t/[slug]/season">["params"] }) {
  await requireMember();
  const { slug } = await params;
  const result = await tryDb(() => getTeamBySlug(slug));
  if (!result.ok || !result.data) return null;
  if (!hasStats(result.data.sport)) return <NoStats />;
  // Stage 6 replaces this uploaded-spreadsheet version with trends from stored games.
  return <SeasonTab />;
}

export default function SeasonPage({ params }: PageProps<"/t/[slug]/season">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Season params={params} />
    </Suspense>
  );
}
