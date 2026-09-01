-- Repair recurring RBAC regressions without changing organizational roles.
--
-- Organizational role, data scope, and dashboard presentation remain separate:
--   * user_roles.role_id grants role-specific capabilities
--   * user_roles.scope_type controls record reach
--   * user_roles.dashboard_type controls presentation only
-- Active employees inherit the existing Employee feature/workflow bundle, but
-- never another employee's record scope.

create or replace function private.is_employee_self_service_eligible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hris_users u
    where u.id = p_user_id
      and u.auth_user_id is not null
      and lower(coalesce(u.status, '')) = 'active'
      and coalesce(u.is_duplicate, false) = false
      and lower(coalesce(u.employment_status, '')) not in (
        'inactive', 'terminated', 'resigned', 'separated', 'archived'
      )
      and exists (
        select 1
        from auth.users au
        where au.id = u.auth_user_id
          and au.deleted_at is null
          and (au.banned_until is null or au.banned_until < now())
      )
      and exists (
        select 1
        from public.user_roles assigned
        join public.roles assigned_role
          on assigned_role.id = assigned.role_id
         and assigned_role.is_active
        where assigned.user_id = u.id
          and assigned.is_active
      )
  )
$$;

create or replace function private.effective_role_ids(p_user_id uuid)
returns table(role_id text)
language sql
stable
security definer
set search_path = ''
as $$
  with assigned as (
    select distinct ur.role_id
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.is_active
    where ur.user_id = p_user_id
      and ur.is_active
  )
  select assigned.role_id
  from assigned
  union
  select employee_role.id
  from public.roles employee_role
  where employee_role.id = 'Employee'
    and employee_role.is_active
    and exists (select 1 from assigned)
    and private.is_employee_self_service_eligible(p_user_id)
$$;

revoke all on function private.is_employee_self_service_eligible(uuid) from public, anon, authenticated;
revoke all on function private.effective_role_ids(uuid) from public, anon, authenticated;

create or replace function public.has_feature_permission(p_resource text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.effective_role_ids(public.current_hris_user_id()) effective_role
    join public.role_permissions rp on rp.role_id = effective_role.role_id
    join public.resources res on res.id = rp.resource_id and res.is_active
    where rp.resource_id = p_resource
      and (p_action = any(rp.permissions) or 'manage' = any(rp.permissions))
  )
$$;

create or replace function public.has_workflow_permission(p_workflow text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.effective_role_ids(public.current_hris_user_id()) effective_role
    join public.role_workflow_permissions wp on wp.role_id = effective_role.role_id
    where wp.workflow_key = p_workflow
      and p_action = any(wp.actions)
  )
$$;

-- Complete the Employee self-service bundle. All non-Employee roles inherit it
-- only when linked to an active employee and an active approved role.
insert into public.role_permissions (role_id, resource_id, permissions, updated_at)
select
  'Employee',
  seeded.resource_id,
  array(
    select distinct permission
    from unnest(coalesce(existing.permissions, '{}'::text[]) || seeded.permissions) permission
    order by permission
  ),
  now()
from (values
  ('Employees'::text, array['view']::text[]),
  ('OT'::text, array['view', 'create', 'edit']::text[]),
  ('WFH'::text, array['view', 'create', 'edit']::text[]),
  ('Leave'::text, array['view', 'create', 'edit']::text[])
) seeded(resource_id, permissions)
left join public.role_permissions existing
  on existing.role_id = 'Employee'
 and existing.resource_id = seeded.resource_id
where exists (select 1 from public.roles where id = 'Employee' and is_active)
  and exists (select 1 from public.resources where id = seeded.resource_id and is_active)
on conflict (role_id, resource_id) do update
set permissions = excluded.permissions,
    updated_at = excluded.updated_at;

insert into public.role_workflow_permissions (role_id, workflow_key, actions, updated_at)
select
  'Employee',
  seeded.workflow_key,
  array(
    select distinct action
    from unnest(coalesce(existing.actions, '{}'::text[]) || seeded.actions) action
    order by action
  ),
  now()
from (values
  ('Overtime'::text, array['submit', 'cancel']::text[]),
  ('WFH'::text, array['submit', 'cancel']::text[]),
  ('Leave'::text, array['submit', 'cancel']::text[])
) seeded(workflow_key, actions)
left join public.role_workflow_permissions existing
  on existing.role_id = 'Employee'
 and existing.workflow_key = seeded.workflow_key
where exists (select 1 from public.roles where id = 'Employee' and is_active)
on conflict (role_id, workflow_key) do update
set actions = excluded.actions,
    updated_at = excluded.updated_at;

-- Case-handler eligibility is a capability, not a role-name comparison. It is
-- stored separately because the feature-permission action domain is closed.
-- Future approved roles can receive this capability without application code.
create table if not exists public.incident_case_handler_roles (
  role_id text primary key references public.roles(id) on update cascade on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.incident_case_handler_roles enable row level security;
revoke all on table public.incident_case_handler_roles from public, anon, authenticated;

insert into public.incident_case_handler_roles (role_id, is_active, updated_at)
select r.id, true, now()
from public.roles r
where r.id = 'HR Staff' and r.is_active
on conflict (role_id) do update
set is_active = true,
    updated_at = excluded.updated_at;

create or replace function private.user_can_handle_incident_case(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.effective_role_ids(p_user_id) effective_role
    join public.incident_case_handler_roles capability
      on capability.role_id = effective_role.role_id
     and capability.is_active
  )
$$;

create or replace function private.user_is_within_current_scope(p_target_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer public.hris_users%rowtype;
  target_user public.hris_users%rowtype;
  scope jsonb := public.current_data_scope();
  scope_type text := scope->>'type';
begin
  select * into viewer from public.hris_users where id = public.current_hris_user_id();
  select * into target_user from public.hris_users where id = p_target_user_id;

  if viewer.id is null or target_user.id is null then return false; end if;
  if viewer.id = target_user.id then return true; end if;
  if scope_type = 'GLOBAL' then return true; end if;
  if scope_type = 'SPECIFIC' then
    return target_user.business_unit_id::text in (
      select jsonb_array_elements_text(coalesce(scope->'allowedBuIds', '[]'::jsonb))
    );
  end if;
  if scope_type = 'HOME_ONLY' then
    return viewer.business_unit_id is not null and viewer.business_unit_id = target_user.business_unit_id;
  end if;
  if scope_type = 'DEPARTMENT' then
    return viewer.department_id is not null and viewer.department_id = target_user.department_id;
  end if;
  if scope_type = 'DIRECT_REPORTS' then
    return target_user.reports_to in (
      viewer.id::text, viewer.auth_user_id::text, viewer.employee_id, viewer.full_name
    );
  end if;
  return false;
end;
$$;

revoke all on function private.user_can_handle_incident_case(uuid) from public, anon, authenticated;
revoke all on function private.user_is_within_current_scope(uuid) from public, anon, authenticated;

create or replace function public.get_assignable_incident_case_handlers()
returns table (
  id uuid,
  full_name text,
  email text,
  job_title text,
  business_unit text,
  business_unit_id uuid,
  role_id text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    candidate.id,
    candidate.full_name,
    candidate.email,
    candidate.position as job_title,
    candidate.business_unit,
    candidate.business_unit_id,
    primary_assignment.role_id
  from public.hris_users candidate
  join lateral (
    select ur.role_id
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.is_active
    where ur.user_id = candidate.id
      and ur.is_active
    order by ur.is_primary desc, ur.role_id
    limit 1
  ) primary_assignment on true
  where public.current_hris_user_id() is not null
    and (
      public.has_feature_permission('IncidentReports', 'assign')
      or public.has_feature_permission('IncidentReports', 'manage')
    )
    and private.is_employee_self_service_eligible(candidate.id)
    and private.user_can_handle_incident_case(candidate.id)
    and private.user_is_within_current_scope(candidate.id)
  order by candidate.full_name, candidate.id
$$;

revoke all on function public.get_assignable_incident_case_handlers() from public, anon;
grant execute on function public.get_assignable_incident_case_handlers() to authenticated;

comment on function public.get_assignable_incident_case_handlers() is
  'Minimal capability- and scope-filtered directory for assigning active Incident Report case handlers.';

create or replace function public.assign_incident_case_handler(
  p_incident_report_id uuid,
  p_handler_user_id uuid,
  p_move_to_nte boolean default false
)
returns public.incident_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := public.current_hris_user_id();
  v_actor_email text;
  v_handler_name text;
  v_handler_email text;
  v_previous_handler_name text;
  v_report public.incident_reports%rowtype;
  v_previous_handler_id uuid;
  v_assignment_changed boolean;
  v_dedupe_key text;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to assign an incident case handler.';
  end if;

  if not public.has_feature_permission('IncidentReports', 'assign')
     and not public.has_feature_permission('IncidentReports', 'manage') then
    raise exception using errcode = '42501', message = 'You do not have permission to assign incident case handlers.';
  end if;

  select * into v_report
  from public.incident_reports
  where id = p_incident_report_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'The incident report could not be found.';
  end if;

  if p_handler_user_id is null then
    raise exception using errcode = '23502', message = 'Select an authorized case handler before continuing.';
  end if;

  select u.full_name, u.email
    into v_handler_name, v_handler_email
  from public.hris_users u
  where u.id = p_handler_user_id
    and private.is_employee_self_service_eligible(u.id)
    and private.user_can_handle_incident_case(u.id)
    and private.user_is_within_current_scope(u.id);

  if v_handler_name is null then
    raise exception using errcode = '22023', message = 'The selected user is not an eligible active HR case handler within your access scope.';
  end if;

  if p_move_to_nte and v_report.pipeline_stage not in ('ir-review', 'hr-review-response', 'nte-for-approval') then
    raise exception using errcode = '22023', message = 'This incident report is not in a stage that can move to NTE approval.';
  end if;

  v_previous_handler_id := v_report.assigned_to_id;
  v_previous_handler_name := v_report.assigned_to_name;
  v_assignment_changed := v_previous_handler_id is distinct from p_handler_user_id;

  update public.incident_reports
  set assigned_to_id = p_handler_user_id,
      assigned_to_name = v_handler_name,
      pipeline_stage = case when p_move_to_nte then 'nte-for-approval' else pipeline_stage end,
      status = case when p_move_to_nte then 'Converted'::public.ir_status else status end,
      updated_at = now()
  where id = p_incident_report_id
  returning * into v_report;

  if v_assignment_changed then
    v_dedupe_key := 'incident:' || v_report.id::text || ':handler:' || p_handler_user_id::text;
    insert into public.notifications (
      user_id, type, title, message, link, related_entity_id, dedupe_key
    ) values (
      p_handler_user_id::text,
      'CASE_ASSIGNED',
      'Incident case assigned',
      format(
        'You were assigned %s involving %s (%s, %s).',
        'TNGIR-' || lpad(v_report.case_number::text, 5, '0'),
        coalesce(array_to_string(v_report.involved_employee_names, ', '), 'an employee'),
        coalesce(v_report.business_unit_name, 'Business unit not specified'),
        coalesce(v_report.category, 'Incident')
      ),
      '/feedback/cases?action=view_case&caseId=' || v_report.id::text,
      v_report.id::text,
      v_dedupe_key
    )
    on conflict (user_id, dedupe_key) do nothing;

    select email into v_actor_email from public.hris_users where id = v_actor_id;
    insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
    values (
      v_actor_id::text,
      v_actor_email,
      case when v_previous_handler_id is null then 'ASSIGN' else 'REASSIGN' end,
      'IncidentReport',
      v_report.id::text,
      format(
        'Case handler changed from %s (%s) to %s (%s) for %s.',
        coalesce(v_previous_handler_name, 'Unassigned'),
        coalesce(v_previous_handler_id::text, 'none'),
        v_handler_name,
        p_handler_user_id,
        'TNGIR-' || lpad(v_report.case_number::text, 5, '0')
      )
    );
  end if;

  if p_move_to_nte then
    select email into v_actor_email from public.hris_users where id = v_actor_id;
    insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
    values (
      v_actor_id::text,
      v_actor_email,
      'UPDATE',
      'IncidentReport',
      v_report.id::text,
      format('Moved %s to NTE approval with handler %s.', 'TNGIR-' || lpad(v_report.case_number::text, 5, '0'), v_handler_name)
    );
  end if;

  return v_report;
end;
$$;

revoke all on function public.assign_incident_case_handler(uuid, uuid, boolean) from public, anon;
grant execute on function public.assign_incident_case_handler(uuid, uuid, boolean) to authenticated;

-- Return the canonical assignment in the auth bootstrap. Legacy profile
-- columns remain available for diagnostics, but no longer determine access.
create or replace function public.get_my_hris_bootstrap()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(profile)
  from (
    select
      u.id,
      u.full_name,
      primary_assignment.role_id as role,
      u.status,
      u.department,
      u.business_unit,
      u.position,
      u.date_hired,
      u.is_photo_enrolled,
      u.email,
      u.business_unit_id,
      u.department_id,
      u.reports_to,
      u.employee_id,
      public.current_data_scope() as data_access_scope,
      primary_assignment.dashboard_type,
      u.permission_diagnostic,
      coalesce(cache.updated_at, u.permission_updated_at) as permission_updated_at,
      u.permission_updated_by,
      u.role as legacy_role,
      u.data_access_scope as legacy_data_access_scope,
      u.dashboard_type as legacy_dashboard_type
    from public.hris_users u
    left join lateral (
      select ur.role_id, ur.dashboard_type
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id and r.is_active
      where ur.user_id = u.id and ur.is_active
      order by ur.is_primary desc, ur.updated_at desc nulls last, ur.role_id
      limit 1
    ) primary_assignment on true
    left join public.rbac_cache_versions cache on cache.user_id = u.id
    where u.auth_user_id = auth.uid()
    limit 1
  ) profile
$$;

create or replace function public.get_my_effective_rbac()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select public.current_hris_user_id() as id
  ), assigned as (
    select ur.role_id, ur.is_primary, ur.dashboard_type, ur.scope_type, ur.allowed_business_unit_ids
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.is_active
    where ur.user_id = (select id from me) and ur.is_active
  ), effective_roles as (
    select role_id from private.effective_role_ids((select id from me))
  ), features as (
    select rp.resource_id, array_agg(distinct action order by action) actions
    from effective_roles effective_role
    join public.role_permissions rp on rp.role_id = effective_role.role_id
    join public.resources res on res.id = rp.resource_id and res.is_active
    cross join lateral unnest(rp.permissions) action
    group by rp.resource_id
  ), sensitive as (
    select sp.field_key, array_agg(distinct action order by action) actions
    from assigned actual_role
    join public.role_sensitive_permissions sp on sp.role_id = actual_role.role_id
    cross join lateral unnest(sp.permissions) action
    group by sp.field_key
  ), workflows as (
    select wp.workflow_key, array_agg(distinct action order by action) actions
    from effective_roles effective_role
    join public.role_workflow_permissions wp on wp.role_id = effective_role.role_id
    cross join lateral unnest(wp.actions) action
    group by wp.workflow_key
  )
  select case
    when (select id from me) is null then
      jsonb_build_object('authorized', false, 'diagnostic', 'No active HRIS profile is linked to this authenticated account.')
    when not exists (select 1 from assigned) then
      jsonb_build_object('authorized', false, 'diagnostic', 'No active approved role assignment was found.')
    else jsonb_build_object(
      'authorized', true,
      'userId', (select id from me),
      'roles', (select jsonb_agg(role_id order by is_primary desc, role_id) from assigned),
      'primaryRole', (select role_id from assigned where is_primary order by role_id limit 1),
      'dashboardType', (select dashboard_type from assigned order by is_primary desc, role_id limit 1),
      'dataScope', public.current_data_scope(),
      'features', coalesce((select jsonb_object_agg(resource_id, to_jsonb(actions)) from features), '{}'::jsonb),
      'sensitive', coalesce((select jsonb_object_agg(field_key, to_jsonb(actions)) from sensitive), '{}'::jsonb),
      'workflows', coalesce((select jsonb_object_agg(workflow_key, to_jsonb(actions)) from workflows), '{}'::jsonb),
      'selfServiceInherited', private.is_employee_self_service_eligible((select id from me)),
      'cacheVersion', coalesce((select version from public.rbac_cache_versions where user_id = (select id from me)), 1)
    )
  end
$$;

revoke all on function public.get_my_hris_bootstrap() from public, anon;
revoke all on function public.get_my_effective_rbac() from public, anon;
revoke all on function public.has_feature_permission(text, text) from public, anon;
revoke all on function public.has_workflow_permission(text, text) from public, anon;
grant execute on function public.get_my_hris_bootstrap() to authenticated;
grant execute on function public.get_my_effective_rbac() to authenticated;
grant execute on function public.has_feature_permission(text, text) to authenticated;
grant execute on function public.has_workflow_permission(text, text) to authenticated;

-- Make permission changes observable by every open session. These triggers
-- update only version rows; they do not change role assignments or records.
create or replace function private.bump_rbac_cache_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then return; end if;
  insert into public.rbac_cache_versions (user_id, version, updated_at)
  values (p_user_id, 2, now())
  on conflict (user_id) do update
  set version = public.rbac_cache_versions.version + 1,
      updated_at = now();
end;
$$;

create or replace function private.bump_rbac_cache_for_role(p_role_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role_id is null then return; end if;
  insert into public.rbac_cache_versions (user_id, version, updated_at)
  select distinct ur.user_id, 2, now()
  from public.user_roles ur
  where ur.role_id = p_role_id and ur.is_active
  on conflict (user_id) do update
  set version = public.rbac_cache_versions.version + 1,
      updated_at = now();
end;
$$;

create or replace function private.on_user_role_rbac_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.bump_rbac_cache_for_user(coalesce(new.user_id, old.user_id));
  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform private.bump_rbac_cache_for_user(old.user_id);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function private.on_role_permission_rbac_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.bump_rbac_cache_for_role(coalesce(new.role_id, old.role_id));
  if tg_op = 'UPDATE' and old.role_id is distinct from new.role_id then
    perform private.bump_rbac_cache_for_role(old.role_id);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function private.on_role_definition_rbac_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.bump_rbac_cache_for_role(coalesce(new.id, old.id));
  if tg_op = 'UPDATE' and old.id is distinct from new.id then
    perform private.bump_rbac_cache_for_role(old.id);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function private.on_hris_user_access_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or old.status is distinct from new.status
     or old.employment_status is distinct from new.employment_status
     or old.auth_user_id is distinct from new.auth_user_id
     or old.is_duplicate is distinct from new.is_duplicate
     or old.business_unit_id is distinct from new.business_unit_id
     or old.department_id is distinct from new.department_id
     or old.reports_to is distinct from new.reports_to then
    perform private.bump_rbac_cache_for_user(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_rbac_after_user_role_change on public.user_roles;
create trigger refresh_rbac_after_user_role_change
after insert or update or delete on public.user_roles
for each row execute function private.on_user_role_rbac_change();

drop trigger if exists refresh_rbac_after_feature_permission_change on public.role_permissions;
create trigger refresh_rbac_after_feature_permission_change
after insert or update or delete on public.role_permissions
for each row execute function private.on_role_permission_rbac_change();

drop trigger if exists refresh_rbac_after_workflow_permission_change on public.role_workflow_permissions;
create trigger refresh_rbac_after_workflow_permission_change
after insert or update or delete on public.role_workflow_permissions
for each row execute function private.on_role_permission_rbac_change();

drop trigger if exists refresh_rbac_after_sensitive_permission_change on public.role_sensitive_permissions;
create trigger refresh_rbac_after_sensitive_permission_change
after insert or update or delete on public.role_sensitive_permissions
for each row execute function private.on_role_permission_rbac_change();

drop trigger if exists refresh_rbac_after_case_handler_capability_change on public.incident_case_handler_roles;
create trigger refresh_rbac_after_case_handler_capability_change
after insert or update or delete on public.incident_case_handler_roles
for each row execute function private.on_role_permission_rbac_change();

drop trigger if exists refresh_rbac_after_role_definition_change on public.roles;
create trigger refresh_rbac_after_role_definition_change
after insert or update or delete on public.roles
for each row execute function private.on_role_definition_rbac_change();

drop trigger if exists refresh_rbac_after_hris_user_access_change on public.hris_users;
create trigger refresh_rbac_after_hris_user_access_change
after insert or update of status, employment_status, auth_user_id, is_duplicate,
  business_unit_id, department_id, reports_to on public.hris_users
for each row execute function private.on_hris_user_access_change();

revoke all on function private.bump_rbac_cache_for_user(uuid) from public, anon, authenticated;
revoke all on function private.bump_rbac_cache_for_role(text) from public, anon, authenticated;
revoke all on function private.on_user_role_rbac_change() from public, anon, authenticated;
revoke all on function private.on_role_permission_rbac_change() from public, anon, authenticated;
revoke all on function private.on_role_definition_rbac_change() from public, anon, authenticated;
revoke all on function private.on_hris_user_access_change() from public, anon, authenticated;

insert into public.rbac_cache_versions (user_id, version, updated_at)
select u.id, 2, now()
from public.hris_users u
where lower(coalesce(u.status, '')) = 'active'
on conflict (user_id) do update
set version = public.rbac_cache_versions.version + 1,
    updated_at = now();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'rbac_cache_versions'
     ) then
    alter publication supabase_realtime add table public.rbac_cache_versions;
  end if;
end
$$;
