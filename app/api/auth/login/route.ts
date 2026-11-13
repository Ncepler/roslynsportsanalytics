import { NextResponse } from "next/server";
import { allowAttempt, clientIp } from "@/lib/auth/rate-limit";
import { safeNext } from "@/lib/auth/redirect";
import { createSessionToken, isRole, safeEqual, SESSION_COOKIE, sessionCookieOptions, type Role } from "@/lib/auth/session";

type LoginBody = { mode?: unknown; password?: unknown; next?: unknown };

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Test button role. In a production build it is ALWAYS demo, whatever the env says. */
function testRole(): Role {
  if (process.env.NODE_ENV === "production") return "demo";
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
    // TEST LOGIN. The deployed URL has been shared with school staff, so in production
    // this only ever grants "demo": the fake-data simulation, no database, no AI calls.
    // Locally, TEST_LOGIN_ROLE (admin | member | demo) picks the role.
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
