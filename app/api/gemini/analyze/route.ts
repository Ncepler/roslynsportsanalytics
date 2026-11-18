import { NextResponse } from "next/server";
import { guarded, jsonError, readJson } from "@/lib/api";
import { verifyToken } from "@/lib/auth/session";
import { geminiModel, startVideoInteraction } from "@/lib/gemini/client";
import { withinClearance, type Clearance } from "@/lib/gemini/gate";
import { appearancePrompt, appearanceSchema, eventsPassPrompt, eventsPassSchema, possessionLogPrompt, possessionLogSchema } from "@/lib/gemini/prompt";
import { parsePossessionRefs, parseSetup, parseVideoRange } from "@/lib/gemini/validate";
import { getSport } from "@/lib/sports";
import { getRegistrySport, isStatSelectable } from "@/lib/sports/registry";
import { buildPrompt, buildResponseSchema } from "@/lib/sports/request-builder";
import { usesPossessionLog } from "@/lib/sports";

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
    const regSport = getRegistrySport(setup.sportId)!; // parseSetup already checked it exists

    // No pass from the Roslyn-game check, no analysis (lib/gemini/gate.ts). No bypass.
    const clearance = (await verifyToken(body?.clearance)) as Clearance | null;
    if (!clearance || !withinClearance(clearance, range.uri, regSport.id, range.start, range.end)) {
      return jsonError(403, "This video hasn't passed the Roslyn-game check.");
    }

    // Registry event log: any sport that doesn't use the possession log. The prompt and schema come from the
    // registry (lib/sports/request-builder.ts), never from the client. Timestamps count from the chunk start.
    if (body?.kind === "registry" || !usesPossessionLog(regSport.id)) {
      const wanted = new Set(setup.registryStatIds ?? regSport.stats.map((s) => s.id));
      const stats = regSport.stats.filter((s) => wanted.has(s.id) && isStatSelectable(regSport, s));
      const teams = { roslyn: setup.roslynColor, opponent: setup.awayColor };
      const chunk = { start: range.start, end: range.end };
      const id = await startVideoInteraction({
        ...range,
        fps: regSport.analysis.fps,
        model: geminiModel(regSport.id),
        prompt: buildPrompt(regSport, stats, teams, chunk),
        schema: buildResponseSchema(regSport, teams, stats.map((s) => s.id)),
      });
      return NextResponse.json({ id });
    }
    const sport = getSport(setup.sportId)!;

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
    // fps and model come from the sport registry, never from the client.
    const id = await startVideoInteraction({ ...range, fps: regSport.analysis.fps, model: geminiModel(sport.id), prompt, schema });
    return NextResponse.json({ id });
  });
}
