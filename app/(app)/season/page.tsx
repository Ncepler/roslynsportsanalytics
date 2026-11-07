import type { Metadata } from "next";

export const metadata: Metadata = { title: "Season trends · Roslyn Film Analyzer" };

export default function SeasonPage() {
  return (
    <section className="max-w-[38rem]">
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Season trends</h1>
      <p className="mt-3 text-muted">
        Upload the club&apos;s finished spreadsheets to find trends across games. Every number is computed from your
        rows, with the sample size shown, and graphs appear only where a pattern holds up.
      </p>
      <p className="mt-6 text-sm text-muted">Not built yet.</p>
    </section>
  );
}
