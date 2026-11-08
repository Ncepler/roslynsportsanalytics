// Plus/minus and minutes for the starters (Long shots; CLAUDE.md sections 9
// and 10). Code follows who is on the court from the starters and the logged
// substitutions, then credits every made basket while each player was on.
// Total is the sum of the quarters (section 10 rule).

import type { LogEvent, PossessionLog, Team } from "@/lib/gemini/log-types";
import { eventPoints } from "./index";

export const PM_PERIODS = ["1", "2", "3", "4", "OT"] as const;

export type PlusMinusRow = {
  number: string;
  /** Per period; null for OT when there was no OT. */
  byPeriod: Record<(typeof PM_PERIODS)[number], number | null>;
  total: number;
  /** Game-clock minutes on the court; null when too many clock readings were missing. */
  minutes: number | null;
};

const clockSeconds = (c: string | null) => {
  const m = c ? /^(\d{1,2}):(\d{2})$/.exec(c.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Share of possessions that need both clock readings for minutes to be trusted. */
const MIN_CLOCK_COVERAGE = 0.8;

export function plusMinus(log: PossessionLog, starters: string[], team: Team = "roslyn"): { rows: PlusMinusRow[]; unknownSubs: number; hadOT: boolean } {
  const tracked = starters.map((s) => s.replace(/^#/, "").trim()).filter(Boolean);
  const onCourt = new Set(tracked);
  const hadOT = log.possessions.some((p) => p.quarter === "OT");
  const pm = new Map(tracked.map((n) => [n, { "1": 0, "2": 0, "3": 0, "4": 0, OT: 0 } as Record<string, number>]));
  const seconds = new Map(tracked.map((n) => [n, 0]));
  let unknownSubs = 0;
  let withClocks = 0;

  // Events in game order, each with its possession's period.
  const timeline = log.possessions
    .flatMap((p) => p.events.map((e) => ({ e, quarter: p.quarter })))
    .sort((a, b) => a.e.videoTime - b.e.videoTime);

  const applySub = (e: LogEvent) => {
    if (e.team !== team) return;
    if (!e.playerOut && !e.playerIn) return;
    if (e.playerOut) onCourt.delete(e.playerOut.replace(/^#/, ""));
    else unknownSubs++;
    if (e.playerIn) onCourt.add(e.playerIn.replace(/^#/, ""));
    else unknownSubs++;
  };

  // Minutes: each possession's game-clock length goes to whoever was on at its start.
  let cursor = 0;
  for (const p of log.possessions.slice().sort((a, b) => a.videoStart - b.videoStart)) {
    // A substitution at the very start of a possession counts before that possession.
    while (cursor < timeline.length && timeline[cursor].e.videoTime <= p.videoStart) {
      if (timeline[cursor].e.type === "substitution") applySub(timeline[cursor].e);
      cursor++;
    }
    const start = clockSeconds(p.clockStart);
    const end = clockSeconds(p.clockEnd);
    if (start !== null && end !== null && start >= end) {
      withClocks++;
      for (const n of tracked) if (onCourt.has(n)) seconds.set(n, (seconds.get(n) ?? 0) + (start - end));
    }
  }

  // Plus/minus: replay from the starting lineup (count unreadable subs on this pass only).
  unknownSubs = 0;
  onCourt.clear();
  tracked.forEach((n) => onCourt.add(n));
  for (const { e, quarter } of timeline) {
    if (e.type === "substitution") applySub(e);
    else if (e.type === "shot" && e.made === true) {
      const pts = eventPoints(e);
      const period = quarter && quarter in { 1: 1, 2: 1, 3: 1, 4: 1, OT: 1 } ? quarter : null;
      if (!period) continue;
      for (const n of tracked) if (onCourt.has(n)) pm.get(n)![period] += e.team === team ? pts : -pts;
    }
  }

  const minutesKnown = log.possessions.length > 0 && withClocks / log.possessions.length >= MIN_CLOCK_COVERAGE;
  const rows = tracked.map((n) => {
    const q = pm.get(n)!;
    const byPeriod = { "1": q["1"], "2": q["2"], "3": q["3"], "4": q["4"], OT: hadOT ? q.OT : null };
    return {
      number: n,
      byPeriod,
      total: q["1"] + q["2"] + q["3"] + q["4"] + (hadOT ? q.OT : 0),
      minutes: minutesKnown ? Math.round(((seconds.get(n) ?? 0) / 60) * 10) / 10 : null,
    };
  });
  return { rows, unknownSubs, hadOT };
}
