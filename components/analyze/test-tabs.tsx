"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/test", label: "Analyze a game" },
  { href: "/test/season", label: "Season trends" },
] as const;

/** Sub-tabs for the simulation. Each is its own page (/test and /test/season). */
export function TestTabs() {
  const pathname = usePathname();
  return (
    <div role="tablist" aria-label="Simulation" className="inline-flex rounded-[0.75rem] bg-surface-sunken p-1">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={active}
            className={`flex min-h-10 items-center rounded-[0.5rem] px-4 text-[0.9375rem] font-medium ${active ? "bg-surface text-text shadow-[0_1px_2px_oklch(0_0_0/0.08)]" : "text-muted"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
