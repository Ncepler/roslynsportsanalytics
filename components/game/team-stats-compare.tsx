"use client";

import { useState } from "react";
import type { CompareRow } from "@/lib/derive/game-stats";

// Head-to-head team stats (Noah, Nov 14: the easiest layout to read). Roslyn's number on the left, the opponent's on
// the right, the stat name in the middle, and a bar under each side showing its share. "Table" shows the same rows
// as a plain zebra table.

const fmt = (v: number | null, format: CompareRow["format"]) => (v === null ? "–" : format === "pct" ? `${Math.round(v * 100)}%` : String(v));

/** How much of the bar a side fills: percentages use their own value, counts use their share of the two sides. */
function share(row: CompareRow, side: "roslyn" | "opponent"): number {
  const mine = row[side];
  if (mine === null) return 0;
  if (row.format === "pct") return Math.min(1, mine);
  const other = row[side === "roslyn" ? "opponent" : "roslyn"] ?? 0;
  const sum = mine + other;
  return sum > 0 ? mine / sum : 0;
}

export function TeamStatsCompare({ rows, away }: { rows: CompareRow[]; away: string }) {
  const [view, setView] = useState<"bars" | "table">("bars");
  if (rows.length === 0) return <p className="text-sm text-muted">No team stats were tracked for this game.</p>;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.04em]">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-3 rounded-sm bg-team-a" /> Roslyn
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-3 rounded-sm bg-team-b" /> {away}
          </span>
        </div>
        <div role="tablist" aria-label="View" className="inline-flex rounded-[0.75rem] bg-surface-sunken p-1">
          {(["bars", "table"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`min-h-9 rounded-[0.5rem] px-3 text-sm font-medium ${view === v ? "bg-surface shadow-[0_1px_2px_oklch(0_0_0/0.08)]" : "text-muted"}`}>
              {v === "bars" ? "Bars" : "Table"}
            </button>
          ))}
        </div>
      </div>

      {view === "bars" ? (
        <ul className="mt-4 divide-y divide-border">
          {rows.map((r) => {
            const a = share(r, "roslyn");
            const b = share(r, "opponent");
            return (
              <li key={r.id} className="py-3">
                <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3 tabular-nums">
                  <span className="text-[1.375rem] font-bold leading-none">
                    {fmt(r.roslyn, r.format)}
                    {r.detail && <span className="ml-1.5 text-sm font-normal text-muted">({r.detail.roslyn})</span>}
                  </span>
                  <span className="text-center text-[0.9375rem] font-semibold">{r.label}</span>
                  <span className="text-right text-[1.375rem] font-bold leading-none">
                    {r.detail && <span className="mr-1.5 text-sm font-normal text-muted">({r.detail.opponent})</span>}
                    {fmt(r.opponent, r.format)}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3" aria-hidden>
                  <div className="flex h-2 justify-end overflow-hidden rounded-full bg-border">
                    <div className="h-full rounded-full bg-team-a" style={{ width: `${a * 100}%`, marginLeft: "auto" }} />
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-border">
                    <div className="h-full rounded-full bg-team-b" style={{ width: `${b * 100}%` }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4 overflow-hidden rounded-[0.75rem] border border-border">
          <table className="w-full border-collapse text-[0.9375rem]">
            <thead>
              <tr className="bg-surface-sunken text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted">
                <th className="px-4 py-2">Stat</th>
                <th className="px-4 py-2 text-right">Roslyn</th>
                <th className="px-4 py-2 text-right">{away}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={i % 2 === 0 ? "bg-surface" : "bg-surface-sunken"}>
                  <th scope="row" className="px-4 py-3 text-left font-semibold">
                    {r.label}
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums">{r.detail ? r.detail.roslyn : fmt(r.roslyn, r.format)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.detail ? r.detail.opponent : fmt(r.opponent, r.format)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
