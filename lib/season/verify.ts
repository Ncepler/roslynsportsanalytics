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
const NON_DATA = [/\bper 100\b/gi, /\b[123]-?(?:point(?:er)?s?|pt|pts)\b/gi, /\b(?:two|three)[-\s]point(?:er)?s?\b/gi, /\bthree[-\s]?(?:pt|pts)\b/gi, /\b(?:q|quarter )[1-4]\b/gi, /\b\d+(?:st|nd|rd|th)\b/gi, /\bp[1-3]\b/gi, /\bperiod [1-3]\b/gi];

// Spelled-out numbers are checked too, so "twelve turnovers" can't slip past the digit check. "one" is left out
// on purpose ("one of the", "one more"); every other count word is turned into digits before checking.
const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, dozen: 12,
};
const TENS = /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[-\s](one|two|three|four|five|six|seven|eight|nine)\b/gi;
const ONES: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const WORD = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join("|")})\\b`, "gi");

function wordsToDigits(text: string): string {
  return text
    .replace(TENS, (_, t: string, o: string) => String(NUMBER_WORDS[t.toLowerCase()] + ONES[o.toLowerCase()]))
    .replace(WORD, (w) => String(NUMBER_WORDS[w.toLowerCase()]));
}

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
    scrubbed = wordsToDigits(scrubbed);
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
