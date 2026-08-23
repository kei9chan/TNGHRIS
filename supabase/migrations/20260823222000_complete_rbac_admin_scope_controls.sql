-- Add the missing audited role-default-scope control used by the centralized
-- Roles & Permissions screen. This is additive and does not rewrite any current
-- user assignment, workflow record, approval, or historical audit entry.

select pg_advisory_xact_lock(hashtext('tng-hris-rbac-admin-scope-controls-v1'));

create or replace function public.admin_update_role_default_scope(
  p_role text,
  p_default_data_scope text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  linked_role text;
  before_state jsonb;
begin
  if actor_id is null or not public.has_active_role('Admin') then
    raise exception 'Forbidden: Admin role-configuration authority is required.' using errcode = '42501';
  end if;

  if p_role in ('Recruiter','test role')
     or not exists (select 1 from public.roles where id = p_role and is_active) then
    raise exception 'Unknown or inactive role.';
  end if;

  if p_default_data_scope not in ('SELF','DIRECT_REPORTS','DEPARTMENT','HOME_ONLY','SPECIFIC','GLOBAL') then
    raise exception 'Invalid default data scope.';
  end if;

  linked_role := case
    when p_role = 'Board of Director' then 'HR Manager'
    when p_role = 'HR Manager' then 'Board of Director'
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'role', r.id,
    'defaultDataScope', r.default_data_scope,
    'dashboardType', r.dashboard_type
  ) order by r.id), '[]'::jsonb)
  into before_state
  from public.roles r
  where r.id in (p_role, coalesce(linked_role, p_role));

  update public.roles
  set default_data_scope = p_default_data_scope,
      updated_at = now()
  where id in (p_role, coalesce(linked_role, p_role));

  insert into public.rbac_audit_log(
    actor_user_id, action, entity_type, entity_id, before_value, after_value
  ) values (
    actor_id,
    'UPDATE_ROLE_DEFAULT_SCOPE',
    'role',
    p_role,
    before_state,
    jsonb_build_object(
      'roles', array_remove(array[p_role, linked_role], null),
      'defaultDataScope', p_default_data_scope
    )
  );

  update public.rbac_cache_versions set version = version + 1, updated_at = now();
  return true;
end;
$$;

revoke all on function public.admin_update_role_default_scope(text,text) from public, anon;
grant execute on function public.admin_update_role_default_scope(text,text) to authenticated;

do $$
begin
  if not exists (select 1 from public.roles where id = 'Manager' and is_active) then
    raise exception 'RBAC scope-control migration aborted: Manager must remain active.';
  end if;
  if exists (select 1 from public.roles where id = 'Team Leader' and is_active) then
    raise exception 'RBAC scope-control migration aborted: Team Leader must not replace Manager.';
  end if;
  if has_function_privilege('anon','public.admin_update_role_default_scope(text,text)','EXECUTE') then
    raise exception 'RBAC scope-control migration failed: anon can execute the administration RPC.';
  end if;
  if not has_function_privilege('authenticated','public.admin_update_role_default_scope(text,text)','EXECUTE') then
    raise exception 'RBAC scope-control migration failed: authenticated cannot execute the administration RPC.';
  end if;
end;
$$;
