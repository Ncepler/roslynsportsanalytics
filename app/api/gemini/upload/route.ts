import { NextResponse } from "next/server";
import { guarded, jsonError, readJson } from "@/lib/api";
import { signToken } from "@/lib/auth/session";
import { startResumableUpload } from "@/lib/gemini/client";
import { MAX_UPLOAD_BYTES, isAllowedVideoType } from "@/lib/gemini/limits";

export const maxDuration = 30;

// Starts a Gemini resumable upload. Returns a signed ticket for the session; the
// browser sends the bytes in small pieces through /api/gemini/chunk, which
// relays them to Google without storing anything (browsers are blocked from
// uploading to Google directly by CORS).
export async function POST(request: Request) {
  return guarded(request, async () => {
    const body = await readJson<{ size?: unknown; mimeType?: unknown }>(request);
    const size = body?.size;
    const mimeType = body?.mimeType;
    if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) return jsonError(400, "Missing file size.");
    if (typeof mimeType !== "string" || !isAllowedVideoType(mimeType)) {
      return jsonError(415, "That file type isn't supported. Use an MP4, MOV, or WebM video.");
    }
    if (size > MAX_UPLOAD_BYTES) return jsonError(413, "That video is over 2 GB. Trim or compress it first.");

    // Display name is generic on purpose: no player or school names leave the app.
    const uploadUrl = await startResumableUpload({ size, mimeType, displayName: `game-${Date.now()}` });
    return NextResponse.json({ ticket: await signToken({ t: "upload", uploadUrl }, 6 * 60 * 60) });
  });
}
