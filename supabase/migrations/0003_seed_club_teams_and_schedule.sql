-- 0003_seed_club_teams_and_schedule.sql: the club's teams, the 2026-27 season, and the Roslyn Boys Varsity
-- Basketball schedule (read from the posted schedule picture). Run in the Supabase SQL editor (club account) after 0001 and 0002.
-- It creates exactly what Admin -> Teams / Seasons / Schedule would create (same values and slugs; "Mens"/"Womens" are
-- stored as boys/girls). Safe to run more than once: anything that already exists is left alone. Nothing is deleted.
-- Not stored (the games table has no column for it): game times. Scrimmages are marked in "location".

-- Teams (gender, level, sport, slug = gender-level-sport)
insert into public.teams (gender, level, sport, slug)
values
  ('boys', 'varsity', 'badminton', 'boys-varsity-badminton'),
  ('girls', 'varsity', 'badminton', 'girls-varsity-badminton'),
  ('boys', 'varsity', 'baseball', 'boys-varsity-baseball'),
  ('boys', 'jv', 'baseball', 'boys-jv-baseball'),
  ('boys', 'varsity', 'basketball', 'boys-varsity-basketball'),
  ('girls', 'varsity', 'basketball', 'girls-varsity-basketball'),
  ('boys', 'jv', 'basketball', 'boys-jv-basketball'),
  ('boys', 'jv2', 'basketball', 'boys-jv2-basketball'),
  ('girls', 'jv', 'basketball', 'girls-jv-basketball'),
  ('boys', 'jhs', 'basketball', 'boys-jhs-basketball'),
  ('girls', 'jhs', 'basketball', 'girls-jhs-basketball'),
  ('boys', 'varsity', 'football', 'boys-varsity-football'),
  ('boys', 'jv', 'football', 'boys-jv-football'),
  ('boys', 'jhs', 'football', 'boys-jhs-football'),
  ('girls', 'varsity', 'flag-football', 'girls-varsity-flag-football'),
  ('girls', 'varsity', 'gymnastics', 'girls-varsity-gymnastics'),
  ('boys', 'varsity', 'lacrosse', 'boys-varsity-lacrosse'),
  ('girls', 'varsity', 'lacrosse', 'girls-varsity-lacrosse'),
  ('boys', 'jv', 'lacrosse', 'boys-jv-lacrosse'),
  ('girls', 'jv', 'lacrosse', 'girls-jv-lacrosse'),
  ('girls', 'jhs', 'lacrosse', 'girls-jhs-lacrosse'),
  ('boys', 'varsity', 'soccer', 'boys-varsity-soccer'),
  ('girls', 'varsity', 'soccer', 'girls-varsity-soccer'),
  ('boys', 'jv', 'soccer', 'boys-jv-soccer'),
  ('girls', 'jv', 'soccer', 'girls-jv-soccer'),
  ('girls', 'jhs', 'soccer', 'girls-jhs-soccer'),
  ('girls', 'varsity', 'softball', 'girls-varsity-softball'),
  ('girls', 'jhs', 'softball', 'girls-jhs-softball'),
  ('boys', 'varsity', 'volleyball', 'boys-varsity-volleyball'),
  ('girls', 'varsity', 'volleyball', 'girls-varsity-volleyball'),
  ('boys', 'jv', 'volleyball', 'boys-jv-volleyball'),
  ('girls', 'jv', 'volleyball', 'girls-jv-volleyball'),
  ('girls', 'jhs', 'volleyball', 'girls-jhs-volleyball'),
  ('boys', 'varsity', 'wrestling', 'boys-varsity-wrestling')
on conflict do nothing;

-- The 2026-27 school-year season (August 1 to July 31), current unless another season is already current.
insert into public.seasons (label, start_date, end_date, is_current)
select '2026-27', date '2026-08-01', date '2027-07-31', not exists (select 1 from public.seasons where is_current)
on conflict (label) do nothing;

-- Opponents (names compared ignoring case, like the app)
insert into public.opponents (name)
select v.name from (values
  ('Bay Shore'),
  ('Bayside'),
  ('Bellmore - JFK'),
  ('Elmont'),
  ('Great Neck North'),
  ('Kellenberg Memorial'),
  ('Knox School'),
  ('Manhasset'),
  ('NY Holiday Invitational (opponent TBD)'),
  ('New Hyde Park Memorial'),
  ('Roosevelt'),
  ('Saint Anthony''s'),
  ('Saint Dominic'),
  ('Saint Raymond'),
  ('Sewanhaka'),
  ('Smithtown West'),
  ('Xaverian')
) as v(name)
where not exists (select 1 from public.opponents o where lower(o.name) = lower(v.name));

-- Roslyn Boys Varsity Basketball, 2026-27
insert into public.games (team_id, season_id, opponent_id, game_date, home_away, location)
select t.id, s.id, o.id, v.game_date::date, v.home_away, v.location
from (values
  ('2026-11-21', 'Xaverian', 'away', 'Scrimmage'),
  ('2026-11-25', 'Saint Anthony''s', 'away', 'Scrimmage'),
  ('2026-11-28', 'Smithtown West', 'away', 'Scrimmage'),
  ('2026-12-02', 'Saint Dominic', 'home', null),
  ('2026-12-05', 'Knox School', 'home', null),
  ('2026-12-09', 'Bay Shore', 'home', null),
  ('2026-12-12', 'Kellenberg Memorial', 'away', 'Elmont Memorial HS (neutral site)'),
  ('2026-12-15', 'Sewanhaka', 'away', null),
  ('2026-12-17', 'Manhasset', 'away', null),
  ('2026-12-22', 'Elmont', 'home', null),
  ('2026-12-26', 'NY Holiday Invitational (opponent TBD)', 'away', 'NY Holiday Invitational Tournament'),
  ('2026-12-28', 'NY Holiday Invitational (opponent TBD)', 'away', 'NY Holiday Invitational Tournament'),
  ('2027-01-02', 'Saint Raymond', 'away', 'Chaminade (neutral site)'),
  ('2027-01-04', 'Roosevelt', 'home', null),
  ('2027-01-07', 'New Hyde Park Memorial', 'home', null),
  ('2027-01-13', 'Great Neck North', 'home', null),
  ('2027-01-16', 'Bellmore - JFK', 'away', null),
  ('2027-01-22', 'Sewanhaka', 'home', null),
  ('2027-01-29', 'Manhasset', 'home', null),
  ('2027-02-01', 'Roosevelt', 'away', null),
  ('2027-02-04', 'New Hyde Park Memorial', 'away', null),
  ('2027-02-11', 'Great Neck North', 'away', null),
  ('2027-02-13', 'Bellmore - JFK', 'home', null),
  ('2027-02-19', 'Bayside', 'away', 'Scrimmage')
) as v(game_date, opponent, home_away, location)
join public.teams t on t.slug = 'boys-varsity-basketball'
join public.seasons s on s.label = '2026-27'
join public.opponents o on lower(o.name) = lower(v.opponent)
where not exists (
  select 1 from public.games g
  where g.team_id = t.id and g.season_id = s.id and g.game_date = v.game_date::date and g.opponent_id = o.id
);

-- Verify: teams by sport, then the schedule count.
select 'teams' as what, count(*)::text as n from public.teams
union all select 'games for boys-varsity-basketball 2026-27', count(*)::text
  from public.games g join public.teams t on t.id = g.team_id join public.seasons s on s.id = g.season_id
 where t.slug = 'boys-varsity-basketball' and s.label = '2026-27';
