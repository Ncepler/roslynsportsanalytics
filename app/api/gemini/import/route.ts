import { del, get, list } from "@vercel/blob";
import { NextResponse } from "next/server";
import { guarded, jsonError, readJson } from "@/lib/api";
import { startResumableUpload } from "@/lib/gemini/client";
import { MAX_UPLOAD_BYTES, isAllowedVideoType } from "@/lib/gemini/limits";

export const maxDuration = 300;

const ORPHAN_AFTER_MS = 60 * 60 * 1000;

// Moves the temporary Blob copy of the video into Gemini in one streamed
// request, then deletes the Blob (success or failure). Nothing is kept on
// Vercel and nothing about the video is logged (CLAUDE.md section 3).
export async function POST(request: Request) {
  return guarded(request, async () => {
    const body = await readJson<{ blobUrl?: unknown; mimeType?: unknown; access?: unknown }>(request);
    const blobUrl = typeof body?.blobUrl === "string" ? body.blobUrl : "";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
    const access = body?.access === "private" ? "private" : "public";
    let host = "";
    try {
      const u = new URL(blobUrl);
      host = u.protocol === "https:" ? u.hostname : "";
    } catch {}
    if (!host.endsWith(".blob.vercel-storage.com")) return jsonError(400, "Bad video address.");
    if (!isAllowedVideoType(mimeType)) return jsonError(415, "That file type isn't supported. Use an MP4, MOV, or WebM video.");

    try {
      // The Blob SDK reads public and private blobs alike and reports the real
      // size (a plain fetch can omit Content-Length).
      const source = await get(blobUrl, { access }).catch(() => null);
      if (!source || source.statusCode !== 200 || !source.stream) return jsonError(502, "Couldn't read the uploaded video. Try again.");
      const size = source.blob.size;
      if (!Number.isInteger(size) || size <= 0) return jsonError(502, "Couldn't read the uploaded video. Try again.");
      if (size > MAX_UPLOAD_BYTES) return jsonError(413, "That video is over 2 GB. Trim or compress it first.");

      const { uploadUrl } = await startResumableUpload({ size, mimeType, displayName: `game-${Date.now()}` });
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Length": String(size), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
        body: source.stream,
        // @ts-expect-error Node's fetch needs this to stream a request body.
        duplex: "half",
      });
      const text = await res.text();
      if (!res.ok) return jsonError(502, `Gemini rejected the upload (HTTP ${res.status}${text ? `: ${text.replace(/\s+/g, " ").slice(0, 200)}` : ""}).`);
      let file: unknown;
      try {
        file = (JSON.parse(text) as { file?: unknown }).file;
      } catch {}
      if (!file) return jsonError(502, "Gemini didn't confirm the upload. Try again.");
      return NextResponse.json({ file });
    } finally {
      await del(blobUrl).catch(() => {});
      await sweepOrphans();
    }
  });
}

// If someone closes the tab between the Blob upload and this hand-off, their
// video would stay on Vercel. Every hand-off also deletes any video Blob that
// is over an hour old, so leftovers never pile up (rule 3, no lasting storage).
async function sweepOrphans() {
  try {
    const { blobs } = await list({ prefix: "game-", limit: 100 });
    const old = blobs.filter((b) => Date.now() - new Date(b.uploadedAt).getTime() > ORPHAN_AFTER_MS).map((b) => b.url);
    if (old.length) await del(old);
  } catch {}
}
