"use client";

import { useState } from "react";
import { SeasonDemo } from "@/components/season/season-demo";
import { demoBackend } from "@/lib/demo/backend";
import { AnalyzeFlow } from "./analyze-flow";

/** The /test page: the real Analyze flow on the simulator, and a simulated Season trends tab. */
export function DemoFlow() {
  const [tab, setTab] = useState<"game" | "season">("game");
  const tabs = [
    { id: "game", label: "Analyze a game" },
    { id: "season", label: "Season trends" },
  ] as const;
  return (
    <div>
      {/* Instant switching, no animation (frequent action). */}
      <div role="tablist" aria-label="Simulation" className="inline-flex rounded-[0.75rem] bg-surface-sunken p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-10 rounded-[0.5rem] px-4 text-[0.9375rem] font-medium ${tab === t.id ? "bg-surface text-text shadow-[0_1px_2px_oklch(0_0_0/0.08)]" : "text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* Both stay mounted so switching tabs keeps each one's progress. */}
      <div className={tab === "game" ? "mt-8" : "hidden"}>
        <AnalyzeFlow makeBackend={demoBackend} demo />
      </div>
      <div className={tab === "season" ? "mt-8" : "hidden"}>
        <SeasonDemo />
      </div>
    </div>
  );
}
