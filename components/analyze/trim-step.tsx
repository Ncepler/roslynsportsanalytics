"use client";

import { useState } from "react";
import type { Range } from "@/lib/client/segments";
import { formatTime, parseTime } from "@/lib/client/time";
import { TrimTimeline } from "./trim-timeline";

export type TrimState = { range: Range; skips: Range[] };

/** Typed M:SS field that commits on blur or Enter (the fallback for videos the browser can't preview). */
function TimeField({ label, value, onCommit, max }: { label: string; value: number; onCommit: (t: number) => void; max?: number }) {
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const commit = () => {
    if (text === null) return;
    const t = parseTime(text);
    if (t === null || (max !== undefined && t > max)) {
      setBad(true);
      return;
    }
    setBad(false);
    setText(null);
    onCommit(t);
  };
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className="field tabular-nums"
        inputMode="numeric"
        placeholder="M:SS"
        value={text ?? formatTime(value)}
        aria-invalid={bad || undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </label>
  );
}

export function TrimStep({
  duration,
  canPreview,
  trim,
  onTrim,
  currentTime,
  onSeek,
  onNext,
  onBack,
  hasPlayhead,
}: {
  duration: number | null;
  /** True when a playable video gives a playhead to mark breaks from. */
  hasPlayhead: boolean;
  /** False when there is a video but the browser can't play it (e.g. HEVC). */
  canPreview: boolean;
  trim: TrimState;
  onTrim: (t: TrimState) => void;
  currentTime: number;
  onSeek: (t: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  // Breaks that fall outside a new trim are trimmed to fit (or dropped).
  const setRange = (range: Range) =>
    onTrim({
      ...trim,
      range,
      skips: trim.skips
        .map((b) => ({ start: Math.max(b.start, range.start), end: Math.min(b.end, range.end) }))
        .filter((b) => b.end - b.start >= 5),
    });
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  const valid = trim.range.end - trim.range.start >= 5 && (duration === null || trim.range.end <= duration + 0.5);

  return (
    <div>
      {duration !== null && canPreview ? (
        <div>
          <TrimTimeline duration={duration} value={trim.range} onChange={setRange} skips={trim.skips} marker={pendingStart} currentTime={currentTime} onSeek={onSeek} />
        </div>
      ) : (
        <p className="rounded-[0.625rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-text">
          This browser can&apos;t preview this video (common with HEVC exports). Type the start and end times instead; the
          analysis still works.
        </p>
      )}

      <h2 className="mt-8 text-xl font-semibold tracking-[-0.01em]">Cut off warmups and the end</h2>
      <p className="mt-1 text-muted">
        Drag the handles to where the game starts and ends, or type the times. Everything outside them is ignored and
        isn&apos;t paid for.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-sm">
        <TimeField label="Game starts at" value={trim.range.start} onCommit={(t) => setRange({ ...trim.range, start: Math.min(t, trim.range.end - 5) })} />
        <TimeField label="Game ends at" value={trim.range.end} max={duration ?? undefined} onCommit={(t) => setRange({ ...trim.range, end: Math.max(t, trim.range.start + 5) })} />
      </div>

      <Breaks trim={trim} onTrim={onTrim} currentTime={currentTime} canPreview={hasPlayhead} pendingStart={pendingStart} setPendingStart={setPendingStart} />

      <div className="mt-8 flex gap-2">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn btn-primary" disabled={!valid} onClick={onNext}>
          Next: set up the game
        </button>
      </div>
    </div>
  );
}

/**
 * Skipping halftime and timeouts. Two taps: pause where the break starts,
 * press "Break starts here"; pause where play resumes, press "Game resumes here".
 */
function Breaks({
  trim,
  onTrim,
  currentTime,
  canPreview,
  pendingStart,
  setPendingStart,
}: {
  trim: TrimState;
  onTrim: (t: TrimState) => void;
  currentTime: number;
  canPreview: boolean;
  pendingStart: number | null;
  setPendingStart: (t: number | null) => void;
}) {
  const [typed, setTyped] = useState<{ start: number; end: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { start: gameStart, end: gameEnd } = trim.range;

  /** Why a break can't be added, or null when it's fine. Never negative, always inside the game. */
  function problem(start: number, end: number): string | null {
    if (start < gameStart) return `A break can't start before the game starts (${formatTime(gameStart)}).`;
    if (end > gameEnd) return `A break can't end after the game ends (${formatTime(gameEnd)}).`;
    if (end <= start) return "The game has to resume after the break starts.";
    if (end - start < 5) return "A break has to be at least 5 seconds long.";
    if (trim.skips.some((b) => start < b.end && end > b.start)) return "That overlaps a break you already added.";
    return null;
  }

  const add = (start: number, end: number) => {
    const p = problem(start, end);
    setError(p);
    if (p) return false;
    onTrim({ ...trim, skips: [...trim.skips, { start, end }].sort((a, b) => a.start - b.start) });
    return true;
  };
  const inGame = currentTime >= gameStart && currentTime <= gameEnd;

  return (
    <section className="mt-8 border-t border-border pt-6">
      <h3 className="font-semibold">Skip halftime and timeouts</h3>
      <p className="mt-1 text-sm text-muted">Optional. Breaks you skip aren&apos;t analyzed, so the stats only cover game time.</p>

      {canPreview && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {pendingStart === null ? (
            <button
              type="button"
              className="btn btn-secondary text-sm"
              disabled={!inGame}
              onClick={() => {
                setError(null);
                setPendingStart(currentTime);
              }}
            >
              Break starts here <span className="text-muted tabular-nums">({formatTime(currentTime)})</span>
            </button>
          ) : (
            <>
              <span className="text-sm tabular-nums">Break from {formatTime(pendingStart)} to…</span>
              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={currentTime - pendingStart < 5}
                onClick={() => {
                  if (add(pendingStart, currentTime)) setPendingStart(null);
                }}
              >
                Game resumes here <span className="tabular-nums opacity-80">({formatTime(currentTime)})</span>
              </button>
              <button
                type="button"
                className="btn btn-ghost text-sm"
                onClick={() => {
                  setPendingStart(null);
                  setError(null);
                }}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
      {canPreview && (
        <p className="hint mt-2">
          {pendingStart === null
            ? "Play or drag the video to where the break starts, then press the button."
            : "The orange line on the slider marks where the break starts. Now play or drag the video to where the game starts again."}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      {trim.skips.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {trim.skips.map((s, i) => (
            <li key={i} className="flex items-center gap-3 text-sm tabular-nums">
              <span>
                Skipping {formatTime(s.start)} – {formatTime(s.end)}
              </span>
              <button type="button" className="btn btn-ghost min-h-8 px-2 text-xs" onClick={() => onTrim({ ...trim, skips: trim.skips.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-4" open={!canPreview || undefined}>
        <summary className="cursor-pointer text-sm text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-text">{canPreview ? "Type the times instead" : "Type the break times"}</summary>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-32">
            <TimeField label="Break starts" value={typed?.start ?? gameStart} max={gameEnd} onCommit={(t) => setTyped({ start: t, end: typed?.end ?? gameStart })} />
          </div>
          <div className="w-32">
            <TimeField label="Game resumes" value={typed?.end ?? gameStart} max={gameEnd} onCommit={(t) => setTyped({ start: typed?.start ?? gameStart, end: t })} />
          </div>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={!typed}
            onClick={() => typed && add(typed.start, typed.end) && setTyped(null)}
          >
            Skip this break
          </button>
        </div>
      </details>
    </section>
  );
}
