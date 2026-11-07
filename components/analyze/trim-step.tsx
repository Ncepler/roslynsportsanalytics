"use client";

import { useState } from "react";
import type { Range } from "@/lib/client/segments";
import { formatTime, parseTime } from "@/lib/client/time";
import { TrimTimeline } from "./trim-timeline";

export type TrimState = { range: Range; skips: Range[]; tipoff?: number };

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
  playable,
  trim,
  onTrim,
  currentTime,
  onSeek,
  onNext,
  onBack,
}: {
  duration: number | null;
  playable: boolean;
  trim: TrimState;
  onTrim: (t: TrimState) => void;
  currentTime: number;
  onSeek: (t: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const setRange = (range: Range) => onTrim({ ...trim, range });
  const valid = trim.range.end - trim.range.start >= 5 && (duration === null || trim.range.end <= duration + 0.5);

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-[-0.01em]">Cut off warmups and the end</h2>
      <p className="mt-1 text-muted">
        Drag the handles to where the game starts and ends. Everything outside them is ignored and isn&apos;t paid for.
      </p>

      {duration !== null && playable ? (
        <div className="mt-6">
          <TrimTimeline duration={duration} value={trim.range} onChange={setRange} skips={trim.skips} currentTime={currentTime} onSeek={onSeek} />
        </div>
      ) : (
        <p className="mt-6 rounded-[0.625rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-text">
          This browser can&apos;t preview this video (common with HEVC exports). Type the start and end times instead; the
          analysis still works.
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:max-w-sm">
        <TimeField label="Game starts at" value={trim.range.start} onCommit={(t) => setRange({ ...trim.range, start: Math.min(t, trim.range.end - 5) })} />
        <TimeField label="Game ends at" value={trim.range.end} max={duration ?? undefined} onCommit={(t) => setRange({ ...trim.range, end: Math.max(t, trim.range.start + 5) })} />
      </div>

      <details className="mt-6 group">
        <summary className="cursor-pointer text-sm font-medium text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-text">
          Optional: skip halftime or timeouts, mark tip-off
        </summary>
        <div className="mt-4 space-y-4">
          {trim.skips.map((s, i) => (
            <div key={i} className="flex items-end gap-3">
              <div className="grid flex-1 grid-cols-2 gap-3 sm:max-w-sm">
                <TimeField label={`Skip ${i + 1} from`} value={s.start} onCommit={(t) => onTrim({ ...trim, skips: trim.skips.map((x, j) => (j === i ? { start: t, end: Math.max(t + 5, x.end) } : x)) })} />
                <TimeField label="to" value={s.end} onCommit={(t) => onTrim({ ...trim, skips: trim.skips.map((x, j) => (j === i ? { ...x, end: Math.max(x.start + 5, t) } : x)) })} />
              </div>
              <button type="button" className="btn btn-ghost min-h-11 text-sm" onClick={() => onTrim({ ...trim, skips: trim.skips.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={() => onTrim({ ...trim, skips: [...trim.skips, { start: currentTime, end: Math.min(currentTime + 120, duration ?? currentTime + 120) }] })}
            >
              Add skip at playhead
            </button>
            <button type="button" className="btn btn-secondary text-sm" onClick={() => onTrim({ ...trim, tipoff: currentTime })}>
              {trim.tipoff === undefined ? "Mark tip-off at playhead" : `Tip-off at ${formatTime(trim.tipoff)} (move to playhead)`}
            </button>
          </div>
          <p className="hint">Play or scrub the video to the moment, then press the button. You can fine-tune the times by typing.</p>
        </div>
      </details>

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
