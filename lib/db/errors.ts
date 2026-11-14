/** A database or validation problem with a status code and a message that is safe to show. */
export class DbError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Optional machine-readable reason the browser can act on (e.g. "needs_confirm"). */
    public code?: string,
  ) {
    super(message);
  }
}

/** Turns a Supabase error into a DbError. Never exposes raw database text. */
export function dbFail(
  error: { code?: string; message?: string },
  messages: { unique?: string; foreignKey?: string } = {},
): never {
  if (error.code === "23505") throw new DbError(409, messages.unique ?? "That already exists.");
  if (error.code === "23503") throw new DbError(409, messages.foreignKey ?? "Something this refers to doesn't exist (or is still in use).");
  if (error.code === "23514" || error.code === "22P02" || error.code === "22007") throw new DbError(400, "That value isn't allowed.");
  // Setup problems get a message that says what to fix (nothing from the database itself is shown).
  const code = error.code ?? "";
  const text = (error.message ?? "").toLowerCase();
  // The code, or a short piece of the message when there is no code (so a problem can be told apart in the logs). No data values.
  console.error("Database error:", code || (text.includes("fetch failed") ? "fetch-failed" : `no-code: ${(error.message ?? "unknown").slice(0, 90)}`));
  if (code === "PGRST125" || code === "PGRST126") {
    throw new DbError(503, "The database address looks wrong. In Vercel, SUPABASE_URL should be just the project URL, like https://abcdefghijklmnopqrst.supabase.co.");
  }
  if (code === "PGRST301" || code === "PGRST300" || code === "PGRST302" || text.includes("invalid api key") || text.includes("jwt")) {
    throw new DbError(503, "The database rejected the key. In Vercel, SUPABASE_SERVICE_ROLE_KEY must be the project's Secret key (not the Publishable key).");
  }
  if (code === "42501") {
    throw new DbError(503, "The database refused access. SUPABASE_SERVICE_ROLE_KEY must be the Secret key, not the Publishable key.");
  }
  if (code === "42P01" || code === "PGRST205") {
    throw new DbError(503, "The database tables are missing. Run supabase/migrations/0001_init.sql (then 0002_save_game.sql) in the Supabase SQL editor.");
  }
  if (!code && text.includes("fetch failed")) {
    throw new DbError(503, "Couldn't reach the database. Check SUPABASE_URL, and that the Supabase project isn't paused.");
  }
  throw new DbError(500, "Database error. Try again.");
}
