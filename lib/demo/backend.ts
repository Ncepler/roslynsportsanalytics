// SIMULATION ONLY. A stand-in for the Gemini backend used by the /test page:
// nothing leaves the browser and no API is called. It runs the real
// segment planning, merge/dedupe, derivations, and sheet code on a
// generated game.

import { ApiError, sleep, type GeminiFile } from "@/lib/client/api";
import type { Backend } from "@/lib/client/backend";
import { mergeLogs, type Range, type Segment } from "@/lib/client/segments";
import { passesNeeded } from "@/lib/gemini/prompt";
import { getSport } from "@/lib/sports";
import { appearanceNotes, simulatedNoteUpdates, simulatedStarters, simulateGame, sliceForSegment } from "./simulate";

const DEMO_FILE: GeminiFile = { name: "files/simulated", uri: "simulated", mimeType: "video/mp4", state: "ACTIVE", error: null };

function check(signal: AbortSignal) {
  if (signal.aborted) throw new ApiError("Cancelled.", 0);
}

/** Segment cores tile the kept ranges exactly, so they rebuild them. */
function rangesFrom(segments: Segment[]): Range[] {
  const out: Range[] = [];
  for (const { core } of [...segments].sort((a, b) => a.core.start - b.core.start)) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.end - core.start) < 0.01) last.end = core.end;
    else out.push({ ...core });
  }
  return out;
}

export function demoBackend(): Backend {
  return {
    calibrates: false,
    async upload(_file, onProgress, signal) {
      for (let i = 1; i <= 20; i++) {
        await sleep(150);
        check(signal);
        onProgress(i / 20);
      }
      return { ...DEMO_FILE, state: "PROCESSING" };
    },
    async waitForActive(_name, signal) {
      await sleep(1200);
      check(signal);
      return DEMO_FILE;
    },
    async deleteFile() {},
    // No real count in the simulation: the estimate stays labeled as a rough guess.
    async countTokens() {
      return null;
    },
    // The simulation always shows a Roslyn game, so the check passes.
    async gate(_file, _range, _sportId, signal) {
      await sleep(1800);
      check(signal);
      return { pass: true, evidence: "ROSLYN across the home jerseys (simulated)", clearance: "simulated" };
    },
    async appearance(_range, _video, setup, signal) {
      await sleep(2500);
      check(signal);
      return {
        notes: appearanceNotes(setup),
        starters: simulatedStarters(setup),
        scoreboard: { visible: true, quarter: true, clock: true, score: true },
      };
    },
    async possessionLog(segments, _video, setup, signal, onSegmentDone) {
      const data = simulateGame(rangesFrom(segments), setup);
      // Mirrors the real pass structure (section 6.3): pass 1 per part, then the later passes.
      const sport = getSport(setup.sportId);
      const passes = sport ? passesNeeded(sport, setup.statIds).length : 1;
      const total = segments.length * passes;
      let done = 0;
      const parts = await Promise.all(
        segments.map(async (segment, i) => {
          for (let p = 0; p < passes; p++) {
            await sleep((p === 0 ? 1600 : 900) + i * 500 + Math.random() * 600);
            check(signal);
            onSegmentDone(++done, total);
          }
          return { segment, log: sliceForSegment(data, segment.watch) };
        }),
      );
      const log = mergeLogs(parts);
      const watched = segments.reduce((s, seg) => s + (seg.watch.end - seg.watch.start), 0);
      return {
        log,
        usage: { inputTokens: Math.round(watched * 100), outputTokens: log.possessions.length * 140 },
        raw: parts.map((p) => JSON.stringify(p.log, null, 2)),
        noteUpdates: simulatedNoteUpdates(setup),
      };
    },
  };
}
