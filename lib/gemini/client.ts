// Server-only Gemini access. Never import this from a client component:
// it reads GEMINI_API_KEY.
import { GoogleGenAI, PartMediaResolutionLevel } from "@google/genai";
import type { PossessionLog } from "./log-types";

export const GEMINI_HOST = "https://generativelanguage.googleapis.com";

export type Resolution = "low" | "high";

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiConfigError("GEMINI_API_KEY is not set.");
  return key;
}

export class GeminiConfigError extends Error {}

let client: GoogleGenAI | null = null;
export function gemini(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: apiKey() });
  return client;
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.8-flash";
}

export type GeminiDiagnosis = { kind: "key" } | { kind: "model"; model: string; available: string[] } | { kind: "request"; detail: string } | { kind: "unknown" };

/**
 * Gemini's newer API answers a bad key, a wrong model name and a malformed request with the same opaque 400, so the
 * site asks Google two tiny questions to tell them apart: is the model there for this key? Never returns the key.
 */
export async function diagnoseGemini(err: unknown): Promise<GeminiDiagnosis> {
  const model = geminiModel();
  try {
    await gemini().models.get({ model });
    // The key works and the model exists: the request itself was refused.
    const detail = (err instanceof Error ? err.message : "").replace(/\s+/g, " ").slice(0, 160);
    return { kind: "request", detail };
  } catch (e) {
    const status = (e as { status?: number }).status;
    const text = e instanceof Error ? e.message : "";
    if (/api[_ ]key|API_KEY_INVALID/i.test(text) || status === 401 || status === 403) return { kind: "key" };
    if (status === 404 || /not found|not supported/i.test(text)) {
      let available: string[] = [];
      try {
        for await (const m of await gemini().models.list()) {
          const name = (m.name ?? "").replace("models/", "");
          if (/^gemini-.*(flash|pro)/.test(name) && !/(image|tts|embedding|live|audio|vision)/.test(name)) available.push(name);
          if (available.length >= 8) break;
        }
      } catch {
        available = [];
      }
      return { kind: "model", model, available };
    }
    return { kind: "unknown" };
  }
}

const seconds = (s: number) => `${Math.max(0, s).toFixed(1)}s`;

/**
 * Starts a resumable Files API upload and returns the session URL. The browser
 * sends the bytes straight to that URL, so the video never passes through
 * Vercel and the key never reaches the browser.
 */
export async function startResumableUpload(opts: { size: number; mimeType: string; displayName: string }) {
  const res = await fetch(`${GEMINI_HOST}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey(),
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(opts.size),
      "X-Goog-Upload-Header-Content-Type": opts.mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: opts.displayName } }),
  });
  const uploadUrl = res.headers.get("x-goog-upload-url");
  if (!res.ok || !uploadUrl) {
    throw Object.assign(new Error(`Gemini refused the upload session (HTTP ${res.status}).`), { status: res.status });
  }
  // Google says what piece size it accepts (every piece but the last must be a multiple of it).
  const granularity = Number(res.headers.get("x-goog-upload-chunk-granularity")) || 262144;
  return { uploadUrl, granularity };
}

export async function getFile(name: string) {
  const file = await gemini().files.get({ name });
  return { name: file.name, uri: file.uri, mimeType: file.mimeType, state: file.state, error: file.error?.message ?? null };
}

export async function deleteFile(name: string) {
  await gemini().files.delete({ name });
}

/** Real token count for a time range of an uploaded video at a resolution. */
export async function countVideoTokens(opts: { uri: string; mimeType: string; start: number; end: number; resolution: Resolution; fps?: number }) {
  const res = await gemini().models.countTokens({
    model: geminiModel(),
    contents: [
      {
        role: "user",
        parts: [
          {
            fileData: { fileUri: opts.uri, mimeType: opts.mimeType },
            videoMetadata: { startOffset: seconds(opts.start), endOffset: seconds(opts.end), fps: opts.fps },
            mediaResolution: {
              level: opts.resolution === "high" ? PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH : PartMediaResolutionLevel.MEDIA_RESOLUTION_LOW,
            },
          },
        ],
      },
    ],
  });
  return res.totalTokens ?? null;
}

/** One short, text-only request that must answer in JSON matching `schema` (no video, nothing stored by Gemini). */
export async function generateJson(opts: { prompt: string; schema: Record<string, unknown>; temperature?: number }): Promise<string> {
  const interaction = await gemini().interactions.create({
    model: geminiModel(),
    store: false,
    input: [{ type: "text", text: opts.prompt }],
    generation_config: { temperature: opts.temperature ?? 0.2 },
    response_format: { type: "text", mime_type: "application/json", schema: opts.schema },
  });
  return interaction.output_text ?? "";
}

/** One request with up to a few pictures that must answer in JSON matching `schema` (nothing stored by Gemini). */
export async function generateJsonFromImages(opts: { prompt: string; images: { mediaType: string; data: string }[]; schema: Record<string, unknown> }): Promise<string> {
  const interaction = await gemini().interactions.create({
    model: geminiModel(),
    store: false,
    input: [
      ...opts.images.map((i) => ({ type: "image" as const, data: i.data, mime_type: i.mediaType as "image/jpeg" })),
      { type: "text" as const, text: opts.prompt },
    ],
    generation_config: { temperature: 0 },
    response_format: { type: "text", mime_type: "application/json", schema: opts.schema },
  });
  return interaction.output_text ?? "";
}

/** Starts a background analysis; returns the interaction id to poll. */
export async function startVideoInteraction(opts: {
  uri: string;
  mimeType: string;
  start: number;
  end: number;
  resolution: Resolution;
  fps?: number;
  prompt: string;
  schema: Record<string, unknown>;
}) {
  const interaction = await gemini().interactions.create({
    model: geminiModel(),
    background: true,
    store: true,
    input: [
      {
        type: "video",
        uri: opts.uri,
        mime_type: opts.mimeType,
        resolution: opts.resolution,
        processing: { type: "static", start_offset: seconds(opts.start), end_offset: seconds(opts.end), fps: opts.fps },
      },
      { type: "text", text: opts.prompt },
    ],
    generation_config: { temperature: 0.1 },
    response_format: { type: "text", mime_type: "application/json", schema: opts.schema },
  });
  return interaction.id;
}

/** Starts a background request on several short clips of one video (the Roslyn-game check). */
export async function startClipsInteraction(opts: {
  uri: string;
  mimeType: string;
  clips: { start: number; end: number }[];
  resolution: Resolution;
  prompt: string;
  schema: Record<string, unknown>;
}) {
  const interaction = await gemini().interactions.create({
    model: geminiModel(),
    background: true,
    store: true,
    input: [
      ...opts.clips.map((c) => ({
        type: "video" as const,
        uri: opts.uri,
        mime_type: opts.mimeType,
        resolution: opts.resolution,
        processing: { type: "static" as const, start_offset: seconds(c.start), end_offset: seconds(c.end) },
      })),
      { type: "text" as const, text: opts.prompt },
    ],
    generation_config: { temperature: 0 },
    response_format: { type: "text", mime_type: "application/json", schema: opts.schema },
  });
  return interaction.id;
}

export type InteractionResult =
  | { status: "running" }
  | { status: "failed"; error: string }
  | { status: "done"; text: string; inputTokens: number | null; outputTokens: number | null };

export async function getVideoInteraction(id: string): Promise<InteractionResult> {
  const it = await gemini().interactions.get(id);
  if (it.status === "completed") {
    return {
      status: "done",
      text: it.output_text ?? "",
      inputTokens: it.usage?.total_input_tokens ?? null,
      outputTokens: it.usage?.total_output_tokens ?? null,
    };
  }
  if (it.status === "in_progress" || it.status === "queued") return { status: "running" };
  const message = it.errors?.map((e) => (e as { message?: string }).message).filter(Boolean).join("; ");
  return { status: "failed", error: message || `Analysis ended with status "${it.status}".` };
}

export function parsePossessionLog(text: string): PossessionLog {
  const parsed = JSON.parse(text) as Partial<PossessionLog>;
  return {
    possessions: Array.isArray(parsed.possessions) ? parsed.possessions : [],
    scoreboard: Array.isArray(parsed.scoreboard) ? parsed.scoreboard : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
  };
}
