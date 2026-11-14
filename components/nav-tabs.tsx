"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Tabs for the /test simulation only. Real team tabs live in components/nav/team-tabs.tsx.
const TABS = [
  { href: "/test", label: "Analyze a game" },
  { href: "/test/season", label: "Season trends" },
] as const;

// Tab switching is frequent, so it is instant: no transitions (CLAUDE.md section 19).
export function NavTabs() {
  const pathname = usePathname();
  if (!(pathname === "/test" || pathname.startsWith("/test/"))) return <div className="flex-1" />;

  return (
    <nav aria-label="Main" className="flex min-w-0 flex-1 self-stretch overflow-x-auto [scrollbar-width:none] sm:gap-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
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
