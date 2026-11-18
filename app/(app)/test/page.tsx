import { DemoAnalyze } from "@/components/analyze/demo-analyze";
import { DemoSeason } from "@/components/season/demo-season";

// The simulation only: made-up data, no AI, no cost. The real-video test lives on the admin page.
export default function TestPage() {
  return (
    <>
      <DemoAnalyze />
      <section id="season" className="mt-16 scroll-mt-20">
        <h2 className="mb-4 text-xl font-semibold tracking-[-0.01em]">Season trends</h2>
        <DemoSeason />
      </section>
    </>
  );
}
