import { NextResponse } from "next/server";
import { guarded, jsonError, readJson } from "@/lib/api";
import { countVideoTokens, geminiModel } from "@/lib/gemini/client";
import { parseVideoRange } from "@/lib/gemini/validate";
import { getRegistrySport } from "@/lib/sports/registry";

export const maxDuration = 30;

// Real input-token count for a video range (feeds the cost estimate). With a sportId, the count uses
// that sport's registry fps and model, so it matches what the analysis will really send.
export async function POST(request: Request) {
  return guarded(request, async () => {
    const body = await readJson<Record<string, unknown>>(request);
    const range = parseVideoRange(body);
    if (typeof range === "string") return jsonError(400, range);
    const sport = typeof body?.sportId === "string" ? getRegistrySport(body.sportId) : undefined;
    return NextResponse.json({
      tokens: await countVideoTokens({ ...range, fps: sport?.analysis.fps ?? range.fps, model: geminiModel(sport?.id) }),
    });
  });
}
