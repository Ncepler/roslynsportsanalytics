"use client";

import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { api, ApiError } from "@/lib/client/api";
import { shrinkImage } from "@/lib/client/image";
import type { DraftRow } from "@/lib/schedule/read";

// Adding many games at once, for one team and season. Two ways to fill the review table: type the games in, or let
// the AI read up to 3 screenshots. Either way nothing is saved until an admin has checked every row and presses the
// button, and saving only ADDS games (the server never changes or removes existing ones).

type Row = { key: number; include: boolean; date: string; opponent: string; home_away: "" | "home" | "away"; location: string };
type Shot = { key: number; name: string; preview: string; data: string };
type ExistingGame = { game_date: string; opponent: string | null };

let counter = 0;
const blank = (r?: Partial<Row>): Row => ({ key: ++counter, include: true, date: "", opponent: "", home_away: "", location: "", ...r });
const norm = (s: string) => s.trim().toLowerCase();
const msg = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export function ScheduleImport({
  teamId,
  teamLabel,
  seasonId,
  seasonLabel,
  seasonRange,
  existing,
  opponents,
  onDone,
}: {
  teamId: string;
  teamLabel: string;
  seasonId: string;
  seasonLabel: string;
  seasonRange: { start: string; end: string };
  existing: ExistingGame[];
  opponents: string[];
  onDone: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"type" | "shots">("type");
  const [rows, setRows] = useState<Row[]>(() => [blank(), blank(), blank()]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const isDuplicate = (r: Row) => existing.some((g) => g.game_date === r.date && g.opponent !== null && norm(g.opponent) === norm(r.opponent));
  const problem = (r: Row): string | null => {
    if (!r.date) return "Needs a date";
    if (r.date < seasonRange.start || r.date > seasonRange.end) return `Outside ${seasonLabel}`;
    if (!r.opponent.trim()) return "Needs an opponent";
    if (!r.home_away) return "Choose home or away";
    return null;
  };
  const touched = (r: Row) => r.date || r.opponent.trim() || r.home_away || r.location.trim();
  const active = rows.filter((r) => r.include && touched(r));
  const dupes = active.filter(isDuplicate);
  const toAdd = active.filter((r) => !isDuplicate(r));
  const broken = toAdd.filter((r) => problem(r));
  const ready = toAdd.length > 0 && broken.length === 0;

  const setRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function takeFiles(files: Iterable<Blob>) {
    setError(null);
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return setError("Choose pictures (PNG, JPG or WebP).");
    if (shots.length + list.length > 3) return setError("You can add up to 3 screenshots.");
    try {
      const made: Shot[] = [];
      for (const f of list) {
        const small = await shrinkImage(f);
        made.push({ key: ++counter, name: f instanceof File ? f.name : "Pasted screenshot", preview: `data:${small.mediaType};base64,${small.data}`, data: small.data });
      }
      setShots((s) => [...s, ...made]);
    } catch {
      setError("Couldn't read that picture. Try a screenshot (PNG or JPG).");
    }
  }
  const onPaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith("image/")).map((i) => i.getAsFile()).filter((f): f is File => Boolean(f));
    if (files.length) {
      e.preventDefault();
      void takeFiles(files);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void takeFiles(e.dataTransfer.files);
  };

  async function read() {
    setReading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ rows: DraftRow[]; merged: number; cut: number }>("/api/admin/schedule/read", {
        body: { season_id: seasonId, images: shots.map((s) => ({ mediaType: "image/jpeg", data: s.data })) },
      });
      if (res.rows.length === 0) setError("The AI didn't find any games in those pictures. Try a clearer screenshot, or type them in.");
      else {
        setRows(res.rows.map((r) => blank({ date: r.date ?? "", opponent: r.opponent ?? "", home_away: r.home_away ?? "", location: r.location ?? "" })));
        setNotice(`Read ${res.rows.length} game${res.rows.length === 1 ? "" : "s"}${res.merged ? ` (${res.merged} repeated ${res.merged === 1 ? "row was" : "rows were"} merged)` : ""}${res.cut ? `. ${res.cut} more were cut off; add them in a second batch.` : ""}. Check every row against the picture, fix anything wrong, then add them. Rows that need attention are marked.`);
      }
    } catch (err) {
      setError(msg(err, "Couldn't read the screenshots."));
    }
    setReading(false);
  }

  async function save() {
    if (!window.confirm(`Add ${toAdd.length} game${toAdd.length === 1 ? "" : "s"} to ${teamLabel} (${seasonLabel})? Existing games are not changed.`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ added: number; skipped: number }>("/api/admin/schedule/import", {
        body: { team_id: teamId, season_id: seasonId, games: toAdd.map((r) => ({ game_date: r.date, opponent_name: r.opponent.trim(), home_away: r.home_away, location: r.location.trim() || null })) },
      });
      setNotice(`Added ${res.added} game${res.added === 1 ? "" : "s"}${res.skipped ? `. ${res.skipped} already on the schedule were left as they are` : ""}.`);
      setRows([blank(), blank(), blank()]);
      setShots([]);
      await onDone();
    } catch (err) {
      setError(msg(err, "Couldn't add the games. Nothing was changed."));
    }
    setSaving(false);
  }

  return (
    <details className="mt-6 rounded-[0.75rem] border border-border" onPaste={onPaste}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Add several games at once (type them in, or read screenshots)</summary>
      <div className="border-t border-border px-4 py-4">
        <p className="text-sm text-muted">
          For {teamLabel}, {seasonLabel}. This only adds games. It never changes or removes games that are already on the schedule, and games that are already there are skipped.
        </p>
        <div role="tablist" aria-label="How to add" className="mt-3 inline-flex rounded-[0.75rem] bg-surface-sunken p-1">
          {(["type", "shots"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`min-h-10 rounded-[0.5rem] px-4 text-[0.9375rem] font-medium ${mode === m ? "bg-surface shadow-[0_1px_2px_oklch(0_0_0/0.08)]" : "text-muted"}`}
            >
              {m === "type" ? "Type them in" : "From screenshots"}
            </button>
          ))}
        </div>

        {mode === "shots" && (
          <div className="mt-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
              className={`rounded-[0.75rem] border border-dashed px-4 py-6 text-center ${over ? "border-accent bg-surface" : "border-border-strong"}`}
            >
              <p className="text-sm">Drop up to 3 screenshots of the schedule here, paste them, or</p>
              <button type="button" className="btn btn-secondary mt-3" disabled={shots.length >= 3} onClick={() => fileInput.current?.click()}>
                Choose screenshots
              </button>
              <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { if (e.target.files) void takeFiles(Array.from(e.target.files)); e.target.value = ""; }} />
            </div>
            {shots.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-3">
                {shots.map((s) => (
                  <li key={s.key} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.preview} alt={`Screenshot ${s.name}`} className="h-28 w-auto rounded-[0.5rem] border border-border object-cover" />
                    <button type="button" aria-label={`Remove ${s.name}`} className="btn btn-secondary absolute -right-2 -top-2 !min-h-7 !px-2 text-xs" onClick={() => setShots((all) => all.filter((x) => x.key !== s.key))}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn btn-primary mt-4" disabled={reading || shots.length === 0} onClick={() => void read()}>
              {reading ? "Reading…" : "Read the schedule"}
            </button>
            <p className="hint mt-2">The pictures are sent to Gemini to be read and are not kept. Nothing is added until you check the rows below and confirm.</p>
          </div>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted">
                <th className="px-1 py-1.5">Add</th>
                <th className="px-1 py-1.5">Date</th>
                <th className="px-1 py-1.5">Opponent</th>
                <th className="px-1 py-1.5">Home or away</th>
                <th className="px-1 py-1.5">Location (optional)</th>
                <th className="px-1 py-1.5">Check</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const dup = Boolean(r.include && touched(r) && isDuplicate(r));
                const p = r.include && touched(r) && !dup ? problem(r) : null;
                return (
                  <tr key={r.key} className="border-b border-border align-top last:border-0">
                    <td className="px-1 py-1.5">
                      <input type="checkbox" aria-label="Include this game" checked={r.include && !dup} disabled={Boolean(dup)} onChange={(e) => setRow(r.key, { include: e.target.checked })} className="mt-3 size-4" />
                    </td>
                    <td className="px-1 py-1.5"><input type="date" aria-label="Date" className="field !min-h-10" value={r.date} onChange={(e) => setRow(r.key, { date: e.target.value })} /></td>
                    <td className="px-1 py-1.5">
                      <input aria-label="Opponent" list="import-opponents" className="field !min-h-10" value={r.opponent} maxLength={80} onChange={(e) => setRow(r.key, { opponent: e.target.value })} />
                    </td>
                    <td className="px-1 py-1.5">
                      <select aria-label="Home or away" className="field !min-h-10" value={r.home_away} onChange={(e) => setRow(r.key, { home_away: e.target.value as Row["home_away"] })}>
                        <option value="">Choose…</option>
                        <option value="home">Home</option>
                        <option value="away">Away</option>
                      </select>
                    </td>
                    <td className="px-1 py-1.5"><input aria-label="Location" className="field !min-h-10" value={r.location} maxLength={120} onChange={(e) => setRow(r.key, { location: e.target.value })} /></td>
                    <td className="px-1 py-1.5 pt-3 text-xs">
                      {dup ? <span className="text-muted">Already on the schedule</span> : p ? <span className="font-medium text-danger">{p}</span> : touched(r) ? <span className="text-muted">Ready</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="import-opponents">
            {opponents.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </div>
        <button type="button" className="btn btn-ghost mt-2 min-h-9 px-2 text-sm" onClick={() => setRows((rs) => [...rs, blank()])}>
          + Add a row
        </button>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={!ready || saving} onClick={() => void save()}>
            {saving ? "Adding…" : toAdd.length === 0 ? "Add games" : `Add ${toAdd.length} game${toAdd.length === 1 ? "" : "s"}`}
          </button>
          <p className="text-sm text-muted tabular-nums">
            {toAdd.length} to add
            {dupes.length > 0 && `, ${dupes.length} already on the schedule`}
            {broken.length > 0 && `, ${broken.length} need${broken.length === 1 ? "s" : ""} fixing`}
          </p>
        </div>
        {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
        <p role="alert" className="mt-2 min-h-5 text-sm text-danger">{error}</p>
      </div>
    </details>
  );
}
