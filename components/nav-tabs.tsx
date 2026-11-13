"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Analyze a game" },
  { href: "/season", label: "Season trends" },
  { href: "/breakdown", label: "Data & privacy" },
] as const;

// While viewing the simulation, the two main tabs stay inside it (/test, /test/season).
const TEST_HREF: Record<string, string> = { "/": "/test", "/season": "/test/season" };

// Tab switching is frequent, so it is instant: no transitions (CLAUDE.md section 19).
export function NavTabs() {
  const pathname = usePathname();
  const inTest = pathname === "/test" || pathname.startsWith("/test/");

  return (
    <nav aria-label="Main" className="flex min-w-0 flex-1 self-stretch overflow-x-auto [scrollbar-width:none] sm:gap-1">
      {TABS.map((tab) => {
        const href = inTest ? (TEST_HREF[tab.href] ?? tab.href) : tab.href;
        const active = pathname === href;
        return (
          <Link
            key={tab.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex shrink-0 items-center px-2 text-[0.875rem] sm:text-[0.9375rem] font-medium whitespace-nowrap sm:px-3 ${
              active
                ? "text-text after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent sm:after:inset-x-3"
                : "text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-text"
            } min-h-12`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
