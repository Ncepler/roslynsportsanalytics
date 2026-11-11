// Schedule, claims and saved results. Stored as small JSON files in a private
// Vercel Blob (no database). Never holds video, appearance notes, or tracker names.

export type GameSport = "basketball" | "lacrosse";
export const GAME_SPORTS: GameSport[] = ["basketball", "lacrosse"];

export type Game = {
  id: string;
  sport: GameSport;
  /** YYYY-MM-DD, or null when the schedule didn't say (never guessed). */
  date: string | null;
  opponent: string;
  /** Free text from the schedule ("JV", "tournament"), or null. */
  note: string | null;
  /** "claimed" is stored; it only counts as in progress while the claim hasn't expired. */
  status: "open" | "claimed" | "done";
  /** SHA-256 hex of the holder's secret token, and when the claim lapses without a heartbeat. */
  claim: { hash: string; expiresAt: number } | null;
  doneAt: number | null;
};

export type Index = { version: 1; games: Game[] };

/** What members see. No claim details. */
export type PublicGame = {
  id: string;
  sport: GameSport;
  date: string | null;
  opponent: string;
  note: string | null;
  status: "open" | "in_progress" | "done";
};

export type SheetCell = string | number | null;
export type StoredSheet = { id: string; title: string; header: SheetCell[][]; rows: SheetCell[][] };

export type StoredResult = {
  gameId: string;
  sport: GameSport;
  opponent: string;
  date: string | null;
  statIds: string[];
  sheets: StoredSheet[];
  savedAt: number;
};

export type ScheduleInput = { sport: GameSport; date: string | null; opponent: string; note: string | null };

/** How long a claim lasts without a heartbeat, and how often the open page renews it. */
export const CLAIM_TTL_MS = 20 * 60 * 1000;
export const HEARTBEAT_MS = 2 * 60 * 1000;
export const MAX_RESULT_BYTES = 500_000;
