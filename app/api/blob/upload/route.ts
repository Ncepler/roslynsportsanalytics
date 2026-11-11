import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { guarded, jsonError, readJson } from "@/lib/api";
import { MAX_UPLOAD_BYTES } from "@/lib/gemini/limits";

export const maxDuration = 30;

// Hands the browser a short-lived token to upload the video to a temporary
// Vercel Blob (Gemini won't take browser uploads, and Vercel functions can't
// take large bodies). /api/gemini/import moves it to Gemini and deletes it
// right away. Sits behind the password gate like every route.
export async function POST(request: Request) {
  return guarded(request, async () => {
    const body = await readJson<HandleUploadBody>(request);
    if (!body) return jsonError(400, "Bad request.");
    if (!process.env.BLOB_READ_WRITE_TOKEN) return jsonError(503, "Video upload isn't set up yet (missing BLOB_READ_WRITE_TOKEN).");
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["video/*"],
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        addRandomSuffix: true,
      }),
    });
    return NextResponse.json(result);
  });
}
