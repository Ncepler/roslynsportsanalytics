import { issueSignedToken } from "@vercel/blob";
import { handleUpload, handleUploadPresigned, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { guarded, jsonError, readJson } from "@/lib/api";
import { blobMode } from "@/lib/blob-config";
import { MAX_UPLOAD_BYTES } from "@/lib/gemini/limits";

export const maxDuration = 30;

// GET tells the browser which upload method this store needs (see lib/blob-config.ts).
export async function GET(request: Request) {
  return guarded(request, async () => NextResponse.json({ mode: blobMode() }));
}

// Hands the browser what it needs to upload the video to a temporary Vercel
// Blob (Gemini won't take browser uploads, and Vercel functions can't take
// large bodies). /api/gemini/import moves it to Gemini and deletes it right
// away. Sits behind the password gate like every route.
export async function POST(request: Request) {
  return guarded(request, async () => {
    const body = await readJson<Record<string, unknown>>(request);
    if (!body) return jsonError(400, "Bad request.");
    const mode = blobMode();
    if (mode === "none") return jsonError(503, "Video upload isn't set up yet (no Blob store connected to this project).");

    if (mode === "token") {
      const result = await handleUpload({
        body: body as unknown as HandleUploadBody,
        request,
        onBeforeGenerateToken: async () => ({
          allowedContentTypes: ["video/*"],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        }),
      });
      return NextResponse.json(result);
    }

    // Newer stores: a short-lived signed URL for exactly this file name, video types only, 2 GB max.
    const result = await handleUploadPresigned({
      body: body as unknown as Parameters<typeof handleUploadPresigned>[0]["body"],
      request,
      getSignedToken: async (pathname) => ({
        token: await issueSignedToken({ pathname, operations: ["put"], allowedContentTypes: ["video/*"], maximumSizeInBytes: MAX_UPLOAD_BYTES }),
        urlOptions: { addRandomSuffix: true, allowedContentTypes: ["video/*"], maximumSizeInBytes: MAX_UPLOAD_BYTES },
      }),
    });
    return NextResponse.json(result);
  });
}
