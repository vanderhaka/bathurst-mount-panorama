-- Shootout Arcade practice counts and one read-only summary for the usage dashboard.
-- Arcade runs never reach the competition tables, so the API counts them here: anonymous, per Sydney day and car.

create table if not exists public.shootout_practice_daily (
  day date not null,
  car text not null check (car in ('camaro', 'mustang', 'supra')),
  starts integer not null default 0 check (starts >= 0),
  laps integer not null default 0 check (laps >= 0),
  valid_laps integer not null default 0 check (valid_laps >= 0),
  primary key (day, car)
);
alter table public.shootout_practice_daily enable row level security;
revoke all on public.shootout_practice_daily from public, anon, authenticated;
grant select, insert, update on public.shootout_practice_daily to service_role;

-- kind: 'start' (a warm-up began), 'lap' (a timed lap finished), 'valid_lap' (it finished clean).
create or replace function public.shootout_practice(p_car text, p_kind text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_car is null or p_car not in ('camaro', 'mustang', 'supra') or p_kind is null or p_kind not in ('start', 'lap', 'valid_lap') then
    raise exception 'shootout_invalid_input';
  end if;
  insert into public.shootout_practice_daily as d (day, car, starts, laps, valid_laps)
    values ((clock_timestamp() at time zone 'Australia/Sydney')::date, p_car,
      (p_kind = 'start')::integer, (p_kind in ('lap', 'valid_lap'))::integer, (p_kind = 'valid_lap')::integer)
  on conflict (day, car) do update set starts = d.starts + excluded.starts, laps = d.laps + excluded.laps,
    valid_laps = d.valid_laps + excluded.valid_laps;
end;
$$;

-- Everything the dashboard shows about both Shootout modes, as one JSON document.
create or replace function public.shootout_stats()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with season as (select public.shootout_season(now()) as id),
  cars as (select unnest(array['camaro', 'mustang', 'supra']) as car),
  attempts as (select a.*, a.season = (select id from season) as this_week from public.shootout_attempts a),
  top10_car as (
    select c.car,
      count(a.id) filter (where a.this_week) as attempts_week,
      count(a.id) filter (where a.this_week and a.submitted_at is not null) as published_week,
      count(a.id) as attempts_all,
      count(a.id) filter (where a.submitted_at is not null) as published_all,
      min(a.time_s) filter (where a.this_week and a.submitted_at is not null and not a.hidden) as best_week,
      min(a.time_s) filter (where a.submitted_at is not null and not a.hidden) as best_all
    from cars c left join attempts a on a.car = c.car group by c.car),
  practice_day as (select (now() at time zone 'Australia/Sydney')::date as today),
  arcade_car as (
    select c.car,
      coalesce(sum(p.starts) filter (where p.day >= (select id from season)), 0) as starts_week,
      coalesce(sum(p.laps) filter (where p.day >= (select id from season)), 0) as laps_week,
      coalesce(sum(p.valid_laps) filter (where p.day >= (select id from season)), 0) as valid_week,
      coalesce(sum(p.starts), 0) as starts_all, coalesce(sum(p.laps), 0) as laps_all, coalesce(sum(p.valid_laps), 0) as valid_all
    from cars c left join public.shootout_practice_daily p on p.car = c.car group by c.car),
  daily as (
    select d::date as day,
      coalesce((select sum(p.starts) from public.shootout_practice_daily p where p.day = d::date), 0) as arcade_starts,
      coalesce((select sum(p.laps) from public.shootout_practice_daily p where p.day = d::date), 0) as arcade_laps,
      (select count(*) from public.shootout_attempts a where (a.started_at at time zone 'Australia/Sydney')::date = d::date) as top10_attempts,
      (select count(*) from public.shootout_attempts a where (a.submitted_at at time zone 'Australia/Sydney')::date = d::date) as top10_published
    from generate_series((select today from practice_day) - 13, (select today from practice_day), interval '1 day') d)
  select jsonb_build_object(
    'takenAt', now(),
    'season', jsonb_build_object('id', (select id from season),
      'endsAt', (((select id from season) + 7)::timestamp at time zone 'Australia/Sydney')),
    'top10', jsonb_build_object(
      'attemptsWeek', (select count(*) from attempts where this_week),
      'browsersWeek', (select count(distinct browser_hash) from attempts where this_week),
      'publishedWeek', (select count(*) from attempts where this_week and submitted_at is not null),
      'attemptsAll', (select count(*) from attempts),
      'browsersAll', (select count(distinct browser_hash) from attempts),
      'publishedAll', (select count(*) from attempts where submitted_at is not null),
      'hiddenAll', (select count(*) from attempts where hidden),
      'byCar', (select jsonb_agg(jsonb_build_object('car', car, 'attemptsWeek', attempts_week, 'publishedWeek', published_week,
        'attemptsAll', attempts_all, 'publishedAll', published_all, 'bestWeek', best_week, 'bestAll', best_all) order by car) from top10_car),
      'board', coalesce((select jsonb_agg(jsonb_build_object('rank', b.rank, 'nickname', b.nickname, 'car', b.car, 'timeS', b.time_s) order by b.rank)
        from public.shootout_board((select id from season), 'all') b), '[]'::jsonb)),
    'arcade', jsonb_build_object(
      'startsWeek', (select sum(starts_week) from arcade_car), 'lapsWeek', (select sum(laps_week) from arcade_car),
      'validWeek', (select sum(valid_week) from arcade_car),
      'startsAll', (select sum(starts_all) from arcade_car), 'lapsAll', (select sum(laps_all) from arcade_car),
      'validAll', (select sum(valid_all) from arcade_car),
      'byCar', (select jsonb_agg(jsonb_build_object('car', car, 'startsWeek', starts_week, 'lapsWeek', laps_week, 'validWeek', valid_week,
        'startsAll', starts_all, 'lapsAll', laps_all, 'validAll', valid_all) order by car) from arcade_car)),
    'daily', (select jsonb_agg(jsonb_build_object('day', day, 'arcadeStarts', arcade_starts, 'arcadeLaps', arcade_laps,
      'top10Attempts', top10_attempts, 'top10Published', top10_published) order by day) from daily));
$$;

revoke execute on function public.shootout_practice(text, text), public.shootout_stats() from public, anon, authenticated;
grant execute on function public.shootout_practice(text, text), public.shootout_stats() to service_role;
