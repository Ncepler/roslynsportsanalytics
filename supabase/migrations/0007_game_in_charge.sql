-- 0007_game_in_charge.sql: who is in charge of each game, and what state their analysis is in.
-- Run in the Supabase SQL editor (club account) after 0006. Idempotent; changes no existing data.
--   assigned_to    the club member's own typed name ("Noah C."): shown next to the game for everyone.
--                  Set when someone takes a game or starts analyzing it. Never a student from the footage.
--   analysis_state 'working' (the AI is running), 'needs_input' (waiting on the member, e.g. to confirm
--                  player numbers), 'failed'. Cleared when the analysis is saved. Shown as a dot.
-- The existing claim columns (0004) still do the real locking; these two are display only.

alter table public.games add column if not exists assigned_to text;
alter table public.games add column if not exists analysis_state text;
alter table public.games drop constraint if exists games_analysis_state_check;
alter table public.games add constraint games_analysis_state_check check (analysis_state is null or analysis_state in ('working','needs_input','failed'));
alter table public.games drop constraint if exists games_assigned_to_check;
alter table public.games add constraint games_assigned_to_check check (assigned_to is null or char_length(assigned_to) between 1 and 40);
