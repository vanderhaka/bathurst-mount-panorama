#!/usr/bin/env bash
set -euo pipefail

task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
task_container="bathurst-shootout-test-$$"
task_tmp="$(mktemp -d)"
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

run_sql <<'SQL' >/dev/null
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
SQL
run_sql < "$task_root/supabase/migrations/20261010003331_shootout_attempts.sql" > "$task_tmp/migration.log"
run_sql < "$task_root/supabase/tests/shootout.sql" > "$task_tmp/rpc.log"

for i in {1..6}; do
  (
    task_number=$(( (i - 1) % 3 + 1 ))
    task_id="$(printf '11111111-1111-4111-8111-%012d' "$i")"
    if printf "set role service_role; select * from public.shootout_start(repeat('c',64),'%s',%d,'camaro');\n" "$task_id" "$task_number" | run_sql > "$task_tmp/quota-$i.log" 2>&1; then
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
select attempts_used = 3 and (select count(*) = 3 from public.shootout_attempts where browser_hash = repeat('c',64))
from public.shootout_browsers where browser_hash = repeat('c',64);
SQL
)"
test "$task_quota" = 't'

for i in {1..8}; do
  (
    printf "set role service_role; select * from public.shootout_start(repeat('d',64),'22222222-2222-4222-8222-222222222222',1,'mustang');\n" | run_sql > "$task_tmp/retry-$i.log" 2>&1
  ) &
done
wait
task_retry="$(run_sql <<'SQL'
set role service_role;
select attempts_used = 1 and (select count(*) = 1 from public.shootout_attempts where browser_hash = repeat('d',64))
from public.shootout_browsers where browser_hash = repeat('d',64);
SQL
)"
test "$task_retry" = 't'

for i in {1..6}; do
  (
    task_time=$((124 + i % 2))
    task_sector=$((task_time - 90))
    if printf "set role service_role; select * from public.shootout_submit(repeat('d',64),'22222222-2222-4222-8222-222222222222','James',%d,array[50,40,%d]::double precision[]);\n" "$task_time" "$task_sector" | run_sql > "$task_tmp/submit-$i.log" 2>&1; then
      printf 'success\n' > "$task_tmp/submit-$i.status"
    else
      printf 'rejected\n' > "$task_tmp/submit-$i.status"
    fi
  ) &
done
wait
task_submissions="$(awk '$0 == "success" { n++ } END { print n+0 }' "$task_tmp"/submit-*.status)"
test "$task_submissions" -eq 3
task_published="$(run_sql <<'SQL'
set role service_role;
select count(*) = 1 and bool_and(time_s in (124,125) and nickname = 'James') from public.shootout_leaderboard();
SQL
)"
test "$task_published" = 't'

printf 'Shootout migration, permissions, RPC validation, Top 10, concurrent quota, retries, and immutable submission checks passed.\n'
