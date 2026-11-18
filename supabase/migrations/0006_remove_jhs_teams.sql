-- JHS (junior high) teams are not tracked at all (Noah, Nov 18). Removes every JHS team and everything that hangs off it.
-- Safe to run more than once. Games are deleted first because games.team_id has no cascade; possessions cascade from games.
begin;

delete from public.games
where team_id in (select id from public.teams where level = 'jhs');

delete from public.teams
where level = 'jhs';

commit;
