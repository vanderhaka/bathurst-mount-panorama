#!/usr/bin/env bash
# Applies every Shootout migration to a fresh PostgreSQL and runs the SQL tests plus concurrency checks.
# Uses a throwaway postgres:17 container. Without Docker, set SHOOTOUT_TEST_LOCAL_PG=1 to use a local server reached
# through the usual libpq variables (PGHOST, PGPORT, PGUSER); a temporary database is created and dropped.
set -euo pipefail

task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
task_tmp="$(mktemp -d)"

if [ "${SHOOTOUT_TEST_LOCAL_PG:-}" = 1 ]; then
  task_db="shootout_test_$$"
  cleanup() {
    psql -X -q -d postgres -c "drop database if exists $task_db with (force)" >/dev/null 2>&1 || true
    rm -rf "$task_tmp"
  }
  trap cleanup EXIT
  psql -X -q -d postgres -v ON_ERROR_STOP=1 -c "create database $task_db encoding 'UTF8' template template0" >/dev/null
  run_sql() {
    psql -X -d "$task_db" --quiet --tuples-only --no-align -v ON_ERROR_STOP=1
  }
else
  task_container="bathurst-shootout-test-$$"
  cleanup() {
    docker stop "$task_container" >/dev/null 2>&1 || true
    rm -rf "$task_tmp"
  }
  trap cleanup EXIT
  docker run --detach --rm --name "$task_container" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
  for _ in {1..40}; do
    if docker exec "$task_container" pg_isready -q -U postgres; then break; fi
    sleep 0.2
  done
  docker exec "$task_container" pg_isready -q -U postgres
  run_sql() {
    docker exec --interactive "$task_container" psql -X -U postgres --quiet --tuples-only --no-align -v ON_ERROR_STOP=1
  }
fi

run_sql <<'SQL' >/dev/null
do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = role_name) then
      execute format('create role %I nologin', role_name);
    end if;
  end loop;
end;
$$;
alter role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
SQL
for migration in "$task_root"/supabase/migrations/*.sql; do
  run_sql < "$migration" > "$task_tmp/migration-$(basename "$migration").log"
done
# The latest migration must be safe to apply twice.
run_sql < "$(ls "$task_root"/supabase/migrations/*.sql | tail -n 1)" > "$task_tmp/migration-again.log"
run_sql < "$task_root/supabase/tests/shootout.sql" > "$task_tmp/rpc.log"

season="$(printf "select public.shootout_season(now());\n" | run_sql)"
ip="$(printf 'e%.0s' {1..64})"

for i in {1..6}; do
  (
    task_number=$(( (i - 1) % 3 + 1 ))
    task_id="$(printf '11111111-1111-4111-8111-%012d' "$i")"
    if printf "set role service_role; select * from public.shootout_start_attempt(repeat('c',64),'%s','%s',%d,'camaro','%s');\n" "$ip" "$task_id" "$task_number" "$season" | run_sql > "$task_tmp/quota-$i.log" 2>&1; then
      printf 'success\n' > "$task_tmp/quota-$i.status"
    else
      printf 'rejected\n' > "$task_tmp/quota-$i.status"
    fi
  ) &
done
wait
task_successes="$(awk '$0 == "success" { n++ } END { print n+0 }' "$task_tmp"/quota-*.status)"
test "$task_successes" -eq 3
task_quota="$(run_sql <<'SQL'
set role service_role;
select count(*) = 3 and count(distinct attempt_number) = 3 from public.shootout_attempts where browser_hash = repeat('c',64);
SQL
)"
test "$task_quota" = 't'

for i in {1..8}; do
  (
    printf "set role service_role; select * from public.shootout_start_attempt(repeat('d',64),'%s','22222222-2222-4222-8222-222222222222',1,'mustang','%s');\n" "$ip" "$season" | run_sql > "$task_tmp/retry-$i.log" 2>&1
  ) &
done
wait
task_retry="$(run_sql <<'SQL'
set role service_role;
select count(*) = 1 from public.shootout_attempts where browser_hash = repeat('d',64);
SQL
)"
test "$task_retry" = 't'
task_limit="$(run_sql <<'SQL'
set role service_role;
select count(*) = 4 from public.shootout_ip_starts where ip_hash = repeat('e',64);
SQL
)"
test "$task_limit" = 't'

for i in {1..6}; do
  (
    printf "set role service_role; select * from public.shootout_start_attempt(repeat('f',64),repeat('%x',64),gen_random_uuid(),1,'supra','%s');\n" "$i" "$season" | run_sql > "$task_tmp/race-$i.log" 2>&1 || true
  ) &
done
wait
task_race="$(run_sql <<'SQL'
set role service_role;
select count(*) = 1 from public.shootout_attempts where browser_hash = repeat('f',64);
SQL
)"
test "$task_race" = 't'

printf "update public.shootout_attempts set started_at = started_at - interval '10 minutes' where browser_hash = repeat('d',64);\n" | run_sql >/dev/null
for i in {1..6}; do
  (
    task_time=$((124 + i % 2))
    task_sector=$((task_time - 88))
    if printf "set role service_role; select * from public.shootout_submit_lap(repeat('d',64),'22222222-2222-4222-8222-222222222222','James',%d,array[50,38,%d]::double precision[],null);\n" "$task_time" "$task_sector" | run_sql > "$task_tmp/submit-$i.log" 2>&1; then
      printf 'success\n' > "$task_tmp/submit-$i.status"
    else
      printf 'rejected\n' > "$task_tmp/submit-$i.status"
    fi
  ) &
done
wait
task_submissions="$(awk '$0 == "success" { n++ } END { print n+0 }' "$task_tmp"/submit-*.status)"
test "$task_submissions" -eq 3
task_published="$(printf "set role service_role; select count(*) = 1 and bool_and(time_s in (124,125) and nickname = 'James') from public.shootout_board('%s','all');\n" "$season" | run_sql)"
test "$task_published" = 't'

printf 'Shootout migrations, permissions, seasons, floors, nicknames, timing, start limits, boards, rank, hiding, concurrent quota, retries, and immutable submission checks passed.\n'
