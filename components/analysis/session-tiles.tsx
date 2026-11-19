"use client";

import { useRouter } from "next/navigation";
import { useSessions, type Session } from "./sessions-provider";
import { StatusDot } from "./status-dot";

/**
 * One tile per open analysis, like Claude's session list: a dot (blue = needs you, green = done, red = failed,
 * grey = working), what game it is, and what it is doing. Clicking one opens it; the x closes it.
 */
export function SessionTiles({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const { sessions, activeKey, setActiveKey, close } = useSessions();
  const router = useRouter();
  if (sessions.length === 0) return null;

  function open(s: Session) {
    setActiveKey(s.key);
    router.push(`/t/${s.team.slug}/analyze`);
    onNavigate?.();
  }

  function remove(s: Session) {
    const keep = s.status === "working" || (!s.saved && s.status !== "failed" && s.status !== "done");
    if (keep && !window.confirm(`Close the analysis of ${s.team.name} vs. ${s.game.opponent}? Anything that isn't saved is lost.`)) return;
    close(s.key);
  }

  return (
    <ul className={compact ? "space-y-1" : "grid gap-2 sm:grid-cols-2"}>
      {sessions.map((s) => {
        const current = s.key === activeKey;
        return (
          <li key={s.key} className={`flex items-stretch rounded-[0.625rem] border ${current ? "border-accent" : "border-border"} bg-surface`}>
            <button type="button" onClick={() => open(s)} aria-current={current ? "true" : undefined} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-[0.625rem] px-3 py-2 text-left [@media(hover:hover)_and_(pointer:fine)]:hover:bg-surface-sunken">
              <StatusDot status={s.status} />
              <span className="min-w-0">
                <span className="block truncate text-[0.9375rem] font-medium">
                  {s.game.homeAway === "home" ? "vs." : "at"} {s.game.opponent}
                </span>
                <span className="block truncate text-xs text-muted">
                  {s.team.name} · {s.detail}
                </span>
              </span>
            </button>
            <button type="button" aria-label={`Close the analysis of ${s.game.opponent}`} onClick={() => remove(s)} className="flex w-10 shrink-0 items-center justify-center rounded-[0.625rem] text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-text">
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <path d="M4 4l10 10M14 4L4 14" />
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
