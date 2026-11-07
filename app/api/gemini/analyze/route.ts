import { NextResponse } from "next/server";
import { guarded, jsonError, readJson } from "@/lib/api";
import { startVideoInteraction } from "@/lib/gemini/client";
import { possessionLogPrompt, possessionLogSchema } from "@/lib/gemini/prompt";
import { parseSetup, parseVideoRange } from "@/lib/gemini/validate";
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

    const id = await startVideoInteraction({
      ...range,
      prompt: possessionLogPrompt(sport, setup, range),
      schema: possessionLogSchema(sport, setup.statIds),
    });
    return NextResponse.json({ id });
  });
}
