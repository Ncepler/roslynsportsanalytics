import { StoredSeason } from "@/components/season/stored-season";
import { listSeasons } from "@/lib/db/admin";
import { getTeamBySlug, tryDb } from "@/lib/db/read";
import { loadStoredSeason } from "@/lib/db/season";
import { hasSeason } from "@/lib/teams/options";

/**
 * Season trends for one team, shown on the team page under the schedule (there is no separate Season tab).
 * Uses the same season the schedule above is showing. Renders nothing for a sport whose trends aren't built.
 */
export async function SeasonSection({ slug, seasonParam }: { slug: string; seasonParam?: string }) {
  const result = await tryDb(async () => {
    const team = await getTeamBySlug(slug);
    if (!team || !hasSeason(team.sport)) return null;
    const seasons = await listSeasons();
    const season = seasons.find((s) => s.id === seasonParam) ?? seasons.find((s) => s.is_current) ?? seasons[0] ?? null;
    if (!season) return null;
    return loadStoredSeason({ id: team.id, sport: team.sport as "basketball" | "lacrosse" }, season);
  });
  if (!result.ok) return <p role="alert" className="mt-10 text-sm text-warning-text">{result.message}</p>;
  if (!result.data) return null;
  return (
    <section id="season" className="mt-12 scroll-mt-20">
      <h2 className="mb-4 text-xl font-semibold tracking-[-0.01em]">Season trends</h2>
      <StoredSeason data={result.data} />
    </section>
  );
}
