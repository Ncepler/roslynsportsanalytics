-- 0001_init.sql: schema for the multi-team site.
-- Safe to paste into the Supabase SQL editor in one go. Idempotent, no destructive statements.
-- The app uses only the server-side service-role key (which bypasses RLS).
-- RLS is on for every table with NO policies, so the anon/authenticated keys can read nothing.
-- Stored: schedule, teams, reviewed possession logs (jersey numbers only).
-- Never stored: video, appearance notes, student names, faces, derived numbers.

-- Teams: gender + level + sport. Values are lowercase. Allowed values live in the app (lib/teams/options.ts),
-- not here, so adding a sport never needs a migration.
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  gender      text not null,
  level       text not null,
  sport       text not null,
  slug        text not null,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint teams_lowercase check (gender = lower(gender) and level = lower(level) and sport = lower(sport)),
  constraint teams_unique unique (gender, level, sport),
  constraint teams_slug_unique unique (slug)
);

create table if not exists public.seasons (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,                 -- e.g. '2026-27'
  start_date  date not null,
  end_date    date not null,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint seasons_label_unique unique (label),
  constraint seasons_dates check (end_date > start_date)
);
-- Only one current season at a time.
create unique index if not exists seasons_one_current on public.seasons (is_current) where is_current;

create table if not exists public.opponents (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists opponents_name_ci on public.opponents (lower(name));

create table if not exists public.games (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id),
  season_id       uuid not null references public.seasons(id),
  opponent_id     uuid not null references public.opponents(id),
  game_date       date not null,
  home_away       text not null,
  location        text,
  status          text not null default 'scheduled',
  our_score       integer,                   -- final score as entered/confirmed by a person; nullable
  opp_score       integer,
  analyzed_at     timestamptz,
  model           text,                      -- AI model that produced the log
  schema_version  integer,                   -- version of the stored possession format
  source_filename text,
  created_at      timestamptz not null default now(),
  constraint games_home_away check (home_away in ('home', 'away')),
  constraint games_status check (status in ('scheduled', 'analyzed')),
  constraint games_scores_nonneg check ((our_score is null or our_score >= 0) and (opp_score is null or opp_score >= 0))
);
create index if not exists games_team_season on public.games (team_id, season_id);

-- One row per possession: the logged fields only. Points, efficiency etc. are computed on read, never stored.
create table if not exists public.possessions (
  game_id      uuid not null references public.games(id) on delete cascade,
  seq          integer not null,
  team         text not null,                -- 'roslyn' | 'opponent'
  quarter      text not null,                -- '1'..'4', 'OT'
  clock_start  text,
  clock_end    text,
  video_start  numeric,
  video_end    numeric,
  context      text,                         -- 'M' | 'Z' | 'F' | null
  shooter      text,                         -- jersey number only, or null
  confidence   text not null default 'medium',
  needs_review boolean not null default false,
  note         text,
  events       jsonb not null default '[]'::jsonb,
  primary key (game_id, seq),
  constraint possessions_team check (team in ('roslyn', 'opponent')),
  constraint possessions_context check (context is null or context in ('M', 'Z', 'F')),
  constraint possessions_confidence check (confidence in ('high', 'medium', 'low'))
);
create index if not exists possessions_game on public.possessions (game_id);

-- Row level security: on, with no policies (defense in depth).
alter table public.teams       enable row level security;
alter table public.seasons     enable row level security;
alter table public.opponents   enable row level security;
alter table public.games       enable row level security;
alter table public.possessions enable row level security;

-- Verify: every row should show rls_on = true.
select c.relname as table_name, c.relrowsecurity as rls_on
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('teams', 'seasons', 'opponents', 'games', 'possessions')
order by c.relname;
