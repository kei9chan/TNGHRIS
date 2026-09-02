-- Reassert authenticated access to the employee bootstrap/dashboard RPCs
-- after schema changes and force PostgREST to refresh its function cache.

select pg_advisory_xact_lock(hashtext('tng-hris-dashboard-rpc-access-v1'));

revoke execute on function public.current_hris_user_id() from public, anon;
revoke execute on function public.get_my_hris_bootstrap() from public, anon;
revoke execute on function public.get_my_effective_rbac() from public, anon;
revoke execute on function public.get_my_request_summaries() from public, anon;

grant execute on function public.current_hris_user_id() to authenticated;
grant execute on function public.get_my_hris_bootstrap() to authenticated;
grant execute on function public.get_my_effective_rbac() to authenticated;
grant execute on function public.get_my_request_summaries() to authenticated;

do $$
declare
  signature regprocedure;
begin
  foreach signature in array array[
    'public.current_hris_user_id()'::regprocedure,
    'public.get_my_hris_bootstrap()'::regprocedure,
    'public.get_my_effective_rbac()'::regprocedure,
    'public.get_my_request_summaries()'::regprocedure
  ] loop
    if has_function_privilege('anon', signature, 'EXECUTE') then
      raise exception 'Dashboard RPC access repair failed: anon can execute %.', signature;
    end if;
    if not has_function_privilege('authenticated', signature, 'EXECUTE') then
      raise exception 'Dashboard RPC access repair failed: authenticated cannot execute %.', signature;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
