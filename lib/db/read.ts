import { db } from "./client";
import { dbFail, DbError } from "./errors";
import type { TeamRow } from "./admin";

// Read-only queries for pages that members can see (admin write operations live in admin.ts).

export async function listActiveTeams(): Promise<TeamRow[]> {
  const { data, error } = await db().from("teams").select("*").eq("archived", false).order("sport").order("gender").order("level");
  if (error) dbFail(error);
  return data as TeamRow[];
}

export async function getTeamBySlug(slug: string): Promise<TeamRow | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const { data, error } = await db().from("teams").select("*").eq("slug", slug).maybeSingle();
  if (error) dbFail(error);
  return (data as TeamRow | null) ?? null;
}

/** Runs a database read for a page. A missing or unreachable database becomes a message, not a crash. */
export async function tryDb<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, message: err instanceof DbError ? err.message : "Couldn't reach the database. Try again." };
  }
}

/** The current season's label (like "2026-27"), or null when none is current. */
export async function getCurrentSeasonLabel(): Promise<string | null> {
  const { data, error } = await db().from("seasons").select("label").eq("is_current", true).maybeSingle();
  if (error) dbFail(error);
  return (data?.label as string | undefined) ?? null;
}
