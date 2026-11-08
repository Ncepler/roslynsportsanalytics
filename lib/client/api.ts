// Browser-side helpers for the app's own API routes.

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
 * Uploads the video straight from the browser to Gemini. The server only
 * opens the session; the bytes never touch Vercel.
 */
export async function uploadToGemini(file: File, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<GeminiFile> {
  const mimeType = normalizeVideoType(file);
  const { uploadUrl } = await api<{ uploadUrl: string }>("/api/gemini/upload", { body: { size: file.size, mimeType } });

  const raw = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.setRequestHeader("X-Goog-Upload-Command", "upload, finalize");
    xhr.setRequestHeader("X-Goog-Upload-Offset", "0");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.responseText) : reject(new ApiError(`Upload to Gemini failed (HTTP ${xhr.status}).`, xhr.status)));
    xhr.onerror = () => reject(new ApiError("Upload to Gemini was blocked or lost. Check your connection and try again.", 0));
    xhr.onabort = () => reject(new ApiError("Upload cancelled.", 0));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });

  const parsed = JSON.parse(raw) as { file?: { name?: string; uri?: string; mimeType?: string; state?: string } };
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
