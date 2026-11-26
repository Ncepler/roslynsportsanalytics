"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SessionStatus } from "@/lib/analysis/status";
import { claimAction, serverState } from "@/lib/analysis/status";
import { api, ApiError } from "@/lib/client/api";
import { getMemberName } from "@/lib/client/member";
import type { ReopenedGame } from "@/lib/client/save";

// Several games can be analyzed at once, like several Claude sessions: each is a live AnalyzeFlow that keeps
// running while you move around the site. The flows are mounted here, above the pages, so going to another tab,
// team or the home page never stops one. Each session's status drives a dot (blue = needs you, green = done,
// red = failed, grey = working) and is also sent to the database so the schedule shows it to everyone.
//
// What survives: moving between pages (all in memory), and finished games (saved to the database by themselves).
// What does not: closing or reloading the tab. The video and the AI's work live in this browser tab, so a closed
// tab stops its analyses (the site warns before that happens).

const AnalyzeFlow = dynamic(() => import("@/components/analyze/analyze-flow").then((m) => m.AnalyzeFlow), { ssr: false, loading: () => <p className="text-muted">Loading…</p> });

export type SessionTeam = { id: string; slug: string; sport: string; name: string };
export type SessionGame = { id: string | null; opponent: string; date: string; homeAway: "home" | "away"; reopened: boolean; scores: { roslyn: number | null; opponent: number | null } };
export type Session = {
  key: string;
  team: SessionTeam;
  game: SessionGame;
  /** The per-tab token that holds this game's claim (null for a quick-added or reopened game). */
  claimToken: string | null;
  reopen: ReopenedGame | null;
  status: SessionStatus;
  detail: string;
  /** The stats are stored: the claim is over. */
  saved: boolean;
};
export type SessionReport = { status: SessionStatus; detail: string; saved: boolean };

export const MAX_SESSIONS = 6;
const HEARTBEAT_MS = 5 * 60 * 1000;

type Ctx = {
  sessions: Session[];
  activeKey: string | null;
  setActiveKey: (key: string | null) => void;
  /** Starts (and claims) an analysis. Returns an error message if it can't start. */
  start: (input: { team: SessionTeam; game: SessionGame; reopen?: ReopenedGame }) => Promise<string | null>;
  close: (key: string) => void;
  /** Used by a running flow to say what it is doing. */
  report: (key: string, r: SessionReport) => void;
};

const SessionsContext = createContext<Ctx | null>(null);

export function useSessions(): Ctx {
  const ctx = useContext(SessionsContext);
  if (!ctx) throw new Error("useSessions needs <SessionsProvider>.");
  return ctx;
}

/** Safe outside the provider (the /test pages): no sessions. */
export const useSessionsOptional = () => useContext(SessionsContext);

/** The one dot for a group of sessions: blue if any needs you, else red, else grey, else green; null if none. */
export function overallStatus(sessions: Session[]): SessionStatus | null {
  if (sessions.length === 0) return null;
  for (const s of ["needs_you", "failed", "working", "done"] as const) if (sessions.some((x) => x.status === s)) return s;
  return null;
}

export function SessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const start: Ctx["start"] = useCallback(async ({ team, game, reopen }) => {
    const live = sessionsRef.current;
    if (live.length >= MAX_SESSIONS) return `You already have ${MAX_SESSIONS} analyses open. Finish or close one first.`;
    if (game.id && live.some((s) => s.game.id === game.id)) return "That game is already open in one of your analyses.";
    const name = getMemberName();
    if (!name) return "Enter your name first.";
    let claimToken: string | null = null;
    // The check happens at this moment, atomically on the server: the first person to get here holds the game.
    if (game.id && !game.reopened) {
      claimToken = crypto.randomUUID();
      try {
        await api(`/api/games/${game.id}/claim`, { body: { token: claimToken, name, state: "needs_input" } });
      } catch (err) {
        return err instanceof ApiError ? err.message : "Couldn't start this game. Try again.";
      }
    }
    const key = crypto.randomUUID();
    const next: Session = { key, team, game, claimToken, reopen: reopen ?? null, status: reopen ? "done" : "needs_you", detail: reopen ? "Saved game" : "Needs you: choose a video", saved: Boolean(reopen) };
    setSessions((cur) => [...cur, next]);
    setActiveKey(key);
    return null;
  }, []);

  const releaseClaim = useCallback((s: Session, keepalive = false) => {
    if (s.claimToken && s.game.id && !s.saved) void api(`/api/games/${s.game.id}/release`, { body: { token: s.claimToken }, keepalive }).catch(() => {});
  }, []);

  const close = useCallback(
    (key: string) => {
      const s = sessionsRef.current.find((x) => x.key === key);
      if (s) releaseClaim(s);
      setSessions((cur) => cur.filter((x) => x.key !== key));
      setActiveKey((cur) => (cur === key ? null : cur));
    },
    [releaseClaim],
  );

  const report = useCallback((key: string, r: SessionReport) => {
    setSessions((cur) => {
      const s = cur.find((x) => x.key === key);
      if (!s || (s.status === r.status && s.detail === r.detail && s.saved === r.saved)) return cur;
      return cur.map((x) => (x.key === key ? { ...x, ...r } : x));
    });
  }, []);

  // Tell the database what each analysis is doing (everyone's schedule shows it), and keep every claim fresh.
  const signature = sessions.map((s) => `${s.key}:${s.status}:${s.saved}`).join("|");
  useEffect(() => {
    const name = getMemberName();
    if (!name) return;
    for (const s of sessionsRef.current) {
      if (!s.claimToken || !s.game.id) continue;
      const action = claimAction(s.status, s.saved);
      if (action === "none") continue;
      // A run that failed (error, or not a Roslyn game) gives the game back right away, so nobody is locked out of it
      // while this tab sits on the error. Pressing Analyze again claims it again (the same token wins if still free).
      if (action === "release") {
        releaseClaim(s);
        continue;
      }
      const state = serverState(s.status) ?? undefined;
      void api(`/api/games/${s.game.id}/claim`, { body: { token: s.claimToken, name, state } }).catch(() => {});
    }
  }, [signature, releaseClaim]);
  useEffect(() => {
    const timer = setInterval(() => {
      const name = getMemberName();
      if (!name) return;
      for (const s of sessionsRef.current) {
        if (!s.claimToken || !s.game.id || claimAction(s.status, s.saved) !== "refresh") continue;
        void api(`/api/games/${s.game.id}/claim`, { body: { token: s.claimToken, name, state: serverState(s.status) ?? undefined } }).catch(() => {});
      }
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, []);

  // Closing the tab gives every unfinished game back.
  useEffect(() => {
    const giveBack = () => sessionsRef.current.forEach((s) => releaseClaim(s, true));
    window.addEventListener("pagehide", giveBack);
    return () => window.removeEventListener("pagehide", giveBack);
  }, [releaseClaim]);

  const value = useMemo<Ctx>(() => ({ sessions, activeKey, setActiveKey, start, close, report }), [sessions, activeKey, start, close, report]);

  return (
    <SessionsContext.Provider value={value}>
      {children}
    </SessionsContext.Provider>
  );
}

/**
 * The running analyses. Always mounted (so they keep working), shown only for the open one on its team's Analyze tab.
 * Place it once, inside <main>, after the page content.
 */
export function SessionViews() {
  const { sessions, activeKey, report, close } = useSessions();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <>
      {sessions.map((s) => {
        const visible = s.key === activeKey && pathname === `/t/${s.team.slug}/analyze`;
        return (
          <div key={s.key} hidden={!visible}>
            <AnalyzeFlow
              team={{ id: s.team.id, slug: s.team.slug, sport: s.team.sport }}
              initialGame={s.game}
              initialReopen={s.reopen ?? undefined}
              claimToken={s.claimToken ?? undefined}
              onReport={(r) => report(s.key, r)}
              onSaved={() => router.refresh()}
              onClose={() => close(s.key)}
            />
          </div>
        );
      })}
    </>
  );
}
