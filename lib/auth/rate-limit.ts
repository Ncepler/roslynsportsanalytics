// Fixed-window, in-memory rate limit keyed by IP.
//
// Best-effort only: on Vercel each serverless instance has its own memory, and
// instances come and go, so an attacker spread across instances (or hitting a
// cold start) gets more attempts than the limit. Good enough to slow casual
// guessing; a shared store (e.g. Redis) would be needed for a hard limit.

const WINDOW_MS = 60_000;

const attempts = new Map<string, { count: number; windowStart: number }>();

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/**
 * Records one attempt. Returns false when the key is over `max` per minute.
 * Default 10 suits login; API routes pass a higher limit (clients poll).
 */
export function allowAttempt(key: string, max = 10): boolean {
  const now = Date.now();

  // Drop expired windows so the map can't grow without bound.
  if (attempts.size > 1000) {
    for (const [k, v] of attempts) if (now - v.windowStart >= WINDOW_MS) attempts.delete(k);
  }

  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}
