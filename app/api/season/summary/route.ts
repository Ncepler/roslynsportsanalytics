import { NextResponse } from "next/server";
import { guarded, jsonError } from "@/lib/api";
import { generateJson } from "@/lib/gemini/client";
import { SUMMARY_SCHEMA, summaryPrompt, type SummaryInput, type SummaryOutput } from "@/lib/season/summary";
import { allowedNumbers, verifyList, verifyText } from "@/lib/season/verify";

export const maxDuration = 60;

const MAX_BODY_CHARS = 40_000;

function validInput(v: unknown): v is SummaryInput {
  if (!v || typeof v !== "object") return false;
  const x = v as Partial<SummaryInput>;
  return (
    (x.sport === "basketball" || x.sport === "lacrosse") &&
    typeof x.games === "number" &&
    Array.isArray(x.pairs) &&
    x.pairs.length <= 200 &&
    !!x.comparison &&
    Array.isArray(x.comparison.rows)
  );
}

// Writes the Season summary with Gemini, from numbers the code already computed (the same Gemini key as
// the video analysis, so everything AI comes from one place). The reply is checked here: any sentence or
// hypothesis with a number that isn't in the input is removed before it reaches the browser.
export async function POST(request: Request) {
  return guarded(request, async () => {
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return jsonError(413, "Too much data for one summary.");
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      return jsonError(400, "Invalid request.");
    }
    if (!validInput(input)) return jsonError(400, "Invalid request.");

    const text = await generateJson({ prompt: summaryPrompt(input), schema: SUMMARY_SCHEMA });
    let parsed: Partial<SummaryOutput>;
    try {
      parsed = JSON.parse(text) as Partial<SummaryOutput>;
    } catch {
      return jsonError(502, "The AI didn't write a usable summary. The numbers above are still correct.");
    }

    const allowed = allowedNumbers(input);
    const summary = verifyText(typeof parsed.summary === "string" ? parsed.summary : "", allowed);
    const hypotheses = verifyList(Array.isArray(parsed.hypotheses) ? parsed.hypotheses.filter((h): h is string => typeof h === "string") : [], allowed);
    return NextResponse.json({
      summary: summary.text,
      hypotheses: hypotheses.items,
      removed: summary.removed.length + hypotheses.removed.length,
    });
  });
}
