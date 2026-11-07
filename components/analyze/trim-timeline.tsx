"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Range } from "@/lib/client/segments";
import { formatTime } from "@/lib/client/time";

// The trim timeline (CLAUDE.md section 19): responds on pointer-down, tracks
// 1:1 from where the handle was grabbed (pointer capture), rubber-bands past
// the ends, and settles with a critically damped spring (a hint of bounce
// only after a flick). Grabbing a settling handle stops the spring and it
// follows the pointer from where it is.

type Handle = "start" | "end";
const MIN_GAP_SECONDS = 5;
const FLICK_PX_PER_S = 900;

/** Apple's rubber-band: resistance grows the further past the edge. */
function rubberband(overshoot: number, dimension: number, c = 0.55) {
  return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function TrimTimeline({
  duration,
  value,
  onChange,
  skips,
  currentTime,
  onSeek,
}: {
  duration: number;
  value: Range;
  onChange: (next: Range) => void;
  skips: Range[];
  currentTime: number;
  onSeek: (t: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  /** Visual offset in px past the allowed bound (rubber-band / spring), per handle. */
  const [over, setOver] = useState<Record<Handle, number>>({ start: 0, end: 0 });
  const drag = useRef<{ handle: Handle; grabOffset: number; history: { x: number; t: number }[] } | null>(null);
  const springs = useRef<Record<Handle, number | null>>({ start: null, end: null });

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const s = springs.current;
    return () => {
      for (const h of ["start", "end"] as const) if (s[h] !== null) cancelAnimationFrame(s[h]!);
    };
  }, []);

  const toPx = useCallback((t: number) => (duration > 0 ? (t / duration) * width : 0), [duration, width]);
  const toTime = useCallback((px: number) => (width > 0 ? (px / width) * duration : 0), [duration, width]);

  const bounds = (handle: Handle): [number, number] =>
    handle === "start" ? [0, Math.max(0, value.end - MIN_GAP_SECONDS)] : [Math.min(duration, value.start + MIN_GAP_SECONDS), duration];

  function stopSpring(handle: Handle) {
    const id = springs.current[handle];
    if (id !== null) cancelAnimationFrame(id);
    springs.current[handle] = null;
  }

  /** Critically damped (or slightly bouncy after a flick) spring from the current overshoot back to 0. */
  function springBack(handle: Handle, velocityPx: number, flick: boolean) {
    stopSpring(handle);
    if (prefersReducedMotion()) {
      setOver((o) => ({ ...o, [handle]: 0 }));
      return;
    }
    const response = 0.35; // seconds
    const damping = flick ? 0.8 : 1;
    const omega = (2 * Math.PI) / response;
    let x = over[handle];
    let v = velocityPx;
    let last = -1;
    const step = (now: number) => {
      const dt = last < 0 ? 1 / 60 : Math.min(0.032, (now - last) / 1000);
      last = now;
      const a = -omega * omega * x - 2 * damping * omega * v;
      v += a * dt;
      x += v * dt;
      if (Math.abs(x) < 0.3 && Math.abs(v) < 5) {
        setOver((o) => ({ ...o, [handle]: 0 }));
        springs.current[handle] = null;
        return;
      }
      setOver((o) => ({ ...o, [handle]: x }));
      springs.current[handle] = requestAnimationFrame(step);
    };
    springs.current[handle] = requestAnimationFrame(step);
  }

  function onPointerDown(handle: Handle, e: PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    stopSpring(handle); // interruptible: grab it mid-motion
    const rect = trackRef.current!.getBoundingClientRect();
    const handleX = toPx(value[handle]) + over[handle];
    drag.current = { handle, grabOffset: e.clientX - rect.left - handleX, history: [{ x: e.clientX, t: e.timeStamp }] };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const rect = trackRef.current!.getBoundingClientRect();
    const rawPx = e.clientX - rect.left - d.grabOffset;
    const [lo, hi] = bounds(d.handle);
    const loPx = toPx(lo);
    const hiPx = toPx(hi);
    const clampedPx = Math.min(hiPx, Math.max(loPx, rawPx));
    const overshoot = rawPx - clampedPx;
    setOver((o) => ({ ...o, [d.handle]: overshoot === 0 ? 0 : rubberband(overshoot, width) }));
    const t = toTime(clampedPx);
    if (Math.abs(t - value[d.handle]) > 0.01) onChange({ ...value, [d.handle]: t });
    d.history.push({ x: e.clientX, t: e.timeStamp });
    if (d.history.length > 6) d.history.shift();
  }

  function onPointerUp() {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const h = d.history;
    const first = h[0];
    const last = h[h.length - 1];
    const dt = (last.t - first.t) / 1000;
    const velocity = dt > 0 ? (last.x - first.x) / dt : 0;
    if (over[d.handle] !== 0) springBack(d.handle, velocity * 0.3, Math.abs(velocity) > FLICK_PX_PER_S);
  }

  function onKeyDown(handle: Handle, e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 10 : 1;
    const delta = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : e.key === "ArrowRight" || e.key === "ArrowUp" ? step : 0;
    if (!delta) return;
    e.preventDefault();
    const [lo, hi] = bounds(handle);
    onChange({ ...value, [handle]: Math.min(hi, Math.max(lo, value[handle] + delta)) });
  }

  function onTrackPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const rect = trackRef.current!.getBoundingClientRect();
    onSeek(Math.min(duration, Math.max(0, toTime(e.clientX - rect.left))));
  }

  const startX = toPx(value.start) + over.start;
  const endX = toPx(value.end) + over.end;

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        onPointerDown={onTrackPointerDown}
        className="relative h-14 cursor-pointer touch-none rounded-[0.625rem] bg-surface-sunken"
      >
        {/* Cut-off areas */}
        <div className="pointer-events-none absolute inset-y-0 left-0 rounded-l-[0.625rem] bg-[oklch(from_var(--text)_l_c_h/0.08)]" style={{ width: Math.max(0, startX) }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 rounded-r-[0.625rem] bg-[oklch(from_var(--text)_l_c_h/0.08)]" style={{ left: endX }} />
        {/* Kept range */}
        <div className="pointer-events-none absolute inset-y-0 border-y-2 border-accent" style={{ left: startX, width: Math.max(0, endX - startX) }} />
        {/* Skipped stretches */}
        {skips.map((s, i) => (
          <div
            key={i}
            className="pointer-events-none absolute inset-y-2 rounded bg-[repeating-linear-gradient(135deg,oklch(from_var(--text)_l_c_h/0.18)_0_4px,transparent_4px_8px)]"
            style={{ left: toPx(s.start), width: Math.max(2, toPx(s.end) - toPx(s.start)) }}
          />
        ))}
        {/* Playhead */}
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-text" style={{ transform: `translateX(${toPx(currentTime) - 1}px)` }} />
        {(["start", "end"] as const).map((handle) => {
          const x = handle === "start" ? startX : endX;
          return (
            <div
              key={handle}
              role="slider"
              tabIndex={0}
              aria-label={handle === "start" ? "Game start" : "Game end"}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(value[handle])}
              aria-valuetext={formatTime(value[handle])}
              onPointerDown={(e) => onPointerDown(handle, e)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={(e) => onKeyDown(handle, e)}
              className="absolute inset-y-0 -ml-5 flex w-10 cursor-ew-resize items-center justify-center"
              style={{ transform: `translateX(${x}px)` }}
            >
              <div className="h-full w-3 rounded-[0.375rem] bg-accent shadow-[0_1px_3px_oklch(0_0_0/0.25)]" />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-sm text-muted tabular-nums">
        <span>Start {formatTime(value.start)}</span>
        <span>{formatTime(Math.max(0, value.end - value.start))} kept</span>
        <span>End {formatTime(value.end)}</span>
      </div>
    </div>
  );
}
