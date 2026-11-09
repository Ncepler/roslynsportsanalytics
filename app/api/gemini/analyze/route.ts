import { NextResponse } from "next/server";
import { guarded, jsonError, readJson } from "@/lib/api";
import { verifyToken } from "@/lib/auth/session";
import { startVideoInteraction } from "@/lib/gemini/client";
import { withinClearance, type Clearance } from "@/lib/gemini/gate";
import { appearancePrompt, appearanceSchema, eventsPassPrompt, eventsPassSchema, possessionLogPrompt, possessionLogSchema } from "@/lib/gemini/prompt";
import { parsePossessionRefs, parseSetup, parseVideoRange } from "@/lib/gemini/validate";
import { getSport } from "@/lib/sports";

export const maxDuration = 60;

// Starts one background analysis of a video range. The client polls
// /api/gemini/analyze/[id]; no function stays open for the whole run.
// The prompt and schema are built here from the sport config, never taken
// from the client.
export async function POST(request: Request) {
  return guarded(request, async () => {
    const body = await readJson<Record<string, unknown>>(request);
    const range = parseVideoRange(body);
    if (typeof range === "string") return jsonError(400, range);
    const setup = parseSetup(body?.setup);
    if (typeof setup === "string") return jsonError(400, setup);
    const sport = getSport(setup.sportId)!;

    // No pass from the Roslyn-game check, no analysis (lib/gemini/gate.ts). No bypass.
    const clearance = (await verifyToken(body?.clearance)) as Clearance | null;
    if (!clearance || !withinClearance(clearance, range.uri, sport.id, range.start, range.end)) {
      return jsonError(403, "This video hasn't passed the Roslyn-game check.");
    }

    // kind: "appearance" = starters + scoreboard check; "log" = pass 1, the
    // possession list; "events" = pass 2 or 3, adding events to pass 1's list.
    const kind = body?.kind === "appearance" || body?.kind === "events" ? body.kind : "log";
    let prompt: string;
    let schema: Record<string, unknown>;
    if (kind === "appearance") {
      prompt = appearancePrompt(sport, setup, range);
      schema = appearanceSchema;
    } else if (kind === "events") {
      const pass = body?.pass === 2 || body?.pass === 3 ? body.pass : null;
      const possessions = parsePossessionRefs(body?.possessions);
      if (!pass || !possessions) return jsonError(400, "Invalid pass or possession list.");
      prompt = eventsPassPrompt(sport, setup, range, pass, possessions);
      schema = eventsPassSchema(sport, setup.statIds, pass);
    } else {
      prompt = possessionLogPrompt(sport, setup, range);
      schema = possessionLogSchema(sport, setup.statIds);
    }
    const id = await startVideoInteraction({ ...range, prompt, schema });
    return NextResponse.json({ id });
  });
}
