// Limits shared by the client and the API routes. No secrets here.

/** 2 GB: the safe Files API limit until a bigger upload is tested (CLAUDE.md section 16). */
export const MAX_UPLOAD_BYTES = 2 * 1024 ** 3;

/** Longest stretch of video analyzed in one run (cost guard, section 6). */
export const MAX_RUN_SECONDS = 2 * 60 * 60;

/** Estimated cost above which the user must confirm before analyzing. */
export const CONFIRM_ABOVE_USD = 0.5;

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/mov",
  "video/webm",
  "video/mpeg",
  "video/x-m4v",
  "video/3gpp",
  "video/avi",
  "video/x-msvideo",
]);

export function isAllowedVideoType(mime: string): boolean {
  return VIDEO_TYPES.has(mime.toLowerCase());
}

/** Gemini file names look like "files/abc123". Reject anything else. */
export function isGeminiFileName(name: unknown): name is string {
  return typeof name === "string" && /^files\/[a-z0-9-]{1,64}$/i.test(name);
}
