"use client";

import { useState } from "react";
import { shotsByZone, shotsTaken } from "@/lib/derive/game-stats";
import type { PossessionLog, Team } from "@/lib/gemini/log-types";
import { SURFACE_LAYOUTS, type ZoneShape } from "@/lib/sports/zones";

// Shot chart by zone (Noah, Nov 14): made shots are filled dots, missed shots are rings, placed inside the named
// zone the AI logged. It never claims an exact position. One half of the surface, per team.

const DOT_R = 5;
const GAP = 13;

function Shape({ s, ...rest }: { s: ZoneShape } & React.SVGProps<SVGElement>) {
  const p = rest as React.SVGProps<SVGPathElement>;
  if (s.t === "rect") return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} {...(rest as React.SVGProps<SVGRectElement>)} />;
  if (s.t === "circle") return <circle cx={s.cx} cy={s.cy} r={s.r} {...(rest as React.SVGProps<SVGCircleElement>)} />;
  return <path d={s.d} {...p} />;
}

/** Dot centers for `n` dots in rows of `cols`, centered on (x, y). */
function grid(n: number, cols: number, x: number, y: number): { x: number; y: number }[] {
  const rows = Math.ceil(n / cols);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, n - row * cols);
    const col = i % cols;
    out.push({ x: x + (col - (inRow - 1) / 2) * GAP, y: y + (row - (rows - 1) / 2) * GAP });
  }
  return out;
}

export function ShotChart({ log, sportId, away }: { log: PossessionLog; sportId: string; away: string }) {
  const [team, setTeam] = useState<Team>("roslyn");
  const layout = SURFACE_LAYOUTS[sportId];
  if (!layout) return null;
  const color = team === "roslyn" ? "var(--team-a)" : "var(--team-b)";
  const { zones, unknown } = shotsByZone(log, team, sportId);
  const total = shotsTaken(log, team, sportId);
  const goalWord = sportId === "basketball" ? "made" : "goals";
  const teamLabel = team === "roslyn" ? "Roslyn" : away;

  // Made shots first, then misses, per zone, so a cluster reads as "filled then rings".
  const dotsFor = (zoneId: string) => {
    const z = layout.zones[zoneId];
    const row = zones.find((r) => r.id === zoneId);
    if (!z || !row) return [];
    const marks = [...Array(row.made).fill(true), ...Array(row.att - row.made).fill(false)] as boolean[];
    const per = Math.ceil(marks.length / z.anchors.length);
    return z.anchors.flatMap((a, i) => grid(marks.slice(i * per, (i + 1) * per).length, z.cols, a.x, a.y).map((pt, j) => ({ ...pt, made: marks[i * per + j] })));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Team" className="inline-flex rounded-[0.75rem] bg-surface-sunken p-1">
          {(["roslyn", "opponent"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={team === t}
              onClick={() => setTeam(t)}
              className={`min-h-10 rounded-[0.5rem] px-4 text-[0.9375rem] font-medium ${team === t ? "bg-surface shadow-[0_1px_2px_oklch(0_0_0/0.08)]" : "text-muted"}`}
            >
              {t === "roslyn" ? "Roslyn" : away}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-4 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" aria-hidden>
              <circle cx="7" cy="7" r="5" fill={color} />
            </svg>
            Shot {goalWord}
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" aria-hidden>
              <circle cx="7" cy="7" r="4.5" fill="var(--surface)" stroke={color} strokeWidth="2" />
            </svg>
            Shot missed
          </span>
        </p>
      </div>

      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={`${teamLabel} shot chart by zone: ${total} shots`} className="mt-3 h-auto w-full max-w-[34rem] rounded-[0.75rem]">
        {layout.surface.map((s, i) => (
          <Shape key={i} s={s} fill="var(--surface-sunken)" stroke="var(--border-strong)" strokeWidth={2} />
        ))}
        {Object.entries(layout.zones).map(([id, z]) => {
          const row = zones.find((r) => r.id === id);
          // Zones shade by how well the team shot there, so the hot spots read at a glance.
          const heat = row && row.att > 0 ? 0.06 + 0.22 * (row.pct ?? 0) : 0;
          return z.shapes.map((s, i) => <Shape key={`${id}-${i}`} s={s} fill={color} fillOpacity={heat} stroke="var(--border)" strokeWidth={1} />);
        })}
        {layout.lines.map((s, i) => (
          <Shape key={i} s={s} fill="none" stroke="var(--border-strong)" strokeWidth={1.5} />
        ))}
        {Object.entries(layout.zones).map(([id, z]) => {
          const row = zones.find((r) => r.id === id);
          if (!row) return null;
          return (
            <g key={id}>
              <text x={z.label.x} y={z.label.y} textAnchor="middle" fontSize={12} fill="var(--text-muted)">
                {row.label}
              </text>
              <text x={z.label.x} y={z.label.y + 14} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--text)" className="tabular-nums">
                {row.att === 0 ? "No shots" : `${row.made}-${row.att}${row.pct === null ? "" : ` · ${Math.round(row.pct * 100)}%`}`}
              </text>
              {dotsFor(id).map((d, i) => (d.made ? <circle key={i} cx={d.x} cy={d.y} r={DOT_R} fill={color} stroke="var(--bg)" strokeWidth={1.5} /> : <circle key={i} cx={d.x} cy={d.y} r={DOT_R - 0.5} fill="var(--surface)" stroke={color} strokeWidth={2} />))}
            </g>
          );
        })}
      </svg>
      <p className="hint mt-2">Shown by zone, not exact positions: the AI names the part of the {sportId === "ice-hockey" ? "ice" : sportId === "lacrosse" ? "field" : "court"} each shot came from.</p>
      {unknown.att > 0 && (
        <p className="hint mt-1 tabular-nums">
          {unknown.att} {unknown.att === 1 ? "shot" : "shots"} had no readable zone and {unknown.att === 1 ? "isn't" : "aren't"} on the chart ({unknown.made} {goalWord}).
        </p>
      )}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-text">Show as a table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted">
                <th className="px-2 py-1.5">Zone</th>
                <th className="px-2 py-1.5 text-right">Shots</th>
                <th className="px-2 py-1.5 text-right">{sportId === "basketball" ? "Made" : "Goals"}</th>
                <th className="px-2 py-1.5 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id} className="border-b border-border last:border-0 tabular-nums">
                  <td className="px-2 py-1.5">{z.label}</td>
                  <td className="px-2 py-1.5 text-right">{z.att}</td>
                  <td className="px-2 py-1.5 text-right">{z.made}</td>
                  <td className="px-2 py-1.5 text-right">{z.pct === null ? "–" : `${Math.round(z.pct * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
