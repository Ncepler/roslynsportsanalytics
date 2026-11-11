import { NextResponse } from "next/server";
import { allowAttempt, clientIp } from "@/lib/auth/rate-limit";
import { ADMIN_COOKIE, createAdminToken, createSessionToken, safeEqual, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

type LoginBody = { mode?: unknown; password?: unknown };

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  if (!allowAttempt(clientIp(request))) {
    return fail(429, "Too many attempts. Wait a minute and try again.");
  }

  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return fail(400, "Invalid request.");
  }

  let admin = false;
  if (body.mode === "test") {
    // TEMPORARY TEST LOGIN BYPASS. Risk: while ALLOW_TEST_LOGIN is "true",
    // anyone who finds the URL gets in and can spend the club's API credits.
    // Mitigations: keep the deployed URL private, turn on Vercel Deployment
    // Protection, use only the free Gemini key while this is on, and set
    // ALLOW_TEST_LOGIN=false (and remove the Test button) before adding a paid key.
    if (process.env.ALLOW_TEST_LOGIN !== "true") {
      return fail(403, "Test login is turned off.");
    }
  } else if (body.mode === "password") {
    const expected = process.env.CLUB_PASSWORD;
    const given = typeof body.password === "string" ? body.password : "";
    // No configured password, or an empty attempt, always fails.
    if (!expected || !given || !(await safeEqual(given, expected))) {
      return fail(401, "Wrong password.");
    }
  } else if (body.mode === "admin-test") {
    // TEMPORARY ADMIN TEST BUTTON. Same risk as the Test button, plus it lets
    // whoever finds the URL edit the schedule and reopen games. Set
    // ALLOW_ADMIN_TEST=false and use ADMIN_PASSWORD before real use.
    if (process.env.ALLOW_ADMIN_TEST !== "true") {
      return fail(403, "Admin test login is turned off.");
    }
    admin = true;
  } else if (body.mode === "admin-password") {
    const expected = process.env.ADMIN_PASSWORD;
    const given = typeof body.password === "string" ? body.password : "";
    if (!expected || !given || !(await safeEqual(given, expected))) {
      return fail(401, "Wrong admin password.");
    }
    admin = true;
  } else {
    return fail(400, "Invalid request.");
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  // An admin is also a member. The admin cookie is separate so members never get it.
  if (admin) response.cookies.set(ADMIN_COOKIE, await createAdminToken(), sessionCookieOptions);
  return response;
}
