import { NextResponse } from "next/server";
import { adminGuarded, jsonError, readJson } from "@/lib/api";
import { allowAttempt, clientIp } from "@/lib/auth/rate-limit";
import { db } from "@/lib/db/client";
import { dbFail } from "@/lib/db/errors";
import { parse, readTextBody } from "@/lib/db/schemas";
import { generateJson } from "@/lib/gemini/client";
import { scheduleTextPrompt, SCHEDULE_SCHEMA, toDraftRows } from "@/lib/schedule/read";

export const maxDuration = 60;

// Builds DRAFT schedule rows from pasted text with Gemini. Like the picture reader it writes nothing and keeps
// nothing: an admin reviews and edits every row before anything is added.
export async function POST(request: Request) {
  return adminGuarded(request, async () => {
    if (!allowAttempt(`schedule-read:${clientIp(request)}`, 8)) return jsonError(429, "Too many tries. Wait a minute and try again.");
    const input = parse(readTextBody, await readJson(request));

    const { data: season, error } = await db().from("seasons").select("label,start_date,end_date").eq("id", input.season_id).maybeSingle();
    if (error) dbFail(error);
    if (!season) return jsonError(400, "That season doesn't exist.");

    const text = await generateJson({ prompt: scheduleTextPrompt(season.label, input.text), schema: SCHEDULE_SCHEMA, temperature: 0 });
    try {
      const { rows, merged, cut } = toDraftRows(text, season);
      return NextResponse.json({ rows, merged, cut });
    } catch {
      return jsonError(502, "The AI couldn't build a schedule from that text. Check what you pasted, or type the games in.");
    }
  });
}
