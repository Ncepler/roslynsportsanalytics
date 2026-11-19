import { z } from "zod";
import { isGender, isLevel, isSport } from "@/lib/teams/options";
import { DbError } from "./errors";

// Every value from the browser is checked here. Never trust a dropdown value.

const oneOf = (name: string) => `Choose a valid ${name}.`

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-05.")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "That date doesn't exist.");

const uuid = z.string().uuid("Invalid id.");

export const teamCreate = z
  .object({
    gender: z.string().refine(isGender, oneOf("gender")),
    level: z.string().refine(isLevel, oneOf("level")),
    sport: z.string().refine(isSport, oneOf("sport")),
  })
  .strict();

export const teamPatch = z.object({ archived: z.boolean() }).strict();

export const seasonCreate = z
  .object({
    label: z.string().trim().regex(/^\d{4}-\d{2}$/, "Use a label like 2026-27."),
    start_date: isoDate,
    end_date: isoDate,
    is_current: z.boolean().optional(),
  })
  .strict()
  .refine((s) => s.end_date > s.start_date, { message: "The season must end after it starts.", path: ["end_date"] });

export const seasonPatch = z.object({ is_current: z.literal(true) }).strict();

export const opponentCreate = z.object({ name: z.string().trim().min(1, "Enter a name.").max(80, "Keep it under 80 characters.") }).strict();

const location = z
  .string()
  .trim()
  .max(120, "Keep the location under 120 characters.")
  .nullish()
  .transform((v) => (v ? v : null));

export const gameCreate = z
  .object({
    team_id: uuid,
    season_id: uuid,
    opponent_id: uuid,
    game_date: isoDate,
    home_away: z.enum(["home", "away"], { message: "Choose home or away." }),
    location,
  })
  .strict();

export const gamePatch = z
  .object({
    season_id: uuid.optional(),
    opponent_id: uuid.optional(),
    game_date: isoDate.optional(),
    home_away: z.enum(["home", "away"], { message: "Choose home or away." }).optional(),
    location: location.optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0, { message: "Nothing to change." });

export const idParam = uuid;

/**
 * A club member's own typed name, shown next to the games they are in charge of. Letters, spaces and . ' - only,
 * so it can't carry markup or a sentence. Not the people in the footage: this is whoever is using the site.
 */
export const memberName = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(40, "Use 40 characters or fewer.")
  .regex(/^[\p{L}][\p{L} .'’-]*$/u, "Use letters only for your name.");

/** What an analysis is doing right now, shown as a dot (blue = needs the member, green = saved, red = failed). */
export const analysisStates = ["working", "needs_input", "failed"] as const;
export type AnalysisState = (typeof analysisStates)[number];

/** Body of the claim route (also the heartbeat): a random per-tab token (a UUID), the member's name, and the state. */
export const claimBody = z.object({ token: z.string().uuid("Invalid token."), name: memberName, state: z.enum(analysisStates).optional() }).strict();

/** Body of the release route: only the token. */
export const releaseBody = z.object({ token: z.string().uuid("Invalid token.") }).strict();

/** Body of the "take this game" route: a name to put the game in that member's charge, or null to give it up. */
export const assignBody = z.object({ name: memberName.nullable() }).strict();

/** Validates untrusted input. Throws a 400 DbError with the first problem in plain words. */
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data ?? undefined);
  if (!result.success) {
    const issue = result.error.issues[0];
    // Our own messages are plain words; zod's built-in ones (wrong type, unknown key) are not, so those become a generic line.
    const generic = !issue || issue.code === "invalid_type" || issue.code === "unrecognized_keys" || issue.message === "Invalid input";
    throw new DbError(400, generic ? "Invalid request." : issue.message);
  }
  return result.data;
}

// ---------- adding many games at once ----------

export const importBody = z
  .object({
    team_id: uuid,
    season_id: uuid,
    games: z
      .array(
        z
          .object({
            game_date: isoDate,
            opponent_name: z.string().trim().min(1, "Every game needs an opponent.").max(80, "Opponent names must be under 80 characters."),
            home_away: z.enum(["home", "away"], { message: "Choose home or away for every game." }),
            location,
          })
          .strict(),
      )
      .min(1, "Nothing to add.")
      .max(60, "Add at most 60 games at a time."),
  })
  .strict();

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const readTextBody = z
  .object({
    season_id: uuid,
    text: z.string().trim().min(5, "Paste the schedule first.").max(20_000, "That's too much text. Paste up to about 60 games at a time."),
  })
  .strict();

export const readBody = z
  .object({
    season_id: uuid,
    images: z
      .array(z.object({ mediaType: z.enum(IMAGE_TYPES, { message: "Use PNG, JPG or WebP pictures." }), data: z.string().min(100).max(2_200_000) }).strict())
      .min(1, "Add at least one picture.")
      .max(3, "Add up to 3 pictures."),
  })
  .strict();

// ---------- one file with every team's schedule ----------

export const FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const readAllBody = z
  .object({
    season_id: uuid,
    // Either a file (base64) or text the browser already read from a .txt or .csv file.
    file: z.object({ mediaType: z.enum(FILE_TYPES, { message: "Use a PDF, picture, Excel, Word, text or CSV file." }), data: z.string().min(20).max(4_000_000) }).strict().optional(),
    text: z.string().trim().min(5).max(120_000, "That file has too much text. Split it into two files.").optional(),
  })
  .strict()
  .refine((b) => Boolean(b.file) !== Boolean(b.text), { message: "Send one file." });

export const importAllBody = z
  .object({
    season_id: uuid,
    games: z
      .array(
        z
          .object({
            team_id: uuid,
            game_date: isoDate,
            opponent_name: z.string().trim().min(1, "Every game needs an opponent.").max(80, "Opponent names must be under 80 characters."),
            home_away: z.enum(["home", "away"], { message: "Choose home or away for every game." }),
            location,
          })
          .strict(),
      )
      .min(1, "Nothing to add.")
      .max(1500, "That's too many games for one go."),
  })
  .strict();
