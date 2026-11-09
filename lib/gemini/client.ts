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
  return uploadUrl;
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
