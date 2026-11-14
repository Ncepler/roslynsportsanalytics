import { db } from "./client";
import { dbFail } from "./errors";
import { fromRows } from "./save-schema";
import { flaggedQuarters, scoreboardCheck } from "@/lib/derive";
import type { ScoreboardReading } from "@/lib/gemini/log-types";
import { gameKey, type RawTab } from "@/lib/season/parse";
import type { Score } from "@/lib/season/model";
import { allSheets } from "@/lib/sheets";
import { defaultStatIds, getSport } from "@/lib/sports";

// Season trends read stored games. Each saved possession log is turned into the club's sheets by the same code
// the Review step uses, and those sheets go through the same parser and math as always (lib/season). Nothing
// derived is stored; every number is computed here, on read, from the logged rows.

export type IncludedGame = { name: string; date: string; opponent: string; lowRows: number; mismatchedQuarters: string[]; hasScore: boolean };

export type StoredSeasonData = {
  sport: "basketball" | "lacrosse";
  seasonLabel: string;
  tabs: RawTab[];
  /** Typed final scores, keyed the way the Season model keys games. */
  scores: Record<string, Score>;
  games: IncludedGame[];
  /** Games (and rows) still carrying something to double-check: low-confidence possessions or a failed scoreboard check. */
  needsReview: { games: number; rows: number };
};

type StoredGame = { id: string; game_date: string; our_score: number | null; opp_score: number | null; meta: { stat_ids?: string[]; starters?: string[]; scoreboard?: ScoreboardReading[] } | null; opponent: { name: string } | null };

const PAGE = 1000;

export async function loadStoredSeason(team: { id: string; sport: "basketball" | "lacrosse" }, season: { id: string; label: string }): Promise<StoredSeasonData> {
  const gamesRes = await db()
    .from("games")
    .select("id, game_date, our_score, opp_score, meta, opponent:opponents(name)")
    .eq("team_id", team.id)
    .eq("season_id", season.id)
    .eq("status", "analyzed")
    .order("game_date");
  if (gamesRes.error) dbFail(gamesRes.error);
  const games = (gamesRes.data ?? []) as unknown as StoredGame[];

  const rowsByGame = new Map<string, unknown[]>();
  if (games.length > 0) {
    const ids = games.map((g) => g.id);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db().from("possessions").select("*").in("game_id", ids).order("game_id").order("seq").range(from, from + PAGE - 1);
      if (error) dbFail(error);
      for (const r of data ?? []) {
        const list = rowsByGame.get(r.game_id as string) ?? [];
        list.push(r);
        rowsByGame.set(r.game_id as string, list);
      }
      if ((data ?? []).length < PAGE) break;
    }
  }

  const config = getSport(team.sport);
  const tabs: RawTab[] = [];
  const scores: Record<string, Score> = {};
  const included: IncludedGame[] = [];
  const used = new Map<string, number>();
  let needsGames = 0;
  let needsRows = 0;

  for (const g of games) {
    const opponent = g.opponent?.name ?? "Unknown";
    const base = `${opponent} ${g.game_date}`;
    const seen = (used.get(base) ?? 0) + 1;
    used.set(base, seen);
    const name = seen === 1 ? base : `${base} (${seen})`; // a doubleheader keeps two separate games
    const meta = g.meta ?? {};
    const log = fromRows((rowsByGame.get(g.id) ?? []) as never, meta.scoreboard ?? []);
    const statIds = meta.stat_ids && meta.stat_ids.length > 0 ? meta.stat_ids : config ? defaultStatIds(config) : [];
    for (const sheet of allSheets(log, statIds, opponent, team.sport, meta.starters ?? [])) {
      tabs.push({ file: "Saved games", name: `${name} - ${sheet.id}`, rows: [...sheet.header, ...sheet.rows] });
    }
    const lowRows = log.possessions.filter((p) => p.confidence === "low").length;
    const mismatchedQuarters = flaggedQuarters(scoreboardCheck(log));
    if (lowRows > 0 || mismatchedQuarters.length > 0) needsGames += 1;
    needsRows += lowRows;
    const hasScore = g.our_score !== null && g.opp_score !== null;
    if (hasScore) scores[gameKey(name)] = { roslyn: g.our_score, opponent: g.opp_score };
    included.push({ name, date: g.game_date, opponent, lowRows, mismatchedQuarters, hasScore });
  }

  return { sport: team.sport, seasonLabel: season.label, tabs, scores, games: included, needsReview: { games: needsGames, rows: needsRows } };
}
