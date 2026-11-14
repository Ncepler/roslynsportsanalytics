"use client";

import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import {
  buildGames,
  byContextSeason,
  efficiencyOf,
  sheetSummary,
  testPairs,
  totalPoints,
  totalPossessions,
  type Game,
  type PairResult,
  type Score,
  type Sport,
} from "@/lib/season/model";
import { readTabs, type RawTab } from "@/lib/season/parse";
import { fitLine, MIN_ABS_R, MIN_GAMES, strength } from "@/lib/season/stats";
import type { SummaryInput } from "@/lib/season/summary";
import { ColumnChart, LineChart, ScatterChart } from "./charts";

// The Season trends tab (CLAUDE.md section 13). Spreadsheets are read here in
// the browser and never uploaded. Every number comes from lib/season; the AI
// only writes the summary, and only from those numbers.

const CONTEXT_NAME = { M: "vs man (M)", Z: "vs zone (Z)", F: "fast break (F)" } as const;
const fmt = (v: number | null, d = 1) => (v === null ? "–" : v.toFixed(d));
const sportLabel = (s: Sport) => (s === "basketball" ? "Basketball" : "Lacrosse");

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

const outcomeWords = (label: string) => label.replace(/ \(%\)$/, "");
const trendTitle = (p: PairResult) => `${outcomeWords(p.y.label)} ${strength(p.r!)} ${outcomeWords(p.x.label).toLowerCase()}`;

/** The simulated Season trends (/test/season): made-up games shown through the real screens. The real tab is StoredSeason. */
export function SeasonTab({ demoTabs, demoScores }: { demoTabs: RawTab[]; demoScores: Record<string, Score> }) {
  const [loaded, setLoaded] = useState(false);
  const [scores, setScores] = useState<Record<string, Score>>({});
  const [sportChoice, setSportChoice] = useState<Sport | null>(null);
  const tabs = useMemo(() => (loaded ? demoTabs : []), [loaded, demoTabs]);

  const { read, skipped } = useMemo(() => readTabs(tabs), [tabs]);
  const games = useMemo(() => buildGames(read), [read]);
  const sports = [...new Set(games.map((g) => g.sport))];
  const sport: Sport | null = sportChoice && sports.includes(sportChoice) ? sportChoice : (sports[0] ?? null);

  return (
    <div className="space-y-10">
      {!loaded ? (
        <div className="flex flex-col items-center justify-center rounded-[0.875rem] border border-dashed border-border-strong px-6 py-14 text-center">
          <p className="text-lg font-medium">See how Season trends works</p>
          <p className="mt-1 max-w-[32rem] text-muted">The real tab reads the games your team has analyzed and saved. Here, load a made-up season to try the screens.</p>
          <div className="mt-6">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setLoaded(true);
                setScores(demoScores);
              }}
            >
              Load a sample season
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() => {
              setLoaded(false);
              setScores({});
            }}
          >
            Start over
          </button>
        </div>
      )}

      {loaded && (
        <p role="status" className="rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm font-medium text-warning-text">
          Simulated season. These games and numbers are made up to show how Season trends works.
        </p>
      )}

      {tabs.length > 0 && <WhatWasRead read={read} skipped={skipped} games={games} />}

      {sport && (
        <>
          {sports.length > 1 && (
            <div role="tablist" aria-label="Sport" className="inline-flex rounded-[0.75rem] bg-surface-sunken p-1">
              {sports.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={s === sport}
                  onClick={() => setSportChoice(s)}
                  className={`min-h-10 rounded-[0.5rem] px-4 text-[0.9375rem] font-medium ${s === sport ? "bg-surface shadow-[0_1px_2px_oklch(0_0_0/0.08)]" : "text-muted"}`}
                >
                  {sportLabel(s)}
                </button>
              ))}
            </div>
          )}
          <SeasonResults games={games.filter((g) => g.sport === sport)} sport={sport} scores={scores} setScores={setScores} demo />
        </>
      )}
    </div>
  );
}

function WhatWasRead({ read, skipped, games }: { read: ReturnType<typeof readTabs>["read"]; skipped: ReturnType<typeof readTabs>["skipped"]; games: Game[] }) {
  const s = sheetSummary(read, skipped);
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-[-0.01em]">What was read</h2>
      <ul className="mt-3 space-y-1 text-[0.9375rem]">
        {s.recognized.map((r) => (
          <li key={r.kind}>
            <span className="font-medium">{r.label}</span>{" "}
            <span className="text-muted tabular-nums">
              · {r.tabs} tab{r.tabs === 1 ? "" : "s"}
            </span>
          </li>
        ))}
        {s.recognized.length === 0 && <li className="text-muted">No tabs matched a club sheet yet.</li>}
      </ul>
      <p className="mt-2 text-sm text-muted tabular-nums">
        {games.length} game{games.length === 1 ? "" : "s"} after matching tabs by name.
      </p>
      {skipped.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-muted">
            Skipped {skipped.length} tab{skipped.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1 space-y-0.5 text-muted">
            {skipped.map((t, i) => (
              <li key={i}>
                &quot;{t.name}&quot; in {t.file}: {t.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function SeasonResults({
  games,
  sport,
  scores,
  setScores,
  demo,
  readOnlyScores = false,
}: {
  games: Game[];
  sport: Sport;
  scores: Record<string, Score>;
  setScores: (s: Record<string, Score>) => void;
  demo: boolean;
  /** Stored games carry their typed final scores; they are changed by editing the game, not here. */
  readOnlyScores?: boolean;
}) {
  const pairs = useMemo(() => testPairs(games, sport, scores), [games, sport, scores]);
  const ctx = useMemo(() => byContextSeason(games, sport), [games, sport]);
  const passing = pairs.filter((p) => p.passes);
  const withScores = games.filter((g) => scores[g.key]?.roslyn != null && scores[g.key]?.opponent != null);
  const wins = withScores.filter((g) => scores[g.key].roslyn! > scores[g.key].opponent!).length;

  const perGame = games.map((g) => {
    if (sport === "basketball" && g.basketball) {
      const b = g.basketball;
      return { name: g.name, value: efficiencyOf(b), points: totalPoints(b), possessions: totalPossessions(b) };
    }
    const d = g.lacrosse?.defense;
    const poss = d ? ["M", "Z", "F"].reduce((a, c) => a + (d[c as "M"].possessions ?? 0), 0) : null;
    const goals = d ? ["M", "Z", "F"].reduce((a, c) => a + (d[c as "M"].goals ?? 0), 0) : null;
    const tov = g.lacrosse?.roslynTurnovers ? g.lacrosse.roslynTurnovers.reduce<number>((a, b) => a + (b ?? 0), 0) : null;
    return { name: g.name, value: poss ? ((goals ?? 0) / poss) * 100 : null, points: tov, possessions: poss };
  });
  const lineLabel = sport === "basketball" ? "Offensive efficiency" : "Goals allowed per opponent possession (%)";
  const linePoints = perGame.filter((p) => p.value !== null).map((p) => ({ label: p.name, value: p.value!, detail: sport === "basketball" ? `${p.points} pts on ${p.possessions} poss.` : `${p.possessions} opponent possessions` }));
  const avg = linePoints.length ? linePoints.reduce((a, p) => a + p.value, 0) / linePoints.length : null;
  const compTitle = sport === "basketball" ? "Offensive efficiency by situation" : "Roslyn defense: goals allowed by situation";
  const compUnit = sport === "basketball" ? "Points per 100 possessions" : "Goals allowed per 100 opponent possessions";

  const summaryInput: SummaryInput = {
    sport,
    games: games.length,
    comparison: { label: compUnit, rows: ctx.map((c) => ({ context: CONTEXT_NAME[c.context], value: c.value === null ? null : Number(c.value.toFixed(1)), possessions: c.possessions })) },
    pairs: pairs.map((p) => ({ stat: p.x.label, outcome: p.y.label, r: p.r === null ? null : Number(p.r.toFixed(2)), n: p.n, shown: p.passes })),
    minGames: MIN_GAMES,
    minAbsR: MIN_ABS_R,
  };

  async function download() {
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    const head = (xs: string[]) => xs.map((value) => ({ value, fontWeight: "bold" as const }));
    const gameRows = games.map((g, i) => [g.name, perGame[i].possessions, perGame[i].points, perGame[i].value === null ? null : Number(perGame[i].value!.toFixed(2)), scores[g.key]?.roslyn ?? null, scores[g.key]?.opponent ?? null]);
    const blob = await writeExcelFile([
      {
        sheet: "Games",
        data: [head(["Game", sport === "basketball" ? "Possessions" : "Opponent possessions", sport === "basketball" ? "Points" : "Roslyn turnovers", lineLabel, "Roslyn score", "Opponent score"]), ...gameRows],
      },
      { sheet: "By situation", data: [head(["Situation", "Possessions", compUnit]), ...ctx.map((c) => [CONTEXT_NAME[c.context], c.possessions, c.value === null ? null : Number(c.value.toFixed(2))])] },
      { sheet: "Pairs tested", data: [head(["Stat", "Compared with", "r", "Games", "Shown as a trend"]), ...pairs.map((p) => [p.x.label, p.y.label, p.r === null ? null : Number(p.r.toFixed(3)), p.n, p.passes ? "Yes" : "No"])] },
    ] as never).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `season-trends-${sport}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-12">
      <section>
        <div className="grid grid-cols-3 gap-4 border-y border-border py-4 sm:max-w-xl">
          <div>
            <p className="text-sm text-muted">Games</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums">{games.length}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Record</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums">{withScores.length ? `${wins}–${withScores.length - wins}` : "–"}</p>
          </div>
          <div>
            <p className="text-sm text-muted">{sport === "basketball" ? "Avg. efficiency" : "Avg. goals allowed %"}</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums">{fmt(avg)}</p>
          </div>
        </div>
        {readOnlyScores ? (
          <p className="mt-3 text-sm text-muted tabular-nums">
            {withScores.length} of {games.length} game{games.length === 1 ? "" : "s"} have a final score. Add one by opening the game in Analyze and saving it with a score.
          </p>
        ) : (
          <ScoreEntry games={games} scores={scores} setScores={setScores} />
        )}
      </section>

      {games.length < 3 ? (
        <p className="text-muted tabular-nums">Not enough data yet: {games.length} game{games.length === 1 ? "" : "s"} so far. Comparisons need at least 3 games, and trends need {MIN_GAMES}.</p>
      ) : (
        <>
          <section>
            <h2 className="text-xl font-semibold tracking-[-0.01em]">{compTitle}</h2>
            <p className="mt-1 text-sm text-muted tabular-nums">
              {compUnit}, all {games.length} games combined.
            </p>
            {ctx.every((c) => c.value === null) ? (
              <p className="mt-3 text-muted">These sheets don&apos;t include the M / Z / F breakdown.</p>
            ) : (
              <div className="mt-4 max-w-xl">
                <ColumnChart
                  label={compTitle}
                  format={(v) => v.toFixed(1)}
                  data={ctx.filter((c) => c.value !== null).map((c) => ({ label: CONTEXT_NAME[c.context], value: c.value!, detail: `${c.detail} on ${c.possessions} possessions` }))}
                />
              </div>
            )}
            <TableToggle head={["Situation", "Possessions", compUnit]} rows={ctx.map((c) => [CONTEXT_NAME[c.context], c.possessions ?? "–", fmt(c.value)])} />
          </section>

          {linePoints.length >= 3 && (
            <section>
              <h2 className="text-xl font-semibold tracking-[-0.01em]">{lineLabel}, game by game</h2>
              <p className="mt-1 text-sm text-muted">In game order. Hover a point for the game.</p>
              <div className="mt-4">
                <LineChart label={`${lineLabel} in each game`} reference={avg === null ? undefined : { value: avg, label: `Season avg ${avg.toFixed(1)}` }} points={linePoints} />
              </div>
              <TableToggle head={["Game", lineLabel]} rows={linePoints.map((p) => [p.label, p.value.toFixed(1)])} />
            </section>
          )}

          <section>
            <h2 className="text-xl font-semibold tracking-[-0.01em]">Trends that hold up</h2>
            <p className="mt-1 max-w-[44rem] text-sm text-muted">
              We tested {pairs.length} pairs of stats. A trend is shown only with at least {MIN_GAMES} games and a correlation of at least {MIN_ABS_R} either way. With{" "}
              {games.length} games, some strong-looking ones are still likely chance. &quot;Goes together with&quot; never means one causes the other.
              {withScores.length === 0 && " Add final scores above to test win margin too."}
            </p>
            {passing.length === 0 ? (
              <p className="mt-4">{games.length < MIN_GAMES ? `Not enough data yet: trends need at least ${MIN_GAMES} games.` : "No trend is strong enough to show yet."}</p>
            ) : (
              <div className="mt-6 grid gap-10 lg:grid-cols-2">
                {passing.slice(0, 4).map((p) => {
                  const pts = games.map((g) => ({ g, x: p.x.value(g, scores[g.key]), y: p.y.value(g, scores[g.key]) })).filter((q): q is { g: Game; x: number; y: number } => q.x !== null && q.y !== null);
                  return (
                    <figure key={`${p.x.id}-${p.y.id}`} className="min-w-0">
                      <figcaption>
                        <p className="font-semibold">{trendTitle(p)}</p>
                        <p className="mt-0.5 text-sm text-muted tabular-nums">
                          r = {p.r!.toFixed(2)} · n = {p.n} games
                        </p>
                      </figcaption>
                      <div className="mt-3">
                        <ScatterChart
                          label={`${p.y.label} against ${p.x.label}, ${p.n} games`}
                          points={pts.map((q) => ({ x: q.x, y: q.y, name: q.g.name }))}
                          xLabel={p.x.label}
                          yLabel={p.y.label}
                          fit={fitLine(
                            pts.map((q) => q.x),
                            pts.map((q) => q.y),
                          )}
                        />
                      </div>
                      <TableToggle head={["Game", p.x.label, p.y.label]} rows={pts.map((q) => [q.g.name, q.x.toFixed(1), q.y.toFixed(1)])} />
                    </figure>
                  );
                })}
              </div>
            )}
            <details className="mt-6 text-sm">
              <summary className="cursor-pointer text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-text">All {pairs.length} pairs tested</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      {["Stat", "Compared with", "r", "Games", "Shown?"].map((h) => (
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
                        <td className="px-2 py-1.5 tabular-nums">{p.n}</td>
                        <td className="px-2 py-1.5">{p.passes ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <Summary input={summaryInput} demo={demo} passing={passing} />
        </>
      )}

      <div>
        <button type="button" className="btn btn-secondary" onClick={() => void download()}>
          Download XLSX
        </button>
        <p className="hint mt-1">Games, the by-situation numbers, and every pair tested.</p>
      </div>
    </div>
  );
}

function ScoreEntry({ games, scores, setScores }: { games: Game[]; scores: Record<string, Score>; setScores: (s: Record<string, Score>) => void }) {
  const set = (key: string, side: "roslyn" | "opponent", text: string) => {
    const n = text.trim() === "" ? null : Number(text);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 300)) return;
    setScores({ ...scores, [key]: { roslyn: scores[key]?.roslyn ?? null, opponent: scores[key]?.opponent ?? null, [side]: n } });
  };
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm font-medium text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-text">
        Add final scores (optional, for win/loss trends)
      </summary>
      <p className="hint mt-2">The club&apos;s sheets don&apos;t include the other team&apos;s score. Type what you know; blanks are left out, never guessed.</p>
      <div className="mt-2 max-h-80 overflow-auto rounded-[0.75rem] border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-surface-sunken">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted">Game</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted">Roslyn</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted">Opponent</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.key} className="border-t border-border">
                <td className="px-3 py-1.5">{g.name}</td>
                {(["roslyn", "opponent"] as const).map((side) => (
                  <td key={side} className="px-3 py-1.5">
                    <input
                      className="field min-h-9 w-20 tabular-nums"
                      inputMode="numeric"
                      aria-label={`${g.name} ${side === "roslyn" ? "Roslyn" : "opponent"} score`}
                      value={scores[g.key]?.[side] ?? ""}
                      onChange={(e) => set(g.key, side, e.target.value)}
                    />
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

function Summary({ input, demo, passing }: { input: SummaryInput; demo: boolean; passing: PairResult[] }) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; summary?: string; hypotheses?: string[]; removed?: number; error?: string }>({ status: "idle" });

  async function write() {
    if (demo) {
      // The simulation never calls an AI: this text is filled in from the computed numbers.
      const best = input.comparison.rows.filter((r) => r.value !== null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
      const top = best[0];
      const low = best[best.length - 1];
      const t = passing[0];
      setState({
        status: "done",
        summary: [
          `Across ${input.games} games, the highest number was ${top?.context} at ${top?.value} and the lowest was ${low?.context} at ${low?.value} (${input.comparison.label.toLowerCase()}).`,
          t ? `${trendTitle(t)} (r = ${t.r!.toFixed(2)}, ${t.n} games).` : "No relationship was strong enough to call a trend.",
          "Other pairs may look related by chance with this many games.",
        ].join(" "),
        hypotheses: ["Do more fast-break chances come from forcing turnovers?", "Does the defense the other team plays change which shots Roslyn takes?"],
        removed: 0,
      });
      return;
    }
    setState({ status: "loading" });
    try {
      const r = await api<{ summary: string; hypotheses: string[]; removed: number }>("/api/claude/season", { body: input });
      setState({ status: "done", ...r });
    } catch (err) {
      setState({ status: "error", error: err instanceof ApiError ? err.message : "The AI summary failed." });
    }
  }

  return (
    <section className="max-w-[44rem]">
      <h2 className="text-xl font-semibold tracking-[-0.01em]">Summary</h2>
      <p className="hint mt-1">
        {demo
          ? "In the simulation this is filled in from the numbers above, without an AI."
          : "Written by AI from the numbers above only. Any sentence with a number that isn't in the app's results is removed."}
      </p>
      {state.status === "idle" && (
        <button type="button" className="btn btn-primary mt-3" onClick={() => void write()}>
          Write a summary
        </button>
      )}
      {state.status === "loading" && <p className="mt-3 text-muted">Writing…</p>}
      {state.status === "error" && (
        <div className="mt-3">
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
          <button type="button" className="btn btn-secondary mt-2 text-sm" onClick={() => void write()}>
            Try again
          </button>
        </div>
      )}
      {state.status === "done" && (
        <div className="mt-3">
          <p className="leading-relaxed">{state.summary || "No summary could be written from these numbers."}</p>
          {state.hypotheses && state.hypotheses.length > 0 && (
            <>
              <p className="mt-4 text-sm font-semibold">Worth testing next</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {state.hypotheses.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </>
          )}
          {state.removed ? (
            <p className="mt-3 text-sm text-warning-text">
              {state.removed} sentence{state.removed === 1 ? "" : "s"} removed: unverified number.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

