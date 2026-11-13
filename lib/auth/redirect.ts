// Only same-site relative paths may be used as a post-login destination (no open redirect).
// Pure string logic, so the proxy, the login API and tests can all share it.
const DUMMY_ORIGIN = "http://same-site.invalid";

/** The normalized path+query if `value` is a safe same-site path; otherwise null. */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) return null;
  if (value[0] !== "/" || value[1] === "/" || value[1] === "\\") return null;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, DUMMY_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== DUMMY_ORIGIN) return null;
  const path = url.pathname;
  // Never bounce back into login or to an API response.
  if (path === "/login" || path.startsWith("/login/") || path === "/api" || path.startsWith("/api/")) return null;
  return path + url.search;
}
