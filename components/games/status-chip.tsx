import type { PublicGame } from "@/lib/games/types";

const LABEL: Record<PublicGame["status"], string> = { open: "Open", in_progress: "In progress", done: "Done" };

// Color is never the only signal: the word is always shown.
const TONE: Record<PublicGame["status"], string> = {
  open: "border-accent text-accent",
  in_progress: "border-warning-border bg-warning-bg text-warning-text",
  done: "border-border-strong text-muted",
};

export function StatusChip({ status }: { status: PublicGame["status"] }) {
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONE[status]}`}>{LABEL[status]}</span>;
}

/** "Fri, Dec 5" from YYYY-MM-DD (no time zone shifts), or "Date not set". */
export function formatGameDate(date: string | null): string {
  if (!date) return "Date not set";
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
