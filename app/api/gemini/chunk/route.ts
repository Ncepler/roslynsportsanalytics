import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { allowAttempt, clientIp } from "@/lib/auth/rate-limit";
import { verifyToken } from "@/lib/auth/session";
import { GEMINI_HOST } from "@/lib/gemini/client";

export const maxDuration = 60;

// Passes one piece (at most 4 MiB, under Vercel's 4.5 MB body limit) of the
// video on to Gemini's upload session and forgets it. Nothing is stored or
// logged. Browsers can't upload to Google directly (CORS), so this relays.
// The target URL comes from a signed ticket, never from the browser.
export async function POST(request: Request) {
  if (!allowAttempt(`chunk:${clientIp(request)}`, 1200)) return jsonError(429, "Too many requests. Wait a minute and try again.");
  const params = new URL(request.url).searchParams;
  const ticket = await verifyToken(params.get("ticket"));
  const uploadUrl = ticket?.t === "upload" && typeof ticket.uploadUrl === "string" ? ticket.uploadUrl : null;
  if (!uploadUrl || !uploadUrl.startsWith(`${GEMINI_HOST}/`)) return jsonError(403, "Invalid upload.");
  const offset = Number(params.get("offset"));
  if (!Number.isInteger(offset) || offset < 0) return jsonError(400, "Bad offset.");
  const last = params.get("last") === "1";

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > 4 * 1024 * 1024) return jsonError(400, "Bad chunk size.");

  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(bytes.byteLength),
        "X-Goog-Upload-Offset": String(offset),
        "X-Goog-Upload-Command": last ? "upload, finalize" : "upload",
      },
      body: bytes,
    });
  } catch {
    return jsonError(502, "Couldn't reach Gemini while uploading. Try again.");
  }
  const text = await res.text();
  if (!res.ok) return jsonError(502, `Gemini rejected part of the upload (HTTP ${res.status}).`);
  return last ? NextResponse.json({ file: JSON.parse(text).file }) : NextResponse.json({ ok: true });
}
