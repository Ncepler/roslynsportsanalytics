import { z } from "zod";
import { isGender, isLevel, isSport } from "@/lib/teams/options";
import { DbError } from "./errors";

// Every value from the browser is checked here. Never trust a dropdown value.

const oneOf = (name: string) => `Choose a valid ${name}.`

const isoDate = z
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
