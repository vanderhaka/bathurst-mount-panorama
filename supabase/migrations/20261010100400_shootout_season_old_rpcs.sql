-- Shootout seasons, part 5 of 5: the first migration's RPCs keep their signatures and shapes, now under the season rules
-- (no start limits: the old API sends no client address).
create or replace function public.shootout_start(p_browser_hash text, p_attempt_id uuid, p_attempt_number integer, p_car text)
returns table (id uuid, number integer, car text, started_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  select a.id, a.number, a.car, a.started_at
  from public.shootout_start_attempt(p_browser_hash, null, p_attempt_id, p_attempt_number, p_car, public.shootout_season(clock_timestamp())) a;
$$;

create or replace function public.shootout_submit(p_browser_hash text, p_attempt_id uuid, p_nickname text, p_time_s double precision, p_sectors_s double precision[])
returns table (publication text)
language sql
security invoker
set search_path = ''
as $$
  select s.publication from public.shootout_submit_lap(p_browser_hash, p_attempt_id, p_nickname, p_time_s, p_sectors_s, null) s;
$$;

create or replace function public.shootout_leaderboard()
returns table (rank bigint, nickname text, car text, time_s double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.rank, b.nickname, b.car, b.time_s from public.shootout_board(public.shootout_season(now()), 'all') b order by b.rank;
$$;

revoke execute on function
  public.shootout_start(text, uuid, integer, text),
  public.shootout_submit(text, uuid, text, double precision, double precision[]),
  public.shootout_leaderboard()
from public, anon, authenticated;
grant execute on function
  public.shootout_start(text, uuid, integer, text),
  public.shootout_submit(text, uuid, text, double precision, double precision[]),
  public.shootout_leaderboard()
to service_role;
