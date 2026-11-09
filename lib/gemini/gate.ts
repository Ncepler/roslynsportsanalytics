// The Roslyn-game check. Runs before any expensive request: a short look at
// three ~20 s clips from the start, middle, and end of the trimmed game. The
// run only continues if the AI sees the chosen sport being played AND visible
// proof that one team is Roslyn. The only bypass is the owner-only code (app/api/admin/unlock). The server signs a pass
// for this exact file, sport, and time range, and every analysis request
// requires it (app/api/gemini/analyze).
//
// The prompt contains no text the user typed (team names, colors), so it
// can't be talked into passing a video.

import type { SportConfig } from "@/lib/sports/types";

export const GATE_CLIP_SECONDS = 20;
/** The pass lasts long enough for a full run and a re-run. */
export const CLEARANCE_TTL_SECONDS = 6 * 60 * 60;

export type GateRange = { start: number; end: number };

/** Three short clips: start, middle, and end of the trimmed game. */
export function gateClips(range: GateRange): GateRange[] {
  const len = range.end - range.start;
  if (len <= GATE_CLIP_SECONDS * 3) return [range];
  const mid = range.start + len / 2;
  return [
    { start: range.start, end: range.start + GATE_CLIP_SECONDS },
    { start: mid - GATE_CLIP_SECONDS / 2, end: mid + GATE_CLIP_SECONDS / 2 },
    { start: range.end - GATE_CLIP_SECONDS, end: range.end },
  ];
}

export const gateSchema = {
  type: "object",
  properties: {
    sportSeen: { type: "string", enum: ["basketball", "lacrosse", "other sport", "not a sports game", "unclear"], description: "What is being played in these clips." },
    isOrganizedGame: { type: "boolean", description: "True only for an organized game between two teams (not practice drills, highlights compilations, video games, or unrelated video)." },
    roslynSeen: { type: "boolean", description: 'True only if you can actually read "Roslyn" (or "ROS" as a team label next to a score) somewhere in the clips.' },
    roslynEvidence: { type: "string", description: 'Exactly where you read it, e.g. "ROSLYN across the home jerseys" or "scoreboard shows ROS 12". Empty if not seen.' },
    reason: { type: "string", description: "One short sentence explaining what the clips show." },
  },
  required: ["sportSeen", "isOrganizedGame", "roslynSeen", "roslynEvidence", "reason"],
};

export function gatePrompt(sport: SportConfig, clips: GateRange[]) {
  return [
    `These ${clips.length === 1 ? "is one clip" : `are ${clips.length} short clips`} from a video someone wants to analyze as a high school ${sport.label.toLowerCase()} game involving Roslyn High School (Roslyn Heights, NY).`,
    "Answer only from what you can see and read. Never guess.",
    "",
    "1. What sport is being played, if any? Is it an organized game between two teams?",
    '2. Can you read "Roslyn" anywhere: lettering on a team\'s jerseys, a team name or "ROS" label next to a score on the scoreboard graphic, court or field markings, or banners and signs? Report exactly where.',
    "",
    'If you cannot clearly read "Roslyn" (or "ROS" as a team label on the scoreboard), roslynSeen must be false. Jersey colors alone are not proof.',
  ].join("\n");
}

export type GateResult = { sportSeen: string; isOrganizedGame: boolean; roslynSeen: boolean; roslynEvidence: string; reason: string };

export type GateDecision = { pass: true; evidence: string } | { pass: false; reason: string };

/** The pass/fail rule lives in code, not in the AI's answer. */
export function decideGate(sport: SportConfig, raw: unknown): GateDecision {
  const r = (raw ?? {}) as Partial<GateResult>;
  const seen = typeof r.sportSeen === "string" ? r.sportSeen : "unclear";
  const why = typeof r.reason === "string" && r.reason.trim() ? ` ${r.reason.trim()}` : "";
  if (seen === "not a sports game" || seen === "unclear") return { pass: false, reason: `This doesn't look like a sports game.${why}` };
  if (seen !== sport.id) {
    const other = seen === "basketball" || seen === "lacrosse" ? `${seen}, not ${sport.label.toLowerCase()}. If that's right, go back and change the sport.` : `${seen}, not ${sport.label.toLowerCase()}.`;
    return { pass: false, reason: `This looks like ${other}${why}` };
  }
  if (r.isOrganizedGame !== true) return { pass: false, reason: `This doesn't look like a full game between two teams.${why}` };
  const evidence = typeof r.roslynEvidence === "string" ? r.roslynEvidence.trim() : "";
  if (r.roslynSeen !== true || !/\b(roslyn|ros)\b/i.test(evidence)) {
    return { pass: false, reason: `The AI couldn't find Roslyn in this video (no "Roslyn" on jerseys, the scoreboard, or the court).${why}` };
  }
  return { pass: true, evidence };
}

export type Clearance = { t: "clear"; uri: string; sport: string; start: number; end: number };

/** A request's range must sit inside the range the pass was issued for. */
export function withinClearance(c: Clearance, uri: string, sport: string, start: number, end: number) {
  return c.t === "clear" && c.uri === uri && c.sport === sport && start >= c.start - 1 && end <= c.end + 1;
}
