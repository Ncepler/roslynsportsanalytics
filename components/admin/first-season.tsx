"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";

// Shown to an admin where a page needs a season and there is none. Creates this school year's season (August 1 to
// July 31, so it covers fall, winter and spring sports) and makes it current. Dates can be changed or other seasons
// added on the Admin page.
export function FirstSeason() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const start = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1; // August or later = a new school year
  const label = `${start}-${String(start + 1).slice(2)}`;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/seasons", { body: { label, start_date: `${start}-08-01`, end_date: `${start + 1}-07-31`, is_current: true } });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the season.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void create()}>
        {busy ? "Creating…" : `Create the ${label} season`}
      </button>
      <p className="hint mt-2">Runs August 1, {start} to July 31, {start + 1}, and becomes the current season.</p>
      <p role="alert" className="mt-2 min-h-5 text-sm text-danger">
        {error}
      </p>
    </div>
  );
}
