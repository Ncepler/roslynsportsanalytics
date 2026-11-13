import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DbError } from "./errors";

// Server-only. Uses the service-role key, which bypasses RLS, so this module must never be imported
// from a client component and the key must never be in a NEXT_PUBLIC_ variable. The app does not use
// Supabase Auth (our own cookie is the login), so no anon key is needed.
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new DbError(503, "The database isn't set up yet (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).");
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
