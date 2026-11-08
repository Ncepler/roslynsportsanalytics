"use client";

import { useState } from "react";
import type { GameSetup } from "@/lib/gemini/prompt";
import { defaultStatIds, getSport, SPORTS } from "@/lib/sports";
import type { Tier } from "@/lib/sports/types";

// Group titles for the stats checklist: how much to trust each kind of stat.
const TIERS: { tier: Tier; title: string; blurb: string }[] = [
  { tier: "reliable", title: "Reliable", blurb: "The AI gets these right almost every time." },
  { tier: "decent", title: "Double-check", blurb: "Usually right. Look them over before copying." },
  { tier: "experimental", title: "Long shots", blurb: "Often wrong. Off unless you turn them on." },
];

const COMMON_COLORS = ["Blue", "White"];

/** A choice of two buttons plus "Other" with a text box. */
function ColorPicker({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid: boolean }) {
  const isCommon = COMMON_COLORS.some((c) => c.toLowerCase() === value.trim().toLowerCase());
  const [other, setOther] = useState(!isCommon && value !== "");
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Roslyn's jersey color">
        {COMMON_COLORS.map((c) => {
          const selected = !other && value.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setOther(false);
                onChange(c.toLowerCase());
              }}
              className={`btn min-w-24 border ${selected ? "border-accent bg-surface ring-2 ring-[oklch(from_var(--accent)_l_c_h/0.25)]" : "border-border-strong bg-surface"}`}
            >
              <span aria-hidden className={`size-3.5 rounded-full border border-border-strong ${c === "Blue" ? "bg-[oklch(0.45_0.15_255)]" : "bg-white"}`} />
              {c}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={other}
          onClick={() => {
            setOther(true);
            if (isCommon) onChange("");
          }}
          className={`btn border ${other ? "border-accent bg-surface ring-2 ring-[oklch(from_var(--accent)_l_c_h/0.25)]" : "border-border-strong bg-surface"}`}
        >
          Other
        </button>
      </div>
      {other && (
        <input
          className="field mt-2 sm:max-w-xs"
          autoFocus
          value={value}
          placeholder="Type the color"
          aria-label="Roslyn's jersey color"
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export function SetupStep({ setup, onChange, onNext, onBack }: { setup: GameSetup; onChange: (s: GameSetup) => void; onNext: () => void; onBack: () => void }) {
  const [tried, setTried] = useState(false);
  const sport = getSport(setup.sportId)!;
  const set = <K extends keyof GameSetup>(k: K, v: GameSetup[K]) => onChange({ ...setup, [k]: v });
  const missing = { roslynColor: !setup.roslynColor.trim(), awayName: !setup.awayName.trim(), awayColor: !setup.awayColor.trim() };
  const ok = !missing.roslynColor && !missing.awayName && !missing.awayColor;
  const err = (key: keyof typeof missing, msg: string) => tried && missing[key] && <span className="mt-1 block text-sm text-danger">{msg}</span>;

  function toggle(id: string, on: boolean) {
    set("statIds", on ? [...setup.statIds, id] : setup.statIds.filter((x) => x !== id));
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (ok) onNext();
      }}
    >
      <h2 className="text-xl font-semibold tracking-[-0.01em]">Who&apos;s playing?</h2>

      <div className="mt-6 space-y-6 sm:max-w-xl">
        <div>
          <span className="label">Sport</span>
          <div className="flex gap-2" role="radiogroup" aria-label="Sport">
            {Object.values(SPORTS).map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={setup.sportId === s.id}
                onClick={() => s.id !== setup.sportId && onChange({ ...setup, sportId: s.id, statIds: defaultStatIds(s) })}
                className={`btn min-w-28 border ${setup.sportId === s.id ? "border-accent bg-surface ring-2 ring-[oklch(from_var(--accent)_l_c_h/0.25)]" : "border-border-strong bg-surface"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Roslyn&apos;s jerseys</span>
          <ColorPicker value={setup.roslynColor} onChange={(v) => set("roslynColor", v)} invalid={tried && missing.roslynColor} />
          {err("roslynColor", "Pick or type a color.")}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Opponent</span>
            <input className="field" value={setup.awayName} placeholder="e.g. Port Washington" aria-invalid={(tried && missing.awayName) || undefined} onChange={(e) => set("awayName", e.target.value)} />
            {err("awayName", "Enter the other team.")}
          </label>
          <label className="block">
            <span className="label">Their jerseys</span>
            <input className="field" value={setup.awayColor} placeholder="e.g. navy" aria-invalid={(tried && missing.awayColor) || undefined} onChange={(e) => set("awayColor", e.target.value)} />
            {err("awayColor", "Enter their color.")}
          </label>
        </div>

        <details>
          <summary className="cursor-pointer text-sm font-medium text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-text">Add jersey numbers (optional)</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Roslyn numbers</span>
              <input className="field tabular-nums" value={setup.roslynRoster} placeholder="3, 5, 11, 23" onChange={(e) => set("roslynRoster", e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Opponent numbers</span>
              <input className="field tabular-nums" value={setup.awayRoster} placeholder="1, 4, 10, 22" onChange={(e) => set("awayRoster", e.target.value)} />
            </label>
          </div>
          <p className="hint mt-2">Numbers only, no names. Helps the AI read jerseys.</p>
        </details>
      </div>

      <fieldset className="mt-10">
        <legend className="text-xl font-semibold tracking-[-0.01em]">What to track</legend>
        <div className="mt-4 space-y-6">
          {TIERS.map(({ tier, title, blurb }) => {
            const stats = sport.stats.filter((s) => s.tier === tier);
            if (stats.length === 0) return null;
            const heading = (
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs font-semibold uppercase tracking-[0.06em]">{title}</span>
                <span className="text-sm text-muted">{blurb}</span>
              </span>
            );
            const list = (
              <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
                {stats.map((s) => (
                  <li key={s.id}>
                    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 py-1">
                      <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={setup.statIds.includes(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
                      <span className="text-[0.9375rem]">{s.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            );
            return (
              <section key={tier} className="border-t border-border pt-4">
                {tier === "experimental" ? (
                  <details>
                    <summary className="cursor-pointer">{heading}</summary>
                    {list}
                  </details>
                ) : (
                  <>
                    {heading}
                    {list}
                  </>
                )}
              </section>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-8 flex gap-2">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
        <button type="submit" className="btn btn-primary">
          Next
        </button>
      </div>
    </form>
  );
}
