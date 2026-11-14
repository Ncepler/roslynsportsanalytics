import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatGameDate } from "@/components/games/status-chip";
import { requireMember } from "@/lib/auth/server";
import { listGames, listSeasons } from "@/lib/db/admin";
import { getTeamBySlug, tryDb } from "@/lib/db/read";

export const metadata: Metadata = { title: "Schedule · Roslyn Film Analyzer" };

// Read-only schedule.
async function Schedule({ params, searchParams }: { params: PageProps<"/t/[slug]">["params"]; searchParams: PageProps<"/t/[slug]">["searchParams"] }) {
  await requireMember();
  const { slug } = await params;
  const { season: seasonParam } = await searchParams;

  const result = await tryDb(async () => {
    const team = await getTeamBySlug(slug);
    if (!team) return null;
    const seasons = await listSeasons();
    const wanted = typeof seasonParam === "string" ? seasonParam : undefined;
    const season = seasons.find((s) => s.id === wanted) ?? seasons.find((s) => s.is_current) ?? seasons[0] ?? null;
    const games = season ? await listGames({ team_id: team.id, season_id: season.id }) : [];
    return { seasons, season, games };
  });
  if (!result.ok) {
    return (
      <p role="alert" className="text-sm text-warning-text">
        {result.message}
      </p>
    );
  }
  if (!result.data) return null; // the layout already 404s an unknown team
  const { seasons, season, games } = result.data;

  return (
    <div>
      {seasons.length > 1 && (
        <nav aria-label="Season" className="mb-4 flex flex-wrap gap-2">
          {seasons.map((s) => (
            <Link
              key={s.id}
              href={`/t/${slug}?season=${s.id}`}
              aria-current={s.id === season?.id ? "true" : undefined}
              className={`btn min-h-9 border px-3 ${s.id === season?.id ? "border-accent bg-[oklch(from_var(--accent)_l_c_h/0.1)]" : "border-border-strong bg-surface"}`}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      )}
      {!season ? (
        <p className="text-sm text-muted">No schedule set up yet.</p>
      ) : games.length === 0 ? (
        <p className="text-sm text-muted">No games scheduled for {season.label}.</p>
      ) : (
        <ul className="divide-y divide-border rounded-[0.75rem] border border-border">
          {games.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="min-w-0">
                <span className="tabular-nums">{formatGameDate(g.game_date)}</span>
                {" · "}
                {g.home_away === "home" ? "vs" : "at"} {g.opponent?.name ?? "Unknown"}
                {g.location && (
                  <span className="block text-sm text-muted sm:inline">
                    <span className="hidden sm:inline"> · </span>
                    {g.location}
                  </span>
                )}
              </span>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${g.status === "analyzed" ? "border-border-strong text-muted" : "border-accent text-accent"}`}>
                {g.status === "analyzed" ? "Analyzed" : "Scheduled"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SchedulePage({ params, searchParams }: PageProps<"/t/[slug]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Schedule params={params} searchParams={searchParams} />
    </Suspense>
  );
}
