-- Shootout seasons, part 2 of 5: season, replay and hidden columns, the per-season quota key, and the start-limit table.

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
