import { NextResponse } from "next/server";
import { adminGuarded, jsonError } from "@/lib/api";
import { allowAttempt, clientIp } from "@/lib/auth/rate-limit";
import { db } from "@/lib/db/client";
import { dbFail } from "@/lib/db/errors";
import { parse, readBody } from "@/lib/db/schemas";
import { generateJsonFromImages } from "@/lib/gemini/client";
import { schedulePrompt, SCHEDULE_SCHEMA, toDraftRows } from "@/lib/schedule/read";

export const maxDuration = 60;

const MAX_BODY_CHARS = 4_000_000; // Vercel's request limit is 4.5 MB

// Reads up to 3 schedule screenshots with Gemini and returns DRAFT rows for an admin to review. It writes nothing
// to the database and keeps nothing: the pictures live only in this request.
export async function POST(request: Request) {
  return adminGuarded(request, async () => {
    if (!allowAttempt(`schedule-read:${clientIp(request)}`, 8)) return jsonError(429, "Too many tries. Wait a minute and try again.");
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return jsonError(413, "Those pictures are too big. Use smaller screenshots.");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonError(400, "Invalid request.");
    }
    const input = parse(readBody, body);

    const { data: season, error } = await db().from("seasons").select("label,start_date,end_date").eq("id", input.season_id).maybeSingle();
    if (error) dbFail(error);
    if (!season) return jsonError(400, "That season doesn't exist.");

    const text = await generateJsonFromImages({ prompt: schedulePrompt(season.label), images: input.images, schema: SCHEDULE_SCHEMA });
    try {
      const { rows, merged, cut } = toDraftRows(text, season);
      return NextResponse.json({ rows, merged, cut });
    } catch {
      return jsonError(502, "The AI couldn't read a schedule from those pictures. Try a clearer screenshot, or type the games in.");
    }
  });
}
