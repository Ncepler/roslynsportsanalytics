// Browser-side helpers for the app's own API routes.

import { upload, uploadPresigned } from "@vercel/blob/client";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; keepalive?: boolean }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
      headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      keepalive: init?.keepalive,
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection.", 0);
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (res.status === 401) {
    // Full reload on purpose: the session is gone, so drop all in-tab state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
    throw new ApiError("Your session ended. Log in again.", 401);
  }
  if (!res.ok || !data) throw new ApiError(data?.error ?? `Request failed (${res.status}).`, res.status);
  return data;
}

export type GeminiFile = { name: string; uri: string; mimeType: string; state: string; error: string | null };

/**
 * Uploads the video to a temporary Vercel Blob (browsers can't upload to
 * Gemini directly, and Vercel functions can't take large bodies), then the
 * server streams it to Gemini and deletes the Blob.
 */
export async function uploadToGemini(file: File, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<GeminiFile> {
  const mimeType = normalizeVideoType(file);
  // Older Blob stores hand out client tokens; newer ones hand out signed URLs. The server says which.
  const { mode } = await api<{ mode: "token" | "presigned" | "none" }>("/api/blob/upload").catch(() => ({ mode: "token" as const }));
  const send = mode === "presigned" ? uploadPresigned : upload;
  const put = (access: "public" | "private") =>
    send(`game-${Date.now()}`, file, {
      access,
      handleUploadUrl: "/api/blob/upload",
      contentType: mimeType,
      multipart: true,
      abortSignal: signal,
      // Leave the last stretch for the hand-off to Gemini.
      onUploadProgress: (e) => onProgress((e.percentage / 100) * 0.9),
    });
  let blob: { url: string };
  let access: "public" | "private" = "public";
  try {
    try {
      blob = await put("public");
    } catch (err) {
      // A Blob store created as "private" refuses public uploads: use private.
      if (signal.aborted || !(err instanceof Error) || !/private|access/i.test(err.message)) throw err;
      access = "private";
      blob = await put("private");
    }
  } catch (err) {
    if (signal.aborted) throw new ApiError("Upload cancelled.", 0);
    throw new ApiError(err instanceof Error && err.message ? err.message : "The upload failed. Try again.", 0);
  }
  const parsed = await api<{ file?: { name?: string; uri?: string; mimeType?: string; state?: string } }>("/api/gemini/import", { body: { blobUrl: blob.url, mimeType, access } });
  onProgress(1);
  if (!parsed.file?.name || !parsed.file.uri) throw new ApiError("Gemini didn't confirm the upload.", 0);
  return {
    name: parsed.file.name,
    uri: parsed.file.uri,
    mimeType: parsed.file.mimeType ?? mimeType,
    state: parsed.file.state ?? "PROCESSING",
    error: null,
  };
}

const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;

/** Polls until Gemini has processed the video (gives up after 15 minutes). */
export async function waitForActive(name: string, signal: AbortSignal): Promise<GeminiFile> {
  const giveUpAt = Date.now() + PROCESSING_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > giveUpAt) throw new ApiError("Gemini is taking too long to process this video. Try again, or try a shorter clip.", 0);
    if (signal.aborted) throw new ApiError("Cancelled.", 0);
    const f = await api<GeminiFile>(`/api/gemini/file?name=${encodeURIComponent(name)}`);
    if (f.state === "ACTIVE") return f;
    if (f.state === "FAILED") throw new ApiError(f.error ?? "Gemini couldn't process this video.", 0);
    await sleep(3000);
  }
}

/** Removes the video from Gemini (CLAUDE.md section 3, rule 3). Best-effort. */
export function deleteFromGemini(name: string) {
  return api("/api/gemini/file", { method: "DELETE", body: { name }, keepalive: true }).catch(() => undefined);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Browsers report some types oddly (e.g. empty for .mkv, "video/quicktime" for .mov). */
export function normalizeVideoType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : "video/mp4";
}
