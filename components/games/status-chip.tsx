/** "Fri, Dec 5, 2026" from YYYY-MM-DD (no time zone shifts), or "Date not set". */
export function formatGameDate(date: string | null): string {
  if (!date) return "Date not set";
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
