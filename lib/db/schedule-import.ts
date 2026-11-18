import { db } from "./client";
import { dbFail, DbError } from "./errors";
import { MAX_ROWS } from "@/lib/schedule/read";

// Adding many games at once. SAFETY: this only ever INSERTS. It never updates or deletes a game, an opponent
// or anything else, so an import (or a double click, or a bad reading) can't change or remove what is there.
// Games already on that team's schedule (same season, date and opponent) are skipped, and the new games go in
// with ONE insert, so they are added together or not at all.

export type ImportGame = { game_date: string; opponent_name: string; home_away: "home" | "away"; location: string | null };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function importGames(input: { team_id: string; season_id: string; games: ImportGame[] }): Promise<{ added: number; skipped: number }> {
  if (input.games.length === 0) throw new DbError(400, "Nothing to add.");
  if (input.games.length > MAX_ROWS) throw new DbError(400, `Add at most ${MAX_ROWS} games at a time.`);

  const team = await db().from("teams").select("archived").eq("id", input.team_id).maybeSingle();
  if (team.error) dbFail(team.error);
  if (!team.data) throw new DbError(400, "That team doesn't exist.");
  if (team.data.archived) throw new DbError(409, "That team is archived. Restore it before adding games.");

  const season = await db().from("seasons").select("label,start_date,end_date").eq("id", input.season_id).maybeSingle();
  if (season.error) dbFail(season.error);
  const range = season.data;
  if (!range) throw new DbError(400, "That season doesn't exist.");
  const outside = input.games.find((g) => g.game_date < range.start_date || g.game_date > range.end_date);
  if (outside) throw new DbError(400, `${outside.game_date} is outside the ${range.label} season (${range.start_date} to ${range.end_date}). Nothing was added.`);

  // Opponents: reuse an existing name (ignoring case), otherwise create it. Compared in code, never with ilike.
  const opponents = await db().from("opponents").select("id, name");
  if (opponents.error) dbFail(opponents.error);
  const idFor = (name: string) => (opponents.data as { id: string; name: string }[]).find((o) => same(o.name, name))?.id;
  const missing: string[] = [];
  for (const g of input.games) if (!idFor(g.opponent_name) && !missing.some((m) => same(m, g.opponent_name))) missing.push(g.opponent_name.trim());
  let known = opponents.data as { id: string; name: string }[];
  if (missing.length > 0) {
    const made = await db().from("opponents").insert(missing.map((name) => ({ name }))).select("id, name");
    if (made.error) {
      // Someone added one of the same names a moment ago: read the list again and carry on.
      const again = await db().from("opponents").select("id, name");
      if (again.error) dbFail(made.error);
      known = again.data as { id: string; name: string }[];
    } else known = [...known, ...(made.data as { id: string; name: string }[])];
  }
  const resolve = (name: string) => known.find((o) => same(o.name, name))?.id;

  // Skip games already on this team's schedule for the season, and repeats inside this batch.
  const existing = await db().from("games").select("game_date, opponent_id").eq("team_id", input.team_id).eq("season_id", input.season_id);
  if (existing.error) dbFail(existing.error);
  const taken = new Set((existing.data as { game_date: string; opponent_id: string }[]).map((g) => `${g.game_date}|${g.opponent_id}`));
  const fresh: { team_id: string; season_id: string; opponent_id: string; game_date: string; home_away: string; location: string | null }[] = [];
  for (const g of input.games) {
    const opponent_id = resolve(g.opponent_name);
    if (!opponent_id) throw new DbError(500, "Couldn't match an opponent. Nothing was added.");
    const key = `${g.game_date}|${opponent_id}`;
    if (taken.has(key)) continue;
    taken.add(key);
    fresh.push({ team_id: input.team_id, season_id: input.season_id, opponent_id, game_date: g.game_date, home_away: g.home_away, location: g.location });
  }
  if (fresh.length > 0) {
    const { error } = await db().from("games").insert(fresh); // one statement: all or nothing
    if (error) dbFail(error, { foreignKey: "An opponent couldn't be matched. Nothing was added." });
  }
  return { added: fresh.length, skipped: input.games.length - fresh.length };
}

export type ImportAllGame = ImportGame & { team_id: string };

/**
 * Adds games for many teams. Same safety as importGames (insert-only, repeats skipped), run one team at a time, so
 * each team's games go in together or not at all. If a team fails, the teams before it are already added; run it again
 * and those games are simply skipped.
 */
export async function importAllGames(input: { season_id: string; games: ImportAllGame[] }): Promise<{ teams: number; added: number; skipped: number }> {
  const byTeam = new Map<string, ImportGame[]>();
  for (const { team_id, ...game } of input.games) byTeam.set(team_id, [...(byTeam.get(team_id) ?? []), game]);
  const tooMany = [...byTeam.values()].find((g) => g.length > MAX_ROWS);
  if (tooMany) throw new DbError(400, `One team has more than ${MAX_ROWS} games. Check the rows. Nothing was added.`);
  let added = 0;
  let skipped = 0;
  let teams = 0;
  for (const [team_id, games] of byTeam) {
    try {
      const r = await importGames({ team_id, season_id: input.season_id, games });
      added += r.added;
      skipped += r.skipped;
      teams += 1;
    } catch (err) {
      const status = err instanceof DbError ? err.status : 500;
      const why = err instanceof DbError ? err.message : "Something went wrong.";
      throw new DbError(status, `${why} ${teams} team${teams === 1 ? " was" : "s were"} added before this. Run it again to add the rest; games already added are skipped.`);
    }
  }
  return { teams, added, skipped };
}
