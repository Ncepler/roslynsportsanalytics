"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GENDERS, LEVELS, SPORTS, teamName } from "@/lib/teams/options";

type Crumb = { label: string; href?: string };

/** "boys-varsity-basketball" -> "Boys Varsity Basketball", read from the same options the rest of the site uses. */
function nameFromSlug(slug: string): string {
  const m = /^([a-z]+)-([a-z0-9]+)-(.+)$/.exec(slug);
  if (m && GENDERS.some((g) => g.value === m[1]) && LEVELS.some((l) => l.value === m[2]) && SPORTS.some((s) => s.value === m[3])) {
    return teamName({ gender: m[1], level: m[2], sport: m[3] });
  }
  return slug;
}

const TEAM_TABS: Record<string, string> = { analyze: "Analyze a game", season: "Season trends" };

export function crumbsFor(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [{ label: "Home" }];

  // The practice simulation is the only area the demo sign-in can reach, so it has its own root.
  if (parts[0] === "test") {
    return parts[1] === "season"
      ? [{ label: "Practice demo", href: "/test" }, { label: "Season trends" }]
      : [{ label: "Practice demo" }, { label: "Analyze a game" }];
  }

  const home: Crumb = { label: "Home", href: "/" };
  if (parts[0] === "t" && parts[1]) {
    const slug = parts[1];
    const team: Crumb = { label: nameFromSlug(slug), href: `/t/${slug}` };
    const tab = parts[2] ? (TEAM_TABS[parts[2]] ?? "Schedule") : "Schedule";
    return [home, team, { label: tab }];
  }
  if (parts[0] === "admin") return [home, { label: "Admin" }];
  if (parts[0] === "breakdown") return [home, { label: "Data & privacy" }];
  return [home];
}

// Where am I (CLAUDE.md section 19, wayfinding). Navigation only, so no animation.
export function Breadcrumbs() {
  const crumbs = crumbsFor(usePathname());
  return (
    <nav aria-label="Breadcrumb" className="mb-6 sm:mb-8">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-x-2">
              {i > 0 && (
                <span aria-hidden="true" className="text-border-strong">
                  /
                </span>
              )}
              {last || !c.href ? (
                <span aria-current={last ? "page" : undefined} className={last ? "min-w-0 truncate font-medium text-text" : ""}>
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="rounded-sm underline-offset-2 [@media(hover:hover)_and_(pointer:fine)]:hover:text-text [@media(hover:hover)_and_(pointer:fine)]:hover:underline">
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
