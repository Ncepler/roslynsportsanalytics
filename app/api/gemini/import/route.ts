import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { guarded, jsonError, readJson } from "@/lib/api";
import { startResumableUpload } from "@/lib/gemini/client";
import { MAX_UPLOAD_BYTES, isAllowedVideoType } from "@/lib/gemini/limits";

export const maxDuration = 300;

// Moves the temporary Blob copy of the video into Gemini in one streamed
// request, then deletes the Blob (success or failure). Nothing is kept on
// Vercel and nothing about the video is logged (CLAUDE.md section 3).
export async function POST(request: Request) {
  return guarded(request, async () => {
    const body = await readJson<{ blobUrl?: unknown; mimeType?: unknown }>(request);
    const blobUrl = typeof body?.blobUrl === "string" ? body.blobUrl : "";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
    let host = "";
    try {
      const u = new URL(blobUrl);
      host = u.protocol === "https:" ? u.hostname : "";
    } catch {}
    if (!host.endsWith(".blob.vercel-storage.com")) return jsonError(400, "Bad video address.");
    if (!isAllowedVideoType(mimeType)) return jsonError(415, "That file type isn't supported. Use an MP4, MOV, or WebM video.");

    try {
      const source = await fetch(blobUrl);
      const size = Number(source.headers.get("content-length"));
      if (!source.ok || !source.body || !Number.isInteger(size) || size <= 0) return jsonError(502, "Couldn't read the uploaded video. Try again.");
      if (size > MAX_UPLOAD_BYTES) return jsonError(413, "That video is over 2 GB. Trim or compress it first.");

      const { uploadUrl } = await startResumableUpload({ size, mimeType, displayName: `game-${Date.now()}` });
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Length": String(size), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
        body: source.body,
        // @ts-expect-error Node's fetch needs this to stream a request body.
        duplex: "half",
      });
      const text = await res.text();
      if (!res.ok) return jsonError(502, `Gemini rejected the upload (HTTP ${res.status}${text ? `: ${text.replace(/\s+/g, " ").slice(0, 200)}` : ""}).`);
      return NextResponse.json({ file: JSON.parse(text).file });
    } finally {
      await del(blobUrl).catch(() => {});
    }
  });
}
