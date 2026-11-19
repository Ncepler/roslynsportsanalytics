import { db } from "./client";
import { dbFail, DbError } from "./errors";
import type { GameRow, TeamRow } from "./admin";
import { fromRows, toRows, type SaveBody } from "./save-schema";
import type { AnalysisState } from "./schemas";
import { allSheets } from "@/lib/sheets";
import { getSport } from "@/lib/sports";
import { hasStats } from "@/lib/teams/options";

// Saving and reading analyzed games. The write is one database function call (migration 0002), so a
// replace is all-or-nothing. Only logged or user-edited fields are stored; never derived numbers.

/** Version of the formulas behind the stored stats snapshot. Bump when a formula in lib/derive changes. */
export const STATS_FORMULA_VERSION = 1;

/** Version of the stored possession format. Bump when the shape of `events` changes. */
export const SCHEMA_VERSION = 1;

export type PickableGame = { id: string; date: string; opponent: string; home_away: "home" | "away"; location: string | null; our_score: number | null; opp_score: number | null; /** Someone is analyzing this game right now. */ busy?: boolean; /** The club member in charge of this game (typed name), if any. */ assignedTo?: string | null; /** What the open analysis is doing (a dot), if one is open. */ state?: AnalysisState | null };

/** A claim not refreshed for this long is treated as abandoned (closed laptop, lost tab). */
export const CLAIM_TTL_MS = 30 * 60 * 1000;
/** Is this "last checked in" time recent enough that the analysis is still open? */
export const isClaimFresh = (since: string | null | undefined): boolean => Boolean(since && Date.parse(since) > Date.now() - CLAIM_TTL_MS);
const claimCutoff = () => new Date(Date.now() - CLAIM_TTL_MS).toISOString();

const lockColumnsMissing = (code?: string) => code === "42703" || code === "PGRST204"; // migration 0004 or 0007 not run yet

/**
 * Marks a scheduled game as being analyzed by this browser tab, and puts the member in charge of it.
 * False when someone else holds a fresh claim. Also the heartbeat: each call refreshes the claim and the state.
 */
export async function claimGame(gameId: string, token: string, name: string, state?: AnalysisState): Promise<boolean> {
  const tryUpdate = (patch: Record<string, unknown>) =>
    db()
      .from("games")
      .update(patch)
      .eq("id", gameId)
      .eq("status", "scheduled")
      .or(`analyzing_token.is.null,analyzing_token.eq.${token},analyzing_since.lt.${claimCutoff()}`)
      .select("id");
  const since = new Date().toISOString();
  let { data, error } = await tryUpdate({ analyzing_token: token, analyzing_since: since, assigned_to: name, ...(state ? { analysis_state: state } : {}) });
  // Migration 0007 not run yet: the claim itself still works without the name and the dot.
  if (error && lockColumnsMissing(error.code)) ({ data, error } = await tryUpdate({ analyzing_token: token, analyzing_since: since }));
  if (error) {
    if (lockColumnsMissing(error.code)) throw new DbError(503, "The database needs its latest update (migration 0004). Ask the admin to run it in Supabase.");
    dbFail(error);
  }
  return (data ?? []).length > 0;
}

/** Clears this tab's claim (and only this tab's). A game that was never analyzed also loses its person in charge. */
export async function releaseGame(gameId: string, token: string): Promise<void> {
  const full = await db().from("games").update({ analyzing_token: null, analyzing_since: null, analysis_state: null, assigned_to: null }).eq("id", gameId).eq("analyzing_token", token).eq("status", "scheduled");
  if (full.error && lockColumnsMissing(full.error.code)) {
    const old = await db().from("games").update({ analyzing_token: null, analyzing_since: null }).eq("id", gameId).eq("analyzing_token", token);
    if (old.error && !lockColumnsMissing(old.error.code)) dbFail(old.error);
    return;
  }
  if (full.error) dbFail(full.error);
  // An analyzed game keeps its person in charge; only the claim goes.
  const rest = await db().from("games").update({ analyzing_token: null, analyzing_since: null, analysis_state: null }).eq("id", gameId).eq("analyzing_token", token);
  if (rest.error && !lockColumnsMissing(rest.error.code)) dbFail(rest.error);
}

/** Puts a member in charge of a game (name) or gives it up (null), without starting an analysis. */
export async function assignGame(gameId: string, name: string | null): Promise<void> {
  const { data, error } = await db().from("games").update({ assigned_to: name }).eq("id", gameId).select("id");
  if (error) {
    if (lockColumnsMissing(error.code)) throw new DbError(503, "The database needs its latest update (migration 0007). Ask the admin to run it in Supabase.");
    dbFail(error);
  }
  if ((data ?? []).length === 0) throw new DbError(404, "Game not found.");
}

/** A team's games for the Analyze picker: not yet analyzed, and already analyzed. */
export async function listTeamGames(teamId: string): Promise<{ scheduled: PickableGame[]; analyzed: PickableGame[]; opponents: string[] }> {
  // Newest columns first; before migrations 0007 / 0004 are run, fall back to what exists instead of failing.
  const selects = [
    "id, game_date, home_away, location, status, our_score, opp_score, analyzing_since, assigned_to, analysis_state, opponent:opponents(name)",
    "id, game_date, home_away, location, status, our_score, opp_score, analyzing_since, opponent:opponents(name)",
    "id, game_date, home_away, location, status, our_score, opp_score, opponent:opponents(name)",
  ];
  let gamesRes = await db().from("games").select(selects[0]).eq("team_id", teamId).order("game_date");
  for (let i = 1; i < selects.length && gamesRes.error && lockColumnsMissing(gamesRes.error.code); i++) {
    gamesRes = (await db().from("games").select(selects[i]).eq("team_id", teamId).order("game_date")) as unknown as typeof gamesRes;
  }
  if (gamesRes.error) dbFail(gamesRes.error);
  const opponentsRes = await db().from("opponents").select("name").order("name");
  if (opponentsRes.error) dbFail(opponentsRes.error);
  type Row = GameRow & { game_date: string; analyzing_since?: string | null };
  const rows = (gamesRes.data ?? []) as unknown as Row[];
  const cutoffMs = Date.now() - CLAIM_TTL_MS;
  const pick = (g: Row): PickableGame => {
    const busy = Boolean(g.analyzing_since && Date.parse(g.analyzing_since) > cutoffMs);
    return {
      id: g.id,
      date: g.game_date,
      opponent: g.opponent?.name ?? "Unknown",
      home_away: g.home_away,
      location: g.location,
      our_score: g.our_score,
      opp_score: g.opp_score,
      busy,
      assignedTo: g.assigned_to ?? null,
      // A stale claim's dot would lie, so it only shows while the claim is fresh.
      state: busy ? ((g.analysis_state as AnalysisState | null | undefined) ?? "working") : null,
    };
  };
  return {
    scheduled: rows.filter((g) => g.status === "scheduled").map(pick),
    analyzed: rows.filter((g) => g.status === "analyzed").map(pick).reverse(),
    opponents: (opponentsRes.data ?? []).map((o: { name: string }) => o.name),
  };
}


/** Throws 409 if a different tab holds a fresh claim on this game (the token is what proves a save is the claimer's). */
async function refuseIfClaimedByOther(gameId: string, token: string | undefined): Promise<void> {
  const { data, error } = await db().from("games").select("analyzing_token, analyzing_since").eq("id", gameId).maybeSingle();
  if (error) {
    if (lockColumnsMissing(error.code)) return;
    dbFail(error);
  }
  const row = data as { analyzing_token: string | null; analyzing_since: string | null } | null;
  const fresh = Boolean(row?.analyzing_token && row.analyzing_since && Date.parse(row.analyzing_since) > Date.now() - CLAIM_TTL_MS);
  if (fresh && row!.analyzing_token !== token) throw new DbError(409, "Someone else is analyzing this game right now, so it can't be saved from here.", "game_busy");
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

async function opponentNameOf(gameId: string): Promise<string> {
  const { data, error } = await db().from("games").select("opponent:opponents(name)").eq("id", gameId).maybeSingle();
  if (error) dbFail(error);
  const opp = (data as unknown as { opponent?: { name?: string } | { name?: string }[] | null } | null)?.opponent;
  return (Array.isArray(opp) ? opp[0]?.name : opp?.name) ?? "Opponent";
}

/** Saves the reviewed log to a scheduled game, or to a quick-added one. Returns the game id. */
export async function saveAnalysis(body: SaveBody, model: string): Promise<{ gameId: string; created: boolean }> {
  const team = await getTeam(body.team_id);
  if (team.archived) throw new DbError(409, "That team is archived.");
  if (!hasStats(team.sport)) throw new DbError(400, "Stats for this sport aren't set up yet.");

  // Second lock (the schema checks this too): an edit without the Roslyn-game check can never create a game.
  if (body.reopen && (!body.game_id || body.quick)) throw new DbError(403, "Only a game that was already saved can be edited.");
  let gameId = body.game_id;
  let created = false;
  if (gameId) {
    const { data, error } = await db().from("games").select("id, team_id, status").eq("id", gameId).maybeSingle();
    if (error) dbFail(error);
    if (!data || data.team_id !== team.id) throw new DbError(404, "That game isn't on this team's schedule.");
    if (body.reopen && data.status !== "analyzed") throw new DbError(400, "That game hasn't been analyzed yet.");
    // Someone else is analyzing this scheduled game right now: their claim wins, so two people can't save over each other.
    if (data.status === "scheduled") await refuseIfClaimedByOther(gameId, body.claim_token);
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

  // Noah, Nov 14: every stat tracked for a game is stored with it, so it is still there if it is wanted later.
  // The possession log above holds every logged stat; this snapshot adds the computed tables (points, efficiency,
  // percentages, totals) as they were when the game was saved. Season trends still recompute from the log on read, so
  // a formula fix reaches past games there; the snapshot is the saved record.
  const opponentName = body.quick?.opponent_name ?? (await opponentNameOf(gameId));
  const snapshotLog = fromRows(toRows(body.log.possessions) as never, body.log.scoreboard);
  const statsSnapshot = {
    formula_version: STATS_FORMULA_VERSION,
    computed_at: new Date().toISOString(),
    stat_ids: body.stat_ids,
    sheets: getSport(team.sport) ? allSheets(snapshotLog, body.stat_ids, opponentName, team.sport, body.starters.filter(Boolean) as string[]) : [],
  };

  const { error } = await db().rpc("save_game_analysis", {
    p_game_id: gameId,
    p_model: model,
    p_schema_version: SCHEMA_VERSION,
    // A file name can contain a student's name ("Jaylen 30 pt game.mp4"), so it is never stored.
    p_source_filename: null,
    p_our_score: body.our_score ?? null,
    p_opp_score: body.opp_score ?? null,
    p_meta: { stat_ids: body.stat_ids, starters: body.starters.filter(Boolean), scoreboard: body.log.scoreboard, stats_snapshot: statsSnapshot, auto_saved: body.auto === true },
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
  const cleared = await db().from("games").update({ analyzing_token: null, analyzing_since: null, analysis_state: null }).eq("id", gameId);
  if (cleared.error && lockColumnsMissing(cleared.error.code)) await db().from("games").update({ analyzing_token: null, analyzing_since: null }).eq("id", gameId);
  else if (cleared.error) dbFail(cleared.error);
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
  // Who is in charge of this game (migration 0007; absent before it is run, which is fine).
  const who = await db().from("games").select("assigned_to").eq("id", gameId).maybeSingle();
  const assigned_to = who.error ? null : ((who.data as { assigned_to?: string | null } | null)?.assigned_to ?? null);
  return { game: { ...(game.data as object), assigned_to } as unknown as GameRow & { meta: { stat_ids?: string[]; starters?: string[]; scoreboard?: unknown[] } | null }, rows: rows.data ?? [] };
}
