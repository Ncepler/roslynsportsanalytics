"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Small inline-SVG charts for the Season tab. Single series, so one hue (the
// app accent), no legend box (the title names it), thin marks, 1px solid
// recessive grid, value labels only where they carry the story, and a hover
// tooltip on every mark. Text stays in text colors, never the series color.

const PAD = { top: 16, right: 16, bottom: 36, left: 44 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Clean tick values covering [min, max]. */
function ticks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  // Keep adding ticks until the last one covers the largest value.
  for (let v = start; out.length < 2 || out[out.length - 1] < max - step * 0.001; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[0.5rem] border border-border bg-surface px-2.5 py-1.5 text-xs shadow-[0_2px_8px_oklch(0_0_0/0.12)] tabular-nums"
      style={{ left: x, top: y - 10 }}
    >
      {children}
    </div>
  );
}

function YAxis({ values, scale, width, format }: { values: number[]; scale: (v: number) => number; width: number; format: (v: number) => string }) {
  return (
    <g>
      {values.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={width - PAD.right} y1={scale(v)} y2={scale(v)} stroke="var(--border)" strokeWidth={1} />
          <text x={PAD.left - 8} y={scale(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-muted)" className="tabular-nums">
            {format(v)}
          </text>
        </g>
      ))}
    </g>
  );
}

const roundedTopRect = (x: number, y: number, w: number, h: number, r = 4) => {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
};

export function ColumnChart({
  data,
  height = 220,
  format = (v) => v.toFixed(0),
  label,
}: {
  data: { label: string; value: number; detail: string }[];
  height?: number;
  format?: (v: number) => string;
  label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value)) * 1.08;
  const yt = ticks(0, max);
  const top = yt[yt.length - 1];
  const y = (v: number) => PAD.top + (height - PAD.top - PAD.bottom) * (1 - v / top);
  const band = (width - PAD.left - PAD.right) / data.length;
  const barW = Math.min(24, band * 0.5);
  return (
    <div ref={ref} className="relative w-full min-w-0">
      {width > 0 && <svg width={width} height={height} role="img" aria-label={label}>
        <YAxis values={yt} scale={y} width={width} format={(v) => v.toFixed(0)} />
        {data.map((d, i) => {
          const cx = PAD.left + band * (i + 0.5);
          return (
            <g key={d.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              {/* Hit target wider than the mark */}
              <rect x={cx - band / 2} y={PAD.top} width={band} height={height - PAD.top - PAD.bottom} fill="transparent" />
              <path d={roundedTopRect(cx - barW / 2, y(d.value), barW, y(0) - y(d.value))} fill="var(--accent)" opacity={hover === null || hover === i ? 1 : 0.55} />
              <text x={cx} y={y(d.value) - 6} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--text)" className="tabular-nums">
                {format(d.value)}
              </text>
              <text x={cx} y={height - PAD.bottom + 18} textAnchor="middle" fontSize={12} fill="var(--text-muted)">
                {d.label}
              </text>
            </g>
          );
        })}
        <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeWidth={1} />
      </svg>}
      {hover !== null && (
        <Tooltip x={PAD.left + band * (hover + 0.5)} y={y(data[hover].value)}>
          <span className="font-semibold">{data[hover].label}</span> · {data[hover].detail}
        </Tooltip>
      )}
    </div>
  );
}

export function LineChart({
  points,
  height = 220,
  label,
  format = (v) => v.toFixed(1),
  reference,
}: {
  points: { label: string; value: number; detail: string }[];
  height?: number;
  label: string;
  format?: (v: number) => string;
  /** Optional horizontal reference (e.g. the season average), labeled at the right. */
  reference?: { value: number; label: string };
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const vals = points.map((p) => p.value);
  const yt = ticks(Math.min(...vals) * 0.95, Math.max(...vals) * 1.05);
  const lo = yt[0];
  const hi = yt[yt.length - 1];
  const y = (v: number) => PAD.top + (height - PAD.top - PAD.bottom) * (1 - (v - lo) / (hi - lo));
  const x = (i: number) => PAD.left + ((width - PAD.left - PAD.right) * i) / Math.max(1, points.length - 1);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - PAD.left) / (width - PAD.left - PAD.right)) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  }

  return (
    <div ref={ref} className="relative w-full min-w-0">
      {width > 0 && <svg width={width} height={height} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <YAxis values={yt} scale={y} width={width} format={(v) => v.toFixed(0)} />
        {reference && (
          <g>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(reference.value)} y2={y(reference.value)} stroke="var(--text-muted)" strokeWidth={1} opacity={0.6} />
            <text x={width - PAD.right} y={y(reference.value) - 5} textAnchor="end" fontSize={11} fill="var(--text-muted)">
              {reference.label}
            </text>
          </g>
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--border-strong)" strokeWidth={1} />}
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : 4} fill="var(--accent)" stroke="var(--bg)" strokeWidth={2} />
        ))}
        <text x={PAD.left} y={height - 8} fontSize={11} fill="var(--text-muted)">
          {points[0]?.label}
        </text>
        <text x={width - PAD.right} y={height - 8} textAnchor="end" fontSize={11} fill="var(--text-muted)">
          {points[points.length - 1]?.label}
        </text>
      </svg>}
      {hover !== null && (
        <Tooltip x={x(hover)} y={y(points[hover].value)}>
          <span className="font-semibold">{points[hover].label}</span> · {format(points[hover].value)} · {points[hover].detail}
        </Tooltip>
      )}
    </div>
  );
}

export function ScatterChart({
  points,
  xLabel,
  yLabel,
  fit,
  height = 260,
  label,
}: {
  points: { x: number; y: number; name: string }[];
  xLabel: string;
  yLabel: string;
  fit: { slope: number; intercept: number } | null;
  height?: number;
  label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xt = ticks(Math.min(...xs), Math.max(...xs));
  const yt = ticks(Math.min(...ys), Math.max(...ys));
  const [x0, x1] = [xt[0], xt[xt.length - 1]];
  const [y0, y1] = [yt[0], yt[yt.length - 1]];
  const bottom = PAD.bottom + 8;
  const sx = (v: number) => PAD.left + ((width - PAD.left - PAD.right) * (v - x0)) / (x1 - x0 || 1);
  const sy = (v: number) => PAD.top + (height - PAD.top - bottom) * (1 - (v - y0) / (y1 - y0 || 1));
  return (
    <div ref={ref} className="relative w-full min-w-0">
      {width > 0 && <svg width={width} height={height} role="img" aria-label={label}>
        {yt.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={sy(v)} y2={sy(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={sy(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-muted)" className="tabular-nums">
              {v}
            </text>
          </g>
        ))}
        {xt.map((v) => (
          <text key={v} x={sx(v)} y={height - bottom + 16} textAnchor="middle" fontSize={11} fill="var(--text-muted)" className="tabular-nums">
            {v}
          </text>
        ))}
        <text x={(PAD.left + width - PAD.right) / 2} y={height - 4} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
          {xLabel}
        </text>
        {fit && (
          <line x1={sx(x0)} x2={sx(x1)} y1={sy(fit.intercept + fit.slope * x0)} y2={sy(fit.intercept + fit.slope * x1)} stroke="var(--text-muted)" strokeWidth={1.5} opacity={0.7} />
        )}
        {points.map((p, i) => (
          <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={12} fill="transparent" />
            <circle cx={sx(p.x)} cy={sy(p.y)} r={hover === i ? 6 : 5} fill="var(--accent)" stroke="var(--bg)" strokeWidth={2} />
          </g>
        ))}
      </svg>}
      <span className="sr-only">{yLabel}</span>
      {hover !== null && (
        <Tooltip x={sx(points[hover].x)} y={sy(points[hover].y)}>
          <span className="font-semibold">{points[hover].name}</span> · {xLabel} {points[hover].x.toFixed(1)} · {yLabel} {points[hover].y.toFixed(0)}
        </Tooltip>
      )}
    </div>
  );
}
