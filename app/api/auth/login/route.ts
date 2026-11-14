import { NextResponse } from "next/server";
import { allowAttempt, clientIp } from "@/lib/auth/rate-limit";
import { safeNext } from "@/lib/auth/redirect";
import { createSessionToken, isRole, safeEqual, SESSION_COOKIE, sessionCookieOptions, type Role } from "@/lib/auth/session";

type LoginBody = { mode?: unknown; password?: unknown; next?: unknown };

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Test button role: whatever TEST_LOGIN_ROLE says (admin | member | demo), and demo if it is unset or invalid. */
function testRole(): Role {
  const wanted = process.env.TEST_LOGIN_ROLE;
  return isRole(wanted) ? wanted : "demo";
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

  let role: Role;
  if (body.mode === "test") {
    // TEST LOGIN: a stand-in for a password until the real passwords are set (Noah, Nov 14). While
    // ALLOW_TEST_LOGIN is "true", anyone who has the URL gets the role in TEST_LOGIN_ROLE, so setting that
    // to admin or member gives them real data and lets them spend API credits. When the passwords are set,
    // set ALLOW_TEST_LOGIN=false (and unset TEST_LOGIN_ROLE) and redeploy.
    if (process.env.ALLOW_TEST_LOGIN !== "true") {
      return fail(403, "Test login is turned off.");
    }
    role = testRole();
  } else if (body.mode === "password") {
    const given = typeof body.password === "string" ? body.password : "";
    const adminPassword = process.env.ADMIN_PASSWORD;
    const clubPassword = process.env.CLUB_PASSWORD;
    // Run both comparisons every time. An unset or empty password, or an empty attempt, never matches.
    const isAdmin = Boolean(adminPassword && given) && (await safeEqual(given, adminPassword as string));
    const isMember = Boolean(clubPassword && given) && (await safeEqual(given, clubPassword as string));
    if (isAdmin) role = "admin";
    else if (isMember) role = "member";
    else return fail(401, "Wrong password.");
  } else {
    return fail(400, "Invalid request.");
  }

  // Demo users can only see /test. Everyone else returns to where they were headed (same-site paths only).
  const redirect = role === "demo" ? "/test" : (safeNext(body.next) ?? "/");

  const response = NextResponse.json({ ok: true, role, redirect });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(role), sessionCookieOptions);
  return response;
}
