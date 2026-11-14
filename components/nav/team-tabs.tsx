"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Tabs inside a team. Switching is instant (CLAUDE.md section 19: no animation on tab switches).
export function TeamTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/t/${slug}`;
  const tabs = [
    { href: base, label: "Schedule" },
    { href: `${base}/analyze`, label: "Analyze a game" },
    { href: `${base}/season`, label: "Season trends" },
  ];
  return (
    <nav aria-label="Team" className="-mx-1 flex overflow-x-auto border-b border-border [scrollbar-width:none]">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-11 shrink-0 items-center px-3 text-[0.9375rem] font-medium whitespace-nowrap ${
              active ? "text-text after:absolute after:inset-x-3 after:bottom-[-1px] after:h-0.5 after:rounded-full after:bg-accent" : "text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-text"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
