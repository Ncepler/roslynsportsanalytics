import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { adminGuarded, jsonError } from "@/lib/api";
import { allowAttempt, clientIp } from "@/lib/auth/rate-limit";
import { readScheduleReply, SCHEDULE_SCHEMA, schedulePrompt } from "@/lib/games/schedule-ai";
import { isGameSport } from "@/lib/games/validate";

export const maxDuration = 60;

const MAX_BODY_CHARS = 4_500_000; // Vercel's body limit is 4.5 MB; the browser shrinks pictures first.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

// Reads a schedule picture or pasted text into rows. Nothing is saved here:
// the admin checks and edits the rows first (PUT /api/admin/schedule).
export async function POST(request: Request) {
  return adminGuarded(request, async () => {
    if (!allowAttempt(`schedule:${clientIp(request)}`, 10)) return jsonError(429, "Too many requests. Wait a minute and try again.");
    if (!process.env.ANTHROPIC_API_KEY) return jsonError(503, "Reading schedules isn't set up yet (no Anthropic API key). Add the games by hand below.");

    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return jsonError(413, "That picture is too big. Try a smaller screenshot.");
    let body: { sport?: unknown; text?: unknown; image?: { mediaType?: unknown; data?: unknown } };
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonError(400, "Invalid request.");
    }
    if (!isGameSport(body.sport)) return jsonError(400, "Pick basketball or lacrosse first.");

    const text = typeof body.text === "string" ? body.text.slice(0, 20_000).trim() : "";
    const img = body.image;
    const hasImage = !!img && IMAGE_TYPES.includes(img.mediaType as ImageType) && typeof img.data === "string" && /^[A-Za-z0-9+/=]+$/.test(img.data);
    if (!text && !hasImage) return jsonError(400, "Add a picture or paste the schedule text.");

    const today = new Date().toISOString().slice(0, 10);
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (hasImage) content.push({ type: "image", source: { type: "base64", media_type: img!.mediaType as ImageType, data: img!.data as string } });
    if (text) content.push({ type: "text", text: `Schedule text:\n${text}` });
    content.push({ type: "text", text: schedulePrompt(body.sport, today) });

    try {
      const client = new Anthropic();
      const response = await client.beta.messages.create({
        model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEDULE_SCHEMA } },
        messages: [{ role: "user", content }],
      });
      if (response.stop_reason === "refusal") return jsonError(502, "The AI couldn't read that. Add the games by hand below.");
      const block = response.content.find((b) => b.type === "text");
      const games = readScheduleReply(block && "text" in block ? block.text : "");
      return NextResponse.json({ games });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return jsonError(429, "The AI is busy. Try again in a minute.");
      if (err instanceof Anthropic.AuthenticationError) return jsonError(503, "The Anthropic API key was rejected.");
      if (err instanceof Anthropic.APIError) return jsonError(502, `Reading the schedule failed (${err.status ?? "error"}). Add the games by hand below.`);
      return jsonError(502, "Reading the schedule failed. Add the games by hand below.");
    }
  });
}
