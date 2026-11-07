import { NextResponse } from "next/server";
import { guarded, jsonError, readJson } from "@/lib/api";
import { deleteFile, getFile } from "@/lib/gemini/client";
import { isGeminiFileName } from "@/lib/gemini/limits";

export const maxDuration = 15;

// GET ?name=files/abc: processing state of an uploaded video.
export async function GET(request: Request) {
  return guarded(request, async () => {
    const name = new URL(request.url).searchParams.get("name");
    if (!isGeminiFileName(name)) return jsonError(400, "Invalid file name.");
    return NextResponse.json(await getFile(name));
  });
}

// DELETE {name}: removes the video from Gemini as soon as the run ends (section 3, rule 3).
export async function DELETE(request: Request) {
  return guarded(request, async () => {
    const body = await readJson<{ name?: unknown }>(request);
    if (!isGeminiFileName(body?.name)) return jsonError(400, "Invalid file name.");
    await deleteFile(body.name);
    return NextResponse.json({ ok: true });
  });
}
