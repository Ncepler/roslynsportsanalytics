// Signed session cookie. Web Crypto only (no Node APIs), so this runs in
// proxy.ts, route handlers, and server components alike.
//
// Token format: base64url(JSON payload) + "." + base64url(HMAC-SHA256 of the payload part).

export const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
} as const;

// Roles (CLAUDE.md, Nov 13): demo sees only the /test simulation; member uses the real site;
// admin is a member plus /admin. The role is inside the signed cookie, so it can't be edited in the browser.
export const ROLES = ["demo", "member", "admin"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Can this role use the real site (database, Gemini)? Demo cannot. */
export const canUseSite = (role: Role | null): boolean => role === "member" || role === "admin";
export const isAdminRole = (role: Role | null): boolean => role === "admin";

// Each cookie carries a short fingerprint of what granted it: the password that was typed, or the Test button
// setting. On every request the fingerprint must still match the current settings, so changing CLUB_PASSWORD or
// ADMIN_PASSWORD logs out everyone who used the old one, and turning the Test button off (or changing
// TEST_LOGIN_ROLE) logs out everyone who got in through it. Cookies without a fingerprint are rejected.
type SessionPayload = { exp: number; role: Role; k: string };

/** Test button role: whatever TEST_LOGIN_ROLE says (admin | member | demo), and demo if it is unset or invalid. */
export function testLoginRole(): Role {
  const wanted = process.env.TEST_LOGIN_ROLE;
  return isRole(wanted) ? wanted : "demo";
}

export const testLoginEnabled = () => process.env.ALLOW_TEST_LOGIN === "true";

export type SessionSource = { kind: "password"; password: string } | { kind: "test" };

const fingerprintCache = new Map<string, Promise<string>>();

function fingerprint(role: Role, source: SessionSource): Promise<string> {
  const input = source.kind === "test" ? `test:${role}` : `pw:${role}:${source.password}`;
  let fp = fingerprintCache.get(input);
  if (!fp) {
    fp = getKey()
      .then((key) => crypto.subtle.sign("HMAC", key, encoder.encode(`fp.${input}`)))
      .then((sig) => toBase64Url(new Uint8Array(sig)).slice(0, 22));
    if (fingerprintCache.size > 20) fingerprintCache.clear();
    fingerprintCache.set(input, fp);
  }
  return fp;
}

/** Fingerprints that are valid right now for this role, from the current env settings. */
async function currentFingerprints(role: Role): Promise<string[]> {
  const out: string[] = [];
  const password = role === "admin" ? process.env.ADMIN_PASSWORD : role === "member" ? process.env.CLUB_PASSWORD : undefined;
  if (password) out.push(await fingerprint(role, { kind: "password", password }));
  if (testLoginEnabled() && testLoginRole() === role) out.push(await fingerprint(role, { kind: "test" }));
  return out;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

let keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET is missing or shorter than 32 characters.");
  }
  keyPromise ??= crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return keyPromise;
}

export async function createSessionToken(role: Role, source: SessionSource): Promise<string> {
  const payload: SessionPayload = { exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS, role, k: await fingerprint(role, source) };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await getKey(), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** The role in a valid, unexpired session cookie; null otherwise (including old cookies with no role). */
export async function verifySessionToken(token: string | undefined): Promise<Role | null> {
  if (!token) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;

  const signatureBytes = fromBase64Url(signature);
  if (!signatureBytes) return null;

  // crypto.subtle.verify compares the signature in constant time.
  const valid = await crypto.subtle.verify("HMAC", await getKey(), signatureBytes, encoder.encode(body));
  if (!valid) return null;

  const payloadBytes = fromBase64Url(body);
  if (!payloadBytes) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<SessionPayload>;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000) return null;
    if (!isRole(payload.role) || typeof payload.k !== "string") return null;
    // Still granted by the current password or Test setting? (Both are fixed-length HMAC prefixes.)
    return (await currentFingerprints(payload.role)).includes(payload.k) ? payload.role : null;
  } catch {
    return null;
  }
}

// Constant-time string equality: HMAC both inputs with the session key, then
// let crypto.subtle.verify compare the digests. Equal-length digests mean the
// comparison time does not depend on where the inputs differ or on their length.
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const key = await getKey();
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(a));
  return crypto.subtle.verify("HMAC", key, digest, encoder.encode(b));
}

// ---------- signed tokens for server-issued passes (e.g. the Roslyn-game check) ----------

/**
 * Signs a small JSON payload with the session secret, with an expiry. Used for
 * passes the server issues and later requires (it can't be forged in the
 * browser, so there is no client-side bypass).
 */
export async function signToken(payload: Record<string, unknown>, ttlSeconds: number): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })));
  const signature = await crypto.subtle.sign("HMAC", await getKey(), encoder.encode(`tok.${body}`));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** The payload of a valid, unexpired token from signToken; null otherwise. */
export async function verifyToken(token: unknown): Promise<Record<string, unknown> | null> {
  if (typeof token !== "string" || token.length > 4000) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const sig = fromBase64Url(signature);
  if (!sig) return null;
  // The "tok." prefix keeps these tokens from ever validating as session cookies (and vice versa).
  if (!(await crypto.subtle.verify("HMAC", await getKey(), sig, encoder.encode(`tok.${body}`)))) return null;
  const bytes = fromBase64Url(body);
  if (!bytes) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    return typeof payload.exp === "number" && payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

// ---------- owner token (what the owner-unlock code returns; only Noah has the code) ----------

// Separate token type from the session cookie, so one can never pass as the other.
export async function createOwnerToken(): Promise<string> {
  return signToken({ t: "owner" }, 6 * 60 * 60);
}

export async function verifyOwnerToken(token: unknown): Promise<boolean> {
  return (await verifyToken(token))?.t === "owner";
}
