import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireMember } from "@/lib/auth/server";
import { listActiveTeams, tryDb } from "@/lib/db/read";
import { SPORTS, teamName } from "@/lib/teams/options";

export const metadata: Metadata = { title: "Teams · Roslyn Film Analyzer" };

// Home: pick a team. (Demo users are sent to /test by proxy.ts and never reach the database.)
async function Teams() {
  await requireMember();
  const result = await tryDb(listActiveTeams);
  if (!result.ok) {
    return (
      <div role="alert" className="rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-text">
        {result.message}
      </div>
    );
  }
  if (result.data.length === 0) {
    return (
      <div className="rounded-[0.75rem] border border-border bg-surface-sunken px-5 py-8 text-center">
        <p className="font-medium">No teams set up yet</p>
      </div>
    );
  }
  const groups = SPORTS.map((s) => ({ sport: s, teams: result.data.filter((t) => t.sport === s.value) })).filter((g) => g.teams.length > 0);
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.sport.value}>
          <h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-muted">{g.sport.label}</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {g.teams.map((t) => (
              <li key={t.id}>
                <Link href={`/t/${t.slug}`} className="flex min-h-14 items-center rounded-[0.75rem] border border-border bg-surface px-4 font-medium [@media(hover:hover)_and_(pointer:fine)]:hover:border-border-strong">
                  {teamName(t)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <section>
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Choose a team</h1>
      <p className="mt-2 max-w-[38rem] text-muted">Each team has its own schedule, analyzed games and season trends.</p>
      <div className="mt-8">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Teams />
        </Suspense>
      </div>
    </section>
  );
}
