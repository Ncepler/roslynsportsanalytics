// Builds lib/sports/generated/sports.ts from the three docs in docs/sports/.
// Run: npm run build:sports   (node --experimental-strip-types, no extra dependencies)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Sport, Stat, VideoReliability } from "../lib/sports/registry-types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docs = (f: string) => readFileSync(join(root, "docs/sports", f), "utf8");
const KEY = docs("sports-analytics-key-stats.md");
const GEM = docs("gemini-models-fps-by-sport.md");

// Dropdown order (from the brief). Ids match lib/teams/options.ts.
const ORDER = ["Basketball", "Lacrosse", "Volleyball", "Soccer", "Football", "Flag Football", "Baseball", "Softball", "Tennis", "Track", "Cross Country", "Swimming", "Wrestling", "Water Polo", "Field Hockey", "Ice Hockey", "Golf", "Badminton", "Bowling", "Fencing", "Gymnastics", "Cheerleading"];
const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Doc heading -> dropdown name where they differ.
const HEADING_ALIAS: Record<string, string> = { "FOOTBALL (11-MAN TACKLE)": "Football", "TRACK AND FIELD": "Track" };
const aliasOf = (h: string) => HEADING_ALIAS[h.toUpperCase()];
const SCOREBOARD_ONLY = new Set(["gymnastics", "fencing"]);

// Real Hudl caveats from docs/sports/hudl-video-inventory.md (the only hand-entered facts here).
const HUDL_NOTES: Record<string, string> = {
  basketball: "Boys JHS and Girls JHS have no game video.",
  volleyball: "Girls JHS has no video.",
  soccer: "Girls JHS has no video.",
  lacrosse: "Girls JHS has no video.",
  badminton: "Mens Varsity has only one video (Sep 17 2026); Womens Varsity has many.",
  football: "Boys Varsity: no video this fall (last seen Nov 1 2025). Boys JV: 2 games from 2024 only. Boys JHS: none.",
  gymnastics: "Womens Varsity only.",
  wrestling: "Boys Varsity only.",
  baseball: "Hudl team exists (Mens Varsity, Boys JV) but has no video.",
  softball: "Hudl team exists (Womens Varsity, Girls JHS) but has no video.",
  "water-polo": "Hudl team exists (Greenwich aquatics) but has no video.",
};

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const isSep = (line: string) => /^\|[\s:|-]+\|$/.test(line.trim());
const strip = (s: string) => s.replace(/\*\*/g, "").trim();

function videoLetter(raw: string): VideoReliability {
  const letters: string[] = raw.replace(/\([^)]*\)/g, "").match(/[HML]/g) ?? [];
  if (letters.length === 0) throw new Error(`No H/M/L in video cell: "${raw}"`);
  return letters.includes("L") ? "L" : letters.includes("M") ? "M" : "H";
}

function parseTable(lines: string[], start: number, tier: Stat["tier"], group: string, universal: boolean, ids: Set<string>): { stats: Stat[]; rows: number; next: number } {
  let i = start;
  const stats: Stat[] = [];
  let rows = 0;
  while (i < lines.length && lines[i].trim().startsWith("|")) {
    const line = lines[i++];
    if (isSep(line)) continue;
    const c = cells(line);
    if (c.length !== 3) throw new Error(`Expected 3 cells, got ${c.length}: ${line}`);
    if (c[0] === "Stat") continue; // header
    rows++;
    const full = strip(c[0]);
    const eq = full.indexOf(" = ");
    const name = eq >= 0 ? full.slice(0, eq).trim() : full;
    const formula = eq >= 0 ? full.slice(eq + 3).trim() : undefined;
    let id = slug(name);
    for (let n = 2; ids.has(id); n++) id = `${slug(name)}-${n}`;
    ids.add(id);
    const stat: Stat = { id, name, tier, group, lookFor: strip(c[1]), video: videoLetter(c[2]), videoRaw: c[2], universal };
    if (formula) stat.formula = formula;
    stats.push(stat);
  }
  return { stats, rows, next: i };
}

function headingTierGroup(h: string): { tier: Stat["tier"]; group: string } {
  const m = h.match(/^Tier ([123])(?::\s*(.+))?$/);
  if (!m) return { tier: null, group: h };
  return { tier: Number(m[1]) as 1 | 2 | 3, group: m[2]?.trim() || "General" };
}

const keyLines = KEY.split("\n");

// Universal stats.
const uniStart = keyLines.findIndex((l) => l.startsWith("## Stats that apply to every sport"));
if (uniStart < 0) throw new Error("Universal section not found");
const ti = keyLines.findIndex((l, i) => i > uniStart && l.trim().startsWith("|"));
const uni = parseTable(keyLines, ti, null, "All sports", true, new Set());
const UNIVERSAL_ROWS = uni.rows;

// Sports.
type Sec = { heading: string; from: number; to: number };
const secs: Sec[] = [];
keyLines.forEach((l, i) => {
  const m = l.match(/^# (\d+)\. (.+)$/);
  if (m) secs.push({ heading: m[2].trim(), from: i, to: keyLines.length });
});
secs.forEach((s, k) => {
  if (k + 1 < secs.length) s.to = secs[k + 1].from;
});
// Cut the last section at the first "## " heading (Suggested build order).
const last = secs[secs.length - 1];
const cut = keyLines.findIndex((l, i) => i > last.from && l.startsWith("## "));
if (cut > 0) last.to = cut;

// Gemini doc section 3 table.
const gl = GEM.split("\n");
const g0 = gl.findIndex((l) => l.startsWith("## 3."));
const gh = gl.findIndex((l, i) => i > g0 && l.trim().startsWith("| Sport |"));
const gem = new Map<string, { fps: number; start: string; minutes: number; hudl: string }>();
for (let i = gh + 1; i < gl.length && gl[i].trim().startsWith("|"); i++) {
  if (isSep(gl[i])) continue;
  const c = cells(gl[i]);
  const name = c[0].replace(/\s*\([^)]*\)/, "").trim();
  gem.set(slug(name), { fps: parseInt(c[1], 10), start: c[2], minutes: parseInt(c[3], 10), hudl: c[6] });
}

const sports: Sport[] = [];
const report: string[] = [];
for (const sec of secs) {
  const dropdownName = aliasOf(sec.heading) ?? ORDER.find((n) => n.toUpperCase() === sec.heading);
  if (!dropdownName) throw new Error(`Heading "${sec.heading}" not in the dropdown order`);
  const id = slug(dropdownName);
  const body = keyLines.slice(sec.from, sec.to);
  const summary = body.join("\n").match(/\*\*What decides [^:]*:\*\*\s*(.+)/)?.[1].trim();
  const eventsNote = body.join("\n").match(/\*\*Log these events:\*\*\s*(.+)/)?.[1].trim();
  if (!summary || !eventsNote) throw new Error(`${id}: missing summary or events note`);

  const ids = new Set<string>();
  const stats: Stat[] = [];
  let tableRows = 0;
  let tier: Stat["tier"] = null;
  let group = "";
  for (let i = 0; i < body.length; ) {
    const l = body[i];
    const h = l.match(/^### (.+)$/);
    if (h) {
      ({ tier, group } = headingTierGroup(h[1].trim()));
      i++;
    } else if (l.trim().startsWith("|")) {
      const t = parseTable(body, i, tier, group, false, ids);
      stats.push(...t.stats);
      tableRows += t.rows;
      i = t.next;
    } else i++;
  }
  // Independent count of table body rows in the section: lines starting with "|" that are not separators or headers.
  const countedRows = body.filter((l) => l.trim().startsWith("|") && !isSep(l) && cells(l)[0] !== "Stat").length;
  if (countedRows !== stats.length || tableRows !== stats.length) throw new Error(`${id}: parsed ${stats.length}, doc has ${countedRows}`);

  // Append the universal stats (ids de-duplicated against this sport's).
  for (const u of uni.stats) {
    let sid = u.id;
    for (let n = 2; ids.has(sid); n++) sid = `${u.id}-${n}`;
    ids.add(sid);
    stats.push({ ...u, id: sid });
  }

  const g = gem.get(id);
  if (!g) throw new Error(`${id}: not in the Gemini doc table`);
  const clubFootage: Sport["clubFootage"] = /^Yes/i.test(g.hudl) ? "yes" : /No Hudl team/i.test(g.hudl) ? "no-team" : /no video/i.test(g.hudl) ? "no-video" : (() => { throw new Error(`${id}: unknown Hudl value "${g.hudl}"`); })();
  const sport: Sport = {
    id,
    name: dropdownName,
    order: ORDER.indexOf(dropdownName) + 1,
    summary,
    eventsNote,
    stats,
    analysis: {
      fps: g.fps,
      defaultModel: "gemini-" + g.start.toLowerCase().replace(/\s+/g, "-"),
      footageMinutes: g.minutes,
      mode: SCOREBOARD_ONLY.has(id) ? "scoreboard-only" : "events",
    },
    clubFootage,
  };
  if (HUDL_NOTES[id]) sport.hudlNote = HUDL_NOTES[id];
  sports.push(sport);
  report.push(`${dropdownName.padEnd(15)} stats ${String(stats.length).padStart(3)} = ${countedRows} table rows + ${UNIVERSAL_ROWS} universal`);
  if (stats.length !== countedRows + UNIVERSAL_ROWS) throw new Error(`${id}: count mismatch`);
}
sports.sort((a, b) => a.order - b.order);
if (sports.length !== ORDER.length) throw new Error(`Expected ${ORDER.length} sports, found ${sports.length}`);

const out = `// GENERATED by scripts/build-sports.ts from docs/sports/*.md. Do not edit by hand; run \`npm run build:sports\`.
import type { Sport } from "../registry-types";

export const SPORT_REGISTRY: Sport[] = ${JSON.stringify(sports, null, 2)};
`;
mkdirSync(join(root, "lib/sports/generated"), { recursive: true });
writeFileSync(join(root, "lib/sports/generated/sports.ts"), out);
console.log(report.join("\n"));
console.log(`\n${sports.length} sports, ${UNIVERSAL_ROWS} universal rows each. Wrote lib/sports/generated/sports.ts`);
