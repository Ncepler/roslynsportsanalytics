import { db } from "./client";
import { dbFail, DbError } from "./errors";
import type { GameRow, TeamRow } from "./admin";
import { toRows, type SaveBody } from "./save-schema";
import { hasStats } from "@/lib/teams/options";

// Saving and reading analyzed games. The write is one database function call (migration 0002), so a
// replace is all-or-nothing. Only logged or user-edited fields are stored; never derived numbers.

/** Version of the stored possession format. Bump when the shape of `events` changes. */
export const SCHEMA_VERSION = 1;

export type PickableGame = { id: string; date: string; opponent: string; home_away: "home" | "away"; location: string | null; our_score: number | null; opp_score: number | null; /** Someone is analyzing this game right now. */ busy?: boolean };

/** A claim not refreshed for this long is treated as abandoned (closed laptop, lost tab). */
export const CLAIM_TTL_MS = 30 * 60 * 1000;
const claimCutoff = () => new Date(Date.now() - CLAIM_TTL_MS).toISOString();

const lockColumnsMissing = (code?: string) => code === "42703" || code === "PGRST204"; // migration 0004 not run yet

/** Marks a scheduled game as being analyzed by this browser tab. False when someone else holds a fresh claim. */
export async function claimGame(gameId: string, token: string): Promise<boolean> {
  const { data, error } = await db()
    .from("games")
    .update({ analyzing_token: token, analyzing_since: new Date().toISOString() })
    .eq("id", gameId)
    .eq("status", "scheduled")
    .or(`analyzing_token.is.null,analyzing_token.eq.${token},analyzing_since.lt.${claimCutoff()}`)
    .select("id");
  if (error) {
    if (lockColumnsMissing(error.code)) throw new DbError(503, "The database needs its latest update (migration 0004). Ask the admin to run it in Supabase.");
    dbFail(error);
  }
  return (data ?? []).length > 0;
}

/** Clears this tab's claim (and only this tab's). */
export async function releaseGame(gameId: string, token: string): Promise<void> {
  const { error } = await db().from("games").update({ analyzing_token: null, analyzing_since: null }).eq("id", gameId).eq("analyzing_token", token);
  if (error && !lockColumnsMissing(error.code)) dbFail(error);
}

/** A team's games for the Analyze picker: not yet analyzed, and already analyzed. */
export async function listTeamGames(teamId: string): Promise<{ scheduled: PickableGame[]; analyzed: PickableGame[]; opponents: string[] }> {
  const lockSelect = "id, game_date, home_away, location, status, our_score, opp_score, analyzing_since, opponent:opponents(name)";
  let gamesRes = await db().from("games").select(lockSelect).eq("team_id", teamId).order("game_date");
  // Before migration 0004 is run the lock columns don't exist: list the games without lock info instead of failing.
  if (gamesRes.error && lockColumnsMissing(gamesRes.error.code)) gamesRes = (await db().from("games").select("id, game_date, home_away, location, status, our_score, opp_score, opponent:opponents(name)").eq("team_id", teamId).order("game_date")) as unknown as typeof gamesRes;
  if (gamesRes.error) dbFail(gamesRes.error);
  const opponentsRes = await db().from("opponents").select("name").order("name");
  if (opponentsRes.error) dbFail(opponentsRes.error);
  const rows = (gamesRes.data ?? []) as unknown as (GameRow & { game_date: string; analyzing_since?: string | null })[];
  const cutoffMs = Date.now() - CLAIM_TTL_MS;
  const pick = (g: GameRow & { analyzing_since?: string | null }): PickableGame => ({
    id: g.id,
    date: g.game_date,
    opponent: g.opponent?.name ?? "Unknown",
    home_away: g.home_away,
    location: g.location,
    our_score: g.our_score,
    opp_score: g.opp_score,
    busy: Boolean(g.analyzing_since && Date.parse(g.analyzing_since) > cutoffMs),
  });
  return {
    scheduled: rows.filter((g) => g.status === "scheduled").map(pick),
    analyzed: rows.filter((g) => g.status === "analyzed").map(pick).reverse(),
    opponents: (opponentsRes.data ?? []).map((o: { name: string }) => o.name),
  };
}

async function findOrCreateOpponent(name: string): Promise<string> {
  // Compared in code, not with ilike: PostgREST treats "*" in ilike as a wildcard, so a typed "P*" could match "Port Washington".
  const sameName = async () => {
    const { data, error } = await db().from("opponents").select("id, name");
    if (error) dbFail(error);
    return (data ?? []).find((o: { id: string; name: string }) => o.name.trim().toLowerCase() === name.trim().toLowerCase())?.id as string | undefined;
  };
  const existing = await sameName();
  if (existing) return existing;
  const made = await db().from("opponents").insert({ name }).select("id").single();
  if (made.error) {
    // Lost a race with someone adding the same name: read it again.
    const again = await sameName();
    if (again) return again;
    dbFail(made.error);
  }
  return made.data.id as string;
}

async function seasonCovering(date: string): Promise<string> {
  const { data, error } = await db().from("seasons").select("id").lte("start_date", date).gte("end_date", date).limit(1);
  if (error) dbFail(error);
  if (!data?.[0]) throw new DbError(400, "No season covers that date. Ask an admin to add the season first.");
  return data[0].id as string;
}

export async function getTeam(id: string): Promise<TeamRow> {
  const { data, error } = await db().from("teams").select("*").eq("id", id).maybeSingle();
  if (error) dbFail(error);
  if (!data) throw new DbError(404, "Team not found.");
  return data as TeamRow;
}

/** Saves the reviewed log to a scheduled game, or to a quick-added one. Returns the game id. */
export async function saveAnalysis(body: SaveBody, model: string): Promise<{ gameId: string; created: boolean }> {
  const team = await getTeam(body.team_id);
  if (team.archived) throw new DbError(409, "That team is archived.");
  if (!hasStats(team.sport)) throw new DbError(400, "Stats for this sport aren't set up yet.");

  let gameId = body.game_id;
  let created = false;
  if (gameId) {
    const { data, error } = await db().from("games").select("id, team_id, status").eq("id", gameId).maybeSingle();
    if (error) dbFail(error);
    if (!data || data.team_id !== team.id) throw new DbError(404, "That game isn't on this team's schedule.");
    if (body.reopen && data.status !== "analyzed") throw new DbError(400, "That game hasn't been analyzed yet.");
    if (data.status === "analyzed" && !body.confirm_replace) {
      throw new DbError(409, "This game already has saved analysis. Replace it?", "needs_confirm");
    }
  } else if (body.quick) {
    // Check the season first, so a bad date doesn't leave a new opponent behind.
    const seasonId = await seasonCovering(body.quick.game_date);
    const opponentId = await findOrCreateOpponent(body.quick.opponent_name);
    const made = await db()
      .from("games")
      .insert({ team_id: team.id, season_id: seasonId, opponent_id: opponentId, game_date: body.quick.game_date, home_away: body.quick.home_away })
      .select("id")
      .single();
    if (made.error) dbFail(made.error);
    gameId = made.data.id as string;
    created = true;
  }
  if (!gameId) throw new DbError(400, "Choose a game or add one.");

  const { error } = await db().rpc("save_game_analysis", {
    p_game_id: gameId,
    p_model: model,
    p_schema_version: SCHEMA_VERSION,
    // A file name can contain a student's name ("Jaylen 30 pt game.mp4"), so it is never stored.
    p_source_filename: null,
    p_our_score: body.our_score ?? null,
    p_opp_score: body.opp_score ?? null,
    p_meta: { stat_ids: body.stat_ids, starters: body.starters.filter(Boolean), scoreboard: body.log.scoreboard },
    p_possessions: toRows(body.log.possessions),
  });
  if (error) {
    // Don't leave an empty quick-added game behind.
    if (created) await db().from("games").delete().eq("id", gameId);
    if (error.code === "PGRST202" || error.code === "42883") throw new DbError(503, "The database needs its latest update (migration 0002). Ask the admin to run it in Supabase.");
    if (error.code === "P0002") throw new DbError(404, "Game not found.");
    dbFail(error);
  }
  // The analysis is saved: whoever held the claim is done with it.
  const cleared = await db().from("games").update({ analyzing_token: null, analyzing_since: null }).eq("id", gameId);
  if (cleared.error && !lockColumnsMissing(cleared.error.code)) dbFail(cleared.error);
  return { gameId, created };
}

/** A saved game's log, ready for the Review table. */
export async function getGameLog(gameId: string) {
  const game = await db().from("games").select("id, team_id, game_date, status, our_score, opp_score, meta, opponent:opponents(name)").eq("id", gameId).maybeSingle();
  if (game.error) dbFail(game.error);
  if (!game.data) throw new DbError(404, "Game not found.");
  if (game.data.status !== "analyzed") throw new DbError(404, "That game hasn't been analyzed yet.");
  const rows = await db().from("possessions").select("*").eq("game_id", gameId).order("seq");
  if (rows.error) dbFail(rows.error);
  return { game: game.data as unknown as GameRow & { meta: { stat_ids?: string[]; starters?: string[]; scoreboard?: unknown[] } | null }, rows: rows.data ?? [] };
}
