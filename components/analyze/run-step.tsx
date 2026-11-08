"use client";

import { useEffect, useState } from "react";
import type { Resolution, RunUsage } from "@/lib/client/run";
import type { Estimate, UploadState } from "./analyze-flow";

export type RunState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "appearance" }
  | { phase: "notes"; notes: string; started: number }
  | { phase: "logging"; done: number; total: number; started: number }
  | { phase: "checking" }
  | { phase: "building" }
  | { phase: "done"; usage: RunUsage; raw: string[] }
  | { phase: "error"; message: string };

const STAGES = ["Uploading", "Processing", "Reading the game", "Logging possessions", "Checking totals", "Building tables"] as const;

function stageIndex(run: RunState, upload: UploadState | null): number {
  switch (run.phase) {
    case "uploading":
      return upload?.status === "processing" ? 1 : 0;
    case "appearance":
    case "notes":
      return 2;
    case "logging":
      return 3;
    case "checking":
      return 4;
    case "building":
    case "done":
      return 5;
    default:
      return -1;
  }
}

export function RunStep({
  keptSeconds,
  segments,
  passes = 1,
  estimate,
  resolution,
  onResolution,
  upload,
  run,
  onAnalyze,
  onContinue,
  onCancel,
  onBack,
  demo = false,
}: {
  keptSeconds: number;
  segments: number;
  /** Analysis passes per part (section 6.3); more stats checked can mean more passes. */
  passes?: number;
  estimate: Estimate;
  resolution: Resolution;
  onResolution: (r: Resolution) => void;
  upload: UploadState | null;
  run: RunState;
  onAnalyze: () => void;
  onContinue: (notes: string) => void;
  onCancel: () => void;
  onBack: () => void;
  demo?: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [notes, setNotes] = useState(run.phase === "notes" ? run.notes : "");
  const [now, setNow] = useState(() => performance.now());
  const running = !["idle", "error", "done"].includes(run.phase);
  // The cost confirm only shows on /test (to demonstrate it); club members on the real page don't manage spend.
  const needsConfirm = demo && (estimate?.cost ?? 0) > 0;

  // When the notes arrive, load them into the editable box.
  const incomingNotes = run.phase === "notes" ? run.notes : null;
  const [seenNotes, setSeenNotes] = useState<string | null>(null);
  if (incomingNotes !== null && incomingNotes !== seenNotes) {
    setSeenNotes(incomingNotes);
    setNotes(incomingNotes);
  }

  // Tick once a second for the ETA (text updates without animation).
  useEffect(() => {
    if (run.phase !== "logging") return;
    const id = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(id);
  }, [run.phase]);

  const current = stageIndex(run, upload);
  const remainingMin =
    run.phase === "logging" && estimate ? Math.max(1, Math.round((estimate.seconds - (now - run.started) / 1000) / 60)) : null;

  if (run.phase === "notes") {
    return (
      <div className="max-w-2xl">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Check the starters</h2>
        <p className="mt-1 text-muted">
          The AI watched the start of the game and described every starter. Fix anything wrong, especially jersey numbers.
        </p>
        <p role="note" className="mt-3 rounded-[0.625rem] border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-text">
          <span className="font-semibold">You&apos;ll check again at the end.</span> The AI keeps these notes up to date as it watches (substitutes,
          numbers it reads later), so come back and check the updated notes on the results page.
        </p>
        <textarea
          className="field mt-4 min-h-64 font-[inherit]"
          value={notes}
          aria-label="Player notes"
          onChange={(e) => setNotes(e.target.value)}
        />
        <p className="hint mt-2">These notes are used only for this run, then thrown away.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onContinue(notes)}>
            Looks right, log possessions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold tracking-[-0.01em]">Analyze the game</h2>

      {!running && (
        <>
          <fieldset className="mt-6">
            <legend className="label">How closely should the AI watch?</legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["low", "Standard (recommended)", "Like watching on a phone. Fine for shots, turnovers, and the score. Might miss small jersey numbers."],
                  ["high", "High detail", "Like watching on a big TV. Reads jersey numbers and the scoreboard better. Takes longer and uses more of the club's AI budget."],
                ] as const
              ).map(([value, title, desc]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer gap-3 rounded-[0.75rem] border p-3 ${resolution === value ? "border-accent" : "border-border"}`}
                >
                  <input type="radio" name="resolution" className="mt-1 accent-[var(--accent)]" checked={resolution === value} onChange={() => onResolution(value)} />
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="hint">{desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <dl className="mt-6 grid grid-cols-3 gap-4 border-y border-border py-4 tabular-nums">
            <div>
              <dt className="hint">Game length</dt>
              <dd className="mt-0.5 text-lg font-semibold">{Math.round(keptSeconds / 60)} min</dd>
            </div>
            <div>
              <dt className="hint">Cost (estimate)</dt>
              <dd className="mt-0.5 text-lg font-semibold">{estimate ? `$${estimate.cost.toFixed(2)}` : "…"}</dd>
            </div>
            <div>
              <dt className="hint">Time (estimate)</dt>
              <dd className="mt-0.5 text-lg font-semibold">{estimate ? `${Math.max(1, Math.round(estimate.seconds / 60))} min` : "…"}</dd>
            </div>
          </dl>
          <p className="hint mt-2">
            {estimate?.measured ? "Based on Gemini's real token count for this video." : "Rough guess until the upload finishes and Gemini counts the video."}{" "}
            Prices are unverified. Runs in {segments} {segments === 1 ? "part" : "parts"}
            {passes > 1 ? `, ${passes} passes each (the AI watches each part ${passes} times, once per group of stats)` : ""}.
          </p>

          {needsConfirm && (
            <label className="mt-4 flex items-start gap-2.5">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span className="text-[0.9375rem]">I understand this run costs about ${estimate!.cost.toFixed(2)} of Gemini credit.</span>
            </label>
          )}

          {run.phase === "error" && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {run.message}
            </p>
          )}

          <div className="mt-6 flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              Back
            </button>
            <button type="button" className="btn btn-primary" disabled={keptSeconds <= 0 || (needsConfirm && !confirmed)} onClick={onAnalyze}>
              {run.phase === "error" ? "Try again" : "Analyze game"}
            </button>
          </div>
        </>
      )}

      {running && (
        <div className="mt-6">
          <ol className="space-y-2.5">
            {STAGES.map((label, i) => {
              const state = i < current ? "done" : i === current ? "active" : "todo";
              const detail = i === 3 && run.phase === "logging" ? ` · ${run.done} of ${run.total} steps done` : "";
              return (
                <li key={label} className={`flex items-center gap-3 ${state === "todo" ? "text-muted" : ""}`}>
                  <span
                    aria-hidden
                    className={`size-2.5 rounded-full ${state === "done" ? "bg-accent" : state === "active" ? "bg-accent ring-4 ring-[oklch(from_var(--accent)_l_c_h/0.2)]" : "bg-border-strong"}`}
                  />
                  <span className={state === "active" ? "font-medium" : ""}>
                    {label}
                    <span className="text-muted tabular-nums">{detail}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          {run.phase === "logging" && (
            <div className="mt-5">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                <div className="h-full origin-left bg-accent transition-transform duration-[var(--duration-slow)] ease-linear" style={{ transform: `scaleX(${run.total ? Math.max(0.03, run.done / run.total) : 0})` }} />
              </div>
              {remainingMin !== null && (
                <p className="mt-2 text-sm text-muted tabular-nums">
                  {demo ? `A real run would take about ${remainingMin} min (estimate). The simulation finishes in seconds.` : `About ${remainingMin} min remaining (estimate)`}
                </p>
              )}
            </div>
          )}
          <p className="mt-5 text-sm text-muted">
            Keep this tab open. Nothing is saved on a server, so closing it stops the run and you&apos;d start again (it costs cents).
          </p>
          <button type="button" className="btn btn-ghost mt-3" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
