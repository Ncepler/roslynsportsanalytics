import { StatusDot, dotFromServer } from "./status-dot";

/**
 * "In charge: Name" with the game's dot, shown next to a game wherever games are listed (schedule, picker, game page),
 * so people can see who is doing what. The name is whatever that club member typed for themselves.
 * `analyzed` games show a green dot; an open analysis shows its live dot (blue = waiting on them).
 */
export function InCharge({ name, state, analyzed, busy }: { name?: string | null; state?: string | null; analyzed?: boolean; busy?: boolean }) {
  const live = busy ? dotFromServer(state) ?? "working" : null;
  const status = analyzed ? "done" : live;
  if (!name && !status) return null;
  const text = name ? (analyzed ? `Analyzed by ${name}` : `In charge: ${name}`) : null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      {status && <StatusDot status={status} />}
      {text && <span>{text}</span>}
    </span>
  );
}
