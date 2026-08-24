-- The notifications idempotency constraint is composite: (user_id, dedupe_key).
-- Correct the conflict target in the already-deployed NTE workflow function.
do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.process_nte_bod_outcome(uuid,text,text)'::regprocedure)
    into function_definition;
  function_definition := replace(
    function_definition,
    'on conflict (dedupe_key) where dedupe_key is not null do nothing',
    'on conflict (user_id, dedupe_key) do nothing'
  );
  execute function_definition;
end;
$$;
