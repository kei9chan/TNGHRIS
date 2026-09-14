-- Run once at the beginning and once at the end of a normal peak interval.
-- Read-only diagnostics. Do not reset statistics or use EXPLAIN ANALYZE on writes.
begin read only;
set local statement_timeout = '5s';
select now() as captured_at, pg_postmaster_start_time() as started_at,
       current_setting('max_connections') as max_connections,
       (select count(*) from pg_stat_activity where backend_type='client backend') as client_backends,
       (select count(*) from pg_stat_activity where wait_event_type='Lock') as lock_waiters,
       temp_bytes, deadlocks, stats_reset
from pg_stat_database where datname=current_database();

select now() as captured_at, queryid::text, calls, total_exec_time,
       temp_blks_written
from extensions.pg_stat_statements
where queryid in (4315869211813686335,1861879201150966668,
                 -1426210244613929498,2976436988251599315,4090209220684720015);
-- Query IDs above identify this project's current baseline. Re-resolve if
-- a migration or PostgreSQL upgrade changes them; missing rows are not zero load.
commit;
