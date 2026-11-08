import type { Metadata } from "next";
import { DemoFlow } from "@/components/analyze/demo-flow";

export const metadata: Metadata = { title: "Simulation · Roslyn Film Analyzer" };

// A walkthrough of the whole Analyze flow with a simulated backend:
// no upload, no Gemini, no cost. The game data is randomly generated.
export default function TestPage() {
  return (
    <section>
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">How it works</h1>
      <p className="mt-2 max-w-[40rem] text-muted">
        A walkthrough of the app: analyzing one game, and spotting trends across a season. The screens are the real ones;
        only the AI and the data are simulated.
      </p>
      <p role="note" className="mt-5 max-w-[40rem] rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-text">
        <span className="font-semibold">Simulation.</span> Nothing is uploaded, no AI runs, and nothing costs money. Games and
        numbers are made up. Each simulated game has one deliberate mistake so you can see the
        scoreboard check catch it. Don&apos;t copy these numbers into the club&apos;s sheets.
      </p>
      <div className="mt-8">
        <DemoFlow />
      </div>
    </section>
  );
}
