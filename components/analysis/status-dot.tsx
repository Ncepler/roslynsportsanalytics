import type { SessionStatus } from "@/lib/analysis/status";

/** Server-side states from the schedule: the same dot for someone else's analysis. */
export type DotKind = SessionStatus | "idle";

const LABEL: Record<SessionStatus, string> = { working: "Working", needs_you: "Needs attention", done: "Done", failed: "Failed" };
const COLOR: Record<SessionStatus, string> = { working: "bg-dot-working", needs_you: "bg-dot-needs", done: "bg-dot-done", failed: "bg-danger" };

/**
 * The little status dot (like Claude's session list): blue = needs you, green = done, red = failed,
 * grey and slowly pulsing = working. Colour is never the only signal: it carries a label for screen readers.
 */
export function StatusDot({ status, label = true }: { status: SessionStatus; label?: boolean }) {
  return (
    <span className="inline-flex items-center">
      <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${COLOR[status]} ${status === "working" ? "status-pulse" : ""}`} />
      {label && <span className="sr-only">{LABEL[status]}</span>}
    </span>
  );
}

/** Dot for a game's database state (someone's analysis open on it). */
export function dotFromServer(state: string | null | undefined): SessionStatus | null {
  if (state === "needs_input") return "needs_you";
  if (state === "failed") return "failed";
  if (state === "working") return "working";
  return null;
}
