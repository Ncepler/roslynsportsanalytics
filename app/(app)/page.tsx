import type { Metadata } from "next";

export const metadata: Metadata = { title: "Analyze a game · Roslyn Film Analyzer" };

export default function AnalyzePage() {
  return (
    <section className="max-w-[38rem]">
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Analyze a game</h1>
      <p className="mt-3 text-muted">
        Upload a game video, trim off warmups, set the sport, teams, and stats to track, then analyze it. The results
        come back as tables that match the club&apos;s sheets, ready to review and copy into Google Sheets.
      </p>
      <p className="mt-6 text-sm text-muted">Not built yet.</p>
    </section>
  );
}
