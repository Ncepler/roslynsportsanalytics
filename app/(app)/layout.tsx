import Link from "next/link";
import { Suspense } from "react";
import { LogoutButton } from "@/components/logout-button";
import { AppNav } from "@/components/nav/app-nav";
import { Breadcrumbs } from "@/components/nav/breadcrumbs";
import { NavTabs } from "@/components/nav-tabs";
import { getRole } from "@/lib/auth/server";
import { getCurrentSeasonLabel, listActiveTeams, tryDb } from "@/lib/db/read";
import { shortSeason } from "@/lib/schedule/dates";

// The drawer's team list. Demo users never read the database (they only see the /test simulation).
async function Nav() {
  const role = await getRole();
  if (role !== "member" && role !== "admin") return <AppNav teams={[]} isAdmin={false} drawer={false} />;
  const [result, season] = await Promise.all([tryDb(listActiveTeams), tryDb(getCurrentSeasonLabel)]);
  return <AppNav teams={result.ok ? result.data : []} isAdmin={role === "admin"} drawer season={season.ok && season.data ? shortSeason(season.data) : null} />;
}

// Shown while the nav loads. Plain on purpose: usePathname() needs a Suspense boundary on dynamic routes.
function TitleOnly() {
  return (
    <Link href="/" className="shrink-0 text-[0.9375rem] font-semibold tracking-[-0.01em]">
      Roslyn Film Analyzer
    </Link>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const freeTier = process.env.GEMINI_TIER === "free";

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-[var(--header-bg)] backdrop-blur-[var(--header-blur)] backdrop-saturate-150">
        <div className="mx-auto flex min-h-14 max-w-5xl items-center gap-2 px-2 sm:gap-3 sm:px-6">
          <Suspense fallback={<TitleOnly />}>
            <Nav />
          </Suspense>
          <Suspense fallback={<div className="flex-1" />}>
            <NavTabs />
          </Suspense>
          <LogoutButton />
        </div>
      </header>
      {freeTier && (
        <div role="status" className="border-b border-warning-border bg-warning-bg text-warning-text">
          <p className="mx-auto max-w-5xl px-4 py-2 text-sm font-medium sm:px-6">
            Free tier: don&apos;t upload student footage.
          </p>
        </div>
      )}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Suspense fallback={<div className="mb-6 h-5 sm:mb-8" />}>
          <Breadcrumbs />
        </Suspense>
        {children}
      </main>
    </>
  );
}
