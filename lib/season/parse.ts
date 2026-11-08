// Reads the club's finished spreadsheets (CLAUDE.md section 13). Runs in the
// browser; nothing is uploaded. Each tab is one game; its sheet type is found
// from header words. Tolerant of merged cells (blank), blank headers, big
// cosmetic M / Z / F letters, tracker-name cells, and blank rows.

import type { Context } from "@/lib/gemini/log-types";

export type Cell = string | number | boolean | Date | null | undefined;
export type RawTab = { file: string; name: string; rows: Cell[][] };

export type SheetKind = "bb-offense-summary" | "bb-possession-log" | "bb-roslyn-offense" | "bb-plus-minus" | "lax-turnovers" | "lax-defense";

export const KIND_LABEL: Record<SheetKind, string> = {
  "bb-offense-summary": "Basketball offense summary",
  "bb-possession-log": "Basketball possession log",
  "bb-roslyn-offense": "Roslyn offense template",
  "bb-plus-minus": "Basketball plus/minus",
  "lax-turnovers": "Lacrosse turnovers",
  "lax-defense": "Lacrosse defense",
};

export type ContextLine = {
  possessions: number | null;
  fg2a: number | null;
  fg2m: number | null;
  fg3a: number | null;
  fg3m: number | null;
  fta: number | null;
  ftm: number | null;
  oreb: number | null;
  dreb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  fouls: number | null;
};

export type ParsedSheet =
  | { kind: "bb-offense-summary"; byContext: Partial<Record<Context, ContextLine>> }
  | { kind: "bb-possession-log"; rows: { seconds: number | null; points: number | null; tov: number | null }[] }
  | { kind: "bb-roslyn-offense"; byContext: Partial<Record<Context, { fg2m: number | null; fg3m: number | null; ftm: number | null }>> }
  | { kind: "bb-plus-minus"; players: { number: string; quarters: (number | null)[]; total: number | null }[] }
  | { kind: "lax-turnovers"; roslyn: (number | null)[]; opponent: (number | null)[]; opponentName: string | null }
  | { kind: "lax-defense"; byContext: Partial<Record<Context, { possessions: number | null; goals: number | null; noGoals: number | null }>> };

export type ReadTab = { file: string; name: string; game: string; sheet: ParsedSheet };
export type SkippedTab = { file: string; name: string; reason: string };

// ---------- cell helpers ----------

const text = (c: Cell) => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString() : String(c)).trim();
const norm = (c: Cell) => text(c).toLowerCase().replace(/\s+/g, " ");

/** A number from a cell, or null when blank / not a number. Accepts "12", "95.8%", " 3 ". */
export function num(c: Cell): number | null {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  const t = text(c).replace(/,/g, "").replace(/%$/, "");
  if (t === "" || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** "0:35" or "1:02" or 35 → seconds. */
function seconds(c: Cell): number | null {
  if (typeof c === "number") return c < 1 && c > 0 ? Math.round(c * 86400) : c; // Sheets time cells come as day fractions
  if (c instanceof Date) return c.getUTCHours() * 3600 + c.getUTCMinutes() * 60 + c.getUTCSeconds();
  const m = /^(\d+):(\d{2})$/.exec(text(c));
  return m ? Number(m[1]) * 60 + Number(m[2]) : num(c);
}

const contextOf = (c: Cell): Context | null => {
  const t = norm(c).replace(/^vs\.? ?/, "");
  if (t === "m" || t === "man") return "M";
  if (t === "z" || t === "zone") return "Z";
  if (t === "f" || t === "fast break" || t === "fastbreak") return "F";
  return null;
};

/** Game key used to join tabs across spreadsheets: case and spacing ignored. */
export const gameKey = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();

/** First row index (in the first 12) whose cells include all the given words. */
function findRow(rows: Cell[][], ...words: string[]): number {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const joined = rows[i].map(norm).join(" | ");
    if (words.every((w) => joined.includes(w))) return i;
  }
  return -1;
}

const colOf = (row: Cell[], pred: (t: string) => boolean) => row.findIndex((c) => pred(norm(c)));

// ---------- detection ----------

export function detect(rows: Cell[][]): SheetKind | null {
  const all = rows.slice(0, 12).flat().map(norm).join(" | ");
  if (all.includes("total +/-") || all.includes("total + / -")) return "bb-plus-minus";
  if (all.includes("defensive possession")) return "lax-defense";
  if (all.includes("possession result") && all.includes("no goal")) return "lax-defense";
  if (all.includes("total turnovers")) return "lax-turnovers";
  if (all.includes("offensive possession")) return "bb-possession-log";
  if (all.includes("2-point fg") || all.includes("2 point fg") || all.includes("offensive efficiency")) return "bb-offense-summary";
  const hasM = rows.some((r) => r.some((c) => contextOf(c) === "M"));
  if (/\b2pt\b/.test(all) && /\b3pt\b/.test(all) && hasM) return "bb-roslyn-offense";
  return null;
}

// ---------- per-kind parsers ----------

function parseOffenseSummary(rows: Cell[][]): ParsedSheet | string {
  const h = findRow(rows, "point fg");
  if (h < 0) return "Couldn't find the 2-Point FG header.";
  const head = rows[h];
  const sub = rows[h + 1] ?? [];
  const at = (word: string) => colOf(head, (t) => t.includes(word));
  const c2 = at("2-point") >= 0 ? at("2-point") : at("2 point");
  const c3 = at("3-point") >= 0 ? at("3-point") : at("3 point");
  const cft = at("free throw");
  const creb = at("rebound");
  // Attempts/made sub-columns: "Att" then "Made" (Made header is sometimes blank, section 10).
  const pair = (c: number) => (c < 0 ? [-1, -1] : norm(sub[c]).startsWith("made") ? [c + 1, c] : [c, c + 1]);
  const [a2, m2] = pair(c2);
  const [a3, m3] = pair(c3);
  const [aft, mft] = pair(cft);
  const cPoss = colOf(head, (t) => t.includes("possession"));
  const cols = {
    ast: at("assist"),
    stl: at("steal"),
    blk: at("block"),
    tov: at("turnover"),
    fouls: at("foul"),
  };
  const byContext: Partial<Record<Context, ContextLine>> = {};
  for (const row of rows.slice(h + 1)) {
    const ctxIndex = row.findIndex((c) => contextOf(c) !== null);
    if (ctxIndex < 0) continue;
    const ctx = contextOf(row[ctxIndex])!;
    const get = (c: number) => (c >= 0 ? num(row[c]) : null);
    byContext[ctx] = {
      possessions: cPoss >= 0 && cPoss !== ctxIndex ? get(cPoss) : num(row[0]),
      fg2a: get(a2),
      fg2m: get(m2),
      fg3a: get(a3),
      fg3m: get(m3),
      fta: get(aft),
      ftm: get(mft),
      oreb: get(creb),
      dreb: creb >= 0 ? get(creb + 1) : null,
      ast: get(cols.ast),
      stl: get(cols.stl),
      blk: get(cols.blk),
      tov: get(cols.tov),
      fouls: get(cols.fouls),
    };
  }
  if (Object.keys(byContext).length === 0) return "No M / Z / F rows found.";
  return { kind: "bb-offense-summary", byContext };
}

function parsePossessionLog(rows: Cell[][]): ParsedSheet | string {
  const h = findRow(rows, "offensive possession");
  const head = rows[h];
  const at = (pred: (t: string) => boolean) => colOf(head, pred);
  const cNum = at((t) => t.includes("offensive possession"));
  const cTime = at((t) => t.includes("time"));
  const c2 = at((t) => t === "2pt");
  const c3 = at((t) => t === "3pt");
  const cft = at((t) => t === "ft");
  const cPts = at((t) => t.includes("total points"));
  const cTov = at((t) => t.includes("turnover"));
  const out: { seconds: number | null; points: number | null; tov: number | null }[] = [];
  for (const row of rows.slice(h + 1)) {
    if (num(row[cNum]) === null) continue; // skips "Team Totals" and blank rows
    // Points from makes when the cells are there (code does the math); else the sheet's own total.
    const m2 = num(row[c2]);
    const m3 = num(row[c3]);
    const mft = num(row[cft]);
    const fromMakes = m2 !== null || m3 !== null || mft !== null ? 2 * (m2 ?? 0) + 3 * (m3 ?? 0) + (mft ?? 0) : null;
    out.push({ seconds: cTime >= 0 ? seconds(row[cTime]) : null, points: fromMakes ?? (cPts >= 0 ? num(row[cPts]) : null), tov: cTov >= 0 ? num(row[cTov]) : null });
  }
  if (out.length === 0) return "No numbered possession rows found.";
  return { kind: "bb-possession-log", rows: out };
}

function parseRoslynOffense(rows: Cell[][]): ParsedSheet | string {
  const h = rows.findIndex((r) => r.some((c) => norm(c) === "2pt"));
  const head = rows[h];
  const c2 = colOf(head, (t) => t === "2pt");
  const c3 = colOf(head, (t) => t === "3pt");
  const cft = colOf(head, (t) => t === "ft");
  const byContext: Partial<Record<Context, { fg2m: number | null; fg3m: number | null; ftm: number | null }>> = {};
  for (const row of rows.slice(h + 1)) {
    const ctx = row.map(contextOf).find((c) => c !== null);
    if (!ctx) continue;
    byContext[ctx] = { fg2m: num(row[c2]), fg3m: num(row[c3]), ftm: num(row[cft]) };
  }
  if (Object.keys(byContext).length === 0) return "No M / Z rows found.";
  return { kind: "bb-roslyn-offense", byContext };
}

function parsePlusMinus(rows: Cell[][]): ParsedSheet | string {
  const h = findRow(rows, "total +/-");
  const head = rows[h < 0 ? findRow(rows, "total + / -") : h];
  if (!head) return "Couldn't find the Total +/- header.";
  const cTotal = colOf(head, (t) => t.startsWith("total"));
  const qCols = ["q1", "q2", "q3", "q4", "ot"].map((q) => colOf(head, (t) => t === q));
  const players: { number: string; quarters: (number | null)[]; total: number | null }[] = [];
  for (const row of rows.slice(rows.indexOf(head) + 1)) {
    const jersey = text(row[0]).replace(/^#/, "");
    if (!/^\d{1,2}$/.test(jersey)) continue;
    const quarters = qCols.map((c) => (c >= 0 ? num(row[c]) : null));
    // Section 10: Total is the sum of the quarters when they're there; the sheet's own Total otherwise.
    const qs = quarters.filter((q): q is number => q !== null);
    players.push({ number: jersey, quarters, total: qs.length ? qs.reduce((a, b) => a + b, 0) : num(row[cTotal]) });
  }
  if (players.length === 0) return "No jersey-number rows found.";
  return { kind: "bb-plus-minus", players };
}

function parseLaxTurnovers(rows: Cell[][]): ParsedSheet | string {
  const h = findRow(rows, "total turnovers");
  const head = rows[h];
  const qCols = ["q1", "q2", "q3", "q4", "ot"].map((q) => colOf(head, (t) => t === q));
  let roslyn: (number | null)[] | null = null;
  let opponent: (number | null)[] | null = null;
  let opponentName: string | null = null;
  for (const row of rows.slice(h + 1)) {
    const label = text(row[0]);
    const values = qCols.map((c) => (c >= 0 ? num(row[c]) : null));
    if (!label || values.every((v) => v === null)) continue;
    if (/roslyn/i.test(label)) roslyn = values;
    else if (!opponent) {
      opponent = values;
      opponentName = label;
    }
  }
  if (!roslyn) return "No Roslyn row found.";
  return { kind: "lax-turnovers", roslyn, opponent: opponent ?? [], opponentName };
}

function parseLaxDefense(rows: Cell[][]): ParsedSheet | string {
  // The "No Goal" / "Goal" labels sit under the "Possession Result" header.
  const resultRow = rows.findIndex((r) => r.some((c) => norm(c) === "no goal"));
  if (resultRow < 0) return "Couldn't find the No Goal / Goal columns.";
  const cNo = colOf(rows[resultRow], (t) => t === "no goal");
  const cGoal = colOf(rows[resultRow], (t) => t === "goal");
  const headRow = findRow(rows, "defensive possession");
  const cPoss = headRow >= 0 ? colOf(rows[headRow], (t) => t.includes("defensive possession")) : 0;
  const byContext: Partial<Record<Context, { possessions: number | null; goals: number | null; noGoals: number | null }>> = {};
  for (const row of rows.slice(resultRow + 1)) {
    const ctx = row.map(contextOf).find((c) => c !== null);
    if (!ctx) continue;
    const goals = num(row[cGoal]);
    const noGoals = num(row[cNo]);
    const poss = num(row[cPoss]) ?? (goals !== null && noGoals !== null ? goals + noGoals : null);
    byContext[ctx] = { possessions: poss, goals, noGoals };
  }
  if (Object.keys(byContext).length === 0) return "No M / Z / F rows found.";
  return { kind: "lax-defense", byContext };
}

const PARSERS: Record<SheetKind, (rows: Cell[][]) => ParsedSheet | string> = {
  "bb-offense-summary": parseOffenseSummary,
  "bb-possession-log": parsePossessionLog,
  "bb-roslyn-offense": parseRoslynOffense,
  "bb-plus-minus": parsePlusMinus,
  "lax-turnovers": parseLaxTurnovers,
  "lax-defense": parseLaxDefense,
};

/** File names the app's own downloads use: "<Opponent> - <sheet-id>.csv". */
const EXPORT_NAME = /^(.*) - ((?:offense-summary|possession-log)-(?:roslyn|opponent)|roslyn-offense|lax-turnovers|lax-defense)$/i;

/** Game name for a tab. For CSVs the tab name is the file name; the app's own exports carry the game before " - ". */
function gameName(tab: RawTab): { game: string; opponentView: boolean } {
  const m = EXPORT_NAME.exec(tab.name);
  if (m) return { game: m[1].trim(), opponentView: /opponent$/i.test(m[2]) };
  return { game: tab.name.trim(), opponentView: false };
}

export function readTabs(tabs: RawTab[]): { read: ReadTab[]; skipped: SkippedTab[] } {
  const read: ReadTab[] = [];
  const skipped: SkippedTab[] = [];
  for (const tab of tabs) {
    const rows = tab.rows.filter((r) => r.some((c) => text(c) !== ""));
    if (rows.length === 0) {
      skipped.push({ file: tab.file, name: tab.name, reason: "Empty" });
      continue;
    }
    const kind = detect(rows);
    if (!kind) {
      skipped.push({ file: tab.file, name: tab.name, reason: "Didn't match a known sheet" });
      continue;
    }
    const { game, opponentView } = gameName(tab);
    if (opponentView) {
      skipped.push({ file: tab.file, name: tab.name, reason: "Opponent's offense (trends here are about Roslyn)" });
      continue;
    }
    const parsed = PARSERS[kind](rows);
    if (typeof parsed === "string") {
      skipped.push({ file: tab.file, name: tab.name, reason: `${KIND_LABEL[kind]}: ${parsed}` });
      continue;
    }
    read.push({ file: tab.file, name: tab.name, game, sheet: parsed });
  }
  return { read, skipped };
}

// ---------- text input (CSV files and pasted tabs) ----------

/** Parses CSV or tab-separated text (Google Sheets copies as tabs). Handles quoted cells. */
export function parseDelimited(input: string): Cell[][] {
  const delim = input.split("\n", 5).some((l) => l.includes("\t")) ? "\t" : ",";
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => (typeof c === "string" && c.trim() === "" ? null : c)));
}
