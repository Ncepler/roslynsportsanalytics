import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { jsonError, refuseUnlessMember } from "@/lib/api";
import { allowAttempt, clientIp } from "@/lib/auth/rate-limit";
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

// Writes the Season summary from numbers the code already computed. The
// reply is checked here: any sentence or hypothesis with a number that isn't
// in the input is removed before it reaches the browser.
export async function POST(request: Request) {
  const refused = await refuseUnlessMember(request);
  if (refused) return refused;
  if (!allowAttempt(`claude:${clientIp(request)}`, 10)) return jsonError(429, "Too many requests. Wait a minute and try again.");
  if (!process.env.ANTHROPIC_API_KEY) return jsonError(503, "The AI summary isn't set up yet (no Anthropic API key).");

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return jsonError(413, "Too much data for one summary.");
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return jsonError(400, "Invalid request.");
  }
  if (!validInput(input)) return jsonError(400, "Invalid request.");

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SUMMARY_SCHEMA } },
      messages: [{ role: "user", content: summaryPrompt(input) }],
    });
    if (response.stop_reason === "refusal") return jsonError(502, "The AI declined to write a summary. The numbers above are still correct.");
    const textBlock = response.content.find((b) => b.type === "text");
    const parsed = JSON.parse(textBlock && "text" in textBlock ? textBlock.text : "{}") as Partial<SummaryOutput>;

    const allowed = allowedNumbers(input);
    const summary = verifyText(typeof parsed.summary === "string" ? parsed.summary : "", allowed);
    const hypotheses = verifyList(Array.isArray(parsed.hypotheses) ? parsed.hypotheses.filter((h): h is string => typeof h === "string") : [], allowed);
    return NextResponse.json({
      summary: summary.text,
      hypotheses: hypotheses.items,
      removed: summary.removed.length + hypotheses.removed.length,
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return jsonError(429, "The AI is busy. Try again in a minute.");
    if (err instanceof Anthropic.AuthenticationError) return jsonError(503, "The Anthropic API key was rejected.");
    if (err instanceof Anthropic.APIError) return jsonError(502, `The AI summary failed (${err.status ?? "error"}). The numbers above are still correct.`);
    return jsonError(502, "The AI summary failed. The numbers above are still correct.");
  }
}
