"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatGameDate } from "@/components/games/status-chip";
import { ApiError, api } from "@/lib/client/api";
import { cleanName, setMemberName, useMemberName } from "@/lib/client/member";
import { loadSavedGame } from "@/lib/client/save";
import type { PickableGame } from "@/lib/db/games";
import { InCharge } from "./in-charge";
import { SessionTiles } from "./session-tiles";
import { MAX_SESSIONS, useSessions, type SessionTeam } from "./sessions-provider";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the user's own time zone

/**
 * The Analyze tab: who you are, your open analyses (switch between them freely), and this team's games.
 * Picking a game claims it on the server at that moment (first person wins) and opens a live analysis for it.
 */
export function AnalysisHub({ team, scheduled, analyzed, opponents }: { team: SessionTeam; scheduled: PickableGame[]; analyzed: PickableGame[]; opponents: string[] }) {
  const { sessions, activeKey, setActiveKey, start } = useSessions();
  const router = useRouter();
  const name = useMemberName();
  const [nameDraft, setNameDraft] = useState("");
  const [changingName, setChangingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState(today);
  const [homeAway, setHomeAway] = useState<"home" | "away">("home");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeHere = sessions.find((s) => s.key === activeKey && s.team.id === team.id);

  function saveName(e: FormEvent) {
    e.preventDefault();
    if (!cleanName(nameDraft)) return setNameError("Use letters only, up to 40 characters.");
    setMemberName(nameDraft);
    setNameError(null);
    setChangingName(false);
  }

  async function begin(id: string, g: PickableGame) {
    setError(null);
    if (g.assignedTo && g.assignedTo !== name && !g.busy && !window.confirm(`${g.assignedTo} is in charge of this game. Take it over?`)) return;
    setBusyId(id);
    const problem = await start({ team, game: { id: g.id, opponent: g.opponent, date: g.date, homeAway: g.home_away, reopened: false, scores: { roslyn: null, opponent: null } } });
    setBusyId(null);
    if (problem) {
      setError(problem);
      router.refresh(); // someone else just took it: show the current state
    }
  }

  async function beginQuick(e: FormEvent) {
    e.preventDefault();
    if (!opponent.trim()) return setError("Enter the opponent.");
    setError(null);
    const problem = await start({ team, game: { id: null, opponent: opponent.trim(), date, homeAway, reopened: false, scores: { roslyn: null, opponent: null } } });
    if (problem) setError(problem);
    else {
      setAdding(false);
      setOpponent("");
    }
  }

  async function reopen(g: PickableGame) {
    setBusyId(g.id);
    setError(null);
    try {
      const r = await loadSavedGame(g.id);
      const problem = await start({ team, game: { id: r.game.id, opponent: r.game.opponent, date: r.game.date, homeAway: g.home_away, reopened: true, scores: { roslyn: r.game.our_score, opponent: r.game.opp_score } }, reopen: r });
      if (problem) setError(problem);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't open that game.");
    }
    setBusyId(null);
  }

  async function takeGame(g: PickableGame, mine: boolean) {
    setError(null);
    try {
      await api(`/api/games/${g.id}/assign`, { body: { name: mine ? null : name } });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update that game.");
    }
  }

  // ---------- who are you ----------
  if (!name || changingName) {
    return (
      <form onSubmit={saveName} className="max-w-[28rem]">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Who&apos;s analyzing?</h2>
        <p className="hint mt-1">Your name goes next to the games you take, so everyone can see who is doing what. It&apos;s remembered on this device.</p>
        <label className="mt-4 block">
          <span className="label">Your name</span>
          <input className="field" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={40} autoComplete="name" autoFocus placeholder={name ?? "First name and last initial"} required />
        </label>
        <p role="alert" className="mt-2 min-h-5 text-sm text-danger">
          {nameError}
        </p>
        <div className="mt-2 flex gap-2">
          <button type="submit" className="btn btn-primary">
            Continue
          </button>
          {name && (
            <button type="button" className="btn btn-secondary" onClick={() => setChangingName(false)}>
              Cancel
            </button>
          )}
        </div>
      </form>
    );
  }

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-muted">
        Analyzing as <span className="font-medium text-text">{name}</span>
      </span>
      <button type="button" className="btn btn-ghost min-h-9 px-2 text-sm" onClick={() => { setNameDraft(name); setChangingName(true); }}>
        Change
      </button>
    </div>
  );

  // ---------- a game is open: show the open-analyses strip and let the analysis itself (SessionViews) fill the page ----------
  if (activeHere) {
    return (
      <div>
        {header}
        <div className="mt-4">
          <SessionTiles />
        </div>
        <div className="mt-3">
          <button type="button" className="btn btn-secondary" onClick={() => setActiveKey(null)}>
            All games
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}

      {sessions.length > 0 && (
        <section className="mt-5">
          <h2 className="text-base font-semibold">Your analyses</h2>
          <p className="hint mt-1 max-w-[38rem]">Start as many as you like and move around the site while they run. Blue means one needs you, green means it&apos;s done and saved. Closing this browser tab stops them.</p>
          <div className="mt-3">
            <SessionTiles />
          </div>
        </section>
      )}

      <h2 className="mt-8 text-xl font-semibold tracking-[-0.01em]">Which game is this?</h2>
      <p className="hint mt-1 max-w-[38rem]">Pick the game from this team&apos;s schedule. Whoever starts a game first has it: nobody else can start it until it&apos;s finished or closed. When the analysis finishes, it&apos;s saved and added to Season trends by itself.</p>

      {scheduled.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No scheduled games are waiting to be analyzed. If the game isn&apos;t on the schedule, add it below.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-[0.75rem] border border-border">
          {scheduled.map((g) => {
            const mine = sessions.find((s) => s.game.id === g.id);
            const theirs = g.assignedTo && g.assignedTo === name;
            return (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="tabular-nums">{formatGameDate(g.date)}</span> · {g.home_away === "home" ? "vs" : "at"} {g.opponent}
                  {g.location && <span className="text-sm text-muted"> · {g.location}</span>}
                  <span className="mt-0.5 block">
                    <InCharge name={g.assignedTo} state={g.state} busy={g.busy} />
                  </span>
                </span>
                {mine ? (
                  <button type="button" className="btn btn-secondary min-h-9 px-3" onClick={() => { setActiveKey(mine.key); }}>
                    Open your analysis
                  </button>
                ) : g.busy ? (
                  <span className="text-sm text-muted">Being analyzed by {g.assignedTo ?? "someone"}</span>
                ) : (
                  <span className="flex flex-wrap items-center gap-2">
                    {(!g.assignedTo || theirs) && (
                      <button type="button" className="btn btn-ghost min-h-9 px-3 text-sm" onClick={() => void takeGame(g, Boolean(theirs))}>
                        {theirs ? "Give up this game" : "I'll take this game"}
                      </button>
                    )}
                    <button type="button" className="btn btn-secondary min-h-9 px-3" disabled={busyId === g.id || sessions.length >= MAX_SESSIONS} onClick={() => void begin(g.id, g)}>
                      {busyId === g.id ? "Starting…" : "Analyze this game"}
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6">
        {!adding ? (
          <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
            Game not on the schedule? Add it
          </button>
        ) : (
          <form onSubmit={beginQuick} className="flex flex-wrap items-end gap-3 rounded-[0.75rem] border border-border bg-surface-sunken p-4">
            <label className="block min-w-0 flex-1 basis-48">
              <span className="label">Opponent</span>
              <input className="field" list="known-opponents" value={opponent} onChange={(e) => setOpponent(e.target.value)} maxLength={80} required />
              <datalist id="known-opponents">
                {opponents.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
            <label className="block flex-1 basis-40">
              <span className="label">Date</span>
              <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label className="block flex-1 basis-32">
              <span className="label">Home or away</span>
              <select className="field" value={homeAway} onChange={(e) => setHomeAway(e.target.value as "home" | "away")}>
                <option value="home">Home</option>
                <option value="away">Away</option>
              </select>
            </label>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary">
                Use this game
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
      <p role="alert" className="mt-2 min-h-5 text-sm text-danger">
        {error}
      </p>

      {analyzed.length > 0 && (
        <section className="mt-8 border-t border-border pt-6">
          <h3 className="text-base font-semibold">Already analyzed</h3>
          <p className="hint mt-1">Open one to check it or fix mistakes. Saving again replaces what was saved.</p>
          <ul className="mt-3 divide-y divide-border rounded-[0.75rem] border border-border">
            {analyzed.map((g) => {
              const open = sessions.find((s) => s.game.id === g.id);
              return (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="tabular-nums">{formatGameDate(g.date)}</span> · {g.home_away === "home" ? "vs" : "at"} {g.opponent}
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2">
                      <InCharge name={g.assignedTo} analyzed />
                      <span className="text-xs text-muted">Stats tracked</span>
                    </span>
                  </span>
                  <button type="button" className="btn btn-secondary min-h-9 px-3" disabled={busyId === g.id} onClick={() => (open ? setActiveKey(open.key) : void reopen(g))}>
                    {busyId === g.id ? "Opening…" : "Open"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
