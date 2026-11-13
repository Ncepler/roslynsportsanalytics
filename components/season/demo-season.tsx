"use client";

import { useState } from "react";
import { simulateSeasonTabs } from "@/lib/demo/season";
import { SeasonTab } from "./season-tab";

/** The real Season trends screens fed made-up games. */
export function DemoSeason() {
  const [demoSeason] = useState(simulateSeasonTabs);
  return <SeasonTab demo demoTabs={demoSeason.tabs} demoScores={demoSeason.scores} />;
}
