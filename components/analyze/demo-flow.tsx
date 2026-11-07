"use client";

import { demoBackend } from "@/lib/demo/backend";
import { AnalyzeFlow } from "./analyze-flow";

/** The real Analyze flow wired to the simulator (the /test page). */
export function DemoFlow() {
  return <AnalyzeFlow makeBackend={demoBackend} demo />;
}
