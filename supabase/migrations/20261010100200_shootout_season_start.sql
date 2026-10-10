-- Shootout seasons, part 3 of 5: starting an attempt, the ranked board, and execute rights for parts 1 and 3.

-- p_ip_hash null skips the start limits; only the first migration's shootout_start passes null.
-- Rows older than a day no longer count toward any limit. They are not deleted here: the remote migration tool holds
-- any statement containing a delete for a confirmation it cannot show. Prune with one SQL delete if the table grows.
create or replace function public.shootout_start_attempt(p_browser_hash text, p_ip_hash text, p_attempt_id uuid, p_attempt_number integer, p_car text, p_season date)
returns table (id uuid, number integer, car text, started_at timestamptz, season date)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  allocated public.shootout_attempts%rowtype;
  season_count integer;
  hour_count integer;
  day_count integer;
begin
  if p_browser_hash is null or p_browser_hash !~ '^[0-9a-f]{64}$' or p_ip_hash !~ '^[0-9a-f]{64}$'
    or p_attempt_id is null or p_attempt_number is null or p_attempt_number not between 1 and 3
    or p_car is null or p_car not in ('camaro', 'mustang', 'supra') or p_season is null or extract(isodow from p_season) <> 1 then
    raise exception 'shootout_invalid_input';
  end if;

  insert into public.shootout_browsers(browser_hash) values (p_browser_hash) on conflict do nothing;
  perform 1 from public.shootout_browsers b where b.browser_hash = p_browser_hash for update;
  select a.* into allocated from public.shootout_attempts a where a.id = p_attempt_id;
  if found then
    if allocated.browser_hash <> p_browser_hash or allocated.attempt_number <> p_attempt_number
      or allocated.car <> p_car or allocated.season <> p_season then
      raise exception 'shootout_request_conflict';
    end if;
    return query select allocated.id, allocated.attempt_number::integer, allocated.car, allocated.started_at, allocated.season;
    return;
  end if;
  -- A lap can start just before Monday midnight and reach the server just after it.
  if p_season not in (public.shootout_season(clock_timestamp()), public.shootout_season(clock_timestamp() - interval '15 minutes')) then
    raise exception 'shootout_wrong_week';
  end if;
  if exists (select 1 from public.shootout_attempts a
    where a.browser_hash = p_browser_hash and a.season = p_season and a.attempt_number = p_attempt_number) then
    select count(*) into season_count from public.shootout_attempts a where a.browser_hash = p_browser_hash and a.season = p_season;
    if season_count >= 3 then raise exception 'shootout_quota_exhausted'; end if;
    raise exception 'shootout_number_used';
  end if;

  if p_ip_hash is not null then
    -- Serialise starts from one network so the limits hold under concurrency.
    perform pg_advisory_xact_lock(hashtextextended('shootout_ip:' || p_ip_hash, 0));
    select count(*) filter (where s.started_at > clock_timestamp() - interval '1 hour'), count(*)
      into hour_count, day_count
      from public.shootout_ip_starts s where s.ip_hash = p_ip_hash and s.started_at > clock_timestamp() - interval '1 day';
    if day_count >= 40 then raise exception 'shootout_rate_limited_day'; end if;
    if hour_count >= 12 then raise exception 'shootout_rate_limited_hour'; end if;
  end if;

  insert into public.shootout_attempts(id, browser_hash, attempt_number, car, season)
    values (p_attempt_id, p_browser_hash, p_attempt_number, p_car, p_season) returning * into allocated;
  if p_ip_hash is not null then
    insert into public.shootout_ip_starts(ip_hash) values (p_ip_hash);
  end if;
  return query select allocated.id, allocated.attempt_number::integer, allocated.car, allocated.started_at, allocated.season;
end;
$$;

-- Every season board: each browser's fastest visible, plausible lap, ranked.
create or replace function public.shootout_ranked(p_season date, p_car text)
returns table (rank bigint, id uuid, nickname text, car text, time_s double precision, replay text)
language sql
stable
security invoker
set search_path = ''
as $$
  with best as (
    select distinct on (a.browser_hash) a.id, a.nickname, a.car, a.time_s, a.submitted_at, a.replay
    from public.shootout_attempts a
    where a.season = p_season and a.submitted_at is not null and not a.hidden and (p_car = 'all' or a.car = p_car)
      and public.shootout_lap_ok(a.time_s, a.sectors_s) and public.shootout_nickname_ok(a.nickname)
    order by a.browser_hash, a.time_s, a.submitted_at, a.id
  )
  select row_number() over (order by b.time_s, b.submitted_at, b.id), b.id, b.nickname, b.car, b.time_s, b.replay
  from best b order by b.time_s, b.submitted_at, b.id;
$$;

revoke execute on function
  public.shootout_season(timestamptz),
  public.shootout_lap_ok(double precision, double precision[]),
  public.shootout_clean_nickname(text),
  public.shootout_nickname_blocked(text),
  public.shootout_nickname_ok(text),
  public.shootout_start_attempt(text, text, uuid, integer, text, date),
  public.shootout_ranked(date, text)
from public, anon, authenticated;
grant execute on function
  public.shootout_season(timestamptz),
  public.shootout_lap_ok(double precision, double precision[]),
  public.shootout_clean_nickname(text),
  public.shootout_nickname_blocked(text),
  public.shootout_nickname_ok(text),
  public.shootout_start_attempt(text, text, uuid, integer, text, date),
  public.shootout_ranked(date, text)
to service_role;
