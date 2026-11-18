import { NextResponse } from "next/server";
import { adminGuarded, jsonError } from "@/lib/api";
import { allowAttempt, clientIp } from "@/lib/auth/rate-limit";
import { db } from "@/lib/db/client";
import { dbFail } from "@/lib/db/errors";
import { parse, readAllBody } from "@/lib/db/schemas";
import { generateJson, generateJsonFromFile, googleErrorOf } from "@/lib/gemini/client";
import { scheduleAllPrompt, SCHEDULE_ALL_SCHEMA, toAllTeamDrafts, type KnownTeam } from "@/lib/schedule/read-all";

export const maxDuration = 120;

const MAX_BODY_CHARS = 4_500_000; // Vercel's request limit is about 4.5 MB

// Reads ONE file holding every team's schedule with Gemini and returns DRAFT rows (each matched to a club team where
// it can be) for an admin to review. It writes nothing to the database and keeps nothing: the file lives only in this request.
export async function POST(request: Request) {
  return adminGuarded(request, async () => {
    if (!allowAttempt(`schedule-read:${clientIp(request)}`, 6)) return jsonError(429, "Too many tries. Wait a minute and try again.");
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return jsonError(413, "That file is too big. Use a file under 3 MB.");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonError(400, "Invalid request.");
    }
    const input = parse(readAllBody, body);

    const { data: season, error } = await db().from("seasons").select("label,start_date,end_date").eq("id", input.season_id).maybeSingle();
    if (error) dbFail(error);
    if (!season) return jsonError(400, "That season doesn't exist.");
    const teamsRes = await db().from("teams").select("id,gender,level,sport,archived");
    if (teamsRes.error) dbFail(teamsRes.error);
    const teams = (teamsRes.data ?? []) as KnownTeam[];

    let text: string;
    try {
      text = input.file
        ? await generateJsonFromFile({ prompt: scheduleAllPrompt(season.label), mimeType: input.file.mediaType, data: input.file.data, schema: SCHEDULE_ALL_SCHEMA })
        : await generateJson({ prompt: scheduleAllPrompt(season.label, input.text), schema: SCHEDULE_ALL_SCHEMA, temperature: 0 });
    } catch (err) {
      // Say what Google itself said (never the key), so a refusal can be fixed instead of guessed at.
      const said = googleErrorOf(err)?.message ?? (err instanceof Error ? err.message.replace(/\s+/g, " ").slice(0, 300) : "");
      console.error("schedule read-all failed:", said);
      return jsonError(502, `Gemini couldn't read that file.${said ? ` It said: ${said}` : ""} Try a PDF or a clear picture, or paste the text.`);
    }
    let drafts;
    try {
      drafts = toAllTeamDrafts(text, season, teams);
    } catch {
      return jsonError(502, "The AI couldn't build a schedule from that file. Try a clearer file, or add the schedules team by team.");
    }

    // Games already on the schedules this season, so the review can show which rows are repeats.
    const ex = await db().from("games").select("team_id, game_date, opponent:opponents(name)").eq("season_id", input.season_id).limit(5000);
    if (ex.error) dbFail(ex.error);
    const existing = ((ex.data ?? []) as unknown as { team_id: string; game_date: string; opponent: { name: string } | { name: string }[] | null }[]).map((g) => ({
      team_id: g.team_id,
      date: g.game_date,
      opponent: (Array.isArray(g.opponent) ? g.opponent[0]?.name : g.opponent?.name) ?? null,
    }));
    return NextResponse.json({ ...drafts, existing });
  });
}
