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

select pg_temp.assert_true(
  (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('shootout_browsers', 'shootout_attempts')),
  'Both tables have RLS enabled');

select pg_temp.assert_true(
  (select count(*) = 3 and bool_and(not p.prosecdef) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('shootout_start', 'shootout_submit', 'shootout_leaderboard')),
  'All RPCs use caller privileges');

do $$
declare
  role_name text;
  signature text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    perform pg_temp.assert_true(not has_table_privilege(role_name, 'public.shootout_attempts', 'SELECT,INSERT,UPDATE,DELETE'), role_name || ' cannot read or change attempts');
    perform pg_temp.assert_true(not has_table_privilege(role_name, 'public.shootout_browsers', 'SELECT,INSERT,UPDATE,DELETE'), role_name || ' cannot read or change browser quota');
    foreach signature in array array[
      'public.shootout_start(text,uuid,integer,text)',
      'public.shootout_submit(text,uuid,text,double precision,double precision[])',
      'public.shootout_leaderboard()'
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
    perform public.shootout_leaderboard();
    raise exception 'anon unexpectedly reached the leaderboard RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.shootout_browsers(browser_hash) values (repeat('f', 64));
    raise exception 'anon unexpectedly changed browser quota';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role service_role;

select pg_temp.expect_error(
  $test$select public.shootout_start(repeat('a',64),'00000000-0000-4000-8000-000000000001',1,'torana')$test$,
  'shootout_invalid_input');
select pg_temp.assert_true((select count(*) = 0 from public.shootout_browsers where browser_hash = repeat('a',64)), 'Validation failures do not allocate quota');

select * from public.shootout_start(repeat('a',64),'00000000-0000-4000-8000-000000000001',1,'camaro');
select * from public.shootout_start(repeat('a',64),'00000000-0000-4000-8000-000000000001',1,'camaro');
select pg_temp.assert_true((select attempts_used = 1 from public.shootout_browsers where browser_hash = repeat('a',64)), 'Repeated start consumes one attempt');
select * from public.shootout_start(repeat('a',64),'00000000-0000-4000-8000-000000000002',2,'mustang');
select * from public.shootout_start(repeat('a',64),'00000000-0000-4000-8000-000000000003',3,'supra');
select pg_temp.assert_true((select count(*) = 3 from public.shootout_attempts where browser_hash = repeat('a',64)), 'Three total attempts span all eligible cars');
select pg_temp.expect_error(
  $test$select public.shootout_start(repeat('a',64),'00000000-0000-4000-8000-000000000004',3,'camaro')$test$,
  'shootout_quota_exhausted');
select * from public.shootout_start(repeat('a',64),'00000000-0000-4000-8000-000000000001',1,'camaro');
select pg_temp.expect_error(
  $test$select public.shootout_start(repeat('a',64),'00000000-0000-4000-8000-000000000001',1,'mustang')$test$,
  'shootout_request_conflict');

select * from public.shootout_start(repeat('b',64),'00000000-0000-4000-8000-000000000005',3,'supra');
select pg_temp.assert_true((select attempts_used = 3 from public.shootout_browsers where browser_hash = repeat('b',64)), 'Earlier offline attempts still count');
select * from public.shootout_start(repeat('b',64),'00000000-0000-4000-8000-000000000006',1,'camaro');
select pg_temp.assert_true((select attempts_used = 3 from public.shootout_browsers where browser_hash = repeat('b',64)), 'A late reply for an earlier reservation does not reset quota');
select * from public.shootout_start(repeat('b',64),'00000000-0000-4000-8000-000000000006',1,'camaro');

select pg_temp.expect_error(
  $test$select public.shootout_submit(repeat('a',64),'00000000-0000-4000-8000-000000000004','James',124,array[50,40,34]::double precision[])$test$,
  'shootout_attempt_not_found');
select pg_temp.expect_error(
  $test$select public.shootout_submit(repeat('b',64),'00000000-0000-4000-8000-000000000001','James',124,array[50,40,34]::double precision[])$test$,
  'shootout_attempt_not_found');
select pg_temp.expect_error(
  $test$select public.shootout_submit(repeat('a',64),'00000000-0000-4000-8000-000000000001','James',99,array[40,30,29]::double precision[])$test$,
  'shootout_invalid_input');
select pg_temp.expect_error(
  $test$select public.shootout_submit(repeat('a',64),'00000000-0000-4000-8000-000000000001','James','NaN'::double precision,array[50,40,34]::double precision[])$test$,
  'shootout_invalid_input');
select pg_temp.expect_error(
  $test$select public.shootout_submit(repeat('a',64),'00000000-0000-4000-8000-000000000001','James',124,array[50,null,74]::double precision[])$test$,
  'shootout_invalid_input');
select pg_temp.expect_error(
  $test$select public.shootout_submit(repeat('a',64),'00000000-0000-4000-8000-000000000001','',124,array[50,40,34]::double precision[])$test$,
  'shootout_invalid_input');
select pg_temp.assert_true((select submitted_at is null from public.shootout_attempts where id = '00000000-0000-4000-8000-000000000001'), 'Failed result validation does not publish');

select * from public.shootout_submit(repeat('a',64),'00000000-0000-4000-8000-000000000001',' James ',128,array[50,40,38]::double precision[]);
select * from public.shootout_submit(repeat('a',64),'00000000-0000-4000-8000-000000000001','James',128,array[50,40,38]::double precision[]);
select pg_temp.assert_true((select nickname = 'James' from public.shootout_attempts where id = '00000000-0000-4000-8000-000000000001'), 'Nickname is trimmed');
select pg_temp.expect_error(
  $test$select public.shootout_submit(repeat('a',64),'00000000-0000-4000-8000-000000000001','Changed',128,array[50,40,38]::double precision[])$test$,
  'shootout_result_conflict');
select pg_temp.expect_error(
  $test$select public.shootout_submit(repeat('a',64),'00000000-0000-4000-8000-000000000001','James',124,array[50,40,34]::double precision[])$test$,
  'shootout_result_conflict');

select * from public.shootout_submit(repeat('a',64),'00000000-0000-4000-8000-000000000002','James',123,array[50,40,33]::double precision[]);
select * from public.shootout_submit(repeat('a',64),'00000000-0000-4000-8000-000000000003','James',125,array[50,40,35]::double precision[]);
select pg_temp.assert_true((select count(*) = 1 from public.shootout_leaderboard()), 'Only one published score per browser');
select pg_temp.assert_true((select car = 'mustang' and time_s = 123 from public.shootout_leaderboard() where rank = 1), 'Best score spans cars');

do $$
declare
  i integer;
  attempt_id uuid;
begin
  for i in 1..11 loop
    attempt_id := gen_random_uuid();
    perform public.shootout_start(md5(i::text) || md5(i::text), attempt_id, 1, 'camaro');
    perform public.shootout_submit(md5(i::text) || md5(i::text), attempt_id, 'Driver ' || i::text,
      125 + i, array[50,40,35+i]::double precision[]);
  end loop;
  perform pg_temp.assert_true((select count(*) = 10 from public.shootout_leaderboard()), 'Leaderboard includes only the Top 10');
  perform pg_temp.assert_true((select max(rank) = 10 and min(rank) = 1 from public.shootout_leaderboard()), 'Ranks are contiguous');
  perform pg_temp.assert_true((select time_s = 134 from public.shootout_leaderboard() where rank = 10), 'Slowest scores are excluded');
end;
$$;

reset role;
rollback;
