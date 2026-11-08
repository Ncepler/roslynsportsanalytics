"use client";

import { useMemo, useState } from "react";
import { efficiencyByContext, record, simulateSeason, testAllPairs, totals, type PairResult, type SeasonGame } from "@/lib/demo/season";
import { fitLine, MIN_ABS_R, MIN_GAMES, strength } from "@/lib/season/stats";
import { ColumnChart, LineChart, ScatterChart } from "./charts";

// SIMULATION ONLY (the /test page). Shows what the Season trends tab will
// look like on a made-up season. Every number is still computed by code from
// the (fake) game rows, exactly as the real tab will do with real sheets.

const CONTEXT_NAME = { M: "vs man (M)", Z: "vs zone (Z)", F: "fast break (F)" } as const;

function TableToggle({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-text">Show as a table</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {head.map((h) => (
                <th key={h} className="px-2 py-1.5 text-left text-xs font-medium text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                {r.map((c, j) => (
                  <td key={j} className="px-2 py-1.5 tabular-nums">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tracking-[-0.01em] tabular-nums">{value}</p>
    </div>
  );
}

function TrendCard({ pair, games }: { pair: PairResult; games: SeasonGame[] }) {
  const xs = games.map(pair.x.value);
  const ys = games.map(pair.y.value);
  const r = pair.r!;
  return (
    <figure className="min-w-0">
      <figcaption>
        <p className="font-semibold">
          {pair.y.label} {strength(r)} {pair.x.label.toLowerCase().replace(/ \(%\)$/, "")}
        </p>
        <p className="mt-0.5 text-sm text-muted tabular-nums">
          r = {r.toFixed(2)} · n = {pair.n} games. This means they go together, not that one causes the other.
        </p>
      </figcaption>
      <div className="mt-3">
        <ScatterChart
          points={games.map((g, i) => ({ x: xs[i], y: ys[i], name: g.tab }))}
          xLabel={pair.x.label}
          yLabel={pair.y.label}
          fit={fitLine(xs, ys)}
          label={`${pair.y.label} against ${pair.x.label}, ${pair.n} games`}
        />
      </div>
      <TableToggle head={["Game", pair.x.label, pair.y.label]} rows={games.map((g, i) => [g.tab, xs[i].toFixed(1), ys[i].toFixed(1)])} />
    </figure>
  );
}

export function SeasonDemo() {
  const [loaded, setLoaded] = useState(false);
  const games = useMemo(() => simulateSeason(), []);
  const byContext = useMemo(() => efficiencyByContext(games), [games]);
  const pairs = useMemo(() => testAllPairs(games), [games]);
  const rec = record(games);
  const passing = pairs.filter((p) => p.passes);
  const best = byContext.reduce((a, b) => ((b.efficiency ?? 0) > (a.efficiency ?? 0) ? b : a));
  const worst = byContext.reduce((a, b) => ((b.efficiency ?? 0) < (a.efficiency ?? 0) ? b : a));

  if (!loaded) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[0.875rem] border border-dashed border-border-strong px-6 py-14 text-center">
        <p className="text-lg font-medium">Upload the club&apos;s finished spreadsheets</p>
        <p className="mt-1 max-w-[30rem] text-muted">
          In Google Sheets, File → Download → Microsoft Excel (.xlsx). Each tab is one game. In this simulation, a made-up season is loaded instead.
        </p>
        <button type="button" className="btn btn-primary mt-6" onClick={() => setLoaded(true)}>
          Load a sample season
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <p role="status" className="rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm font-medium text-warning-text">
        Simulated season. These games and numbers are made up to show how Season trends works.
      </p>

      <section>
        <h2 className="text-xl font-semibold tracking-[-0.01em]">What was read</h2>
        <ul className="mt-3 space-y-1 text-[0.9375rem]">
          <li>
            <span className="font-medium">Offense summary</span> <span className="text-muted">· {games.length} game tabs recognized</span>
          </li>
          <li>
            <span className="font-medium">Possession log</span> <span className="text-muted">· {games.length} game tabs recognized</span>
          </li>
          <li className="text-muted">Skipped 2 tabs that didn&apos;t match a known sheet: &quot;Template&quot;, &quot;Notes&quot;</li>
        </ul>
        <div className="mt-6 grid grid-cols-3 gap-4 border-y border-border py-4 sm:max-w-xl">
          <Stat label="Games" value={String(games.length)} />
          <Stat label="Record" value={`${rec.wins}–${rec.losses}`} />
          <Stat label="Avg. efficiency" value={rec.avgEfficiency!.toFixed(1)} />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Offensive efficiency by situation</h2>
        <p className="mt-1 text-sm text-muted">Points per 100 possessions, all {games.length} games combined.</p>
        <div className="mt-4 max-w-xl">
          <ColumnChart
            label="Offensive efficiency by situation"
            format={(v) => v.toFixed(1)}
            data={byContext.map((c) => ({ label: CONTEXT_NAME[c.context], value: c.efficiency ?? 0, detail: `${c.points} pts on ${c.possessions} possessions` }))}
          />
        </div>
        <TableToggle
          head={["Situation", "Possessions", "Points", "Efficiency"]}
          rows={byContext.map((c) => [CONTEXT_NAME[c.context], c.possessions, c.points, c.efficiency?.toFixed(1) ?? "–"])}
        />
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Efficiency game by game</h2>
        <p className="mt-1 text-sm text-muted">Hover a point for the game.</p>
        <div className="mt-4">
          <LineChart
            label="Offensive efficiency in each game"
            reference={{ value: rec.avgEfficiency!, label: `Season avg ${rec.avgEfficiency!.toFixed(1)}` }}
            points={games.map((g) => {
              const t = totals(g);
              return { label: g.tab, value: t.efficiency, detail: `${t.margin > 0 ? "W" : "L"} by ${Math.abs(t.margin)}` };
            })}
          />
        </div>
        <TableToggle
          head={["Game", "Date", "Points", "Possessions", "Efficiency", "Margin"]}
          rows={games.map((g) => {
            const t = totals(g);
            return [g.tab, g.date, t.points, t.possessions, t.efficiency.toFixed(1), t.margin];
          })}
        />
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Trends that hold up</h2>
        <p className="mt-1 max-w-[42rem] text-sm text-muted">
          We tested {pairs.length} pairs of stats. A trend is shown only with at least {MIN_GAMES} games and a correlation of at least {MIN_ABS_R} either way. With{" "}
          {games.length} games, some strong-looking ones are still likely chance.
        </p>
        {passing.length === 0 ? (
          <p className="mt-4">Not enough data to call any trend yet.</p>
        ) : (
          <div className="mt-6 grid gap-10 lg:grid-cols-2">
            {passing.slice(0, 2).map((p) => (
              <TrendCard key={`${p.x.id}-${p.y.id}`} pair={p} games={games} />
            ))}
          </div>
        )}
        <details className="mt-6 text-sm">
          <summary className="cursor-pointer text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-text">All {pairs.length} pairs tested</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {["Stat", "Compared with", "r", "Shown?"].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left text-xs font-medium text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pairs.map((p) => (
                  <tr key={`${p.x.id}-${p.y.id}`} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5">{p.x.label}</td>
                    <td className="px-2 py-1.5">{p.y.label}</td>
                    <td className="px-2 py-1.5 tabular-nums">{p.r === null ? "–" : p.r.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{p.passes ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="max-w-[42rem]">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Summary</h2>
        <p className="mt-2 leading-relaxed">
          Across {games.length} games ({rec.wins}–{rec.losses}), Roslyn scored most efficiently on {CONTEXT_NAME[best.context]} possessions (
          {best.efficiency!.toFixed(1)} per 100) and least efficiently {CONTEXT_NAME[worst.context]} ({worst.efficiency!.toFixed(1)}).
          {passing[0] &&
            ` ${passing[0].y.label} ${strength(passing[0].r!)} ${passing[0].x.label.toLowerCase().replace(/ \(%\)$/, "")} (r = ${passing[0].r!.toFixed(2)}, ${passing[0].n} games).`}{" "}
          Worth testing next: whether more fast-break chances come from forcing turnovers.
        </p>
        <p className="hint mt-2">
          In the real tab, Claude writes this summary but may only quote numbers the app computed; any other number is removed. Here it&apos;s filled in
          from the simulated data.
        </p>
      </section>
    </div>
  );
}

