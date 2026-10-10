-- Shootout overhaul: weekly seasons (Monday 00:00 Australia/Sydney), three attempts per browser per season,
-- realistic lap and sector floors, server-side lap timing, per-network start limits, replays, nickname rules shared
-- with src/shootout/model.ts, per-car boards, a rank on submit, and a hidden flag for moderation.
-- The API (api/shootout.ts) validates the same rules first; these checks keep the database consistent on its own.
--
-- Safe to apply before the new API deploys, and to apply again: the first migration's RPCs keep their signatures and
-- response shapes (shootout_start, shootout_submit, shootout_leaderboard) and now apply the season rules internally.
-- The new API calls shootout_start_attempt, shootout_submit_lap, shootout_board and shootout_replay.

create or replace function public.shootout_season(p_at timestamptz)
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  select (date_trunc('week', p_at at time zone 'Australia/Sydney'))::date;
$$;

-- Floors: about 97 % of the fastest ideal lap (MIN_SHOOTOUT_LAP_S and MIN_SHOOTOUT_SECTORS_S in model.ts).
create or replace function public.shootout_lap_ok(p_time_s double precision, p_sectors_s double precision[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(p_time_s between 112 and 600
    and cardinality(p_sectors_s) = 3 and array_ndims(p_sectors_s) = 1 and array_lower(p_sectors_s, 1) = 1
    and p_sectors_s[1] >= 46 and p_sectors_s[1] < p_time_s
    and p_sectors_s[2] >= 29 and p_sectors_s[2] < p_time_s
    and p_sectors_s[3] >= 36 and p_sectors_s[3] < p_time_s
    and abs(p_sectors_s[1] + p_sectors_s[2] + p_sectors_s[3] - p_time_s) <= 1, false);
$$;

-- The API's normalisation: NFKC, then the whitespace JavaScript's String.prototype.trim removes.
create or replace function public.shootout_clean_nickname(p_nickname text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select btrim(normalize(p_nickname, nfkc),
    E' \t\n\u000b\f\r                 　﻿');
$$;

-- Mirror of isBlockedShootoutNickname: ASCII lower case and leetspeak folded, words split on spaces, other
-- characters dropped inside a word. Parts match inside a word, the short words only whole.
create or replace function public.shootout_nickname_blocked(p_nickname text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from regexp_split_to_table(translate(p_nickname, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ013457@$!|', 'abcdefghijklmnopqrstuvwxyzoieastasii'), ' +') as token
    cross join lateral regexp_replace(token, '[^a-z]', '', 'g') as word
    where word <> '' and (
      word = any (array['fag', 'fags', 'ass', 'arse', 'dick', 'cock', 'coon', 'spic', 'chink', 'gook', 'kike', 'paki', 'wog', 'abo', 'boong', 'tranny', 'nazi'])
      or word ~ '(fuck|shit|cunt|nigger|nigga|faggot|retard|bitch|whore|wank|twat|slut)'));
$$;

-- Mirror of shootoutNicknameError for a cleaned nickname: 1-24 code points, NFKC, no \p{C} (controls, format
-- characters such as bidi overrides and zero-width marks, private use, unassigned), no line or paragraph separators,
-- and not blocked. Unassigned code points need unicode_assigned (PostgreSQL 17); the listed ranges hold everywhere.
create or replace function public.shootout_nickname_ok(p_nickname text)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  assigned boolean := true;
begin
  if p_nickname is null or p_nickname is distinct from public.shootout_clean_nickname(p_nickname)
    or char_length(p_nickname) not between 1 and 24
    or p_nickname ~ '[\u0001-\u001f\u007f-\u009f­؀-؅؜۝܏࢐࢑࣢᠎​-‏ -‮⁠-⁤⁦-⁯-﷐-﷯﻿￹-￻￾￿\U000110bd\U000110cd\U00013430-\U0001343f\U0001bca0-\U0001bca3\U0001d173-\U0001d17a\U000e0000-\U000e007f\U000f0000-\U0010ffff]' then
    return false;
  end if;
  if to_regprocedure('pg_catalog.unicode_assigned(text)') is not null then
    execute 'select pg_catalog.unicode_assigned($1)' into assigned using p_nickname;
  end if;
  return assigned and not public.shootout_nickname_blocked(p_nickname);
end;
$$;

alter table public.shootout_attempts add column if not exists season date;
alter table public.shootout_attempts add column if not exists replay text;
alter table public.shootout_attempts add column if not exists hidden boolean not null default false;
-- Backfilled before the default is set: a volatile default would give every existing row this week's season.
update public.shootout_attempts a set season = public.shootout_season(a.started_at) where a.season is null;
alter table public.shootout_attempts
  alter column season set default public.shootout_season(clock_timestamp()),
  alter column season set not null;
-- Quota is now the three attempt numbers of each season; attempts_used is no longer maintained.
alter table public.shootout_attempts drop constraint if exists shootout_attempts_browser_hash_attempt_number_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shootout_attempts_browser_season_number_key') then
    alter table public.shootout_attempts add constraint shootout_attempts_browser_season_number_key unique (browser_hash, season, attempt_number);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shootout_attempts_season_check') then
    alter table public.shootout_attempts add constraint shootout_attempts_season_check check (extract(isodow from season) = 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shootout_attempts_replay_check') then
    alter table public.shootout_attempts add constraint shootout_attempts_replay_check check (replay is null or (submitted_at is not null
      and octet_length(replay) <= 49152 and replay ~ '^[A-Za-z0-9+/]*={0,2}$'));
  end if;
end;
$$;
create index if not exists shootout_attempts_board_idx on public.shootout_attempts (season, time_s, submitted_at, id)
  where submitted_at is not null and not hidden;

-- One row per allocated start, per hashed client IP, kept for a day.
create table if not exists public.shootout_ip_starts (
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null default clock_timestamp()
);
create index if not exists shootout_ip_starts_idx on public.shootout_ip_starts (ip_hash, started_at);
alter table public.shootout_ip_starts enable row level security;
revoke all on public.shootout_ip_starts from public, anon, authenticated;
grant select, insert, delete on public.shootout_ip_starts to service_role;

-- p_ip_hash null skips the start limits; only the first migration's shootout_start passes null.
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
    delete from public.shootout_ip_starts s where s.ip_hash = p_ip_hash and s.started_at <= clock_timestamp() - interval '1 day';
  end if;
  if random() < 0.01 then
    delete from public.shootout_ip_starts s where s.started_at <= clock_timestamp() - interval '1 day';
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

-- The first migration's RPCs, same signatures and shapes, now under the season rules (no start limits: the old API
-- sends no client address).
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
  public.shootout_season(timestamptz),
  public.shootout_lap_ok(double precision, double precision[]),
  public.shootout_clean_nickname(text),
  public.shootout_nickname_blocked(text),
  public.shootout_nickname_ok(text),
  public.shootout_start_attempt(text, text, uuid, integer, text, date),
  public.shootout_ranked(date, text),
  public.shootout_submit_lap(text, uuid, text, double precision, double precision[], text),
  public.shootout_board(date, text),
  public.shootout_replay(date, text, integer),
  public.shootout_start(text, uuid, integer, text),
  public.shootout_submit(text, uuid, text, double precision, double precision[]),
  public.shootout_leaderboard()
from public, anon, authenticated;
grant execute on function
  public.shootout_season(timestamptz),
  public.shootout_lap_ok(double precision, double precision[]),
  public.shootout_clean_nickname(text),
  public.shootout_nickname_blocked(text),
  public.shootout_nickname_ok(text),
  public.shootout_start_attempt(text, text, uuid, integer, text, date),
  public.shootout_ranked(date, text),
  public.shootout_submit_lap(text, uuid, text, double precision, double precision[], text),
  public.shootout_board(date, text),
  public.shootout_replay(date, text, integer),
  public.shootout_start(text, uuid, integer, text),
  public.shootout_submit(text, uuid, text, double precision, double precision[]),
  public.shootout_leaderboard()
to service_role;
