import type { Metadata } from "next";
import { AnalyzeFlow } from "@/components/analyze/analyze-flow";

export const metadata: Metadata = { title: "Analyze a game · Roslyn Film Analyzer" };

export default function AnalyzePage() {
  return (
    <section>
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Analyze a game</h1>
      <p className="mt-2 max-w-[38rem] text-muted">
        Upload a game video, trim it, set up the teams, and get tables that match the club&apos;s sheets.
      </p>
      <div className="mt-8">
        <AnalyzeFlow />
      </div>
    </section>
  );
}
