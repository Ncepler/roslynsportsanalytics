// Season-tab statistics (CLAUDE.md section 13). Pure functions; all numbers
// shown on the Season tab come from here, never from the AI.

/** Minimum games before a correlation is reported at all. */
export const MIN_GAMES = 10;
/** |r| needed to call a relationship worth showing. */
export const MIN_ABS_R = 0.5;

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Pearson correlation. Null with fewer than 3 points or no variation. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs.slice(0, n))!;
  const my = mean(ys.slice(0, n))!;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Plain-English strength, always "goes together with", never "causes". */
export function strength(r: number): string {
  const a = Math.abs(r);
  const dir = r > 0 ? "goes up with" : "goes down as";
  if (a >= 0.7) return `strongly ${dir}`;
  if (a >= 0.5) return `moderately ${dir}`;
  if (a >= 0.3) return `weakly ${dir}`;
  return "shows no clear link with";
}

/** Least-squares line through the points, for drawing a trend line. */
export function fitLine(xs: number[], ys: number[]): { slope: number; intercept: number } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs)!;
  const my = mean(ys)!;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}
