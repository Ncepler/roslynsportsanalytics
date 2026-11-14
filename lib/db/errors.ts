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
  console.error("Database error:", error.code ?? "unknown");
  throw new DbError(500, "Database error. Try again.");
}
