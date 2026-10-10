-- Shootout seasons, part 4 of 5: submitting a lap, the Top 10 board and replays.

create or replace function public.shootout_submit_lap(p_browser_hash text, p_attempt_id uuid, p_nickname text, p_time_s double precision,
  p_sectors_s double precision[], p_replay text)
returns table (publication text, place integer, total integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allocated public.shootout_attempts%rowtype;
  clean_nickname text := public.shootout_clean_nickname(p_nickname);
begin
  if p_browser_hash is null or p_browser_hash !~ '^[0-9a-f]{64}$' or p_attempt_id is null
    or not public.shootout_lap_ok(p_time_s, p_sectors_s)
    or p_replay is not null and (octet_length(p_replay) > 49152 or p_replay !~ '^[A-Za-z0-9+/]*={0,2}$') then
    raise exception 'shootout_invalid_input';
  end if;
  if not public.shootout_nickname_ok(clean_nickname) then raise exception 'shootout_nickname_rejected'; end if;
  select a.* into allocated from public.shootout_attempts a
    where a.id = p_attempt_id and a.browser_hash = p_browser_hash for update;
  if not found then raise exception 'shootout_attempt_not_found'; end if;
  if allocated.submitted_at is not null then
    if allocated.nickname is distinct from clean_nickname or allocated.time_s is distinct from p_time_s
      or allocated.sectors_s is distinct from p_sectors_s then
      raise exception 'shootout_result_conflict';
    end if;
  else
    if clock_timestamp() > ((allocated.season + 7)::timestamp at time zone 'Australia/Sydney') + interval '1 hour' then
      raise exception 'shootout_season_closed';
    end if;
    -- The browser allocates in the background a moment after the lap starts; 20 s covers that and its retries.
    if clock_timestamp() - allocated.started_at < make_interval(secs => p_time_s - 20) then
      raise exception 'shootout_lap_unverified';
    end if;
    update public.shootout_attempts a set nickname = clean_nickname, time_s = p_time_s, sectors_s = p_sectors_s,
      replay = p_replay, submitted_at = clock_timestamp() where a.id = p_attempt_id returning a.* into allocated;
  end if;
  -- The lap's place among every browser's best this season, counting laps outside the Top 10.
  return query
    with best as (
      select distinct on (r.browser_hash) r.browser_hash, r.time_s, r.submitted_at, r.id
      from public.shootout_attempts r
      where r.season = allocated.season and r.submitted_at is not null and not r.hidden
        and r.browser_hash <> allocated.browser_hash
        and public.shootout_lap_ok(r.time_s, r.sectors_s) and public.shootout_nickname_ok(r.nickname)
      order by r.browser_hash, r.time_s, r.submitted_at, r.id
    )
    select 'published'::text,
      (1 + count(*) filter (where (b.time_s, b.submitted_at, b.id) < (allocated.time_s, allocated.submitted_at, allocated.id)))::integer,
      (1 + count(*))::integer
    from best b;
end;
$$;

create or replace function public.shootout_board(p_season date, p_car text)
returns table (rank bigint, id uuid, nickname text, car text, time_s double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.rank, r.id, r.nickname, r.car, r.time_s from public.shootout_ranked(p_season, p_car) r where r.rank <= 10 order by r.rank;
$$;

create or replace function public.shootout_replay(p_season date, p_car text, p_rank integer)
returns table (car text, time_s double precision, replay text)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.car, r.time_s, r.replay from public.shootout_ranked(p_season, p_car) r
  where p_rank between 1 and 10 and r.rank = p_rank and r.replay is not null;
$$;

revoke execute on function
  public.shootout_submit_lap(text, uuid, text, double precision, double precision[], text),
  public.shootout_board(date, text),
  public.shootout_replay(date, text, integer)
from public, anon, authenticated;
grant execute on function
  public.shootout_submit_lap(text, uuid, text, double precision, double precision[], text),
  public.shootout_board(date, text),
  public.shootout_replay(date, text, integer)
to service_role;
