"use client";

import { useRef, useState, type DragEvent } from "react";
import { api, ApiError } from "@/lib/client/api";
import { shrinkImage } from "@/lib/client/image";
import type { SeasonRow, TeamRow } from "@/lib/db/admin";
import type { DraftAllRow } from "@/lib/schedule/read-all";
import { teamName } from "@/lib/teams/options";

// One file with every team's schedule. The AI reads the whole file and says which team each game belongs to; an admin
// checks every row, then ONE button adds them. Saving only ADDS games (the server never changes or removes existing
// ones), and games already on a schedule are skipped. The file is sent to Gemini to be read and is never kept.

type Row = { key: number; include: boolean; team_id: string; team_label: string; date: string; opponent: string; home_away: "" | "home" | "away"; location: string };
type Existing = { team_id: string; date: string; opponent: string | null };
type ReadResult = { rows: DraftAllRow[]; merged: number; skippedOther: number; cut: number; existing: Existing[] };

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const OFFICE = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

let counter = 0;
const norm = (s: string) => s.trim().toLowerCase();
const msg = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

const toBase64 = (buf: ArrayBuffer) => {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** What to send for a chosen file: a base64 file (PDF, picture, Excel, Word) or the text of a .txt / .csv file. */
async function prepare(file: File): Promise<{ file: { mediaType: string; data: string } } | { text: string }> {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    if (file.size > MAX_FILE_BYTES) throw new Error("That PDF is over 3 MB. Save it smaller, or split it in two.");
    return { file: { mediaType: "application/pdf", data: toBase64(await file.arrayBuffer()) } };
  }
  if (file.type.startsWith("image/")) {
    const small = await shrinkImage(file);
    return { file: { mediaType: small.mediaType, data: small.data } };
  }
  if (name.endsWith(".xlsx") || name.endsWith(".docx")) {
    if (file.size > MAX_FILE_BYTES) throw new Error("That file is over 3 MB. Save it smaller, or split it in two.");
    return { file: { mediaType: name.endsWith(".xlsx") ? OFFICE.xlsx : OFFICE.docx, data: toBase64(await file.arrayBuffer()) } };
  }
  if (file.type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".csv")) return { text: await file.text() };
  throw new Error("Use a PDF, picture, Excel (.xlsx), Word (.docx), text or CSV file. For an older .xls or .doc file, save it as one of those first.");
}

export function ScheduleImportAll({
  teams,
  seasons,
  opponents,
  onDone,
}: {
  teams: TeamRow[];
  seasons: SeasonRow[];
  opponents: string[];
  onDone: () => Promise<void>;
}) {
  const activeTeams = teams.filter((t) => !t.archived).sort((a, b) => teamName(a).localeCompare(teamName(b)));
  const [seasonId, setSeasonId] = useState(() => (seasons.find((s) => s.is_current) ?? seasons[0])?.id ?? "");
  const season = seasons.find((s) => s.id === seasonId);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [existing, setExisting] = useState<Existing[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const isDuplicate = (r: Row) => existing.some((g) => g.team_id === r.team_id && g.date === r.date && g.opponent !== null && norm(g.opponent) === norm(r.opponent));
  const problem = (r: Row): string | null => {
    if (!r.team_id) return "Choose the team";
    if (!r.date) return "Needs a date";
    if (season && (r.date < season.start_date || r.date > season.end_date)) return `Outside ${season.label}`;
    if (!r.opponent.trim()) return "Needs an opponent";
    if (!r.home_away) return "Choose home or away";
    return null;
  };
  const active = (rows ?? []).filter((r) => r.include);
  const dupes = active.filter(isDuplicate);
  const toAdd = active.filter((r) => !isDuplicate(r));
  const broken = toAdd.filter((r) => problem(r));
  const ready = toAdd.length > 0 && broken.length === 0;
  const teamCount = new Set(toAdd.map((r) => r.team_id)).size;
  const setRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function take(file: File | undefined) {
    if (!file || !seasonId) return;
    setError(null);
    setNotice(null);
    setReading(true);
    setRows(null);
    setFileName(file.name);
    try {
      const body = await prepare(file);
      const res = await api<ReadResult>("/api/admin/schedule/read-all", { body: { season_id: seasonId, ...body } });
      setExisting(res.existing);
      setRows(
        res.rows.map((d) => ({
          key: ++counter,
          include: true,
          team_id: d.team_id ?? "",
          team_label: d.team_label ?? "",
          date: d.date ?? "",
          opponent: d.opponent ?? "",
          home_away: d.home_away ?? "",
          location: d.location ?? "",
        })),
      );
      const bits = [`Read ${res.rows.length} game${res.rows.length === 1 ? "" : "s"}.`];
      if (res.skippedOther) bits.push(`Skipped ${res.skippedOther} junior high or other-level row${res.skippedOther === 1 ? "" : "s"}.`);
      if (res.merged) bits.push(`Merged ${res.merged} repeated row${res.merged === 1 ? "" : "s"}.`);
      if (res.cut) bits.push(`${res.cut} more rows were cut off. Split the file in two.`);
      setInfo(bits.join(" "));
      if (res.rows.length === 0) setError("The AI didn't find any games in that file.");
    } catch (err) {
      setError(err instanceof Error && !(err instanceof ApiError) ? err.message : msg(err, "Couldn't read that file. Try again."));
    }
    setReading(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    void take(e.dataTransfer.files[0]);
  }

  async function save() {
    if (!ready) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api<{ teams: number; added: number; skipped: number }>("/api/admin/schedule/import-all", {
        body: {
          season_id: seasonId,
          games: toAdd.map((g) => ({ team_id: g.team_id, game_date: g.date, opponent_name: g.opponent.trim(), home_away: g.home_away, location: g.location.trim() || null })),
        },
      });
      setNotice(`Added ${r.added} game${r.added === 1 ? "" : "s"} to ${r.teams} team${r.teams === 1 ? "" : "s"}.${r.skipped ? ` ${r.skipped} were already there.` : ""}`);
      setRows(null);
      setFileName(null);
      setInfo(null);
      await onDone();
    } catch (err) {
      setError(msg(err, "Couldn't add the games. Nothing from this step was lost; try again."));
    }
    setSaving(false);
  }

  const shown = (rows ?? []).filter((r) => !onlyProblems || (r.include && !isDuplicate(r) && problem(r)));

  return (
    <div>
      <p className="max-w-[40rem] text-sm text-muted">
        Upload one file that has the schedule of every team (a PDF, a picture, an Excel or Word file, or a text file). Gemini reads it, works out which team each game belongs to, and fills in the table below. This only adds games. It never changes or removes games that are already there, and games already on a schedule are skipped. Junior high teams are ignored.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">Season</span>
          <select className="field" value={seasonId} onChange={(e) => { setSeasonId(e.target.value); setRows(null); setInfo(null); }}>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {s.is_current ? " (current)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`mt-4 rounded-[0.75rem] border border-dashed px-4 py-8 text-center ${over ? "border-accent bg-surface" : "border-border-strong"}`}
      >
        <p className="text-sm">{reading ? `Reading ${fileName ?? "the file"}… this can take a minute.` : fileName && rows ? fileName : "Drop the schedule file here, or"}</p>
        <button type="button" className="btn btn-secondary mt-3" disabled={reading || !seasonId} onClick={() => input.current?.click()}>
          {rows ? "Choose a different file" : "Choose a file"}
        </button>
        <input
          ref={input}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.docx,.txt,.csv,application/pdf,image/*,text/plain,text/csv"
          className="sr-only"
          onChange={(e) => {
            void take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <p className="hint mt-3">Up to 3 MB. The file is sent to Gemini to be read and is not kept. Nothing is added until you check the rows below and confirm.</p>
      </div>

      {info && rows && <p role="status" className="mt-4 text-sm">{info}</p>}

      {rows && rows.length > 0 && (
        <>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
            Show only rows that need fixing ({broken.length})
          </label>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[68rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-1 py-1.5">Add</th>
                  <th className="px-1 py-1.5">Team</th>
                  <th className="px-1 py-1.5">Date</th>
                  <th className="px-1 py-1.5">Opponent</th>
                  <th className="px-1 py-1.5">Home or away</th>
                  <th className="px-1 py-1.5">Location (optional)</th>
                  <th className="px-1 py-1.5">Check</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const dup = Boolean(r.include && isDuplicate(r));
                  const p = r.include && !dup ? problem(r) : null;
                  return (
                    <tr key={r.key} className="border-b border-border align-top last:border-0">
                      <td className="px-1 py-1.5">
                        <input type="checkbox" aria-label="Include this game" checked={r.include && !dup} disabled={dup} onChange={(e) => setRow(r.key, { include: e.target.checked })} className="mt-3 size-4" />
                      </td>
                      <td className="px-1 py-1.5">
                        <select aria-label="Team" className="field !min-h-10 !min-w-[13rem]" value={r.team_id} onChange={(e) => setRow(r.key, { team_id: e.target.value })}>
                          <option value="">{r.team_label ? `Choose… (read: ${r.team_label})` : "Choose…"}</option>
                          {activeTeams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {teamName(t)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-1.5"><input type="date" aria-label="Date" className="field !min-h-10" value={r.date} onChange={(e) => setRow(r.key, { date: e.target.value })} /></td>
                      <td className="px-1 py-1.5"><input aria-label="Opponent" list="import-all-opponents" className="field !min-h-10 !min-w-[9rem]" value={r.opponent} maxLength={80} onChange={(e) => setRow(r.key, { opponent: e.target.value })} /></td>
                      <td className="px-1 py-1.5">
                        <select aria-label="Home or away" className="field !min-h-10 !min-w-[6.5rem]" value={r.home_away} onChange={(e) => setRow(r.key, { home_away: e.target.value as Row["home_away"] })}>
                          <option value="">Choose…</option>
                          <option value="home">Home</option>
                          <option value="away">Away</option>
                        </select>
                      </td>
                      <td className="px-1 py-1.5"><input aria-label="Location" className="field !min-h-10" value={r.location} maxLength={120} onChange={(e) => setRow(r.key, { location: e.target.value })} /></td>
                      <td className="px-1 py-1.5 pt-3 text-xs">
                        {dup ? <span className="text-muted">Already on the schedule</span> : p ? <span className="font-medium text-danger">{p}</span> : r.include ? <span className="text-muted">Ready</span> : <span className="text-muted">Skipped</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <datalist id="import-all-opponents">
              {opponents.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={!ready || saving} onClick={() => void save()}>
              {saving ? "Adding…" : toAdd.length === 0 ? "Add games" : `Add ${toAdd.length} game${toAdd.length === 1 ? "" : "s"} to ${teamCount} team${teamCount === 1 ? "" : "s"}`}
            </button>
            <p className="text-sm text-muted tabular-nums">
              {toAdd.length} to add
              {dupes.length > 0 && `, ${dupes.length} already on a schedule`}
              {broken.length > 0 && `, ${broken.length} need${broken.length === 1 ? "s" : ""} fixing`}
            </p>
          </div>
        </>
      )}
      {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
      <p role="alert" className="mt-2 min-h-5 text-sm text-danger">{error}</p>
    </div>
  );
}
