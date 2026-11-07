import { NextResponse } from "next/server";
import { guarded, jsonError, readJson } from "@/lib/api";
import { countVideoTokens } from "@/lib/gemini/client";
import { parseVideoRange } from "@/lib/gemini/validate";

export const maxDuration = 30;

// Real input-token count for a video range (feeds the cost estimate).
export async function POST(request: Request) {
  return guarded(request, async () => {
    const range = parseVideoRange(await readJson<Record<string, unknown>>(request));
    if (typeof range === "string") return jsonError(400, range);
    return NextResponse.json({ tokens: await countVideoTokens(range) });
  });
}
