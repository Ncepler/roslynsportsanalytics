import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FirstSeason } from "@/components/admin/first-season";
import { NoStats } from "@/components/nav/no-stats";
import { StoredSeason } from "@/components/season/stored-season";
import { requireMember } from "@/lib/auth/server";
import { listSeasons } from "@/lib/db/admin";
import { getTeamBySlug, tryDb } from "@/lib/db/read";
import { loadStoredSeason } from "@/lib/db/season";
import { hasStats } from "@/lib/teams/options";

export const metadata: Metadata = { title: "Season trends · Roslyn Film Analyzer" };

// Trends for one team and season (default: the current season), from the games saved in the database.
async function Season({ params, searchParams }: { params: PageProps<"/t/[slug]/season">["params"]; searchParams: PageProps<"/t/[slug]/season">["searchParams"] }) {
  await requireMember();
  const { slug } = await params;
  const { season: seasonParam } = await searchParams;
  const result = await tryDb(async () => {
    const team = await getTeamBySlug(slug);
    if (!team || !hasStats(team.sport)) return { team, stored: null, seasons: [], season: null };
    const seasons = await listSeasons();
    const wanted = typeof seasonParam === "string" ? seasonParam : undefined;
    const season = seasons.find((s) => s.id === wanted) ?? seasons.find((s) => s.is_current) ?? seasons[0] ?? null;
    const stored = season ? await loadStoredSeason({ id: team.id, sport: team.sport as "basketball" | "lacrosse" }, season) : null;
    return { team, stored, seasons, season };
  });
  if (!result.ok) return <p role="alert" className="text-sm text-warning-text">{result.message}</p>;
  const { team, stored, seasons, season } = result.data;
  if (!team) return null;
  if (!hasStats(team.sport)) return <NoStats />;
  if (!season || !stored) {
    const role = await requireMember();
    return role === "admin" ? (
      <div>
        <p className="mb-4 text-muted">Season trends need a season first.</p>
        <FirstSeason />
      </div>
    ) : (
      <p className="text-muted">No season has been set up yet. Check back soon, or ask an admin.</p>
    );
  }

  return (
    <div>
      {seasons.length > 1 && (
        <nav aria-label="Season" className="mb-6 flex flex-wrap gap-2">
          {seasons.map((s) => (
            <Link
              key={s.id}
              href={`/t/${slug}/season?season=${s.id}`}
              aria-current={s.id === season.id ? "true" : undefined}
              className={`btn min-h-9 border px-3 ${s.id === season.id ? "border-accent bg-[oklch(from_var(--accent)_l_c_h/0.1)]" : "border-border-strong bg-surface"}`}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      )}
      <StoredSeason data={stored} />
    </div>
  );
}

export default function SeasonPage({ params, searchParams }: PageProps<"/t/[slug]/season">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Season params={params} searchParams={searchParams} />
    </Suspense>
  );
}
