-- User Management is an Admin control plane. An active Admin who already has
-- the UserManagement view permission must be able to resolve the full user
-- directory even if an older assignment carries HOME_ONLY employee scope.
-- All non-Admin roles continue to use their existing RBAC data scope.

create or replace function public.can_access_hris_user(p_target_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer public.hris_users;
  target_user public.hris_users;
  scope jsonb;
  scope_type text;
begin
  select * into viewer
  from public.hris_users
  where id = public.current_hris_user_id();

  select * into target_user
  from public.hris_users
  where id = p_target_user_id;

  if viewer.id is null or target_user.id is null then return false; end if;
  if viewer.id = target_user.id then return true; end if;

  -- Admin-only global directory access. This uses active server-resolved roles
  -- and permissions; it is not based on an email or frontend claim.
  if public.has_active_role('Admin')
     and public.has_feature_permission('UserManagement', 'view') then
    return true;
  end if;

  if not public.has_feature_permission('Employees', 'view')
     and not public.has_feature_permission('EmployeeList', 'view')
     and not public.has_feature_permission('UserManagement', 'view') then
    return false;
  end if;

  scope := public.current_data_scope();
  scope_type := scope->>'type';
  if scope_type = 'GLOBAL' then return true; end if;
  if scope_type = 'SPECIFIC' then
    return target_user.business_unit_id::text in (
      select jsonb_array_elements_text(scope->'allowedBuIds')
    );
  end if;
  if scope_type = 'HOME_ONLY' then
    return viewer.business_unit_id is not null
      and viewer.business_unit_id = target_user.business_unit_id;
  end if;
  if scope_type = 'DEPARTMENT' then
    return viewer.department_id is not null
      and viewer.department_id = target_user.department_id;
  end if;
  if scope_type = 'DIRECT_REPORTS' then
    return target_user.reports_to in (
      viewer.id::text,
      viewer.auth_user_id::text,
      viewer.employee_id,
      viewer.full_name
    );
  end if;
  return false;
end;
$$;

revoke all on function public.can_access_hris_user(uuid) from public, anon;
grant execute on function public.can_access_hris_user(uuid) to authenticated;
