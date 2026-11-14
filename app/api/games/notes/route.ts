import { NextResponse } from "next/server";
import { guarded, jsonError } from "@/lib/api";
import { allowAttempt, clientIp } from "@/lib/auth/rate-limit";
import { generateJson } from "@/lib/gemini/client";
import { NOTES_SCHEMA, notesPrompt, type GameNotesInput, type GameNotesOutput } from "@/lib/game/notes";
import { allowedNumbers, verifyList } from "@/lib/season/verify";

export const maxDuration = 60;

const MAX_BODY_CHARS = 30_000;

function validInput(v: unknown): v is GameNotesInput {
  if (!v || typeof v !== "object") return false;
  const x = v as Partial<GameNotesInput>;
  return (
    typeof x.sport === "string" &&
    typeof x.sportLabel === "string" &&
    typeof x.opponent === "string" &&
    x.opponent.length <= 80 &&
    !!x.score &&
    Array.isArray(x.byPeriod) &&
    Array.isArray(x.compare) &&
    x.compare.length <= 60 &&
    !!x.sources &&
    !!x.sources.roslyn &&
    !!x.sources.opponent
  );
}

// Writes the game notes with Gemini from numbers the browser computed from the reviewed log, then removes every
// note that contains a number not in that input before it goes back (CLAUDE.md section 3, rule 8).
export async function POST(request: Request) {
  return guarded(request, async () => {
    if (!allowAttempt(`game-notes:${clientIp(request)}`, 10)) return jsonError(429, "Too many tries. Wait a minute and try again.");
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return jsonError(413, "Too much data for one set of notes.");
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      return jsonError(400, "Invalid request.");
    }
    if (!validInput(input)) return jsonError(400, "Invalid request.");

    const text = await generateJson({ prompt: notesPrompt(input), schema: NOTES_SCHEMA });
    let parsed: Partial<GameNotesOutput>;
    try {
      parsed = JSON.parse(text) as Partial<GameNotesOutput>;
    } catch {
      return jsonError(502, "The AI didn't write usable notes. The numbers above are still correct.");
    }

    const allowed = allowedNumbers(input);
    const clean = (v: unknown) => verifyList(Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").slice(0, 6) : [], allowed);
    const worked = clean(parsed.worked);
    const opponentBetter = clean(parsed.opponent_better);
    const takeaways = clean(parsed.takeaways);
    return NextResponse.json({
      worked: worked.items,
      opponent_better: opponentBetter.items,
      takeaways: takeaways.items,
      removed: worked.removed.length + opponentBetter.removed.length + takeaways.removed.length,
    });
  });
}
