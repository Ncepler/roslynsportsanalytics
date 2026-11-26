// Plain-English messages for Gemini failures, and a small capped retry for rate limits. No SDK import, so tests can
// use it without mocking anything.

/** What a member sees when Google says the prepaid balance is $0 (HTTP 402). A retry can't fix it, so none is made. */
export const OUT_OF_CREDIT_MESSAGE = "Gemini credit is used up, so the AI can't run right now. Add credit in Google AI Studio (Billing), then try again. Nothing was lost.";

/** What a member sees when Google is limiting requests (HTTP 429) and the retries below didn't clear it. */
export const RATE_LIMIT_MESSAGE = "Gemini is busy right now (rate limit), and waiting a few seconds didn't clear it. Wait a minute, then try again.";

/** The key itself was refused. The site never shows the key. */
export const BAD_KEY_MESSAGE = "Gemini refused the API key. Check GEMINI_API_KEY in Vercel (paste the whole key, nothing cut off), then redeploy.";

/** The message for a status code we know the meaning of, or null for anything else. */
export function geminiStatusMessage(status: number | undefined): string | null {
  if (status === 402) return OUT_OF_CREDIT_MESSAGE;
  if (status === 429) return RATE_LIMIT_MESSAGE;
  if (status === 401 || status === 403) return BAD_KEY_MESSAGE;
  return null;
}

/** For a background run that ended with an error text instead of a status code. */
export function plainGeminiFailure(message: string): string {
  if (/RESOURCE_EXHAUSTED|quota|rate.?limit|429/i.test(message)) return RATE_LIMIT_MESSAGE;
  if (/billing|insufficient|out of credit|payment required|402/i.test(message)) return OUT_OF_CREDIT_MESSAGE;
  if (/API_KEY_INVALID|api key not valid|permission.?denied|unauthenticated/i.test(message)) return BAD_KEY_MESSAGE;
  return message;
}

export const statusOf = (err: unknown): number | undefined => {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
};

/** Waits 2 s, then 5 s, then 10 s between tries (3 retries, so at most 4 attempts and about 17 s of waiting). */
export const RETRY_DELAYS_MS = [2000, 5000, 10000] as const;

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Runs `call`. A 429 (rate limit) is retried with a growing wait, a small capped number of times. Everything else,
 * and above all a 402 (out of credit), is thrown at once: retrying cannot fix it and would only repeat the failure.
 */
export async function withGeminiRetry<T>(call: () => Promise<T>, sleep: (ms: number) => Promise<void> = realSleep): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (statusOf(err) !== 429 || attempt >= RETRY_DELAYS_MS.length) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}
