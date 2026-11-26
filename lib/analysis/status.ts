// What an open analysis is doing, as one word per session tile. Pure, so it is easy to test.
//   working   the AI (or the save) is running and nothing is needed from the member
//   needs_you the member has to do something: confirm player numbers, finish setup, review, retry a failed save
//   done      the stats are saved to the game (so Season trends already include them), or, for a sport that can't be
//             saved yet, the results are ready
//   failed    the run stopped with an error, or the video wasn't a Roslyn game
import type { AnalysisState } from "@/lib/db/schemas";

export type SessionStatus = "working" | "needs_you" | "done" | "failed";

export type StatusInput = {
  /** run.phase from the flow */
  phase: "idle" | "uploading" | "gate" | "appearance" | "notes" | "logging" | "checking" | "building" | "done" | "error" | "rejected";
  /** The flow has a finished log (possession or registry) in hand. */
  hasResults: boolean;
  /** The log is stored in the database (and unchanged since). */
  saved: boolean;
  /** This sport's results can be stored (basketball and lacrosse today). */
  savable: boolean;
  /** The automatic save is running right now. */
  saving: boolean;
  /** The automatic save failed. */
  saveFailed: boolean;
};

const RUNNING = new Set<StatusInput["phase"]>(["uploading", "gate", "appearance", "logging", "checking", "building"]);

export function deriveStatus(i: StatusInput): SessionStatus {
  if (i.phase === "error" || i.phase === "rejected") return "failed";
  if (RUNNING.has(i.phase) || i.saving) return "working";
  if (i.hasResults) {
    if (!i.savable) return "done";
    return i.saved ? "done" : "needs_you";
  }
  return "needs_you"; // setup steps, the player-numbers check, a run that hasn't started
}

/** The line shown under the tile's title. */
export function statusText(i: StatusInput & { step: number }): string {
  if (i.phase === "error") return "Stopped with an error";
  if (i.phase === "rejected") return "Not a Roslyn game";
  if (i.saving) return "Saving the stats";
  if (i.phase === "uploading") return "Uploading the video";
  if (i.phase === "gate") return "Checking it's a Roslyn game";
  if (i.phase === "appearance") return "Reading the game";
  if (i.phase === "logging") return "Logging the game";
  if (i.phase === "checking" || i.phase === "building") return "Building the tables";
  if (i.phase === "notes") return "Needs you: confirm player numbers";
  if (i.hasResults) {
    if (!i.savable) return "Done · results are in this tab only";
    if (i.saved) return "Done · saved to the season";
    return i.saveFailed ? "Needs you: it didn't save, press Save game" : "Needs you: review and save";
  }
  if (i.step <= 0) return "Needs you: choose a video";
  if (i.step === 1) return "Needs you: trim the video";
  if (i.step === 2) return "Needs you: set up the teams";
  return "Needs you: press Analyze";
}

/**
 * What a session does with its game's claim. A run that failed (error, or not a Roslyn game) gives the game back at
 * once, so nobody is locked out while the tab sits on the error; everything unfinished keeps the claim fresh; a saved
 * game has no claim left to manage.
 */
export function claimAction(status: SessionStatus, saved: boolean): "release" | "refresh" | "none" {
  if (saved) return "none";
  return status === "failed" ? "release" : "refresh";
}

/** What the server remembers (for everyone else's schedule view). Saved or finished analyses clear it. */
export function serverState(status: SessionStatus): AnalysisState | null {
  if (status === "working") return "working";
  if (status === "needs_you") return "needs_input";
  if (status === "failed") return "failed";
  return null;
}
