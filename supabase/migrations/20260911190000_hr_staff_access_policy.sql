-- Normalize the HR Staff role as one auditable, role-level policy.
-- This repairs the active HR Staff population as a group and leaves
-- historical employee records and inactive role assignments untouched.

do $$
declare
  v_before text[];
begin
  if not exists (select 1 from public.roles where id = 'HR Staff' and is_active) then
    raise exception 'HR Staff role is missing or inactive; refusing to change access.';
  end if;
  if not exists (select 1 from public.resources where id = 'Evaluation' and is_active) then
    raise exception 'Evaluation resource is missing; refusing to change access.';
  end if;

  select permissions
  into v_before
  from public.role_permissions
  where role_id = 'HR Staff' and resource_id = 'Evaluation';

  insert into public.role_permissions (role_id, resource_id, permissions, updated_at)
  values ('HR Staff', 'Evaluation', array['view', 'create', 'assign']::text[], now())
  on conflict (role_id, resource_id) do update
    set permissions = excluded.permissions,
        updated_at = excluded.updated_at;

  if v_before is distinct from array['view', 'create', 'assign']::text[] then
    insert into public.rbac_audit_log(
      actor_user_id, action, entity_type, entity_id, before_value, after_value
    ) values (
      null,
      'UPDATE_ROLE_PERMISSIONS',
      'role',
      'HR Staff',
      jsonb_build_object('resource', 'Evaluation', 'permissions', coalesce(to_jsonb(v_before), '[]'::jsonb)),
      jsonb_build_object('resource', 'Evaluation', 'permissions', to_jsonb(array['view', 'create', 'assign']::text[]))
    );
  end if;
end;
$$;

-- The role catalog already declares HR Staff as global HR. Keep the catalog
-- and every active assignment/profile in agreement so the dashboard and record
-- scope cannot silently fall back to Employee self-service behavior.
update public.roles
set dashboard_type = 'hr',
    default_data_scope = 'GLOBAL',
    updated_at = now()
where id = 'HR Staff'
  and (dashboard_type is distinct from 'hr' or default_data_scope is distinct from 'GLOBAL');

do $$
declare
  row record;
  before_state jsonb;
  after_state jsonb;
begin
  perform set_config('app.rbac_role_update', 'allowed', true);

  for row in
    select
      ur.user_id,
      ur.role_id,
      ur.is_primary,
      ur.scope_type,
      ur.allowed_business_unit_ids,
      ur.dashboard_type as assignment_dashboard_type,
      u.role as profile_role,
      u.dashboard_type as profile_dashboard_type,
      u.data_access_scope as profile_scope
    from public.user_roles ur
    join public.hris_users u on u.id = ur.user_id
    where ur.role_id = 'HR Staff'
      and ur.is_active
      and lower(coalesce(u.status, '')) = 'active'
      and (
        ur.scope_type is distinct from 'GLOBAL'
        or ur.dashboard_type is distinct from 'hr'
        or coalesce(cardinality(ur.allowed_business_unit_ids), 0) <> 0
        or (ur.is_primary and u.role is distinct from 'HR Staff')
        or u.dashboard_type is distinct from 'hr'
        or coalesce(u.data_access_scope->>'type', '') is distinct from 'GLOBAL'
      )
  loop
    before_state := jsonb_build_object(
      'profile', jsonb_build_object(
        'role', row.profile_role,
        'dashboardType', row.profile_dashboard_type,
        'dataScope', row.profile_scope
      ),
      'assignment', jsonb_build_object(
        'roleId', row.role_id,
        'isPrimary', row.is_primary,
        'scopeType', row.scope_type,
        'allowedBusinessUnitIds', to_jsonb(coalesce(row.allowed_business_unit_ids, '{}'::uuid[])),
        'dashboardType', row.assignment_dashboard_type
      )
    );

    update public.user_roles
    set scope_type = 'GLOBAL',
        allowed_business_unit_ids = '{}',
        dashboard_type = 'hr',
        updated_at = now(),
        updated_by = null
    where user_id = row.user_id
      and role_id = 'HR Staff'
      and is_active;

    update public.hris_users
    set role = case when row.is_primary then 'HR Staff' else role end,
        dashboard_type = case when row.is_primary then 'hr' else dashboard_type end,
        data_access_scope = case when row.is_primary
          then jsonb_build_object('type', 'GLOBAL', 'allowedBuIds', '[]'::jsonb)
          else data_access_scope
        end,
        permission_updated_at = now(),
        permission_updated_by = null,
        permission_diagnostic = null
    where id = row.user_id;

    insert into public.rbac_cache_versions(user_id, version, updated_at)
    values (row.user_id, 2, now())
    on conflict (user_id) do update
      set version = public.rbac_cache_versions.version + 1,
          updated_at = now();

    select jsonb_build_object(
      'profile', jsonb_build_object(
        'role', u.role,
        'dashboardType', u.dashboard_type,
        'dataScope', u.data_access_scope
      ),
      'assignment', (
        select to_jsonb(saved_role)
        from public.user_roles saved_role
        where saved_role.user_id = row.user_id
          and saved_role.role_id = 'HR Staff'
          and saved_role.is_active
      )
    )
    into after_state
    from public.hris_users u
    where u.id = row.user_id;

    insert into public.rbac_audit_log(
      actor_user_id, target_user_id, action, entity_type, entity_id,
      before_value, after_value
    ) values (
      null,
      row.user_id,
      'NORMALIZE_HR_STAFF_ACCESS',
      'user_role',
      row.user_id::text,
      before_state,
      after_state
    );
  end loop;
end;
$$;

-- Evaluation assignment is a distinct capability. HR Staff can create and
-- assign cycles, while manage-only controls (question bank, timelines,
-- destructive edits, and result visibility changes) remain restricted.
drop policy if exists evaluation_evaluators_hr_insert on public.evaluation_evaluators;
create policy evaluation_evaluators_hr_insert
  on public.evaluation_evaluators
  for insert to authenticated
  with check ((select public.has_feature_permission('Evaluation', 'assign')));

drop policy if exists evaluation_evaluators_hr_update on public.evaluation_evaluators;
create policy evaluation_evaluators_hr_update
  on public.evaluation_evaluators
  for update to authenticated
  using ((select public.has_feature_permission('Evaluation', 'manage')))
  with check ((select public.has_feature_permission('Evaluation', 'manage')));

drop policy if exists evaluation_evaluators_hr_delete on public.evaluation_evaluators;
create policy evaluation_evaluators_hr_delete
  on public.evaluation_evaluators
  for delete to authenticated
  using ((select public.has_feature_permission('Evaluation', 'manage')));

drop policy if exists evaluations_hr_insert on public.evaluations;
create policy evaluations_hr_insert
  on public.evaluations
  for insert to authenticated
  with check ((select public.has_feature_permission('Evaluation', 'assign')));

drop policy if exists evaluations_hr_update on public.evaluations;
create policy evaluations_hr_update
  on public.evaluations
  for update to authenticated
  using ((select public.has_feature_permission('Evaluation', 'manage')))
  with check ((select public.has_feature_permission('Evaluation', 'manage')));

drop policy if exists evaluations_hr_delete on public.evaluations;
create policy evaluations_hr_delete
  on public.evaluations
  for delete to authenticated
  using ((select public.has_feature_permission('Evaluation', 'manage')));

drop policy if exists evaluation_assignments_hr_insert on public.evaluation_assignments;
create policy evaluation_assignments_hr_insert
  on public.evaluation_assignments
  for insert to authenticated
  with check ((select public.has_feature_permission('Evaluation', 'assign')));

drop policy if exists evaluation_assignments_hr_update on public.evaluation_assignments;
create policy evaluation_assignments_hr_update
  on public.evaluation_assignments
  for update to authenticated
  using ((select public.has_feature_permission('Evaluation', 'manage')))
  with check ((select public.has_feature_permission('Evaluation', 'manage')));

drop policy if exists evaluation_assignments_hr_delete on public.evaluation_assignments;
create policy evaluation_assignments_hr_delete
  on public.evaluation_assignments
  for delete to authenticated
  using ((select public.has_feature_permission('Evaluation', 'manage')));

-- Keep the existing assignment/rater rules, but prevent an HR Staff user from
-- using the HR-wide override to edit another person's completed submission.
drop policy if exists evaluation_submissions_hr_role_guard on public.evaluation_submissions;
create policy evaluation_submissions_hr_role_guard
  on public.evaluation_submissions
  as restrictive
  for all to authenticated
  using (
    not (select public.is_hr_or_admin())
    or (select public.has_feature_permission('Evaluation', 'manage'))
    or rater_id = (select public.current_hris_user_id())
  )
  with check (
    not (select public.is_hr_or_admin())
    or (select public.has_feature_permission('Evaluation', 'manage'))
    or rater_id = (select public.current_hris_user_id())
  );

-- Question-bank and timeline writes are manage-only. HR Staff can use the
-- published choices while the assignment form is open.
drop policy if exists eval_qs_hr_admin_all on public.evaluation_question_sets;
create policy eval_qs_manage_all
  on public.evaluation_question_sets
  for all to authenticated
  using ((select public.has_feature_permission('Evaluation', 'manage')))
  with check ((select public.has_feature_permission('Evaluation', 'manage')));

drop policy if exists eval_q_hr_admin_all on public.evaluation_questions;
create policy eval_q_manage_all
  on public.evaluation_questions
  for all to authenticated
  using ((select public.has_feature_permission('Evaluation', 'manage')))
  with check ((select public.has_feature_permission('Evaluation', 'manage')));

drop policy if exists eval_tl_hr_admin_all on public.evaluation_timelines;
create policy eval_tl_manage_all
  on public.evaluation_timelines
  for all to authenticated
  using ((select public.has_feature_permission('Evaluation', 'manage')))
  with check ((select public.has_feature_permission('Evaluation', 'manage')));

-- Keep the RPC itself on the same source of truth as its RLS policies. The
-- replacement is derived from the deployed function definition so the
-- idempotent request-key behavior and notification transaction are preserved.
do $$
declare
  definition text;
  replaced text;
begin
  definition := pg_get_functiondef(
    'public.create_evaluation_cycle(text,uuid,uuid[],uuid[],uuid[],date,jsonb,text)'::regprocedure
  );
  replaced := replace(
    definition,
    'if not (select public.is_hr_or_admin()) then',
    'if not (select public.has_feature_permission(''Evaluation'', ''assign'')) then'
  );
  if replaced = definition then
    raise exception 'create_evaluation_cycle permission guard was not found; refusing to continue.';
  end if;
  execute replaced;
end;
$$;
