import type { Metadata } from "next";
import { SeasonTab } from "@/components/season/season-tab";

export const metadata: Metadata = { title: "Season trends · Roslyn Film Analyzer" };

export default function SeasonPage() {
  return (
    <section>
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Season trends</h1>
      <p className="mt-2 max-w-[40rem] text-muted">
        Find patterns across games from the club&apos;s finished spreadsheets. Every number is worked out from your rows, with the number of games shown.
      </p>
      <div className="mt-8">
        <SeasonTab />
      </div>
    </section>
  );
}
