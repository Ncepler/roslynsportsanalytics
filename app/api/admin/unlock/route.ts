import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { allowAttempt, clientIp } from "@/lib/auth/rate-limit";
import { safeEqual, signToken } from "@/lib/auth/session";

// Owner-only unlock for the Roslyn-game check (Noah's Nov 9 decision, see
// CLAUDE.md section 3 rule 9). The code lives only in the ADMIN_BYPASS_CODE
// env var, never in the code or the browser bundle. With the var unset the
// feature does not exist. A wrong code gets the same plain "no" as always.
export async function POST(request: Request) {
  if (!allowAttempt(`admin:${clientIp(request)}`, 10)) return jsonError(429, "Too many tries.");
  const expected = process.env.ADMIN_BYPASS_CODE;
  const body = await readJson<{ code?: unknown }>(request);
  const code = typeof body?.code === "string" ? body.code : "";
  if (!expected || !code || !(await safeEqual(code, expected))) return NextResponse.json({ ok: false });
  return NextResponse.json({ ok: true, token: await signToken({ t: "admin" }, 6 * 60 * 60) });
}
