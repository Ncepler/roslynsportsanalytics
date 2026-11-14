import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PersistentAnalyze } from "@/components/analyze/persistent-analyze";
import { TeamTabs } from "@/components/nav/team-tabs";
import { listTeamGames } from "@/lib/db/games";
import { requireMember } from "@/lib/auth/server";
import { getCurrentSeasonLabel, getTeamBySlug, tryDb } from "@/lib/db/read";
import { shortSeason } from "@/lib/schedule/dates";
import { hasStats, teamName } from "@/lib/teams/options";

async function TeamFrame({ params, children }: { params: LayoutProps<"/t/[slug]">["params"]; children: React.ReactNode }) {
  await requireMember();
  const { slug } = await params;
  const [result, seasonResult] = await Promise.all([tryDb(() => getTeamBySlug(slug)), tryDb(getCurrentSeasonLabel)]);
  if (!result.ok) {
    return (
      <div role="alert" className="rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-text">
        {result.message}
      </div>
    );
  }
  if (!result.data) notFound();
  const team = result.data;
  // The Analyze flow lives here (not in the Analyze page) so its state survives switching tabs.
  const games = !team.archived && hasStats(team.sport) ? await tryDb(() => listTeamGames(team.id)) : null;
  return (
    <section>
      <h1 className="flex flex-wrap items-baseline gap-x-3 text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">
        {teamName(team)}
        {seasonResult.ok && seasonResult.data && <span className="text-[1.25rem] font-medium tabular-nums text-muted">{shortSeason(seasonResult.data)}</span>}
      </h1>
      {team.archived && <p className="mt-2 text-sm text-muted">This team is archived.</p>}
      <div className="mt-5">
        <TeamTabs slug={team.slug} />
      </div>
      <div className="mt-8">
        {children}
        {games?.ok && <PersistentAnalyze team={{ id: team.id, slug: team.slug, sport: team.sport as "basketball" | "lacrosse", ...games.data }} />}
      </div>
    </section>
  );
}

export default function TeamLayout({ params, children }: LayoutProps<"/t/[slug]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <TeamFrame params={params}>{children}</TeamFrame>
    </Suspense>
  );
}
