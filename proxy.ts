import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

// Gate for every page and every API route (CLAUDE.md section 3, rule 7), with roles:
//   demo   -> only the /test simulation (no database, no AI).
//   member -> everything except /admin and /api/admin/*.
//   admin  -> everything.
// Public: /login and /api/auth/*. Next's build assets are excluded by the matcher.
// The matcher deliberately does not skip paths by file extension, so a route
// like /api/report.csv can't slip past the gate. API routes check the role again (lib/api.ts).
const DEMO_STATIC = new Set(["/icon.svg", "/apple-icon.png"]);

const isTestPath = (p: string) => p === "/test" || p.startsWith("/test/");
const isAdminPath = (p: string) => p === "/admin" || p.startsWith("/admin/") || p === "/api/admin" || p.startsWith("/api/admin/");

// Next ignores the status on a rewrite, so the 403 page is returned from here. Self-contained on purpose.
const ADMINS_ONLY_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admins only · Roslyn Film Analyzer</title><meta name="color-scheme" content="light dark"><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;padding:1rem;box-sizing:border-box}main{max-width:26rem}h1{font-size:1.75rem;letter-spacing:-.02em;margin:0 0 .5rem}p{margin:0 0 1.25rem;opacity:.75}a{display:inline-block;margin-right:.5rem;padding:.6rem 1rem;border-radius:.6rem;border:1px solid currentColor;color:inherit;text-decoration:none}</style></head><body><main><h1>Admins only</h1><p>You're signed in with the club password, which can't open this page. If you're an admin, log in again with the admin password.</p><a href="/login?next=/admin">Log in as admin</a><a href="/">Back to the site</a></main></body></html>`;

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  if (pathname.startsWith("/api/auth/")) return NextResponse.next();
  if (pathname === "/login") return NextResponse.next();

  const role = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (!role) {
    if (isApi) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  if (role === "demo") {
    if (isApi) return NextResponse.json({ error: "The demo can't use this. Log in with the club password." }, { status: 403 });
    if (isTestPath(pathname) || DEMO_STATIC.has(pathname)) return NextResponse.next();
    return NextResponse.redirect(new URL("/test", request.url));
  }

  if (isAdminPath(pathname) && role !== "admin") {
    if (isApi) return NextResponse.json({ error: "Admins only." }, { status: 403 });
    // A signed-in member gets a real 403 page, not a redirect (no login loop).
    return new NextResponse(ADMINS_ONLY_HTML, { status: 403, headers: { "content-type": "text/html; charset=utf-8" } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico$).*)"],
};
