"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { formatGameDate } from "@/components/games/status-chip";
import { api, ApiError } from "@/lib/client/api";
import type { GameRow, OpponentRow, SeasonRow, TeamRow } from "@/lib/db/admin";
import { ScheduleImport } from "@/components/admin/schedule-import";
import { GENDERS, hasStats, LEVELS, SPORTS, teamName } from "@/lib/teams/options";

const NEW_OPPONENT = "__new";
const msg = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-10 border-t border-border pt-8 first:mt-0 first:border-0 first:pt-0">
      <h2 className="text-xl font-semibold tracking-[-0.01em]">{title}</h2>
      {hint && <p className="mt-1 max-w-[38rem] text-sm text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Problem({ text }: { text: string | null }) {
  return (
    <p role="alert" className="mt-2 min-h-5 text-sm text-danger">
      {text}
    </p>
  );
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block min-w-0 flex-1 ${wide ? "basis-full sm:basis-64" : "basis-40"}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function ClubAdmin() {
  const [teams, setTeams] = useState<TeamRow[] | null>(null);
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [opponents, setOpponents] = useState<OpponentRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [t, s, o] = await Promise.all([
        api<{ teams: TeamRow[] }>("/api/admin/teams"),
        api<{ seasons: SeasonRow[] }>("/api/admin/seasons"),
        api<{ opponents: OpponentRow[] }>("/api/admin/opponents"),
      ]);
      setTeams(t.teams);
      setSeasons(s.seasons);
      setOpponents(o.opponents);
      setLoadError(null);
    } catch (err) {
      setTeams([]);
      setLoadError(msg(err, "Couldn't load the club data."));
    }
  }, []);

  useEffect(() => {
    // Initial load from the server; setState happens after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  if (teams === null) return <p className="text-muted">Loading…</p>;

  return (
    <div>
      {loadError && (
        <p role="alert" className="mb-6 rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-text">
          {loadError}
        </p>
      )}
      <Section title="Teams" hint="A team is a gender, a level and a sport. Archive a team instead of deleting it.">
        <TeamsSection teams={teams} onChange={reload} />
      </Section>
      <Section title="Seasons" hint="Games belong to a season. Exactly one season is current; it's the default everywhere.">
        <SeasonsSection seasons={seasons} onChange={reload} />
      </Section>
      <Section title="Schedule" hint="Add, edit and remove games for one team and season.">
        <ScheduleSection teams={teams} seasons={seasons} opponents={opponents} onOpponentsChange={reload} />
      </Section>
      <Section title="Export all data" hint="A JSON backup of every team, season, opponent, game and possession. Keep it somewhere private.">
        <a className="btn btn-secondary" href="/api/admin/export" download>
          Download JSON
        </a>
      </Section>
    </div>
  );
}

// ---------- Teams ----------

function TeamsSection({ teams, onChange }: { teams: TeamRow[]; onChange: () => Promise<void> }) {
  const [gender, setGender] = useState("");
  const [level, setLevel] = useState("");
  const [sport, setSport] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/teams", { body: { gender, level, sport } });
      setGender("");
      setLevel("");
      setSport("");
      await onChange();
    } catch (err) {
      setError(msg(err, "Couldn't add the team."));
    }
    setBusy(false);
  }

  async function archive(t: TeamRow, archived: boolean) {
    setError(null);
    try {
      await api(`/api/admin/teams/${t.id}`, { method: "PATCH", body: { archived } });
      await onChange();
    } catch (err) {
      setError(msg(err, "Couldn't update the team."));
    }
  }

  return (
    <>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <Field label="Gender">
          <select className="field" value={gender} onChange={(e) => setGender(e.target.value)} required>
            <option value="">Choose…</option>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Level">
          <select className="field" value={level} onChange={(e) => setLevel(e.target.value)} required>
            <option value="">Choose…</option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sport">
          <select className="field" value={sport} onChange={(e) => setSport(e.target.value)} required>
            <option value="">Choose…</option>
            {SPORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" className="btn btn-primary" disabled={busy || !gender || !level || !sport}>
          {busy ? "Adding…" : "Add team"}
        </button>
      </form>
      <Problem text={error} />
      {teams.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No teams yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border rounded-[0.75rem] border border-border">
          {teams.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className={t.archived ? "text-muted line-through" : ""}>
                {teamName(t)}
                {!hasStats(t.sport) && <span className="ml-2 text-xs text-muted">(no stats yet)</span>}
                {t.archived && <span className="ml-2 text-xs no-underline">Archived</span>}
              </span>
              <button type="button" className="btn btn-ghost min-h-9 px-2" onClick={() => void archive(t, !t.archived)}>
                {t.archived ? "Restore" : "Archive"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------- Seasons ----------

function SeasonsSection({ seasons, onChange }: { seasons: SeasonRow[]; onChange: () => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [current, setCurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/seasons", { body: { label, start_date: start, end_date: end, is_current: current } });
      setLabel("");
      setStart("");
      setEnd("");
      setCurrent(false);
      await onChange();
    } catch (err) {
      setError(msg(err, "Couldn't add the season."));
    }
    setBusy(false);
  }

  async function makeCurrent(id: string) {
    setError(null);
    try {
      await api(`/api/admin/seasons/${id}`, { method: "PATCH", body: { is_current: true } });
      await onChange();
    } catch (err) {
      setError(msg(err, "Couldn't change the current season."));
    }
  }

  return (
    <>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <Field label="Label (like 2026-27)">
          <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="2026-27" maxLength={7} required />
        </Field>
        <Field label="Starts">
          <input className="field" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
        </Field>
        <Field label="Ends">
          <input className="field" type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} />
          Make current
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Adding…" : "Add season"}
        </button>
      </form>
      <Problem text={error} />
      {seasons.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No seasons yet. Add one before scheduling games.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border rounded-[0.75rem] border border-border">
          {seasons.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="tabular-nums">
                {s.label} <span className="text-sm text-muted">{s.start_date} to {s.end_date}</span>
                {s.is_current && <span className="ml-2 rounded-full border border-accent px-2.5 py-0.5 text-xs font-medium text-accent">Current</span>}
              </span>
              {!s.is_current && (
                <button type="button" className="btn btn-ghost min-h-9 px-2" onClick={() => void makeCurrent(s.id)}>
                  Make current
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------- Schedule ----------

function ScheduleSection({
  teams,
  seasons,
  opponents,
  onOpponentsChange,
}: {
  teams: TeamRow[];
  seasons: SeasonRow[];
  opponents: OpponentRow[];
  onOpponentsChange: () => Promise<void>;
}) {
  const activeTeams = teams.filter((t) => !t.archived);
  const [teamId, setTeamId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state (also used for editing).
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [opponentId, setOpponentId] = useState("");
  const [newOpponent, setNewOpponent] = useState("");
  const [homeAway, setHomeAway] = useState<"home" | "away">("home");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  const effectiveTeam = teamId || activeTeams[0]?.id || "";
  const effectiveSeason = seasonId || seasons.find((s) => s.is_current)?.id || seasons[0]?.id || "";

  async function load() {
    if (!effectiveTeam || !effectiveSeason) return setGames([]);
    try {
      const res = await api<{ games: GameRow[] }>(`/api/admin/games?team_id=${effectiveTeam}&season_id=${effectiveSeason}`);
      setGames(res.games);
    } catch (err) {
      setGames([]);
      setError(msg(err, "Couldn't load the schedule."));
    }
  }

  useEffect(() => {
    // Load from the server when the team or season changes; setState happens after the await.
    let stale = false;
    if (!effectiveTeam || !effectiveSeason) return;
    api<{ games: GameRow[] }>(`/api/admin/games?team_id=${effectiveTeam}&season_id=${effectiveSeason}`)
      .then((res) => !stale && setGames(res.games))
      .catch((err) => {
        if (stale) return;
        setGames([]);
        setError(msg(err, "Couldn't load the schedule."));
      });
    return () => {
      stale = true;
    };
  }, [effectiveTeam, effectiveSeason]);

  function resetForm() {
    setEditing(null);
    setDate("");
    setOpponentId("");
    setNewOpponent("");
    setHomeAway("home");
    setLocation("");
  }

  async function addOpponent() {
    setError(null);
    try {
      const res = await api<{ opponent: OpponentRow }>("/api/admin/opponents", { body: { name: newOpponent } });
      await onOpponentsChange();
      setOpponentId(res.opponent.id);
      setNewOpponent("");
    } catch (err) {
      setError(msg(err, "Couldn't add the opponent."));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fields = { game_date: date, opponent_id: opponentId, home_away: homeAway, location: location || null };
      if (editing) await api(`/api/admin/games/${editing}`, { method: "PATCH", body: { ...fields, season_id: effectiveSeason } });
      else await api("/api/admin/games", { body: { team_id: effectiveTeam, season_id: effectiveSeason, ...fields } });
      resetForm();
      await load();
    } catch (err) {
      setError(msg(err, "Couldn't save the game."));
    }
    setBusy(false);
  }

  function edit(g: GameRow) {
    setEditing(g.id);
    setDate(g.game_date);
    setOpponentId(g.opponent_id);
    setHomeAway(g.home_away);
    setLocation(g.location ?? "");
    setError(null);
  }

  async function remove(g: GameRow) {
    setError(null);
    const analyzed = g.status === "analyzed";
    if (analyzed && !window.confirm("This game has saved analysis. Delete the game AND its analysis? This can't be undone.")) return;
    try {
      await api(`/api/admin/games/${g.id}${analyzed ? "?confirm=1" : ""}`, { method: "DELETE" });
      if (editing === g.id) resetForm();
      await load();
    } catch (err) {
      setError(msg(err, "Couldn't delete the game."));
    }
  }

  if (activeTeams.length === 0 || seasons.length === 0) {
    return <p className="text-sm text-muted">Add a team and a season first.</p>;
  }

  const adding = opponentId === NEW_OPPONENT;

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Field label="Team" wide>
          <select className="field" value={effectiveTeam} onChange={(e) => { setTeamId(e.target.value); resetForm(); }}>
            {activeTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {teamName(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Season">
          <select className="field" value={effectiveSeason} onChange={(e) => { setSeasonId(e.target.value); resetForm(); }}>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {s.is_current ? " (current)" : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <form onSubmit={submit} className="mt-5 flex flex-wrap items-end gap-3 rounded-[0.75rem] border border-border bg-surface-sunken p-4">
        <Field label="Date">
          <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Opponent">
          <select className="field" value={opponentId} onChange={(e) => setOpponentId(e.target.value)} required>
            <option value="">Choose…</option>
            {opponents.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            <option value={NEW_OPPONENT}>Add a new opponent…</option>
          </select>
        </Field>
        {adding && (
          <div className="flex basis-full items-end gap-2">
            <Field label="New opponent name">
              <input className="field" value={newOpponent} onChange={(e) => setNewOpponent(e.target.value)} maxLength={80} />
            </Field>
            <button type="button" className="btn btn-secondary" disabled={!newOpponent.trim()} onClick={() => void addOpponent()}>
              Add opponent
            </button>
          </div>
        )}
        <Field label="Home or away">
          <select className="field" value={homeAway} onChange={(e) => setHomeAway(e.target.value as "home" | "away")}>
            <option value="home">Home</option>
            <option value="away">Away</option>
          </select>
        </Field>
        <Field label="Location (optional)">
          <input className="field" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} />
        </Field>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy || !date || !opponentId || adding}>
            {editing ? "Save changes" : "Add game"}
          </button>
          {editing && (
            <button type="button" className="btn btn-secondary" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>
      <Problem text={error} />

      {(() => {
        const team = activeTeams.find((t) => t.id === effectiveTeam);
        const season = seasons.find((s) => s.id === effectiveSeason);
        return team && season ? (
          <ScheduleImport
            key={`${team.id}-${season.id}`}
            teamId={team.id}
            teamLabel={teamName(team)}
            seasonId={season.id}
            seasonLabel={season.label}
            seasonRange={{ start: season.start_date, end: season.end_date }}
            existing={(games ?? []).map((g) => ({ game_date: g.game_date, opponent: g.opponent?.name ?? null }))}
            opponents={opponents.map((o) => o.name)}
            onDone={async () => {
              await load();
              await onOpponentsChange();
            }}
          />
        ) : null;
      })()}

      {games === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : games.length === 0 ? (
        <p className="text-sm text-muted">No games scheduled for this team and season.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border rounded-[0.75rem] border border-border">
          {games.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span className="min-w-0">
                <span className="tabular-nums">{formatGameDate(g.game_date)}</span>
                {" · "}
                {g.home_away === "home" ? "vs" : "at"} {g.opponent?.name ?? "Unknown"}
                {g.location && <span className="text-sm text-muted"> · {g.location}</span>}
                <span className={`ml-2 rounded-full border px-2.5 py-0.5 text-xs font-medium ${g.status === "analyzed" ? "border-border-strong text-muted" : "border-accent text-accent"}`}>
                  {g.status === "analyzed" ? "Analyzed" : "Scheduled"}
                </span>
              </span>
              <span className="flex gap-1">
                <button type="button" className="btn btn-ghost min-h-9 px-2" onClick={() => edit(g)}>
                  Edit
                </button>
                <button type="button" className="btn btn-ghost min-h-9 px-2 text-danger" onClick={() => void remove(g)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
