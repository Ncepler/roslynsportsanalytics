"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/client/api";
import { GENDERS, LEVELS, SPORTS } from "@/lib/teams/options";

// Shown to an admin on the home page while there are no teams, so the first teams can be added right there
// (no trip to another page). "Add the usual teams" creates the boys and girls, varsity and JV teams for the two
// sports that have stats; anything extra can be archived on the Admin page.
const USUAL = ["basketball", "lacrosse"] as const;

export function FirstTeams() {
  const router = useRouter();
  const [gender, setGender] = useState("");
  const [level, setLevel] = useState("");
  const [sport, setSport] = useState("");
  const [busy, setBusy] = useState<"one" | "usual" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addOne(e: FormEvent) {
    e.preventDefault();
    setBusy("one");
    setError(null);
    try {
      await api("/api/admin/teams", { body: { gender, level, sport } });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add the team.");
      setBusy(null);
    }
  }

  async function addUsual() {
    setBusy("usual");
    setError(null);
    try {
      for (const s of USUAL) for (const g of GENDERS) for (const l of LEVELS) {
        try {
          await api("/api/admin/teams", { body: { gender: g.value, level: l.value, sport: s } });
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 409)) throw err; // already exists: fine
        }
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add the teams.");
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 text-left">
      <button type="button" className="btn btn-primary w-full sm:w-auto" disabled={busy !== null} onClick={() => void addUsual()}>
        {busy === "usual" ? "Adding…" : "Add basketball and lacrosse teams (boys and girls, varsity and JV)"}
      </button>
      <p className="hint mt-2">Creates 8 teams. You can archive any you don&apos;t need on the Admin page.</p>

      <form onSubmit={addOne} className="mt-6 border-t border-border pt-5">
        <p className="label">Or add one team</p>
        <div className="flex flex-wrap items-end gap-3">
          <select aria-label="Gender" className="field min-w-0 flex-1 basis-32" value={gender} onChange={(e) => setGender(e.target.value)} required>
            <option value="">Gender…</option>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
          <select aria-label="Level" className="field min-w-0 flex-1 basis-32" value={level} onChange={(e) => setLevel(e.target.value)} required>
            <option value="">Level…</option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <select aria-label="Sport" className="field min-w-0 flex-1 basis-40" value={sport} onChange={(e) => setSport(e.target.value)} required>
            <option value="">Sport…</option>
            {SPORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary" disabled={busy !== null || !gender || !level || !sport}>
            {busy === "one" ? "Adding…" : "Add team"}
          </button>
        </div>
      </form>
      <p role="alert" className="mt-2 min-h-5 text-sm text-danger">
        {error}
      </p>
    </div>
  );
}
