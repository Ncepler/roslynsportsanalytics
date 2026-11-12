// Browser-side calls for the schedule and claims.

import type { GameSport, PublicGame } from "@/lib/games/types";
import { api } from "./api";

export const fetchGames = (sport: GameSport) => api<{ games: PublicGame[] }>(`/api/games?sport=${sport}`).then((r) => r.games);

export const claimGame = (id: string) => api<{ token: string }>(`/api/games/${id}/claim`, { method: "POST", body: {} }).then((r) => r.token);

export const sendHeartbeat = (id: string, token: string) => api(`/api/games/${id}/heartbeat`, { body: { token } });

/** Best effort and safe to call as the page closes. */
export const releaseGame = (id: string, token: string) => api(`/api/games/${id}/release`, { body: { token }, keepalive: true }).catch(() => undefined);

export const finishGame = (id: string, token: string, data: { statIds: string[]; sheets: unknown[]; clearance: string }) => api(`/api/games/${id}/finish`, { body: { token, ...data } });
