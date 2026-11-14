"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { SPORTS, splitByGender, teamName } from "@/lib/teams/options";

export type NavTeam = { id: string; slug: string; gender: string; level: string; sport: string };

const subscribeNothing = () => () => {};
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Header title, current team name, and (for members and admins) the hamburger with its left drawer.
 * Motion (CLAUDE.md section 19): the drawer slides with transform and the scrim fades with opacity, both
 * ~200 ms on --ease-drawer / --ease-out; reduced-motion zeroes the durations. Opening and closing are the
 * only animations; tab switching elsewhere stays instant.
 */
export function AppNav({ teams, drawer, season }: { teams: NavTeam[]; drawer: boolean; /** Current season, short form like "26/27", shown by every team. */ season?: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  // The drawer lives in <body>: the header's backdrop-filter would otherwise trap a fixed-position panel inside it.
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);

  const slug = /^\/t\/([^/]+)/.exec(pathname)?.[1];
  const current = slug ? teams.find((t) => t.slug === slug) : undefined;

  useEffect(() => {
    if (!open) return;
    const returnTo = trigger.current;
    close.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      // Focus trap: Tab and Shift+Tab cycle inside the drawer.
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      returnTo?.focus();
    };
  }, [open]);

  const groups = SPORTS.map((s) => ({ sport: s, teams: teams.filter((t) => t.sport === s.value) })).filter((g) => g.teams.length > 0).map((g) => ({ ...g, ...splitByGender(g.teams) }));

  return (
    <>
      {drawer && (
        <button
          ref={trigger}
          type="button"
          className="btn btn-ghost -ml-1 size-11 shrink-0 px-0"
          aria-label="Open menu"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="app-drawer"
          onClick={() => setOpen(true)}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <path d="M3 5.5h14M3 10h14M3 14.5h14" />
          </svg>
        </button>
      )}
      <Link href="/" className={`${current ? "hidden sm:block" : ""} shrink-0 text-[0.9375rem] font-semibold tracking-[-0.01em]`}>
        Roslyn Film Analyzer
      </Link>
      {current && (
        <span className="min-w-0 truncate text-[0.9375rem] font-medium sm:text-muted" aria-live="polite">
          <span className="mr-2 hidden text-muted sm:inline" aria-hidden="true">
            /
          </span>
          {teamName(current)}
        </span>
      )}

      {drawer &&
        mounted &&
        createPortal(
          <div className="drawer-root" data-open={open}>
            <div className="drawer-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
            <div id="app-drawer" ref={panel} role="dialog" aria-modal="true" aria-label="Teams and menu" className="drawer" inert={!open}>
              <div className="flex min-h-14 items-center justify-between gap-2 border-b border-border px-4">
                <span className="text-[0.9375rem] font-semibold tracking-[-0.01em]">Teams</span>
                <button ref={close} type="button" className="btn btn-ghost -mr-2 size-11 px-0" aria-label="Close menu" onClick={() => setOpen(false)}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 4l10 10M14 4L4 14" />
                  </svg>
                </button>
              </div>
              <nav aria-label="Teams" className="flex-1 overflow-y-auto px-2 py-3">
                {groups.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-muted">No teams yet.</p>
                ) : (
                  groups.map((g) => (
                    <div key={g.sport.value} className="mb-4">
                      <h2 className="px-2 pb-1 text-xs font-semibold uppercase tracking-[0.04em] text-muted">{g.sport.label}</h2>
                      {[
                        { label: "Girls", list: g.girls },
                        { label: "Boys", list: g.boys },
                      ].map((col) =>
                        col.list.length === 0 ? null : (
                          <div key={col.label} className="mb-2">
                            <h3 className="px-2 pt-1 text-xs text-muted">{col.label}</h3>
<ul>
                        {col.list.map((t) => {
                          const active = t.slug === slug;
                          return (
                            <li key={t.id}>
                              <Link
                                href={`/t/${t.slug}`}
                                aria-current={active ? "page" : undefined}
                                onClick={() => setOpen(false)}
                                className={`flex min-h-11 items-center justify-between gap-2 rounded-[0.5rem] px-2 text-[0.9375rem] ${active ? "bg-surface-sunken font-medium text-text" : "text-text [@media(hover:hover)_and_(pointer:fine)]:hover:bg-surface-sunken"}`}
                              >
                                <span>{teamName(t)}</span>
                                {season && <span className="text-xs tabular-nums text-muted">{season}</span>}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                          </div>
                        ),
                      )}
                    </div>
                  ))
                )}
              </nav>
              <div className="border-t border-border px-2 py-3">
                <Link href="/breakdown" onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-[0.5rem] px-2 text-[0.9375rem] text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:bg-surface-sunken">
                  Data &amp; privacy
                </Link>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
