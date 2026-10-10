create table public.shootout_browsers (
  browser_hash text primary key check (browser_hash ~ '^[0-9a-f]{64}$'),
  attempts_used smallint not null default 0 check (attempts_used between 0 and 3)
);

create table public.shootout_attempts (
  id uuid primary key,
  browser_hash text not null references public.shootout_browsers(browser_hash),
  attempt_number smallint not null check (attempt_number between 1 and 3),
  car text not null check (car in ('camaro', 'mustang', 'supra')),
  started_at timestamptz not null default clock_timestamp(),
  nickname text,
  time_s double precision,
  sectors_s double precision[],
  submitted_at timestamptz,
  unique (browser_hash, attempt_number),
  check (
    (nickname is null and time_s is null and sectors_s is null and submitted_at is null)
    or
    (nickname is not null and time_s is not null and sectors_s is not null and submitted_at is not null
      and nickname = btrim(nickname) and char_length(nickname) between 1 and 24 and nickname !~ '[[:cntrl:]]'
      and time_s between 100 and 1800
      and cardinality(sectors_s) = 3 and array_ndims(sectors_s) = 1 and array_lower(sectors_s, 1) = 1 and array_position(sectors_s, null) is null
      and sectors_s[1] > 0 and sectors_s[1] < time_s
      and sectors_s[2] > 0 and sectors_s[2] < time_s
      and sectors_s[3] > 0 and sectors_s[3] < time_s
      and abs(sectors_s[1] + sectors_s[2] + sectors_s[3] - time_s) <= 1)
  )
);

create index shootout_attempts_results_idx on public.shootout_attempts (browser_hash, time_s, submitted_at, id)
  where submitted_at is not null;

alter table public.shootout_browsers enable row level security;
alter table public.shootout_attempts enable row level security;
revoke all on public.shootout_browsers, public.shootout_attempts from public, anon, authenticated;
grant select, insert, update on public.shootout_browsers, public.shootout_attempts to service_role;

create function public.shootout_start(p_browser_hash text, p_attempt_id uuid, p_attempt_number integer, p_car text)
returns table (id uuid, number integer, car text, started_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  used integer;
  allocated public.shootout_attempts%rowtype;
begin
  if p_browser_hash is null or p_browser_hash !~ '^[0-9a-f]{64}$' or p_attempt_id is null
    or p_attempt_number is null or p_attempt_number not between 1 and 3
    or p_car is null or p_car not in ('camaro', 'mustang', 'supra') then
    raise exception 'shootout_invalid_input';
  end if;

  insert into public.shootout_browsers(browser_hash) values (p_browser_hash) on conflict do nothing;
  select b.attempts_used into used from public.shootout_browsers b where b.browser_hash = p_browser_hash for update;
  select a.* into allocated from public.shootout_attempts a where a.id = p_attempt_id;
  if found then
    if allocated.browser_hash <> p_browser_hash or allocated.attempt_number <> p_attempt_number or allocated.car <> p_car then
      raise exception 'shootout_request_conflict';
    end if;
    return query select allocated.id, allocated.attempt_number::integer, allocated.car, allocated.started_at;
    return;
  end if;
  if exists (select 1 from public.shootout_attempts a where a.browser_hash = p_browser_hash and a.attempt_number = p_attempt_number) then
    if used >= 3 then raise exception 'shootout_quota_exhausted'; end if;
    raise exception 'shootout_number_used';
  end if;

  insert into public.shootout_attempts(id, browser_hash, attempt_number, car)
    values (p_attempt_id, p_browser_hash, p_attempt_number, p_car) returning * into allocated;
  update public.shootout_browsers set attempts_used = greatest(used, p_attempt_number) where browser_hash = p_browser_hash;
  return query select allocated.id, allocated.attempt_number::integer, allocated.car, allocated.started_at;
end;
$$;

create function public.shootout_submit(p_browser_hash text, p_attempt_id uuid, p_nickname text, p_time_s double precision, p_sectors_s double precision[])
returns table (publication text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allocated public.shootout_attempts%rowtype;
  clean_nickname text := btrim(p_nickname);
begin
  if p_browser_hash is null or p_browser_hash !~ '^[0-9a-f]{64}$' or p_attempt_id is null
    or clean_nickname is null or char_length(clean_nickname) not between 1 and 24 or clean_nickname ~ '[[:cntrl:]]'
    or p_time_s is null or p_time_s not between 100 and 1800
    or p_sectors_s is null or cardinality(p_sectors_s) <> 3 or array_lower(p_sectors_s, 1) <> 1
    or p_sectors_s[1] is null or not (p_sectors_s[1] > 0 and p_sectors_s[1] < p_time_s)
    or p_sectors_s[2] is null or not (p_sectors_s[2] > 0 and p_sectors_s[2] < p_time_s)
    or p_sectors_s[3] is null or not (p_sectors_s[3] > 0 and p_sectors_s[3] < p_time_s)
    or abs(p_sectors_s[1] + p_sectors_s[2] + p_sectors_s[3] - p_time_s) > 1 then
    raise exception 'shootout_invalid_input';
  end if;
  select a.* into allocated from public.shootout_attempts a
    where a.id = p_attempt_id and a.browser_hash = p_browser_hash for update;
  if not found then raise exception 'shootout_attempt_not_found'; end if;
  if allocated.submitted_at is not null then
    if allocated.nickname is distinct from clean_nickname or allocated.time_s is distinct from p_time_s or allocated.sectors_s is distinct from p_sectors_s then
      raise exception 'shootout_result_conflict';
    end if;
    return query select 'published'::text;
    return;
  end if;
  update public.shootout_attempts set nickname = clean_nickname, time_s = p_time_s,
    sectors_s = p_sectors_s, submitted_at = clock_timestamp() where id = p_attempt_id;
  return query select 'published'::text;
end;
$$;

create function public.shootout_leaderboard()
returns table (rank bigint, nickname text, car text, time_s double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  with best as (
    select distinct on (a.browser_hash) a.nickname, a.car, a.time_s, a.submitted_at, a.id
    from public.shootout_attempts a where a.submitted_at is not null
    order by a.browser_hash, a.time_s, a.submitted_at, a.id
  )
  select row_number() over (order by b.time_s, b.submitted_at, b.id), b.nickname, b.car, b.time_s
  from best b order by b.time_s, b.submitted_at, b.id limit 10;
$$;

revoke execute on function public.shootout_start(text, uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.shootout_submit(text, uuid, text, double precision, double precision[]) from public, anon, authenticated;
revoke execute on function public.shootout_leaderboard() from public, anon, authenticated;
grant execute on function public.shootout_start(text, uuid, integer, text) to service_role;
grant execute on function public.shootout_submit(text, uuid, text, double precision, double precision[]) to service_role;
grant execute on function public.shootout_leaderboard() to service_role;
