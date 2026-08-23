-- Remove PostgreSQL's default PUBLIC execute grant from every centralized RBAC
-- SECURITY DEFINER function. Only authenticated sessions may invoke resolver/RPC
-- entry points; trigger functions remain non-callable through PostgREST.

select pg_advisory_xact_lock(hashtext('tng-hris-rbac-function-lockdown-v1'));

revoke execute on function public.admin_replace_role_authority(text,jsonb,jsonb) from public, anon;
revoke execute on function public.admin_replace_role_permissions(text,jsonb) from public, anon;
revoke execute on function public.admin_set_user_roles(uuid,text[],text,text,uuid[],text) from public, anon;
revoke execute on function public.assert_bod_hr_manager_parity() from public, anon;
revoke execute on function public.can_access_hris_user(uuid) from public, anon;
revoke execute on function public.current_data_scope() from public, anon;
revoke execute on function public.current_hris_id() from public, anon;
revoke execute on function public.current_hris_name() from public, anon;
revoke execute on function public.current_hris_reports_to() from public, anon;
revoke execute on function public.current_hris_role() from public, anon;
revoke execute on function public.current_hris_roles() from public, anon;
revoke execute on function public.current_hris_user_id() from public, anon;
revoke execute on function public.enforce_bod_hr_manager_parity() from public, anon, authenticated;
revoke execute on function public.get_accessible_hris_users() from public, anon;
revoke execute on function public.get_hris_user_profile(uuid) from public, anon;
revoke execute on function public.get_my_effective_rbac() from public, anon;
revoke execute on function public.get_my_hris_bootstrap() from public, anon;
revoke execute on function public.guard_hris_user_security_update() from public, anon, authenticated;
revoke execute on function public.guard_workflow_status_transition() from public, anon, authenticated;
revoke execute on function public.has_active_role(text) from public, anon;
revoke execute on function public.has_feature_permission(text,text) from public, anon;
revoke execute on function public.has_sensitive_permission(text,text) from public, anon;
revoke execute on function public.has_workflow_permission(text,text) from public, anon;
revoke execute on function public.is_hr_or_admin() from public, anon;
revoke execute on function public.is_system_admin() from public, anon;

grant execute on function public.admin_replace_role_authority(text,jsonb,jsonb) to authenticated;
grant execute on function public.admin_replace_role_permissions(text,jsonb) to authenticated;
grant execute on function public.admin_set_user_roles(uuid,text[],text,text,uuid[],text) to authenticated;
grant execute on function public.assert_bod_hr_manager_parity() to authenticated;
grant execute on function public.can_access_hris_user(uuid) to authenticated;
grant execute on function public.current_data_scope() to authenticated;
grant execute on function public.current_hris_id() to authenticated;
grant execute on function public.current_hris_name() to authenticated;
grant execute on function public.current_hris_reports_to() to authenticated;
grant execute on function public.current_hris_role() to authenticated;
grant execute on function public.current_hris_roles() to authenticated;
grant execute on function public.current_hris_user_id() to authenticated;
grant execute on function public.get_accessible_hris_users() to authenticated;
grant execute on function public.get_hris_user_profile(uuid) to authenticated;
grant execute on function public.get_my_effective_rbac() to authenticated;
grant execute on function public.get_my_hris_bootstrap() to authenticated;
grant execute on function public.has_active_role(text) to authenticated;
grant execute on function public.has_feature_permission(text,text) to authenticated;
grant execute on function public.has_sensitive_permission(text,text) to authenticated;
grant execute on function public.has_workflow_permission(text,text) to authenticated;
grant execute on function public.is_hr_or_admin() to authenticated;
grant execute on function public.is_system_admin() to authenticated;

do $$
declare signature regprocedure;
begin
  foreach signature in array array[
    'public.admin_replace_role_authority(text,jsonb,jsonb)'::regprocedure,
    'public.admin_replace_role_permissions(text,jsonb)'::regprocedure,
    'public.admin_set_user_roles(uuid,text[],text,text,uuid[],text)'::regprocedure,
    'public.assert_bod_hr_manager_parity()'::regprocedure,
    'public.can_access_hris_user(uuid)'::regprocedure,
    'public.current_data_scope()'::regprocedure,
    'public.current_hris_roles()'::regprocedure,
    'public.current_hris_user_id()'::regprocedure,
    'public.get_accessible_hris_users()'::regprocedure,
    'public.get_hris_user_profile(uuid)'::regprocedure,
    'public.get_my_effective_rbac()'::regprocedure,
    'public.get_my_hris_bootstrap()'::regprocedure,
    'public.has_active_role(text)'::regprocedure,
    'public.has_feature_permission(text,text)'::regprocedure,
    'public.has_sensitive_permission(text,text)'::regprocedure,
    'public.has_workflow_permission(text,text)'::regprocedure
  ] loop
    if has_function_privilege('anon', signature, 'EXECUTE') then
      raise exception 'RBAC function lockdown failed: anon can execute %.', signature;
    end if;
    if not has_function_privilege('authenticated', signature, 'EXECUTE') then
      raise exception 'RBAC function lockdown failed: authenticated cannot execute %.', signature;
    end if;
  end loop;

  if has_function_privilege('anon','public.guard_workflow_status_transition()','EXECUTE')
     or has_function_privilege('authenticated','public.guard_workflow_status_transition()','EXECUTE')
     or has_function_privilege('anon','public.guard_hris_user_security_update()','EXECUTE')
     or has_function_privilege('authenticated','public.guard_hris_user_security_update()','EXECUTE')
     or has_function_privilege('anon','public.enforce_bod_hr_manager_parity()','EXECUTE')
     or has_function_privilege('authenticated','public.enforce_bod_hr_manager_parity()','EXECUTE') then
    raise exception 'RBAC function lockdown failed: a trigger function is directly executable.';
  end if;
end;
$$;

