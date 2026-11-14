// Pure date helpers for schedules. Code (not the AI) works out the year and checks every date.

/** "2026-27" -> "26/27". Anything else comes back unchanged. */
export function shortSeason(label: string): string {
  const m = /^\d{2}(\d{2})-(\d{2})$/.exec(label);
  return m ? `${m[1]}/${m[2]}` : label;
}

const pad = (n: number) => String(n).padStart(2, "0");

function isRealDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Turns a month and day (and a year, only if the picture printed one) into YYYY-MM-DD inside the season.
 * A season runs across two calendar years, so exactly one of the two candidates can fit. Returns null when
 * nothing fits or the date doesn't exist: the AI's reading is never trusted to pick the year.
 */
export function resolveDate(month: number | null, day: number | null, year: number | null, season: { start_date: string; end_date: string }): string | null {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month! < 1 || month! > 12 || day! < 1 || day! > 31) return null;
  const startYear = Number(season.start_date.slice(0, 4));
  const endYear = Number(season.end_date.slice(0, 4));
  const years = year !== null && Number.isInteger(year) ? [year] : [...new Set([startYear, endYear])];
  const fits = years
    .filter((y) => isRealDate(y, month!, day!))
    .map((y) => `${y}-${pad(month!)}-${pad(day!)}`)
    .filter((iso) => iso >= season.start_date && iso <= season.end_date);
  return fits.length === 1 ? fits[0] : null;
}
