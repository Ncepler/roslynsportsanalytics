import { db } from "./client";
import { dbFail, DbError } from "./errors";
import { teamSlug, type TeamKey } from "@/lib/teams/options";

// Database operations behind /api/admin/*. Inputs are already validated (lib/db/schemas.ts).
// Only logged or user-edited fields are stored; never derived numbers.

export type TeamRow = TeamKey & { id: string; slug: string; archived: boolean; created_at: string };
export type SeasonRow = { id: string; label: string; start_date: string; end_date: string; is_current: boolean; created_at: string };
export type OpponentRow = { id: string; name: string; created_at: string };
export type GameRow = {
  id: string;
  team_id: string;
  season_id: string;
  opponent_id: string;
  game_date: string;
  home_away: "home" | "away";
  location: string | null;
  status: "scheduled" | "analyzed";
  our_score: number | null;
  opp_score: number | null;
  analyzed_at: string | null;
  opponent?: { name: string } | null;
};

// ---------- teams ----------

export async function listTeams(): Promise<TeamRow[]> {
  const { data, error } = await db().from("teams").select("*").order("sport").order("gender").order("level");
  if (error) dbFail(error);
  return data as TeamRow[];
}

export async function createTeam(input: TeamKey): Promise<TeamRow> {
  const { data, error } = await db()
    .from("teams")
    .insert({ gender: input.gender, level: input.level, sport: input.sport, slug: teamSlug(input) })
    .select()
    .single();
  if (error) dbFail(error, { unique: "That team already exists." });
  return data as TeamRow;
}

export async function setTeamArchived(id: string, archived: boolean): Promise<TeamRow> {
  const { data, error } = await db().from("teams").update({ archived }).eq("id", id).select().maybeSingle();
  if (error) dbFail(error);
  if (!data) throw new DbError(404, "Team not found.");
  return data as TeamRow;
}

// ---------- seasons ----------

export async function listSeasons(): Promise<SeasonRow[]> {
  const { data, error } = await db().from("seasons").select("*").order("start_date", { ascending: false });
  if (error) dbFail(error);
  return data as SeasonRow[];
}

/** Makes one season current. Not a single transaction: clears the old one, then sets the new one (the unique index guards against two). */
export async function makeSeasonCurrent(id: string): Promise<SeasonRow> {
  const found = await db().from("seasons").select("id").eq("id", id).maybeSingle();
  if (found.error) dbFail(found.error);
  if (!found.data) throw new DbError(404, "Season not found.");
  const cleared = await db().from("seasons").update({ is_current: false }).eq("is_current", true).neq("id", id);
  if (cleared.error) dbFail(cleared.error);
  const { data, error } = await db().from("seasons").update({ is_current: true }).eq("id", id).select().single();
  if (error) dbFail(error, { unique: "Another season is still marked current. Try again." });
  return data as SeasonRow;
}

export async function createSeason(input: { label: string; start_date: string; end_date: string; is_current?: boolean }): Promise<SeasonRow> {
  const { data, error } = await db()
    .from("seasons")
    .insert({ label: input.label, start_date: input.start_date, end_date: input.end_date, is_current: false })
    .select()
    .single();
  if (error) dbFail(error, { unique: "That season already exists." });
  return input.is_current ? makeSeasonCurrent((data as SeasonRow).id) : (data as SeasonRow);
}

// ---------- opponents ----------

export async function listOpponents(): Promise<OpponentRow[]> {
  const { data, error } = await db().from("opponents").select("*").order("name");
  if (error) dbFail(error);
  return data as OpponentRow[];
}

export async function createOpponent(name: string): Promise<OpponentRow> {
  const { data, error } = await db().from("opponents").insert({ name }).select().single();
  if (error) dbFail(error, { unique: "That opponent is already in the list." });
  return data as OpponentRow;
}

// ---------- games (the schedule) ----------

export async function listGames(filter: { team_id?: string; season_id?: string }): Promise<GameRow[]> {
  let q = db().from("games").select("*, opponent:opponents(name)").order("game_date");
  if (filter.team_id) q = q.eq("team_id", filter.team_id);
  if (filter.season_id) q = q.eq("season_id", filter.season_id);
  const { data, error } = await q;
  if (error) dbFail(error);
  return data as unknown as GameRow[];
}

async function requireSeasonCovering(seasonId: string, date: string) {
  const { data, error } = await db().from("seasons").select("label,start_date,end_date").eq("id", seasonId).maybeSingle();
  if (error) dbFail(error);
  if (!data) throw new DbError(400, "That season doesn't exist.");
  if (date < data.start_date || date > data.end_date) {
    throw new DbError(400, `That date is outside the ${data.label} season (${data.start_date} to ${data.end_date}).`);
  }
}

export async function createGame(input: {
  team_id: string;
  season_id: string;
  opponent_id: string;
  game_date: string;
  home_away: "home" | "away";
  location: string | null;
}): Promise<GameRow> {
  const team = await db().from("teams").select("archived").eq("id", input.team_id).maybeSingle();
  if (team.error) dbFail(team.error);
  if (!team.data) throw new DbError(400, "That team doesn't exist.");
  if (team.data.archived) throw new DbError(409, "That team is archived. Restore it before adding games.");
  await requireSeasonCovering(input.season_id, input.game_date);
  const { data, error } = await db().from("games").insert(input).select("*, opponent:opponents(name)").single();
  if (error) dbFail(error, { foreignKey: "That opponent doesn't exist." });
  return data as unknown as GameRow;
}

export async function updateGame(
  id: string,
  patch: { season_id?: string; opponent_id?: string; game_date?: string; home_away?: "home" | "away"; location?: string | null },
): Promise<GameRow> {
  const current = await db().from("games").select("season_id,game_date").eq("id", id).maybeSingle();
  if (current.error) dbFail(current.error);
  if (!current.data) throw new DbError(404, "Game not found.");
  if (patch.season_id !== undefined || patch.game_date !== undefined) {
    await requireSeasonCovering(patch.season_id ?? current.data.season_id, patch.game_date ?? current.data.game_date);
  }
  const { data, error } = await db().from("games").update(patch).eq("id", id).select("*, opponent:opponents(name)").single();
  if (error) dbFail(error, { foreignKey: "That opponent doesn't exist." });
  return data as unknown as GameRow;
}

/** Deleting a game that has saved analysis also deletes its possession rows, so it needs `confirm`. */
export async function deleteGame(id: string, confirm: boolean): Promise<void> {
  const { data, error } = await db().from("games").select("status").eq("id", id).maybeSingle();
  if (error) dbFail(error);
  if (!data) throw new DbError(404, "Game not found.");
  if (data.status === "analyzed" && !confirm) {
    throw new DbError(409, "This game has saved analysis. Confirm to delete the game and its analysis.");
  }
  const del = await db().from("games").delete().eq("id", id);
  if (del.error) dbFail(del.error);
}

// ---------- export ----------

const PAGE = 1000;

async function readAll(table: string, order: string[]): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db().from(table).select("*");
    for (const col of order) q = q.order(col);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) dbFail(error);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/** Everything stored, for backup and handoff. */
export async function exportAll() {
  const [teams, seasons, opponents, games, possessions] = await Promise.all([
    readAll("teams", ["id"]),
    readAll("seasons", ["id"]),
    readAll("opponents", ["id"]),
    readAll("games", ["id"]),
    readAll("possessions", ["game_id", "seq"]),
  ]);
  return { exported_at: new Date().toISOString(), format_version: 1, tables: { teams, seasons, opponents, games, possessions } };
}
