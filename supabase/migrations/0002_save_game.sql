-- 0002_save_game.sql: transactional "save the reviewed possession log" for a game.
-- Run in the Supabase SQL editor (club account) after 0001. Idempotent; no destructive statements on existing data.
-- Adds games.meta (which stats were tracked, starter jersey numbers, scoreboard readings: numbers only)
-- and save_game_analysis(), which replaces a game's possession rows and marks it analyzed in ONE transaction
-- (a function body is a single transaction, so a failure part-way leaves the old rows untouched).
-- Only logged or user-edited fields are stored. Points, efficiency and percentages are never stored.

alter table public.games add column if not exists meta jsonb;

create or replace function public.save_game_analysis(
  p_game_id         uuid,
  p_model           text,
  p_schema_version  integer,
  p_source_filename text,
  p_our_score       integer,
  p_opp_score       integer,
  p_meta            jsonb,
  p_possessions     jsonb
) returns void
language plpgsql
set search_path = public
as $$
begin
  if p_possessions is null or jsonb_typeof(p_possessions) <> 'array' then
    raise exception 'possessions must be a JSON array' using errcode = '22023';
  end if;

  -- Lock the game row so two simultaneous saves take turns.
  perform 1 from public.games where id = p_game_id for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  delete from public.possessions where game_id = p_game_id;

  insert into public.possessions
    (game_id, seq, team, quarter, clock_start, clock_end, video_start, video_end,
     context, shooter, confidence, needs_review, note, events)
  select
    p_game_id,
    t.seq::integer,
    t.r->>'team',
    t.r->>'quarter',
    t.r->>'clock_start',
    t.r->>'clock_end',
    (t.r->>'video_start')::numeric,
    (t.r->>'video_end')::numeric,
    t.r->>'context',
    t.r->>'shooter',
    coalesce(t.r->>'confidence', 'medium'),
    coalesce((t.r->>'needs_review')::boolean, false),
    t.r->>'note',
    case when jsonb_typeof(t.r->'events') = 'array' then t.r->'events' else '[]'::jsonb end
  from jsonb_array_elements(p_possessions) with ordinality as t(r, seq);

  update public.games
     set status          = 'analyzed',
         analyzed_at     = now(),
         model           = p_model,
         schema_version  = p_schema_version,
         source_filename = p_source_filename,
         our_score       = p_our_score,
         opp_score       = p_opp_score,
         meta            = p_meta
   where id = p_game_id;
end;
$$;

-- Only the server (service role) may call it.
revoke all on function public.save_game_analysis(uuid, text, integer, text, integer, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_game_analysis(uuid, text, integer, text, integer, integer, jsonb, jsonb) to service_role;

-- Verify: expect one row for the column and one for the function.
select 'column games.meta' as item, count(*)::text as found
  from information_schema.columns where table_schema = 'public' and table_name = 'games' and column_name = 'meta'
union all
select 'function save_game_analysis', count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'save_game_analysis';
