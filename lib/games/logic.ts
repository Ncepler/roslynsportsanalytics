// Pure rules for games and claims: no storage, no clock of its own, so every
// rule can be tested. Each apply* function returns a new index or says why not.

import { CLAIM_TTL_MS, type Game, type GameSport, type Index, type PublicGame, type ScheduleInput } from "./types";

export type Outcome = { ok: true; index: Index } | { ok: false; status: number; error: string };

const fail = (status: number, error: string): Outcome => ({ ok: false, status, error });

export const emptyIndex = (): Index => ({ version: 1, games: [] });

export const isLive = (g: Game, now: number) => g.status === "claimed" && !!g.claim && g.claim.expiresAt > now;

export function toPublic(g: Game, now: number): PublicGame {
  const status = g.status === "done" ? "done" : isLive(g, now) ? "in_progress" : "open";
  return { id: g.id, sport: g.sport, date: g.date, opponent: g.opponent, note: g.note, status };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Same sport + date + opponent = same game, so re-uploading a schedule never duplicates. */
export function gameId(sport: GameSport, date: string | null, opponent: string): string {
  return `${sport}-${date ?? "no-date"}-${slug(opponent) || "opponent"}`;
}

export const validGameId = (id: unknown): id is string => typeof id === "string" && /^[a-z0-9-]{1,100}$/.test(id);

const replace = (index: Index, id: string, next: Game): Index => ({ ...index, games: index.games.map((g) => (g.id === id ? next : g)) });

export function applyUpsert(index: Index, items: ScheduleInput[]): { index: Index; added: number; kept: number } {
  const games = [...index.games];
  let added = 0;
  let kept = 0;
  for (const item of items) {
    const id = gameId(item.sport, item.date, item.opponent);
    const existing = games.find((g) => g.id === id);
    if (existing) {
      kept += 1;
      // Only the note may change; claims and results are never touched here.
      if (item.note !== existing.note) games[games.indexOf(existing)] = { ...existing, note: item.note };
      continue;
    }
    games.push({ id, sport: item.sport, date: item.date, opponent: item.opponent.trim(), note: item.note, status: "open", claim: null, doneAt: null });
    added += 1;
  }
  return { index: { ...index, games }, added, kept };
}

export function applyClaim(index: Index, id: string, hash: string, now: number): Outcome {
  const g = index.games.find((x) => x.id === id);
  if (!g) return fail(404, "That game isn't on the schedule.");
  if (g.status === "done") return fail(409, "That game has already been analyzed.");
  if (isLive(g, now)) return fail(409, "Someone else is working on that game right now.");
  return { ok: true, index: replace(index, id, { ...g, status: "claimed", claim: { hash, expiresAt: now + CLAIM_TTL_MS } }) };
}

/** The holder's token must match the claim that is still on the game (even a lapsed one nobody has taken over). */
function holds(g: Game | undefined, hash: string): g is Game {
  return !!g && g.status === "claimed" && g.claim?.hash === hash;
}

export function applyHeartbeat(index: Index, id: string, hash: string, now: number): Outcome {
  const g = index.games.find((x) => x.id === id);
  if (!holds(g, hash)) return fail(409, "This game was released. Pick it again to keep going.");
  return { ok: true, index: replace(index, id, { ...g, claim: { hash, expiresAt: now + CLAIM_TTL_MS } }) };
}

export function applyRelease(index: Index, id: string, hash: string): Outcome {
  const g = index.games.find((x) => x.id === id);
  if (!holds(g, hash)) return { ok: true, index }; // already free: nothing to do
  return { ok: true, index: replace(index, id, { ...g, status: "open", claim: null }) };
}

export function applyFinish(index: Index, id: string, hash: string, now: number): Outcome {
  const g = index.games.find((x) => x.id === id);
  if (g?.status === "done") return fail(409, "That game has already been saved.");
  if (!holds(g, hash)) return fail(409, "This game was released before it could be saved. Pick it again and re-run it.");
  return { ok: true, index: replace(index, id, { ...g, status: "done", claim: null, doneAt: now }) };
}

export function applyReopen(index: Index, id: string): Outcome {
  const g = index.games.find((x) => x.id === id);
  if (!g) return fail(404, "That game isn't on the schedule.");
  return { ok: true, index: replace(index, id, { ...g, status: "open", claim: null, doneAt: null }) };
}

export function applyDelete(index: Index, id: string, now: number): Outcome {
  const g = index.games.find((x) => x.id === id);
  if (!g) return fail(404, "That game isn't on the schedule.");
  if (g.status === "done") return fail(409, "Reopen this game before deleting it.");
  if (isLive(g, now)) return fail(409, "Someone is working on this game right now.");
  return { ok: true, index: { ...index, games: index.games.filter((x) => x.id !== id) } };
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Games for the picker: by date (undated last), then opponent. */
export function sortGames<T extends { date: string | null; opponent: string }>(games: T[]): T[] {
  return [...games].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.opponent.localeCompare(b.opponent));
}
