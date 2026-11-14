import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DbError } from "./errors";

// Server-only. Uses the Supabase secret (service-role) key, which bypasses RLS, so this module must never be
// imported from a client component and the key must never be in a NEXT_PUBLIC_ variable. The app does not use
// Supabase Auth (our own cookie is the login), so no publishable/anon key is needed.
let client: SupabaseClient | null = null;
let clientFor = "";

/**
 * The project's base address, whatever form it was pasted in. Accepts "https://abc.supabase.co", a trailing
 * slash, "/rest/v1" or any other path on the end (these made every request fail with PGRST125), a dashboard link
 * (supabase.com/dashboard/project/<ref>), or just the 20-letter project ref. Returns null if it can't be understood.
 */
export function normalizeSupabaseUrl(raw: string): string | null {
  const text = raw.trim().replace(/^["']|["']$/g, "");
  if (/^[a-z0-9]{20}$/.test(text)) return `https://${text}.supabase.co`;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const dashboard = /(?:^|\.)supabase\.com$/.test(url.hostname) ? /\/project\/([a-z0-9]{20})(?:\/|$)/.exec(url.pathname) : null;
  if (dashboard) return `https://${dashboard[1]}.supabase.co`;
  if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
  return url.origin;
}

export function db(): SupabaseClient {
  const rawUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) throw new DbError(503, "The database isn't set up yet (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).");
  const url = normalizeSupabaseUrl(rawUrl);
  if (!url) throw new DbError(503, "SUPABASE_URL isn't a web address. It should look like https://abcdefghijklmnopqrst.supabase.co.");
  if (!client || clientFor !== `${url}|${key.length}`) {
    client = createClient(url, key.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
    clientFor = `${url}|${key.length}`;
  }
  return client;
}
