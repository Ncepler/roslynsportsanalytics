"use client";

import type { Sport, Stat } from "@/lib/sports/registry-types";
import { isStatSelectable } from "@/lib/sports/registry";

// The stats checklist, read entirely from the sport registry: grouped by tier, then by group.
// Tier 1 is checked by default. Stats the AI can't reliably see (video "L") start unchecked with a badge.
// Scoreboard-only sports list everything but only the universal stats can be picked.

const TIER_TITLES: Record<string, string> = {
  "1": "Tier 1: what decides games",
  "2": "Tier 2: supporting stats",
  "3": "Tier 3: extra depth",
  none: "Other stats",
  all: "All sports",
};

function bucketOf(s: Stat): string {
  if (s.universal) return "all";
  return s.tier === null ? "none" : String(s.tier);
}

export function RegistryChecklist({ sport, selected, onToggle, onSetMany }: { sport: Sport; selected: string[]; onToggle: (id: string, on: boolean) => void; /** Turn a whole section on or off at once. */ onSetMany: (ids: string[], on: boolean) => void }) {
  const scoreboardOnly = sport.analysis.mode === "scoreboard-only";
  const buckets = ["1", "2", "3", "none", "all"]
    .map((key) => {
      const stats = sport.stats.filter((s) => bucketOf(s) === key);
      const groups: { name: string; stats: Stat[] }[] = [];
      for (const s of stats) {
        const g = groups.find((x) => x.name === s.group);
        if (g) g.stats.push(s);
        else groups.push({ name: s.group, stats: [s] });
      }
      return { key, groups, count: stats.length };
    })
    .filter((b) => b.count > 0);

  return (
    <div className="mt-4 space-y-6">
      {scoreboardOnly && (
        <p role="status" className="rounded-[0.5rem] border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-text">
          For {sport.name}, the AI can only read the scoreboard. Only the all-sports stats can be selected; the rest are listed but off.
        </p>
      )}
      {buckets.map(({ key, groups, count }) => {
        const body = (
          <div className="mt-2 space-y-4">
            {groups.map((g) => (
              <div key={g.name}>
                <p className="text-sm font-medium text-muted">{g.name}</p>
                <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">
                  {g.stats.map((s) => {
                    const selectable = isStatSelectable(sport, s);
                    return (
                      <li key={s.id}>
                        <label className={`flex min-h-10 items-center gap-2.5 py-1 ${selectable ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={selectable && selected.includes(s.id)} disabled={!selectable} onChange={(e) => onToggle(s.id, e.target.checked)} />
                          <span className="text-[0.9375rem]" title={s.lookFor}>
                            {s.name}
                            {s.video === "L" && <span className="ml-2 rounded-full border border-warning-border bg-warning-bg px-2 py-0.5 text-xs text-warning-text">Needs manual review</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        );
        const heading = (
          <span className="text-xs font-semibold uppercase tracking-[0.06em]">
            {TIER_TITLES[key]} <span className="font-normal normal-case tracking-normal text-muted">({count})</span>
          </span>
        );
        const ids = groups.flatMap((g) => g.stats).filter((s) => isStatSelectable(sport, s)).map((s) => s.id);
        const allOn = ids.length > 0 && ids.every((id) => selected.includes(id));
        const noneOn = ids.every((id) => !selected.includes(id));
        const bulk = ids.length > 0 && (
          <span className="flex gap-2">
            <button type="button" className="btn btn-ghost min-h-8 px-2 text-sm" disabled={allOn} onClick={() => onSetMany(ids, true)}>
              Select all
            </button>
            <button type="button" className="btn btn-ghost min-h-8 px-2 text-sm" disabled={noneOn} onClick={() => onSetMany(ids, false)}>
              Deselect all
            </button>
          </span>
        );
        return (
          <section key={key} className="border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {heading}
              {bulk}
            </div>
            {key === "1" ? body : (
              <details>
                <summary className="mt-1 cursor-pointer text-sm text-muted">Show the {count} stats</summary>
                {body}
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
