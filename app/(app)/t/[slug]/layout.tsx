import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TeamTabs } from "@/components/nav/team-tabs";
import { requireMember } from "@/lib/auth/server";
import { getTeamBySlug, tryDb } from "@/lib/db/read";
import { teamName } from "@/lib/teams/options";

async function TeamFrame({ params, children }: { params: LayoutProps<"/t/[slug]">["params"]; children: React.ReactNode }) {
  await requireMember();
  const { slug } = await params;
  const result = await tryDb(() => getTeamBySlug(slug));
  if (!result.ok) {
    return (
      <div role="alert" className="rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-text">
        {result.message}
      </div>
    );
  }
  if (!result.data) notFound();
  const team = result.data;
  return (
    <section>
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">{teamName(team)}</h1>
      {team.archived && <p className="mt-2 text-sm text-muted">This team is archived.</p>}
      <div className="mt-5">
        <TeamTabs slug={team.slug} />
      </div>
      <div className="mt-8">{children}</div>
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
