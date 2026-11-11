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

type SessionPayload = { exp: number };

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

export async function createSessionToken(): Promise<string> {
  const payload: SessionPayload = { exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await getKey(), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return false;

  const signatureBytes = fromBase64Url(signature);
  if (!signatureBytes) return false;

  // crypto.subtle.verify compares the signature in constant time.
  const valid = await crypto.subtle.verify("HMAC", await getKey(), signatureBytes, encoder.encode(body));
  if (!valid) return false;

  const payloadBytes = fromBase64Url(body);
  if (!payloadBytes) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<SessionPayload>;
    return typeof payload.exp === "number" && payload.exp > Date.now() / 1000;
  } catch {
    return false;
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

// ---------- admin cookie (a second signed cookie, set only by an admin login) ----------

export const ADMIN_COOKIE = "admin";

export async function createAdminToken(): Promise<string> {
  return signToken({ t: "admin" }, SESSION_TTL_SECONDS);
}

export async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  return (await verifyToken(token))?.t === "admin";
}
