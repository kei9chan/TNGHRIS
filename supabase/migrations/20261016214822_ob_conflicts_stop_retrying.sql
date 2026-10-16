-- A stale request revision is a business conflict, not a PostgreSQL
-- serialization failure. PostgREST 14 can retry SQLSTATE 40001 indefinitely.
-- Keep the existing checks, messages, owners, ACLs and bodies; change only the
-- explicit conflict error code for these two Official Business functions.
-- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
set local lock_timeout = '5s';
set local statement_timeout = '20s';

do $migration$
declare
  signature text;
  function_oid regprocedure;
  definition text;
  patched text;
begin
  foreach signature in array array[
    'private.ob_command(uuid,text,integer,jsonb,text)',
    'private.ob_record_clock(text,uuid,integer,date,jsonb)'
  ] loop
    function_oid := to_regprocedure(signature);
    if function_oid is null then
      raise exception 'Official Business function missing: %', signature;
    end if;
    definition := pg_get_functiondef(function_oid);
    patched := regexp_replace(
      definition,
      $pattern$errcode\s*=\s*'40001'$pattern$,
      $replacement$errcode='PT409'$replacement$,
      'gi'
    );
    if definition = patched and definition not like '%PT409%' then
      raise exception 'Expected Official Business conflict checks missing: %', signature;
    end if;
    if definition <> patched then
      execute patched;
    end if;
    if exists(select 1 from pg_proc where oid=function_oid and prosrc like '%40001%') then
      raise exception 'Retryable conflict remains in %', signature;
    end if;
  end loop;
end
$migration$;
