-- Transactional integration regression for canonical RBAC inheritance.
-- Run with a migration-capable test connection. The final ROLLBACK preserves
-- every pre-existing user, request, assignment, notification, and audit row.

begin;

create temp table test_identity (
  label text primary key,
  auth_id uuid not null,
  user_id uuid not null,
  role_id text not null,
  scope_type text not null,
  status text not null
) on commit drop;

insert into test_identity values
  ('employee', gen_random_uuid(), gen_random_uuid(), 'Employee', 'HOME_ONLY', 'Active'),
  ('finance', gen_random_uuid(), gen_random_uuid(), 'Finance Staff', 'HOME_ONLY', 'Active'),
  ('hr_staff', gen_random_uuid(), gen_random_uuid(), 'HR Staff', 'GLOBAL', 'Active'),
  ('global_hr', gen_random_uuid(), gen_random_uuid(), 'HR Manager', 'GLOBAL', 'Active'),
  ('scoped_hr', gen_random_uuid(), gen_random_uuid(), 'HR Manager', 'HOME_ONLY', 'Active'),
  ('inactive_handler', gen_random_uuid(), gen_random_uuid(), 'HR Staff', 'GLOBAL', 'Inactive');

create temp table test_org as
select u.business_unit, u.business_unit_id, u.department, u.department_id, u.reports_to
from public.hris_users u
where lower(u.status) = 'active'
  and u.business_unit_id is not null
  and u.reports_to ~* '^[0-9a-f-]{36}$'
  and exists (select 1 from public.hris_users manager where manager.id::text = u.reports_to)
limit 1;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
)
select auth_id, 'authenticated', 'authenticated',
       label || '-' || auth_id::text || '@rbac-test.invalid', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
       now(), now(), false, false
from test_identity;

insert into public.hris_users (
  id, auth_user_id, email, first_name, last_name, full_name, role, status,
  is_photo_enrolled, business_unit, department, position, date_hired,
  business_unit_id, department_id, employment_status, data_access_scope,
  dashboard_type, reports_to, employee_id, is_duplicate
)
select identity.user_id, identity.auth_id,
       identity.label || '-' || identity.auth_id::text || '@rbac-test.invalid',
       'Synthetic', identity.label, 'Synthetic ' || identity.label,
       identity.role_id, identity.status, false,
       org.business_unit, org.department, 'RBAC test', current_date,
       org.business_unit_id, org.department_id, 'Regular',
       jsonb_build_object('type', identity.scope_type),
       case when identity.role_id in ('HR Staff', 'HR Manager') then 'hr' else 'employee' end,
       org.reports_to, 'TEST-' || substr(identity.user_id::text, 1, 8), false
from test_identity identity
cross join test_org org;

insert into public.user_roles (
  user_id, role_id, is_primary, scope_type, allowed_business_unit_ids,
  dashboard_type, is_active, assigned_at
)
select user_id, role_id, true, scope_type, '{}'::uuid[],
       case when role_id in ('HR Staff', 'HR Manager') then 'hr' else 'employee' end,
       true, now()
from test_identity;

create temp table test_result (name text primary key, passed boolean not null) on commit drop;
create temp table test_request (kind text primary key, id uuid not null) on commit drop;
grant all on test_identity, test_result, test_request to authenticated;
set local role authenticated;

-- Employee WFH and OT are the foreign records used to verify HR Staff privacy.
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', (select auth_id from test_identity where label = 'employee'), 'role', 'authenticated')::text,
  true
);
with row as (
  insert into public.wfh_requests (
    employee_id, employee_name, date, end_date, reason, status,
    business_unit_id, department_id
  )
  select identity.user_id, 'Synthetic Employee', current_date + 1, current_date + 1,
         'Transactional RBAC integration test', 'WFH_PENDING_SUBMISSION',
         user_row.business_unit_id, user_row.department_id
  from test_identity identity
  join public.hris_users user_row on user_row.id = identity.user_id
  where identity.label = 'employee'
  returning id
)
insert into test_request select 'employee_wfh', id from row;
update public.wfh_requests set status = 'WFH_PENDING_DEPT_HEAD_APPROVAL'
where id = (select id from test_request where kind = 'employee_wfh');

with row as (
  insert into public.ot_requests (
    employee_id, employee_name, date, start_time, end_time, reason, status,
    history_log, ot_type, paid_ot_type
  )
  select user_id, 'Synthetic Employee', current_date + 1, '18:00', '20:00',
         'Transactional RBAC integration test', 'Draft', '[]'::jsonb,
         'Paid', 'Regular Overtime'
  from test_identity where label = 'employee'
  returning id
)
insert into test_request select 'employee_ot', id from row;
update public.ot_requests set status = 'Submitted', submitted_at = now()
where id = (select id from test_request where kind = 'employee_ot');

insert into test_result values (
  'employee_submits_own_wfh_and_ot',
  exists(select 1 from public.wfh_requests where id = (select id from test_request where kind = 'employee_wfh'))
  and exists(select 1 from public.ot_requests where id = (select id from test_request where kind = 'employee_ot'))
);

-- HR Staff inherits both self-service workflows but cannot read the Employee's records.
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', (select auth_id from test_identity where label = 'hr_staff'), 'role', 'authenticated')::text,
  true
);
with row as (
  insert into public.wfh_requests (
    employee_id, employee_name, date, end_date, reason, status,
    business_unit_id, department_id
  )
  select identity.user_id, 'Synthetic HR Staff', current_date + 1, current_date + 1,
         'Transactional RBAC integration test', 'WFH_PENDING_SUBMISSION',
         user_row.business_unit_id, user_row.department_id
  from test_identity identity
  join public.hris_users user_row on user_row.id = identity.user_id
  where identity.label = 'hr_staff'
  returning id
)
insert into test_request select 'hr_staff_wfh', id from row;
update public.wfh_requests set status = 'WFH_PENDING_DEPT_HEAD_APPROVAL'
where id = (select id from test_request where kind = 'hr_staff_wfh');

with row as (
  insert into public.ot_requests (
    employee_id, employee_name, date, start_time, end_time, reason, status,
    history_log, ot_type, paid_ot_type
  )
  select user_id, 'Synthetic HR Staff', current_date + 1, '18:00', '20:00',
         'Transactional RBAC integration test', 'Draft', '[]'::jsonb,
         'Paid', 'Regular Overtime'
  from test_identity where label = 'hr_staff'
  returning id
)
insert into test_request select 'hr_staff_ot', id from row;
update public.ot_requests set status = 'Submitted', submitted_at = now()
where id = (select id from test_request where kind = 'hr_staff_ot');

insert into test_result values (
  'hr_staff_inherits_self_service_without_foreign_access',
  public.has_feature_permission('OT', 'create')
  and public.has_feature_permission('WFH', 'create')
  and public.has_workflow_permission('Overtime', 'submit')
  and public.has_workflow_permission('WFH', 'submit')
  and exists(select 1 from public.ot_requests where id = (select id from test_request where kind = 'hr_staff_ot'))
  and exists(select 1 from public.wfh_requests where id = (select id from test_request where kind = 'hr_staff_wfh'))
  and not exists(select 1 from public.ot_requests where id = (select id from test_request where kind = 'employee_ot'))
);

-- Finance Staff also inherits the Employee bundle without changing role.
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', (select auth_id from test_identity where label = 'finance'), 'role', 'authenticated')::text,
  true
);
with row as (
  insert into public.wfh_requests (
    employee_id, employee_name, date, end_date, reason, status,
    business_unit_id, department_id
  )
  select identity.user_id, 'Synthetic Finance Staff', current_date + 1, current_date + 1,
         'Transactional RBAC integration test', 'WFH_PENDING_SUBMISSION',
         user_row.business_unit_id, user_row.department_id
  from test_identity identity
  join public.hris_users user_row on user_row.id = identity.user_id
  where identity.label = 'finance'
  returning id
)
insert into test_request select 'finance_wfh', id from row;
update public.wfh_requests set status = 'WFH_PENDING_DEPT_HEAD_APPROVAL'
where id = (select id from test_request where kind = 'finance_wfh');

with row as (
  insert into public.ot_requests (
    employee_id, employee_name, date, start_time, end_time, reason, status,
    history_log, ot_type, paid_ot_type
  )
  select user_id, 'Synthetic Finance Staff', current_date + 1, '18:00', '20:00',
         'Transactional RBAC integration test', 'Draft', '[]'::jsonb,
         'Paid', 'Regular Overtime'
  from test_identity where label = 'finance'
  returning id
)
insert into test_request select 'finance_ot', id from row;
update public.ot_requests set status = 'Submitted', submitted_at = now()
where id = (select id from test_request where kind = 'finance_ot');

insert into test_result values (
  'finance_staff_inherits_employee_bundle',
  public.get_my_effective_rbac()->>'primaryRole' = 'Finance Staff'
  and public.has_feature_permission('OT', 'create')
  and public.has_feature_permission('WFH', 'create')
  and public.has_workflow_permission('Overtime', 'submit')
  and public.has_workflow_permission('WFH', 'submit')
  and exists(select 1 from public.ot_requests where id = (select id from test_request where kind = 'finance_ot'))
  and exists(select 1 from public.wfh_requests where id = (select id from test_request where kind = 'finance_wfh'))
);

-- Handler discovery is capability-based, excludes inactive users, and is denied to Employees.
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', (select auth_id from test_identity where label = 'global_hr'), 'role', 'authenticated')::text,
  true
);
insert into test_result values (
  'global_hr_lists_only_active_capable_handlers',
  exists(
    select 1 from public.get_assignable_incident_case_handlers()
    where id = (select user_id from test_identity where label = 'hr_staff')
  )
  and not exists(
    select 1 from public.get_assignable_incident_case_handlers()
    where id = (select user_id from test_identity where label = 'inactive_handler')
  )
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', (select auth_id from test_identity where label = 'scoped_hr'), 'role', 'authenticated')::text,
  true
);
insert into test_result values (
  'scoped_hr_only_lists_home_business_unit_handlers',
  not exists(
    select 1
    from public.get_assignable_incident_case_handlers() handler
    where handler.business_unit_id is distinct from (
      select user_row.business_unit_id
      from public.hris_users user_row
      where user_row.id = (select user_id from test_identity where label = 'scoped_hr')
    )
  )
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', (select auth_id from test_identity where label = 'employee'), 'role', 'authenticated')::text,
  true
);
insert into test_result values (
  'employee_cannot_list_handlers',
  not exists(select 1 from public.get_assignable_incident_case_handlers())
);

-- A database permission removal changes effective access immediately.
reset role;
update public.role_permissions
set permissions = array_remove(permissions, 'create'), updated_at = now()
where role_id = 'Employee' and resource_id = 'WFH';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', (select auth_id from test_identity where label = 'employee'), 'role', 'authenticated')::text,
  true
);
insert into test_result values (
  'permission_removal_is_immediate',
  not public.has_feature_permission('WFH', 'create')
);

reset role;
select 1 / case when bool_and(passed) then 1 else 0 end as all_regressions_passed
from test_result;
select * from test_result order by name;

rollback;
