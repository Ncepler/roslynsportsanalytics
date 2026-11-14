"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AnalyzeFlow, type TeamContext } from "./analyze-flow";

/**
 * The real Analyze flow, mounted by the team layout so it survives switching between Schedule, Analyze and Season
 * trends. (When it lived inside the Analyze page, leaving that tab threw away the video, setup and the AI's work,
 * even while the player check was still waiting for an answer.) It is shown only on the Analyze tab and is created
 * the first time that tab is opened.
 */
export function PersistentAnalyze({ team }: { team: TeamContext }) {
  const pathname = usePathname();
  const router = useRouter();
  const active = pathname.endsWith("/analyze");
  const [opened, setOpened] = useState(active);
  if (active && !opened) setOpened(true);
  if (!opened) return null;
  return (
    <div hidden={!active}>
      <p className="max-w-[38rem] text-muted">Upload a game video, trim it, set up the teams, review the log, and save it to the schedule.</p>
      <div className="mt-8">
        {/* Keyed by team: moving to another team starts a fresh flow; moving between tabs keeps this one. */}
        <AnalyzeFlow key={team.id} team={team} onSaved={() => router.refresh()} />
      </div>
    </div>
  );
}
