-- PostgREST enables safeupdate: even singleton bookkeeping needs an explicit
-- row predicate. Preserve the deployed worker's authentication and queue logic.
do $migration$
declare
  target regprocedure;
  definition text;
  patched text;
begin
  foreach target in array array[
    'public.phone_push_worker(bigint,uuid,text,text,text)'::regprocedure,
    'phone_push_private.dispatch_tick()'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    patched := replace(definition,
      'update phone_push_private.worker_health set last_claim_at=now();',
      'update phone_push_private.worker_health set last_claim_at=now() where singleton=true;');
    patched := replace(patched,
      'update phone_push_private.worker_health set last_finish_at=now();',
      'update phone_push_private.worker_health set last_finish_at=now() where singleton=true;');
    patched := replace(patched,
      'update phone_push_private.worker_health set last_requested_at=now(),request_id=r;',
      'update phone_push_private.worker_health set last_requested_at=now(),request_id=r where singleton=true;');
    if regexp_replace(patched,
      'update phone_push_private[.]worker_health set [^;]+ where singleton=true;',
      '', 'gi') ~* 'update phone_push_private[.]worker_health' then
      raise exception 'Unexpected phone push health update in %', target;
    end if;
    if patched <> definition then
      execute patched;
    end if;
  end loop;
end
$migration$;
