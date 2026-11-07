"use client";

import { useState } from "react";
import type { GameSetup } from "@/lib/gemini/prompt";
import { getSport, SPORTS } from "@/lib/sports";
import type { Tier } from "@/lib/sports/types";

const TIERS: { tier: Tier; title: string; note?: string }[] = [
  { tier: "reliable", title: "Reliable" },
  { tier: "decent", title: "Decent", note: "Review recommended" },
  { tier: "experimental", title: "Experimental", note: "Often wrong. Off by default" },
];

export function SetupStep({ setup, onChange, onNext, onBack }: { setup: GameSetup; onChange: (s: GameSetup) => void; onNext: () => void; onBack: () => void }) {
  const [tried, setTried] = useState(false);
  const sport = getSport(setup.sportId)!;
  const set = <K extends keyof GameSetup>(k: K, v: GameSetup[K]) => onChange({ ...setup, [k]: v });
  const missing = { roslynColor: !setup.roslynColor.trim(), awayName: !setup.awayName.trim(), awayColor: !setup.awayColor.trim() };
  const ok = !missing.roslynColor && !missing.awayName && !missing.awayColor;

  function toggle(id: string, on: boolean) {
    set("statIds", on ? [...setup.statIds, id] : setup.statIds.filter((x) => x !== id));
  }

  const text = (key: "roslynColor" | "awayName" | "awayColor", label: string, placeholder: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className="field"
        value={setup[key]}
        placeholder={placeholder}
        aria-invalid={(tried && missing[key]) || undefined}
        onChange={(e) => set(key, e.target.value)}
      />
      {tried && missing[key] && <span className="mt-1 block text-sm text-danger">Required.</span>}
    </label>
  );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (ok) onNext();
      }}
    >
      <h2 className="text-xl font-semibold tracking-[-0.01em]">Set up the game</h2>
      <p className="mt-1 text-muted">Roslyn is always our team. Colors are plain words the AI uses to tell the teams apart.</p>

      <div className="mt-6 grid gap-4 sm:max-w-xl sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="label">Sport</span>
          <select className="field" value={setup.sportId} onChange={(e) => set("sportId", e.target.value)}>
            {Object.values(SPORTS).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
            <option disabled>Lacrosse (coming later)</option>
          </select>
        </label>
        {text("roslynColor", "Roslyn's jersey color", "e.g. white")}
        <div className="hidden sm:block" />
        {text("awayName", "Away team", "e.g. Port Washington")}
        {text("awayColor", "Away team's jersey color", "e.g. navy")}
      </div>

      <details className="mt-5 sm:max-w-xl">
        <summary className="cursor-pointer text-sm font-medium text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-text">Optional: rosters</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Roslyn jersey numbers</span>
            <input className="field tabular-nums" value={setup.roslynRoster} placeholder="3, 5, 11, 23" onChange={(e) => set("roslynRoster", e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Away jersey numbers</span>
            <input className="field tabular-nums" value={setup.awayRoster} placeholder="1, 4, 10, 22" onChange={(e) => set("awayRoster", e.target.value)} />
          </label>
        </div>
        <p className="hint mt-2">Numbers only. Never type player names.</p>
      </details>

      <fieldset className="mt-8">
        <legend className="text-base font-semibold">Stats to track</legend>
        <p className="hint mt-1">Derived stats are worked out by the app from the AI&apos;s log, so they cost nothing extra.</p>
        <div className="mt-4 space-y-5">
          {TIERS.map(({ tier, title, note }) => {
            const stats = sport.stats.filter((s) => s.tier === tier);
            const group = (
              <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {stats.map((s) => (
                  <li key={s.id}>
                    <label className="flex min-h-10 cursor-pointer items-start gap-2.5 py-1.5">
                      <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={setup.statIds.includes(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
                      <span>
                        <span className="text-[0.9375rem]">{s.label}</span>
                        {s.source === "derived" && <span className="ml-1.5 text-xs text-muted">derived</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            );
            return tier === "experimental" ? (
              <details key={tier}>
                <summary className="cursor-pointer text-sm font-medium">
                  {title} <span className="font-normal text-muted">· {note}</span>
                </summary>
                {group}
              </details>
            ) : (
              <div key={tier}>
                <p className="text-sm font-medium">
                  {title} {note && <span className="font-normal text-muted">· {note}</span>}
                </p>
                {group}
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-8 flex gap-2">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
        <button type="submit" className="btn btn-primary">
          Next: review the estimate
        </button>
      </div>
    </form>
  );
}
