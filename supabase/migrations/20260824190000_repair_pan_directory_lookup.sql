-- Return the PAN employee/approver directory through one authorization-aware
-- endpoint. This avoids losing both pickers when one of several independent
-- browser queries is blocked or returns a partial RBAC result.
create or replace function public.get_pan_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  result jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not (
    private.pan_actor_can_create()
    or public.has_active_role('Admin')
    or public.has_active_role('Board of Director')
    or public.has_feature_permission('PAN', 'view')
    or public.has_feature_permission('PersonnelActionNotices', 'view')
  ) then
    raise exception 'PAN access is required to load the employee directory.' using errcode = '42501';
  end if;

  with directory as (
    select
      candidate.id,
      candidate.employee_id,
      candidate.full_name,
      candidate.email,
      candidate.role::text as primary_role,
      candidate.status::text as status,
      candidate.department,
      candidate.department_id,
      candidate.business_unit,
      candidate.business_unit_id,
      candidate.employment_status,
      candidate.position,
      candidate.salary_basic,
      candidate.salary_deminimis,
      candidate.salary_reimbursable,
      candidate.date_hired,
      coalesce((
        select jsonb_agg(to_jsonb(role_names.role_name) order by role_names.role_name)
        from (
          select candidate.role::text as role_name
          union
          select assignment.role_id
          from public.user_roles assignment
          where assignment.user_id = candidate.id and assignment.is_active
        ) role_names
      ), '[]'::jsonb) as roles,
      public.can_access_hris_user(candidate.id) as is_in_scope,
      (
        candidate.role::text = 'Board of Director'
        or exists (
          select 1 from public.user_roles assignment
          where assignment.user_id = candidate.id
            and assignment.role_id = 'Board of Director'
            and assignment.is_active
        )
      ) as is_bod,
      (
        candidate.role::text <> 'Employee'
        or exists (
          select 1 from public.user_roles assignment
          where assignment.user_id = candidate.id
            and assignment.role_id <> 'Employee'
            and assignment.is_active
        )
      ) as is_approver
    from public.hris_users candidate
    where lower(candidate.status::text) = 'active'
  ), rows_as_json as (
    select directory.*,
      jsonb_build_object(
        'id', id,
        'employee_id', employee_id,
        'full_name', full_name,
        'email', email,
        'role', primary_role,
        'roles', roles,
        'status', status,
        'department', department,
        'department_id', department_id,
        'business_unit', business_unit,
        'business_unit_id', business_unit_id,
        'employment_status', employment_status,
        'position', position,
        'salary_basic', salary_basic,
        'salary_deminimis', salary_deminimis,
        'salary_reimbursable', salary_reimbursable,
        'date_hired', date_hired
      ) as payload
    from directory
  )
  select jsonb_build_object(
    'employees', coalesce((
      select jsonb_agg(payload order by full_name, id)
      from rows_as_json where is_in_scope
    ), '[]'::jsonb),
    'approvers', coalesce((
      select jsonb_agg(payload order by is_bod desc, full_name, id)
      from rows_as_json where is_approver and (is_in_scope or is_bod)
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_pan_directory() from public, anon, authenticated;
grant execute on function public.get_pan_directory() to authenticated;
