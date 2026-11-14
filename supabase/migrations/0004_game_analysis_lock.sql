-- 0004_game_analysis_lock.sql: stops two people analyzing the same game at once.
-- Run in the Supabase SQL editor (club account) after 0003. Idempotent; changes no existing data.
-- Adds two nullable columns to games. The app sets them when someone starts analyzing a scheduled game
-- (one atomic UPDATE that only succeeds if nobody else holds a fresh claim), refreshes them every few
-- minutes while the analysis is open, and clears them when the analysis is saved or abandoned.
-- A claim that has not been refreshed for 30 minutes counts as abandoned, so a closed laptop never
-- blocks a game forever. The token is a random per-browser-tab value, never a name.

alter table public.games add column if not exists analyzing_token text;
alter table public.games add column if not exists analyzing_since timestamptz;
