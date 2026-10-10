-- Shootout overhaul: weekly seasons (Monday 00:00 Australia/Sydney), three attempts per browser per season,
-- realistic lap and sector floors, server-side lap timing, per-network start limits, replays, nickname rules shared
-- with src/shootout/model.ts, per-car boards, a rank on submit, and a hidden flag for moderation.
-- The API (api/shootout.ts) validates the same rules first; these checks keep the database consistent on its own.
--
-- Safe to apply before the new API deploys, and to apply again: the first migration's RPCs keep their signatures and
-- response shapes (shootout_start, shootout_submit, shootout_leaderboard) and now apply the season rules internally.
-- The new API calls shootout_start_attempt, shootout_submit_lap, shootout_board and shootout_replay.
-- Applied as five files (this one: the helper functions), each small enough for one remote migration call.

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
    E' \t\n\u000b\f\r\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff');
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
    or p_nickname ~ '[\u0001-\u001f\u007f-\u009f\u00ad\u0600-\u0605\u061c\u06dd\u070f\u0890\u0891\u08e2\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u206f\ue000-\uf8ff\ufdd0-\ufdef\ufeff\ufff9-\ufffb\ufffe\uffff\U000110bd\U000110cd\U00013430-\U0001343f\U0001bca0-\U0001bca3\U0001d173-\U0001d17a\U000e0000-\U000e007f\U000f0000-\U0010ffff]' then
    return false;
  end if;
  if to_regprocedure('pg_catalog.unicode_assigned(text)') is not null then
    execute 'select pg_catalog.unicode_assigned($1)' into assigned using p_nickname;
  end if;
  return assigned and not public.shootout_nickname_blocked(p_nickname);
end;
$$;
