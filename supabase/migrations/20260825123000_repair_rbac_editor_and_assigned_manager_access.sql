-- Repair audited role editing and make active time-request assignment the
-- canonical authorization source for queues, deep links, RLS and actions.

create or replace function private.is_active_time_request_approver(
  p_actor_id uuid,
  p_request_type text,
  p_request_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid;
  v_direct_manager_id uuid;
  v_status text;
  v_manager_stage boolean := false;
begin
  if p_actor_id is null or p_request_id is null then return false; end if;

  case lower(p_request_type)
    when 'leave' then
      select employee_id, direct_manager_id, status
      into v_employee_id, v_direct_manager_id, v_status
      from public.leave_requests where id = p_request_id;
      v_manager_stage := v_status in ('Pending', 'PendingGM');
    when 'wfh' then
      select employee_id, direct_manager_id, status
      into v_employee_id, v_direct_manager_id, v_status
      from public.wfh_requests where id = p_request_id;
      v_manager_stage := v_status in ('WFH_PENDING_DEPT_HEAD_APPROVAL', 'WFH_PENDING_GM_APPROVAL');
    when 'overtime' then
      select employee_id, direct_manager_id, status::text
      into v_employee_id, v_direct_manager_id, v_status
      from public.ot_requests where id = p_request_id;
      v_manager_stage := v_status in ('Submitted', 'PendingGM');
    else
      return false;
  end case;

  if v_employee_id is null then return false; end if;

  if v_manager_stage and (
    p_actor_id = v_direct_manager_id
    or private.is_direct_reporting_manager(p_actor_id, v_employee_id)
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.time_request_approval_assignments assignment
    where assignment.request_type = lower(p_request_type)
      and assignment.request_id = p_request_id
      and assignment.approver_user_id = p_actor_id
      and assignment.status = 'Pending'
  );
end;
$$;

create or replace function public.can_view_time_request(
  p_request_type text,
  p_request_id uuid,
  p_employee_id uuid,
  p_direct_manager_id uuid,
  p_business_unit_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.current_hris_user_id();
begin
  if v_actor is null then return false; end if;
  if v_actor = p_employee_id then return true; end if;
  if private.is_active_time_request_approver(v_actor, p_request_type, p_request_id) then return true; end if;

  return (
    public.has_active_role('Admin')
    or public.has_active_role('HR Manager')
    or public.has_active_role('HR Staff')
  ) and public.can_access_hris_user(p_employee_id);
end;
$$;

create or replace function public.get_my_pending_time_approval_ids()
returns table(request_type text, request_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (select public.current_hris_user_id() as id)
  select 'leave'::text, request.id
  from public.leave_requests request, actor
  where private.is_active_time_request_approver(actor.id, 'leave', request.id)
  union all
  select 'wfh'::text, request.id
  from public.wfh_requests request, actor
  where private.is_active_time_request_approver(actor.id, 'wfh', request.id)
  union all
  select 'overtime'::text, request.id
  from public.ot_requests request, actor
  where private.is_active_time_request_approver(actor.id, 'overtime', request.id)
$$;

-- Record-level assignment is sufficient for review. Requiring broad module
-- permission here caused assigned managers to receive a notification and then
-- be denied the same request.
drop policy if exists leave_authorized_view on public.leave_requests;
create policy leave_authorized_view on public.leave_requests
for select to authenticated
using (public.can_view_time_request('leave', id, employee_id, direct_manager_id, business_unit_id));

drop policy if exists wfh_authorized_view on public.wfh_requests;
create policy wfh_authorized_view on public.wfh_requests
for select to authenticated
using (public.can_view_time_request('wfh', id, employee_id, direct_manager_id, business_unit_id));

drop policy if exists ot_authorized_view on public.ot_requests;
create policy ot_authorized_view on public.ot_requests
for select to authenticated
using (public.can_view_time_request('overtime', id, employee_id, direct_manager_id, business_unit_id));

create or replace function public.admin_set_user_roles(
  p_target_user_id uuid,
  p_role_ids text[],
  p_primary_role text,
  p_scope_type text,
  p_allowed_business_unit_ids uuid[] default '{}'::uuid[],
  p_dashboard_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := public.current_hris_user_id();
  v_before_state jsonb;
  v_after_state jsonb;
  v_max_roles integer := 1;
  v_requested_role_id text;
  v_final_admins integer;
  v_cache_version bigint;
  v_dashboard_type text;
begin
  if v_actor_id is null or not public.has_active_role('Admin') then
    raise exception 'Forbidden: Admin role assignment authority is required.' using errcode = '42501';
  end if;
  if v_actor_id = p_target_user_id then
    raise exception 'Self-promotion and self-role changes are not permitted.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.hris_users target where target.id = p_target_user_id) then
    raise exception 'The selected user does not exist.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_role_ids), 0) = 0 then
    raise exception 'At least one active role is required.' using errcode = '22023';
  end if;
  if p_scope_type not in ('SELF','DIRECT_REPORTS','DEPARTMENT','HOME_ONLY','SPECIFIC','GLOBAL') then
    raise exception 'Invalid data scope: %', p_scope_type using errcode = '22023';
  end if;
  if p_scope_type = 'SPECIFIC' and coalesce(cardinality(p_allowed_business_unit_ids), 0) = 0 then
    raise exception 'Selected business-unit scope requires at least one business unit.' using errcode = '22023';
  end if;
  if p_dashboard_type is not null and p_dashboard_type not in ('executive','hr','admin','admin_it','manager','employee') then
    raise exception 'Invalid dashboard type: %', p_dashboard_type using errcode = '22023';
  end if;
  if p_primary_role is null or not (p_primary_role = any(p_role_ids)) then
    raise exception 'The primary role must be included in assigned roles.' using errcode = '22023';
  end if;
  if cardinality(p_role_ids) <> cardinality(array(select distinct unnest(p_role_ids))) then
    raise exception 'Duplicate role assignments are not permitted.' using errcode = '22023';
  end if;

  select coalesce(allowlist.max_active_roles, 1)
  into v_max_roles
  from (select p_target_user_id as id) target
  left join public.user_multi_role_allowlist allowlist on allowlist.user_id = target.id;
  if cardinality(p_role_ids) > v_max_roles then
    raise exception 'This account is approved for at most % active role(s).', v_max_roles using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(p_role_ids) requested(requested_role_id)
    left join public.roles catalog on catalog.id = requested.requested_role_id
    where catalog.id is null or not catalog.is_active
  ) then
    raise exception 'One or more requested roles are unknown or inactive.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'profile', jsonb_build_object('role', target.role, 'dashboardType', target.dashboard_type, 'dataScope', target.data_access_scope),
    'roles', coalesce((select jsonb_agg(to_jsonb(existing_role)) from public.user_roles existing_role where existing_role.user_id = target.id and existing_role.is_active), '[]'::jsonb)
  ) into v_before_state
  from public.hris_users target where target.id = p_target_user_id;

  if exists (
    select 1 from public.user_roles existing_role
    where existing_role.user_id = p_target_user_id
      and existing_role.role_id = 'Admin'
      and existing_role.is_active
  ) and not ('Admin' = any(p_role_ids)) then
    select count(distinct existing_role.user_id)
    into v_final_admins
    from public.user_roles existing_role
    join public.hris_users active_user on active_user.id = existing_role.user_id
    where existing_role.role_id = 'Admin'
      and existing_role.is_active
      and lower(active_user.status) = 'active';
    if v_final_admins <= 1 then
      raise exception 'Cannot remove the final active Admin.' using errcode = '22023';
    end if;
  end if;

  select coalesce(p_dashboard_type, catalog.dashboard_type)
  into v_dashboard_type
  from public.roles catalog where catalog.id = p_primary_role;

  perform set_config('app.rbac_role_update', 'allowed', true);
  update public.user_roles existing_role
  set is_active = false, is_primary = false, updated_at = now(), updated_by = v_actor_id
  where existing_role.user_id = p_target_user_id;

  foreach v_requested_role_id in array p_role_ids loop
    insert into public.user_roles (
      user_id, role_id, is_primary, scope_type, allowed_business_unit_ids,
      dashboard_type, is_active, assigned_by, updated_by
    ) values (
      p_target_user_id, v_requested_role_id, v_requested_role_id = p_primary_role,
      p_scope_type, coalesce(p_allowed_business_unit_ids, '{}'),
      v_dashboard_type, true, v_actor_id, v_actor_id
    )
    on conflict (user_id, role_id) do update set
      is_primary = excluded.is_primary,
      scope_type = excluded.scope_type,
      allowed_business_unit_ids = excluded.allowed_business_unit_ids,
      dashboard_type = excluded.dashboard_type,
      is_active = true,
      updated_at = now(),
      updated_by = v_actor_id;
  end loop;

  update public.hris_users target
  set role = p_primary_role,
      dashboard_type = v_dashboard_type,
      data_access_scope = jsonb_build_object(
        'type', p_scope_type,
        'allowedBuIds', coalesce(to_jsonb(p_allowed_business_unit_ids), '[]'::jsonb)
      ),
      permission_updated_at = now(),
      permission_updated_by = v_actor_id,
      permission_diagnostic = null
  where target.id = p_target_user_id;

  insert into public.rbac_cache_versions(user_id, version, updated_at)
  values (p_target_user_id, 2, now())
  on conflict (user_id) do update
    set version = public.rbac_cache_versions.version + 1, updated_at = now()
  returning version into v_cache_version;

  select jsonb_build_object(
    'profile', jsonb_build_object('role', target.role, 'dashboardType', target.dashboard_type, 'dataScope', target.data_access_scope),
    'roles', coalesce((select jsonb_agg(to_jsonb(saved_role)) from public.user_roles saved_role where saved_role.user_id = target.id and saved_role.is_active), '[]'::jsonb)
  ) into v_after_state
  from public.hris_users target where target.id = p_target_user_id;

  insert into public.rbac_audit_log(
    actor_user_id, target_user_id, action, entity_type, entity_id, before_value, after_value
  ) values (
    v_actor_id, p_target_user_id, 'SET_USER_ROLES', 'user', p_target_user_id::text,
    v_before_state, v_after_state
  );

  insert into public.notifications(user_id, type, title, message, link, related_entity_id)
  values (
    p_target_user_id::text,
    'SYSTEM_ALERT',
    'Your HRIS access was updated',
    'An administrator updated your role, access scope, or dashboard. Refresh the app to load the new configuration.',
    '/my-profile',
    p_target_user_id::text
  );

  return jsonb_build_object(
    'success', true,
    'targetUserId', p_target_user_id,
    'roles', p_role_ids,
    'primaryRole', p_primary_role,
    'scopeType', p_scope_type,
    'allowedBusinessUnitIds', coalesce(to_jsonb(p_allowed_business_unit_ids), '[]'::jsonb),
    'dashboardType', v_dashboard_type,
    'cacheVersion', v_cache_version,
    'effectiveConfiguration', v_after_state,
    'refreshRequired', true
  );
end;
$$;

-- Safely repair active manager-stage records without resetting any completed
-- approval history.
update public.wfh_requests request
set direct_manager_id = manager.id,
    approver_configuration_required = false,
    approval_configuration_note = null
from public.hris_users employee
join public.hris_users manager on employee.reports_to in (
  manager.id::text, manager.auth_user_id::text, coalesce(manager.employee_id, ''), manager.full_name
)
where request.employee_id = employee.id
  and request.status in ('WFH_PENDING_DEPT_HEAD_APPROVAL', 'WFH_PENDING_GM_APPROVAL')
  and request.direct_manager_id is distinct from manager.id;

update public.leave_requests request
set direct_manager_id = manager.id,
    approver_configuration_required = false,
    approval_configuration_note = null
from public.hris_users employee
join public.hris_users manager on employee.reports_to in (
  manager.id::text, manager.auth_user_id::text, coalesce(manager.employee_id, ''), manager.full_name
)
where request.employee_id = employee.id
  and request.status in ('Pending', 'PendingGM')
  and request.direct_manager_id is distinct from manager.id;

update public.ot_requests request
set direct_manager_id = manager.id,
    approver_configuration_required = false,
    approval_configuration_note = null
from public.hris_users employee
join public.hris_users manager on employee.reports_to in (
  manager.id::text, manager.auth_user_id::text, coalesce(manager.employee_id, ''), manager.full_name
)
where request.employee_id = employee.id
  and request.status::text in ('Submitted', 'PendingGM')
  and request.direct_manager_id is distinct from manager.id;

-- Correct Boj's operational access while retaining approval authority solely
-- through the saved reporting relationship.
do $$
declare
  v_target_id uuid;
  v_actor_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  select id into v_target_id
  from public.hris_users
  where lower(email) = 'boj@thenextperience.com'
  limit 1;
  if v_target_id is null then return; end if;

  select assigned.user_id into v_actor_id
  from public.user_roles assigned
  join public.hris_users active_user on active_user.id = assigned.user_id
  where assigned.role_id = 'Admin'
    and assigned.is_active
    and assigned.user_id <> v_target_id
    and lower(active_user.status) = 'active'
  order by assigned.updated_at desc nulls last
  limit 1;
  if v_actor_id is null then
    raise exception 'Boj access repair requires another active Admin.';
  end if;

  select jsonb_build_object(
    'profile', jsonb_build_object('role', target.role, 'dashboardType', target.dashboard_type, 'dataScope', target.data_access_scope),
    'roles', coalesce((select jsonb_agg(to_jsonb(existing_role)) from public.user_roles existing_role where existing_role.user_id = target.id and existing_role.is_active), '[]'::jsonb)
  ) into v_before
  from public.hris_users target where target.id = v_target_id;

  perform set_config('app.rbac_role_update', 'allowed', true);
  update public.user_roles existing_role
  set is_active = false, is_primary = false, updated_at = now(), updated_by = v_actor_id
  where existing_role.user_id = v_target_id;

  insert into public.user_roles(
    user_id, role_id, is_primary, scope_type, allowed_business_unit_ids,
    dashboard_type, is_active, assigned_by, updated_by
  ) values (
    v_target_id, 'Manager', true, 'DIRECT_REPORTS', '{}',
    'manager', true, v_actor_id, v_actor_id
  )
  on conflict (user_id, role_id) do update set
    is_primary = true,
    scope_type = 'DIRECT_REPORTS',
    allowed_business_unit_ids = '{}',
    dashboard_type = 'manager',
    is_active = true,
    updated_at = now(),
    updated_by = v_actor_id;

  update public.hris_users target
  set role = 'Manager',
      dashboard_type = 'manager',
      data_access_scope = jsonb_build_object('type', 'DIRECT_REPORTS', 'allowedBuIds', '[]'::jsonb),
      permission_updated_at = now(),
      permission_updated_by = v_actor_id,
      permission_diagnostic = null
  where target.id = v_target_id;

  insert into public.rbac_cache_versions(user_id, version, updated_at)
  values (v_target_id, 2, now())
  on conflict (user_id) do update
    set version = public.rbac_cache_versions.version + 1, updated_at = now();

  select jsonb_build_object(
    'profile', jsonb_build_object('role', target.role, 'dashboardType', target.dashboard_type, 'dataScope', target.data_access_scope),
    'roles', coalesce((select jsonb_agg(to_jsonb(saved_role)) from public.user_roles saved_role where saved_role.user_id = target.id and saved_role.is_active), '[]'::jsonb)
  ) into v_after
  from public.hris_users target where target.id = v_target_id;

  insert into public.rbac_audit_log(
    actor_user_id, target_user_id, action, entity_type, entity_id, before_value, after_value
  ) values (
    v_actor_id, v_target_id, 'SYSTEM_REPAIR_USER_ACCESS', 'user', v_target_id::text, v_before, v_after
  );

  insert into public.notifications(user_id, type, title, message, link, related_entity_id)
  values (
    v_target_id::text,
    'SYSTEM_ALERT',
    'Your HRIS access was corrected',
    'Your operational role is now Manager with direct-report access. Refresh the app to load your pending approvals.',
    '/approvals',
    v_target_id::text
  );
end;
$$;

-- Normalize actionable historical links that contain a request identifier.
update public.notifications notification
set link = '/approvals?type=wfh&item=' || notification.related_entity_id
where notification.related_entity_id is not null
  and notification.link like '/payroll/wfh-requests%'
  and exists (select 1 from public.wfh_requests request where request.id::text = notification.related_entity_id);

update public.notifications notification
set link = '/approvals?type=leave&item=' || notification.related_entity_id
where notification.related_entity_id is not null
  and notification.link like '/payroll/leave%'
  and exists (select 1 from public.leave_requests request where request.id::text = notification.related_entity_id);

update public.notifications notification
set link = '/approvals?type=overtime&item=' || notification.related_entity_id
where notification.related_entity_id is not null
  and notification.link like '/payroll/overtime-requests%'
  and exists (select 1 from public.ot_requests request where request.id::text = notification.related_entity_id);

revoke all on function public.get_my_pending_time_approval_ids() from public, anon;
grant execute on function public.get_my_pending_time_approval_ids() to authenticated;
revoke all on function public.admin_set_user_roles(uuid,text[],text,text,uuid[],text) from public, anon;
grant execute on function public.admin_set_user_roles(uuid,text[],text,text,uuid[],text) to authenticated;

comment on function public.get_my_pending_time_approval_ids() is
  'Returns only Leave, WFH and Overtime records on which the current user is the active assigned approver.';
