// Browser-side calls for saving and reopening analyzed games.

import type { PossessionLog } from "@/lib/gemini/log-types";
import { api } from "./api";

export type SaveInput = {
  team_id: string;
  game_id?: string;
  quick?: { opponent_name: string; game_date: string; home_away: "home" | "away" };
  reopen?: boolean;
  confirm_replace?: boolean;
  clearance?: string;
  source_filename?: string | null;
  our_score?: number | null;
  opp_score?: number | null;
  stat_ids: string[];
  starters: string[];
  log: Pick<PossessionLog, "possessions" | "scoreboard">;
};

export const saveGameToTeam = (input: SaveInput) => api<{ ok: true; game_id: string }>("/api/games/save", { body: input });

export type ReopenedGame = {
  game: { id: string; date: string; opponent: string; our_score: number | null; opp_score: number | null };
  statIds: string[];
  starters: string[];
  log: PossessionLog;
};

export const loadSavedGame = (id: string) => api<ReopenedGame>(`/api/games/${id}/log`);
