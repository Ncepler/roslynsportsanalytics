"use client";

import { demoBackend } from "@/lib/demo/backend";
import { AnalyzeFlow } from "./analyze-flow";

/** The real Analyze screens running on the simulator (client component: it hands a function to AnalyzeFlow). */
export function DemoAnalyze() {
  return <AnalyzeFlow makeBackend={demoBackend} demo />;
}
