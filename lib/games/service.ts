// Game operations the API routes call. Every change is read, change, conditional
// write; if someone else wrote in between, it re-reads and tries again.

import { GameError } from "./errors";
import {
  applyClaim,
  applyDelete,
  applyFinish,
  applyHeartbeat,
  applyRelease,
  applyReopen,
  applyUpsert,
  hashToken,
  newToken,
  sortGames,
  toPublic,
  type Outcome,
} from "./logic";
import { getStore, type Store } from "./store";
import { MAX_RESULT_BYTES, type GameSport, type PublicGame, type ScheduleInput, type StoredResult, type StoredSheet } from "./types";

const RETRIES = 6;

async function mutate<T>(store: Store, change: (index: Awaited<ReturnType<Store["readIndex"]>>["index"], now: number) => { outcome: Outcome; value: T }): Promise<T> {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const { index, etag } = await store.readIndex();
    const { outcome, value } = change(index, Date.now());
    if (!outcome.ok) throw new GameError(outcome.status, outcome.error);
    if (outcome.index === index || (await store.writeIndex(outcome.index, etag))) return value;
  }
  throw new GameError(503, "Lots of people are using this right now. Try again.");
}

export async function listGames(sport?: GameSport, store: Store = getStore()): Promise<PublicGame[]> {
  const { index } = await store.readIndex();
  const now = Date.now();
  return sortGames(index.games.filter((g) => !sport || g.sport === sport).map((g) => toPublic(g, now)));
}

export async function saveSchedule(items: ScheduleInput[], store: Store = getStore()) {
  return mutate(store, (index) => {
    const { index: next, added, kept } = applyUpsert(index, items);
    return { outcome: { ok: true, index: next } as Outcome, value: { added, kept } };
  });
}

/** Returns the secret token the holder needs for heartbeat, release and save. */
export async function claimGame(id: string, store: Store = getStore()): Promise<string> {
  const token = newToken();
  const hash = await hashToken(token);
  await mutate(store, (index, now) => ({ outcome: applyClaim(index, id, hash, now), value: null }));
  return token;
}

export async function heartbeat(id: string, token: string, store: Store = getStore()) {
  const hash = await hashToken(token);
  await mutate(store, (index, now) => ({ outcome: applyHeartbeat(index, id, hash, now), value: null }));
}

export async function releaseGame(id: string, token: string, store: Store = getStore()) {
  const hash = await hashToken(token);
  await mutate(store, (index) => ({ outcome: applyRelease(index, id, hash), value: null }));
}

/**
 * Saves the finished sheets and locks the game. Sport, opponent and date come
 * from the schedule, not the browser. The result is written first, so a failure
 * in between never loses data.
 */
export async function finishGame(id: string, token: string, data: { statIds: string[]; sheets: StoredSheet[] }, store: Store = getStore()) {
  const hash = await hashToken(token);
  if (JSON.stringify(data).length > MAX_RESULT_BYTES) throw new GameError(413, "These results are too big to save.");
  // Check the claim before writing anything.
  const { index } = await store.readIndex();
  const check = applyFinish(index, id, hash, Date.now());
  const game = index.games.find((g) => g.id === id);
  if (!check.ok || !game) throw new GameError(check.ok ? 404 : check.status, check.ok ? "That game isn't on the schedule." : check.error);
  await store.writeResult(id, { gameId: id, sport: game.sport, opponent: game.opponent, date: game.date, statIds: data.statIds, sheets: data.sheets, savedAt: Date.now() });
  try {
    await mutate(store, (idx, now) => ({ outcome: applyFinish(idx, id, hash, now), value: null }));
  } catch (err) {
    await store.deleteResult(id);
    throw err;
  }
}

export async function reopenGame(id: string, store: Store = getStore()) {
  await mutate(store, (index) => ({ outcome: applyReopen(index, id), value: null }));
  await store.deleteResult(id);
}

export async function deleteGame(id: string, store: Store = getStore()) {
  await mutate(store, (index, now) => ({ outcome: applyDelete(index, id, now), value: null }));
}

export async function listResults(sport: GameSport, store: Store = getStore()): Promise<StoredResult[]> {
  const { index } = await store.readIndex();
  const done = index.games.filter((g) => g.sport === sport && g.status === "done");
  const results = await Promise.all(done.map((g) => store.readResult(g.id)));
  return results.filter((r): r is StoredResult => r !== null);
}
