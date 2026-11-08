// Checks that every number in the AI's Season text came from the code's
// computed data (CLAUDE.md section 13). Sentences with any other number are
// removed and counted, so the AI can never put a new number in front of a
// student.

/** Every number in the computed payload, in the forms a writer might quote it. */
export function allowedNumbers(data: unknown): number[] {
  const out: number[] = [];
  const walk = (v: unknown, key = "") => {
    if (typeof v === "number" && Number.isFinite(v)) {
      out.push(v, Math.abs(v));
      // A share like 0.62 may be quoted as 62%; a correlation (r) never is.
      if (Math.abs(v) <= 1 && key !== "r") out.push(Math.abs(v) * 100);
    } else if (typeof v === "string") {
      for (const m of v.match(/-?\d+(?:\.\d+)?/g) ?? []) out.push(Math.abs(Number(m)));
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, k));
  };
  walk(data);
  return out;
}

/** Number words that aren't data: "3-pointers", "Q3", "2-point", "M / Z / F" etc. */
const NON_DATA = [/\bper 100\b/gi, /\b[123]-?(?:point(?:er)?s?|pt|pts)\b/gi, /\b(?:q|quarter )[1-4]\b/gi, /\bthree(?:-point(?:er)?s?)?\b/gi];

/** A written number matches a computed one if it equals it at the precision the writer used. */
function matches(written: string, allowed: number[]): boolean {
  const value = Math.abs(Number(written));
  const decimals = written.includes(".") ? written.split(".")[1].length : 0;
  const tolerance = 0.5 * 10 ** -decimals + 1e-9;
  return allowed.some((a) => Math.abs(a - value) <= tolerance);
}

export type Verified = { text: string; removed: string[] };

export function verifyText(text: string, allowed: number[]): Verified {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  const kept: string[] = [];
  const removed: string[] = [];
  for (const sentence of sentences) {
    let scrubbed = sentence;
    for (const re of NON_DATA) scrubbed = scrubbed.replace(re, "");
    const numbers = scrubbed.match(/-?\d+(?:\.\d+)?/g) ?? [];
    if (numbers.every((n) => matches(n, allowed))) kept.push(sentence);
    else removed.push(sentence);
  }
  return { text: kept.join(" "), removed };
}

export function verifyList(items: string[], allowed: number[]): { items: string[]; removed: string[] } {
  const keptItems: string[] = [];
  const removed: string[] = [];
  for (const item of items) {
    const v = verifyText(item, allowed);
    if (v.removed.length === 0) keptItems.push(item);
    else removed.push(item);
  }
  return { items: keptItems, removed };
}
