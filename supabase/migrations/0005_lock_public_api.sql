-- 0005_lock_public_api.sql: a second lock on the club database, on top of row level security.
-- Run in the Supabase SQL editor (club account) after 0004. Idempotent; changes no data.
--
-- Why: Supabase puts every table in the public schema on a web API that anyone can call with the project's
-- public ("anon" / publishable) key. Today row level security (on, with no policies) is what stops that key
-- from reading anything. If RLS were ever switched off by mistake (one click in the dashboard), the tables
-- would be readable. This takes away the public roles' permissions on the tables themselves, so both locks
-- would have to fail at once. The app only uses the server's secret key (service_role), which keeps its access.

revoke all on table public.teams, public.seasons, public.opponents, public.games, public.possessions from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Tables, sequences and functions made later (by anyone running SQL as postgres) start without public access too.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- The server keeps what it needs.
grant select, insert, update, delete on table public.teams, public.seasons, public.opponents, public.games, public.possessions to service_role;
grant execute on function public.save_game_analysis(uuid, text, integer, text, integer, integer, jsonb, jsonb) to service_role;

-- RLS stays on (re-applied here in case it was ever turned off).
alter table public.teams       enable row level security;
alter table public.seasons     enable row level security;
alter table public.opponents   enable row level security;
alter table public.games       enable row level security;
alter table public.possessions enable row level security;

-- Verify: every row should show rls_on = true, anon_can_read = false, server_can_read = true.
select c.relname as table_name,
       c.relrowsecurity as rls_on,
       has_table_privilege('anon', c.oid, 'select') as anon_can_read,
       has_table_privilege('service_role', c.oid, 'select') as server_can_read
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('teams', 'seasons', 'opponents', 'games', 'possessions')
order by c.relname;
