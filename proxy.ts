import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, SESSION_COOKIE, verifyAdminToken, verifySessionToken } from "@/lib/auth/session";

// Gate for every page and every API route (CLAUDE.md section 3, rule 7).
// Public: /login and /api/auth/*. Next's build assets are excluded by the matcher.
// The matcher deliberately does not skip paths by file extension, so a route
// like /api/report.csv can't slip past the gate.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  if (pathname.startsWith("/api/auth/")) return NextResponse.next();

  const authed = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    // A member who needs the admin login is sent here with ?admin, so don't bounce them back.
    const wantsAdmin = request.nextUrl.searchParams.has("admin");
    return authed && !wantsAdmin ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }

  // Admin-only: the /admin page and /api/admin/* (the owner-unlock route stays member-level).
  const adminOnly = pathname === "/admin" || pathname.startsWith("/admin/") || (pathname.startsWith("/api/admin/") && pathname !== "/api/admin/unlock");
  if (adminOnly && !(authed && (await verifyAdminToken(request.cookies.get(ADMIN_COOKIE)?.value)))) {
    if (isApi) return NextResponse.json({ error: authed ? "Admins only." : "Not signed in." }, { status: authed ? 403 : 401 });
    return NextResponse.redirect(new URL("/login?admin=1", request.url));
  }

  if (authed) return NextResponse.next();

  if (isApi) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico$).*)"],
};
