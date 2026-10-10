begin;

create function pg_temp.assert_true(p_pass boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_pass is distinct from true then raise exception 'Shootout test failed: %', p_message; end if;
end;
$$;

create function pg_temp.expect_error(p_statement text, p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_statement;
  exception when others then
    if sqlerrm = p_message then return; end if;
    raise exception 'Expected %, got %', p_message, sqlerrm;
  end;
  raise exception 'Expected an error: %', p_message;
end;
$$;

create function pg_temp.hex(p_seed text) returns text language sql as $$ select md5(p_seed) || md5(p_seed || '!') $$;
create function pg_temp.week() returns date language sql as $$ select public.shootout_season(now()) $$;

-- Starts an attempt from its own network and moves its start back, as if the lap had been driven.
create function pg_temp.started(p_browser text, p_id uuid, p_number integer, p_car text)
returns void language plpgsql as $$
begin
  perform public.shootout_start_attempt(p_browser, pg_temp.hex(p_id::text), p_id, p_number, p_car, pg_temp.week());
  update public.shootout_attempts set started_at = started_at - interval '10 minutes' where id = p_id;
end;
$$;

grant execute on all functions in schema pg_temp to service_role;

select pg_temp.assert_true(
  (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('shootout_browsers', 'shootout_attempts', 'shootout_ip_starts')),
  'Every table has RLS enabled');

select pg_temp.assert_true(
  (select count(*) = 13 and bool_and(not p.prosecdef) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'shootout\_%'),
  'All functions use caller privileges, one of each');

do $$
declare
  role_name text;
  signature text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    perform pg_temp.assert_true(not has_table_privilege(role_name, 'public.shootout_attempts', 'SELECT,INSERT,UPDATE,DELETE'), role_name || ' cannot read or change attempts');
    perform pg_temp.assert_true(not has_table_privilege(role_name, 'public.shootout_browsers', 'SELECT,INSERT,UPDATE,DELETE'), role_name || ' cannot read or change browsers');
    perform pg_temp.assert_true(not has_table_privilege(role_name, 'public.shootout_ip_starts', 'SELECT,INSERT,UPDATE,DELETE'), role_name || ' cannot read or change start limits');
    foreach signature in array array[
      'public.shootout_season(timestamptz)',
      'public.shootout_lap_ok(double precision,double precision[])',
      'public.shootout_clean_nickname(text)',
      'public.shootout_nickname_blocked(text)',
      'public.shootout_nickname_ok(text)',
      'public.shootout_start_attempt(text,text,uuid,integer,text,date)',
      'public.shootout_submit_lap(text,uuid,text,double precision,double precision[],text)',
      'public.shootout_start(text,uuid,integer,text)',
      'public.shootout_submit(text,uuid,text,double precision,double precision[])',
      'public.shootout_leaderboard()',
      'public.shootout_ranked(date,text)',
      'public.shootout_board(date,text)',
      'public.shootout_replay(date,text,integer)'
    ] loop
      perform pg_temp.assert_true(not has_function_privilege(role_name, signature, 'EXECUTE'), role_name || ' cannot call ' || signature);
      perform pg_temp.assert_true(has_function_privilege('service_role', signature, 'EXECUTE'), 'service_role can call ' || signature);
    end loop;
  end loop;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform public.shootout_board(public.shootout_season(now()), 'all');
    raise exception 'anon unexpectedly reached the board RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.shootout_browsers(browser_hash) values (repeat('f', 64));
    raise exception 'anon unexpectedly changed browsers';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Seasons: Monday 00:00 in Sydney, across both daylight saving changes.
select pg_temp.assert_true(public.shootout_season('2026-10-04T12:59:59Z') = '2026-09-28', 'Sunday 23:59:59 AEDT (DST began that day) is still the old week');
select pg_temp.assert_true(public.shootout_season('2026-10-04T13:00:00Z') = '2026-10-05', 'Monday 00:00 AEDT starts the week');
select pg_temp.assert_true(public.shootout_season('2026-04-05T13:59:59Z') = '2026-03-30', 'Sunday 23:59:59 AEST after DST ended');
select pg_temp.assert_true(public.shootout_season('2026-04-05T14:00:00Z') = '2026-04-06', 'Monday 00:00 AEST starts the week');

-- Nickname rules mirror src/shootout/model.ts.
select pg_temp.assert_true(public.shootout_clean_nickname(E' Ｊames　') = 'James', 'NFKC and trim');
select pg_temp.assert_true(public.shootout_nickname_ok('James') and public.shootout_nickname_ok('Dickson') and public.shootout_nickname_ok('Assassin 77')
  and public.shootout_nickname_ok('José Ñandú') and public.shootout_nickname_ok('レーサー'), 'Ordinary nicknames pass');
select pg_temp.assert_true(not public.shootout_nickname_ok(E'Ja‮mes') and not public.shootout_nickname_ok(E'Ja​mes')
  and not public.shootout_nickname_ok(E'James') and not public.shootout_nickname_ok(E'Ja\tmes') and not public.shootout_nickname_ok(E'Ja mes')
  and not public.shootout_nickname_ok(E'Ja\U000e0041') and not public.shootout_nickname_ok(E'Ja﷐'), 'Hidden, control, private and separator characters fail');
select pg_temp.assert_true(not public.shootout_nickname_ok('') and not public.shootout_nickname_ok(repeat('x', 25)) and public.shootout_nickname_ok(repeat('é', 24))
  and not public.shootout_nickname_ok(' James') and not public.shootout_nickname_ok(E'Ｊames'), 'Length counts code points; only clean names pass');
select pg_temp.assert_true(public.shootout_nickname_blocked('F.U.C.K') and public.shootout_nickname_blocked('sh1t happens') and public.shootout_nickname_blocked('Big Dick')
  and public.shootout_nickname_blocked('W4NK3R') and public.shootout_nickname_blocked('$lut') and not public.shootout_nickname_blocked('Dickson')
  and not public.shootout_nickname_blocked('Classic') and not public.shootout_nickname_blocked('Shi Tan'), 'Blocklist folds leetspeak and matches like the client');

-- Lap floors mirror MIN_SHOOTOUT_LAP_S and MIN_SHOOTOUT_SECTORS_S.
select pg_temp.assert_true(public.shootout_lap_ok(112, array[46, 29, 37]) and not public.shootout_lap_ok(111.9, array[46, 29, 36.9])
  and not public.shootout_lap_ok(124, array[45.9, 40, 38.1]) and not public.shootout_lap_ok(124, array[50, 28.9, 45.1])
  and not public.shootout_lap_ok(124, array[50, 38.1, 35.9]) and not public.shootout_lap_ok('NaN', array[50, 40, 34])
  and not public.shootout_lap_ok(124, array[50, null, 74]::double precision[]) and not public.shootout_lap_ok(124, array[50, 'NaN', 74]::double precision[])
  and not public.shootout_lap_ok(601, array[200, 200, 201]) and not public.shootout_lap_ok(124, array[50, 40, 36, -2]), 'Lap and sector floors hold');

set local role service_role;

select pg_temp.expect_error(
  $test$select public.shootout_start_attempt(repeat('a',64),repeat('e',64),'00000000-0000-4000-8000-000000000001',1,'torana',pg_temp.week())$test$,
  'shootout_invalid_input');
select pg_temp.expect_error(
  $test$select public.shootout_start_attempt(repeat('a',64),'local','00000000-0000-4000-8000-000000000001',1,'camaro',pg_temp.week())$test$,
  'shootout_invalid_input');
select pg_temp.expect_error(
  $test$select public.shootout_start_attempt(repeat('a',64),repeat('e',64),'00000000-0000-4000-8000-000000000001',1,'camaro',pg_temp.week() + 1)$test$,
  'shootout_invalid_input');
select pg_temp.expect_error(
  $test$select public.shootout_start_attempt(repeat('a',64),repeat('e',64),'00000000-0000-4000-8000-000000000001',1,'camaro',pg_temp.week() - 14)$test$,
  'shootout_wrong_week');
select pg_temp.expect_error(
  $test$select public.shootout_start_attempt(repeat('a',64),repeat('e',64),'00000000-0000-4000-8000-000000000001',1,'camaro',pg_temp.week() + 7)$test$,
  'shootout_wrong_week');
select pg_temp.assert_true((select count(*) = 0 from public.shootout_attempts where browser_hash = repeat('a',64)), 'Refused starts allocate nothing');

-- Last week's attempts do not count against this week.
insert into public.shootout_browsers(browser_hash) values (repeat('a',64));
insert into public.shootout_attempts(id, browser_hash, attempt_number, car, season, started_at)
  select gen_random_uuid(), repeat('a',64), n, 'camaro', pg_temp.week() - 7, now() - interval '8 days' from generate_series(1, 3) n;

select * from public.shootout_start_attempt(repeat('a',64),repeat('e',64),'00000000-0000-4000-8000-000000000001',1,'camaro',pg_temp.week());
select * from public.shootout_start_attempt(repeat('a',64),repeat('e',64),'00000000-0000-4000-8000-000000000001',1,'camaro',pg_temp.week());
select pg_temp.assert_true((select count(*) = 1 from public.shootout_ip_starts where ip_hash = repeat('e',64)), 'A repeated start counts once against the network');
select * from public.shootout_start_attempt(repeat('a',64),repeat('e',64),'00000000-0000-4000-8000-000000000002',2,'mustang',pg_temp.week());
select * from public.shootout_start_attempt(repeat('a',64),repeat('e',64),'00000000-0000-4000-8000-000000000003',3,'supra',pg_temp.week());
select pg_temp.assert_true((select count(*) = 3 from public.shootout_attempts where browser_hash = repeat('a',64) and season = pg_temp.week()),
  'Three attempts this week span all eligible cars');
select pg_temp.expect_error(
  $test$select public.shootout_start_attempt(repeat('a',64),repeat('e',64),'00000000-0000-4000-8000-000000000004',3,'camaro',pg_temp.week())$test$,
  'shootout_quota_exhausted');
select pg_temp.expect_error(
  $test$select public.shootout_start_attempt(repeat('a',64),repeat('e',64),'00000000-0000-4000-8000-000000000001',1,'mustang',pg_temp.week())$test$,
  'shootout_request_conflict');
select pg_temp.assert_true((select (season, number) = (pg_temp.week(), 1) from public.shootout_start_attempt(repeat('a',64),repeat('e',64),
  '00000000-0000-4000-8000-000000000001',1,'camaro',pg_temp.week())), 'A retried start returns the original allocation');

select * from public.shootout_start_attempt(repeat('b',64),repeat('e',64),'00000000-0000-4000-8000-000000000005',3,'supra',pg_temp.week());
select pg_temp.expect_error(
  $test$select public.shootout_start_attempt(repeat('b',64),repeat('e',64),'00000000-0000-4000-8000-000000000006',3,'camaro',pg_temp.week())$test$,
  'shootout_number_used');

-- The first migration's RPCs keep working for the API deployed before this migration.
select * from public.shootout_start(repeat('7',64),'00000000-0000-4000-8000-000000000071',1,'camaro');
select pg_temp.assert_true((select count(*) = 1 and bool_and(season = pg_temp.week()) from public.shootout_attempts where browser_hash = repeat('7',64)),
  'The old start allocates in this week');
select pg_temp.assert_true((select (id, number, car) = ('00000000-0000-4000-8000-000000000071'::uuid, 1, 'camaro')
  from public.shootout_start(repeat('7',64),'00000000-0000-4000-8000-000000000071',1,'camaro')), 'The old start keeps its shape and retries');
select pg_temp.expect_error(
  $test$select public.shootout_submit(repeat('7',64),'00000000-0000-4000-8000-000000000071','James',105,array[40,30,35]::double precision[])$test$,
  'shootout_invalid_input');
update public.shootout_attempts set started_at = started_at - interval '10 minutes' where browser_hash = repeat('7',64);
select pg_temp.assert_true((select publication = 'published' from public.shootout_submit(repeat('7',64),'00000000-0000-4000-8000-000000000071',
  ' Old API ',140,array[50,40,50]::double precision[])), 'The old submit publishes under the new floors');

-- Rate limit: 12 starts per hour and 40 per day from one network.
do $$
declare
  i integer;
begin
  delete from public.shootout_ip_starts;
  for i in 1..12 loop
    perform public.shootout_start_attempt(pg_temp.hex('rate' || i), repeat('9',64), gen_random_uuid(), 1, 'camaro', pg_temp.week());
  end loop;
  perform pg_temp.expect_error(format($test$select public.shootout_start_attempt(%L,%L,gen_random_uuid(),1,'camaro',pg_temp.week())$test$,
    pg_temp.hex('rate13'), repeat('9',64)), 'shootout_rate_limited_hour');
  perform pg_temp.assert_true((select count(*) = 0 from public.shootout_attempts where browser_hash = pg_temp.hex('rate13')), 'A limited start allocates nothing');
  perform public.shootout_start_attempt(pg_temp.hex('rate13'), repeat('8',64), gen_random_uuid(), 1, 'camaro', pg_temp.week());
  delete from public.shootout_ip_starts where ip_hash = repeat('9',64);
  insert into public.shootout_ip_starts(ip_hash, started_at) select repeat('9',64), now() - interval '2 hours' from generate_series(1, 12);
  perform public.shootout_start_attempt(pg_temp.hex('rate14'), repeat('9',64), gen_random_uuid(), 1, 'camaro', pg_temp.week());
  insert into public.shootout_ip_starts(ip_hash, started_at) select repeat('9',64), now() - interval '3 hours' from generate_series(1, 27);
  perform pg_temp.expect_error(format($test$select public.shootout_start_attempt(%L,%L,gen_random_uuid(),1,'camaro',pg_temp.week())$test$,
    pg_temp.hex('rate15'), repeat('9',64)), 'shootout_rate_limited_day');
  delete from public.shootout_ip_starts where ip_hash = repeat('9',64);
  insert into public.shootout_ip_starts(ip_hash, started_at) select repeat('9',64), now() - interval '25 hours' from generate_series(1, 40);
  perform public.shootout_start_attempt(pg_temp.hex('rate15'), repeat('9',64), gen_random_uuid(), 1, 'camaro', pg_temp.week());
  perform pg_temp.assert_true((select count(*) = 1 from public.shootout_ip_starts where ip_hash = repeat('9',64)), 'Day-old starts are pruned');
end;
$$;

-- Submission rules.
select pg_temp.expect_error(
  $test$select public.shootout_submit_lap(repeat('a',64),'00000000-0000-4000-8000-000000000004','James',124,array[50,40,34]::double precision[],null)$test$,
  'shootout_invalid_input');
select pg_temp.expect_error(
  $test$select public.shootout_submit_lap(repeat('a',64),'00000000-0000-4000-8000-000000000004','James',128,array[50,40,38]::double precision[],null)$test$,
  'shootout_attempt_not_found');
select pg_temp.expect_error(
  $test$select public.shootout_submit_lap(repeat('b',64),'00000000-0000-4000-8000-000000000001','James',128,array[50,40,38]::double precision[],null)$test$,
  'shootout_attempt_not_found');
select pg_temp.expect_error(
  $test$select public.shootout_submit_lap(repeat('a',64),'00000000-0000-4000-8000-000000000001','James',111,array[46,29,36]::double precision[],null)$test$,
  'shootout_invalid_input');
select pg_temp.expect_error(
  $test$select public.shootout_submit_lap(repeat('a',64),'00000000-0000-4000-8000-000000000001','',128,array[50,40,38]::double precision[],null)$test$,
  'shootout_nickname_rejected');
select pg_temp.expect_error(
  $test$select public.shootout_submit_lap(repeat('a',64),'00000000-0000-4000-8000-000000000001','5hit Driver',128,array[50,40,38]::double precision[],null)$test$,
  'shootout_nickname_rejected');
select pg_temp.expect_error(
  $test$select public.shootout_submit_lap(repeat('a',64),'00000000-0000-4000-8000-000000000001',E'Ja‮mes',128,array[50,40,38]::double precision[],null)$test$,
  'shootout_nickname_rejected');
select pg_temp.expect_error(
  $test$select public.shootout_submit_lap(repeat('a',64),'00000000-0000-4000-8000-000000000001','James',128,array[50,40,38]::double precision[],'not base64!')$test$,
  'shootout_invalid_input');
select pg_temp.expect_error(
  $test$select public.shootout_submit_lap(repeat('a',64),'00000000-0000-4000-8000-000000000001','James',128,array[50,40,38]::double precision[],null)$test$,
  'shootout_lap_unverified');
select pg_temp.assert_true((select submitted_at is null from public.shootout_attempts where id = '00000000-0000-4000-8000-000000000001'), 'Refused results do not publish');

update public.shootout_attempts set started_at = started_at - interval '100 seconds' where id = '00000000-0000-4000-8000-000000000001';
select pg_temp.expect_error(
  $test$select public.shootout_submit_lap(repeat('a',64),'00000000-0000-4000-8000-000000000001','James',128,array[50,40,38]::double precision[],null)$test$,
  'shootout_lap_unverified');
update public.shootout_attempts set started_at = started_at - interval '9 seconds' where id = '00000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select place = 1 and total = 2 from public.shootout_submit_lap(repeat('a',64),'00000000-0000-4000-8000-000000000001',
  E' Ｊames ',128,array[50,40,38]::double precision[],'AQ==')), 'A lap 20 s faster than the time since its start publishes, with its rank');
select * from public.shootout_submit_lap(repeat('a',64),'00000000-0000-4000-8000-000000000001','James',128,array[50,40,38]::double precision[],null);
select pg_temp.assert_true((select nickname = 'James' and replay = 'AQ==' from public.shootout_attempts where id = '00000000-0000-4000-8000-000000000001'),
  'Nickname is normalised, the replay is kept and a retry changes nothing');
select pg_temp.expect_error(
  $test$select public.shootout_submit_lap(repeat('a',64),'00000000-0000-4000-8000-000000000001','Changed',128,array[50,40,38]::double precision[],null)$test$,
  'shootout_result_conflict');
select pg_temp.expect_error(
  $test$select public.shootout_submit_lap(repeat('a',64),'00000000-0000-4000-8000-000000000001','James',124,array[50,40,34.5]::double precision[],null)$test$,
  'shootout_invalid_input');

update public.shootout_attempts set started_at = started_at - interval '10 minutes' where browser_hash = repeat('a',64) and season = pg_temp.week();
select * from public.shootout_submit_lap(repeat('a',64),'00000000-0000-4000-8000-000000000002','James',123,array[50,37,36]::double precision[],null);
select * from public.shootout_submit_lap(repeat('a',64),'00000000-0000-4000-8000-000000000003','James',125,array[50,38,37]::double precision[],null);
select pg_temp.assert_true((select count(*) = 2 from public.shootout_board(pg_temp.week(), 'all')), 'One lap per browser on the board');
select pg_temp.assert_true((select car = 'mustang' and time_s = 123 and id = '00000000-0000-4000-8000-000000000002'
  from public.shootout_board(pg_temp.week(), 'all') where rank = 1), 'The best lap spans cars and carries its attempt id');
select pg_temp.assert_true((select time_s = 128 from public.shootout_board(pg_temp.week(), 'camaro') where rank = 1), 'The car board shows the best lap in that car');
select pg_temp.assert_true((select count(*) = 1 from public.shootout_replay(pg_temp.week(), 'camaro', 1))
  and (select count(*) = 0 from public.shootout_replay(pg_temp.week(), 'all', 1)), 'Replays come from the board entry, when it has one');

-- An attempt from a closed week cannot publish.
insert into public.shootout_attempts(id, browser_hash, attempt_number, car, season, started_at)
  values ('00000000-0000-4000-8000-000000000007', repeat('b',64), 1, 'camaro', pg_temp.week() - 14, now() - interval '15 days');
select pg_temp.expect_error(
  $test$select public.shootout_submit_lap(repeat('b',64),'00000000-0000-4000-8000-000000000007','James',128,array[50,40,38]::double precision[],null)$test$,
  'shootout_season_closed');

-- A legacy implausible lap stays off the board.
insert into public.shootout_attempts(id, browser_hash, attempt_number, car, season, nickname, time_s, sectors_s, submitted_at)
  values ('00000000-0000-4000-8000-000000000008', repeat('b',64), 1, 'supra', pg_temp.week(), 'Cheater', 101, array[40,30,31], now());
select pg_temp.assert_true((select count(*) = 2 from public.shootout_board(pg_temp.week(), 'all')), 'Laps under the floors are not shown');

do $$
declare
  i integer;
  attempt_id uuid;
  rank_row record;
begin
  for i in 1..11 loop
    attempt_id := gen_random_uuid();
    perform pg_temp.started(pg_temp.hex(i::text), attempt_id, 1, case when i % 2 = 0 then 'supra' else 'camaro' end);
    select * into rank_row from public.shootout_submit_lap(pg_temp.hex(i::text), attempt_id, 'Driver ' || i::text,
      125 + i, array[50, 40, 35 + i]::double precision[], null);
    perform pg_temp.assert_true(rank_row.place = i + 1 and rank_row.total = i + 2, 'Rank counts every browser this season, Top 10 or not');
  end loop;
  perform pg_temp.assert_true((select count(*) = 10 from public.shootout_board(pg_temp.week(), 'all')), 'The board holds only the Top 10');
  perform pg_temp.assert_true((select max(rank) = 10 and min(rank) = 1 from public.shootout_board(pg_temp.week(), 'all')), 'Ranks are contiguous');
  perform pg_temp.assert_true((select array_agg(l.time_s order by l.rank) = array_agg(b.time_s order by b.rank)
    from public.shootout_leaderboard() l join public.shootout_board(pg_temp.week(), 'all') b using (rank)), 'The old leaderboard shows this week''s board');
  perform pg_temp.assert_true((select time_s = 134 from public.shootout_board(pg_temp.week(), 'all') where rank = 10), 'Slower laps drop off');
  perform pg_temp.assert_true((select count(*) = 6 and bool_and(car = 'supra') from public.shootout_board(pg_temp.week(), 'supra')), 'Car boards filter by car');
  perform pg_temp.assert_true((select count(*) = 0 from public.shootout_replay(pg_temp.week(), 'all', 11)), 'Only Top 10 replays are served');
end;
$$;

-- One update hides a lap; the browser's next best then counts.
reset role;
update public.shootout_attempts set hidden = true where id = '00000000-0000-4000-8000-000000000002';
set local role service_role;
select pg_temp.assert_true((select id = '00000000-0000-4000-8000-000000000003' and rank = 1 from public.shootout_board(pg_temp.week(), 'all')
  where nickname = 'James'), 'A hidden lap leaves the board');
select pg_temp.assert_true((select count(*) = 0 from public.shootout_board(pg_temp.week(), 'mustang')), 'Hidden laps leave every board');

reset role;
rollback;
