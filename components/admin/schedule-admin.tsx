"use client";

import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { formatGameDate, StatusChip } from "@/components/games/status-chip";
import { api, ApiError } from "@/lib/client/api";
import { fetchGames } from "@/lib/client/games";
import { shrinkImage } from "@/lib/client/image";
import type { GameSport, PublicGame } from "@/lib/games/types";

type Row = { key: number; date: string; opponent: string; note: string };

const SPORTS: { id: GameSport; label: string }[] = [
  { id: "basketball", label: "Basketball" },
  { id: "lacrosse", label: "Lacrosse" },
];

const choiceClass = (selected: boolean) =>
  `btn border ${selected ? "border-accent bg-[oklch(from_var(--accent)_l_c_h/0.1)] text-text" : "border-border-strong bg-surface"}`;

let rowKey = 0;
const newRow = (r?: Partial<Row>): Row => ({ key: ++rowKey, date: "", opponent: "", note: "", ...r });

export function ScheduleAdmin() {
  const [sport, setSport] = useState<GameSport>("basketball");
  const [games, setGames] = useState<PublicGame[] | null>(null);
  const [draft, setDraft] = useState<Row[]>([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ name: string; preview: string; mediaType: "image/jpeg"; data: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setGames(await fetchGames(sport));
    } catch (err) {
      setGames([]);
      setError(err instanceof Error ? err.message : "Couldn't load the schedule.");
    }
  }, [sport]);

  useEffect(() => {
    // Loading from the server on mount and on sport change; setState happens after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function takeImage(file: Blob | undefined, name = "Pasted picture") {
    if (!file) return;
    setError(null);
    try {
      const shrunk = await shrinkImage(file);
      setImage({ name: file instanceof File ? file.name : name, preview: `data:${shrunk.mediaType};base64,${shrunk.data}`, ...shrunk });
    } catch {
      setError("Couldn't read that picture. Try a screenshot (PNG or JPG).");
    }
  }

  function onPaste(e: ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (item) {
      e.preventDefault();
      void takeImage(item.getAsFile() ?? undefined);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
    if (f) void takeImage(f);
    else setError("Drop a picture (PNG or JPG), or paste the schedule text.");
  }

  async function read() {
    setReading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ games: { date: string | null; opponent: string; note: string | null }[] }>("/api/admin/schedule/parse", {
        body: { sport, text: text.trim() || undefined, image: image ? { mediaType: image.mediaType, data: image.data } : undefined },
      });
      if (res.games.length === 0) setError("Didn't find any games in that. Try a clearer picture, or add them by hand.");
      else setDraft((d) => [...d, ...res.games.map((g) => newRow({ date: g.date ?? "", opponent: g.opponent, note: g.note ?? "" }))]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't read the schedule.");
    }
    setReading(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ added: number; kept: number }>("/api/admin/schedule", {
        method: "PUT",
        body: { sport, games: draft.map((r) => ({ date: r.date || null, opponent: r.opponent, note: r.note || null })) },
      });
      setNotice(`Saved. ${res.added} new game${res.added === 1 ? "" : "s"}${res.kept ? `, ${res.kept} already on the schedule` : ""}.`);
      setDraft([]);
      setText("");
      setImage(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the schedule.");
    }
    setSaving(false);
  }

  async function act(game: PublicGame, action: "reopen" | "delete") {
    const sure =
      action === "delete"
        ? `Delete ${game.opponent} from the schedule?`
        : game.status === "done"
          ? `Reopen ${game.opponent}? Its saved results will be deleted and someone can analyze it again.`
          : `Free up ${game.opponent}? Whoever is working on it will lose their spot.`;
    if (!window.confirm(sure)) return;
    setError(null);
    setNotice(null);
    try {
      await api(`/api/admin/schedule/${game.id}`, { method: action === "delete" ? "DELETE" : "POST", body: action === "delete" ? undefined : {} });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work. Try again.");
    }
  }

  const setRow = (key: number, patch: Partial<Row>) => setDraft((d) => d.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const canSave = draft.some((r) => r.opponent.trim()) && !saving;

  return (
    <div className="space-y-12">
      <div role="radiogroup" aria-label="Sport" className="flex gap-2">
        {SPORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={sport === s.id}
            className={`${choiceClass(sport === s.id)} min-w-32`}
            onClick={() => {
              setSport(s.id);
              setDraft([]);
              setError(null);
              setNotice(null);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <section aria-labelledby="add-title">
        <h2 id="add-title" className="text-xl font-semibold tracking-[-0.01em]">
          Add games
        </h2>
        <p className="hint mt-1 max-w-[38rem]">Upload a picture of the schedule or paste its text. The AI copies the games out; you check them before anything is saved.</p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          onPaste={onPaste}
          className={`mt-4 rounded-[0.875rem] border border-dashed p-4 ${over ? "border-accent bg-surface" : "border-border-strong"}`}
        >
          {image ? (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.preview} alt="The schedule picture you added" className="max-h-40 w-auto max-w-[45%] rounded-lg border border-border object-contain" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{image.name}</p>
                <button type="button" className="btn btn-ghost mt-1 min-h-9 px-2 text-sm" onClick={() => setImage(null)}>
                  Remove picture
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()}>
                Choose picture
              </button>
              <span className="hint">or drop one here, or click the box below and paste (Ctrl/Cmd+V).</span>
            </div>
          )}
          <input ref={fileInput} type="file" accept="image/*" className="sr-only" onChange={(e) => void takeImage(e.target.files?.[0])} />
          <label className="label mt-4" htmlFor="schedule-text">
            Or paste the schedule text
          </label>
          <textarea id="schedule-text" className="field" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Dec 5 vs. Port Washington&#10;Dec 9 at Manhasset" />
        </div>

        <div className="mt-3">
          <button type="button" className="btn btn-primary" disabled={reading || (!image && !text.trim())} onClick={() => void read()}>
            {reading ? "Reading…" : "Read schedule"}
          </button>
        </div>

        {draft.length > 0 && (
          <div className="mt-6">
            <h3 className="font-medium">Check these before saving</h3>
            <p className="hint mt-1">Fix anything the AI got wrong. A blank date stays blank: it is never guessed.</p>
            <ul className="mt-3 space-y-2">
              {draft.map((r) => (
                <li key={r.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-[0.75rem] border border-border p-2 sm:grid-cols-[9.5rem_1fr_9rem_auto]">
                  <input type="date" aria-label="Date" className="field" value={r.date} onChange={(e) => setRow(r.key, { date: e.target.value })} />
                  <input aria-label="Opponent" className="field col-span-1 sm:col-span-1" placeholder="Opponent" value={r.opponent} onChange={(e) => setRow(r.key, { opponent: e.target.value })} maxLength={80} />
                  <input aria-label="Note" className="field" placeholder="Note (JV, tournament…)" value={r.note} onChange={(e) => setRow(r.key, { note: e.target.value })} maxLength={80} />
                  <button type="button" className="btn btn-ghost px-3" aria-label={`Remove ${r.opponent || "this row"}`} onClick={() => setDraft((d) => d.filter((x) => x.key !== r.key))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" disabled={!canSave} onClick={() => void save()}>
                {saving ? "Saving…" : `Save ${draft.filter((r) => r.opponent.trim()).length} game${draft.filter((r) => r.opponent.trim()).length === 1 ? "" : "s"}`}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setDraft((d) => [...d, newRow()])}>
                Add a row
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setDraft([])}>
                Discard
              </button>
            </div>
          </div>
        )}
        {draft.length === 0 && (
          <button type="button" className="btn btn-ghost mt-2 px-2 text-sm" onClick={() => setDraft([newRow()])}>
            Add a game by hand
          </button>
        )}

        <p role="alert" className="mt-3 min-h-5 text-sm text-danger">
          {error}
        </p>
        {notice && (
          <p role="status" className="text-sm font-medium">
            {notice}
          </p>
        )}
      </section>

      <section aria-labelledby="sched-title">
        <h2 id="sched-title" className="text-xl font-semibold tracking-[-0.01em]">
          {SPORTS.find((s) => s.id === sport)?.label} schedule
        </h2>
        {games === null ? (
          <p className="mt-3 text-muted">Loading…</p>
        ) : games.length === 0 ? (
          <p className="mt-3 text-muted">No games yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-[0.875rem] border border-border">
            {games.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-[12rem] flex-1">
                  <p className="font-medium break-words">{g.opponent}</p>
                  <p className="text-sm text-muted tabular-nums">
                    {formatGameDate(g.date)}
                    {g.note ? ` · ${g.note}` : ""}
                  </p>
                </div>
                <StatusChip status={g.status} />
                <div className="flex gap-1">
                  {g.status !== "open" && (
                    <button type="button" className="btn btn-secondary min-h-9 px-3 text-sm" onClick={() => void act(g, "reopen")}>
                      {g.status === "done" ? "Reopen" : "Free up"}
                    </button>
                  )}
                  {g.status === "open" && (
                    <button type="button" className="btn btn-ghost min-h-9 px-3 text-sm" onClick={() => void act(g, "delete")}>
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
