-- Complete production RBAC repair for TNG HRIS.
-- This migration is additive, transactional, rerunnable, and preserves all
-- existing business records and historical role references.

select pg_advisory_xact_lock(hashtext('tng-hris-complete-rbac-repair-v1'));

-- ---------------------------------------------------------------------------
-- Mandatory preflight and recoverable in-database snapshot
-- ---------------------------------------------------------------------------

do $$
declare
  missing_accounts text;
  unexpected_roles text;
begin
  select string_agg(required.email, ', ')
  into missing_accounts
  from (values
    ('kay@thenextperience.com'),
    ('it@thenextperience.com'),
    ('hrs@thenextperience.com')
  ) as required(email)
  where not exists (
    select 1 from public.hris_users u where lower(u.email) = required.email
  );

  if missing_accounts is not null then
    raise exception 'RBAC preflight failed. Required production accounts missing: %', missing_accounts;
  end if;

  select string_agg(distinct u.role, ', ')
  into unexpected_roles
  from public.hris_users u
  where u.role not in (
    'Admin', 'Auditor', 'Board of Director', 'Business Unit Manager',
    'Employee', 'Finance Staff', 'GeneralManager', 'HR Manager', 'HR Staff',
    'IT', 'Manager', 'Operations Director', 'Recruiter', 'test role'
  );

  if unexpected_roles is not null then
    raise exception 'RBAC preflight failed. Unmapped production roles: %', unexpected_roles;
  end if;
end;
$$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.rbac_migration_snapshots (
  snapshot_key text primary key,
  production_commit text not null,
  captured_at timestamptz not null default now(),
  roles jsonb not null,
  role_permissions jsonb not null,
  user_assignments jsonb not null,
  rls_policies jsonb not null,
  approval_baseline jsonb not null
);

insert into private.rbac_migration_snapshots (
  snapshot_key,
  production_commit,
  roles,
  role_permissions,
  user_assignments,
  rls_policies,
  approval_baseline
)
select
  'pre-rbac-20260823-fde428f',
  'fde428f15e5e7567e44d4b6b0025c26c56e878fb',
  coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.roles r), '[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(rp) order by rp.role_id, rp.resource_id) from public.role_permissions rp), '[]'::jsonb),
  coalesce((select jsonb_agg(jsonb_build_object(
    'id', u.id,
    'auth_user_id', u.auth_user_id,
    'email', u.email,
    'role', u.role,
    'status', u.status,
    'data_access_scope', u.data_access_scope
  ) order by lower(u.email)) from public.hris_users u), '[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(p) order by p.schemaname, p.tablename, p.policyname)
    from pg_policies p where p.schemaname = 'public'), '[]'::jsonb),
  jsonb_build_object(
    'captured_at', now(),
    'leave', jsonb_build_object(
      'count', (select count(*) from public.leave_requests where status = 'Pending'),
      'ids', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from public.leave_requests where status = 'Pending')
    ),
    'wfh', jsonb_build_object(
      'count', (select count(*) from public.wfh_requests where status in ('WFH_PENDING_BOD_APPROVAL', 'WFH_PENDING_DEPT_HEAD_APPROVAL')),
      'bod_count', (select count(*) from public.wfh_requests where status = 'WFH_PENDING_BOD_APPROVAL'),
      'department_count', (select count(*) from public.wfh_requests where status = 'WFH_PENDING_DEPT_HEAD_APPROVAL'),
      'ids', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from public.wfh_requests where status in ('WFH_PENDING_BOD_APPROVAL', 'WFH_PENDING_DEPT_HEAD_APPROVAL'))
    ),
    'overtime', jsonb_build_object(
      'count', (select count(*) from public.ot_requests where status::text = 'PendingBOD'),
      'ids', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from public.ot_requests where status::text = 'PendingBOD')
    ),
    'manpower', jsonb_build_object(
      'count', (select count(*) from public.manpower_requests where status = 'Pending'),
      'ids', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from public.manpower_requests where status = 'Pending')
    )
  )
where not exists (
  select 1 from private.rbac_migration_snapshots where snapshot_key = 'pre-rbac-20260823-fde428f'
);

revoke all on private.rbac_migration_snapshots from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Role/resource metadata and complete action vocabulary
-- ---------------------------------------------------------------------------

alter table public.roles add column if not exists display_name text;
alter table public.roles add column if not exists is_active boolean not null default true;
alter table public.roles add column if not exists dashboard_type text not null default 'employee';
alter table public.roles add column if not exists default_data_scope text not null default 'SELF';
alter table public.roles add column if not exists updated_at timestamptz not null default now();

alter table public.hris_users add column if not exists dashboard_type text;
alter table public.hris_users add column if not exists permission_diagnostic text;
alter table public.hris_users add column if not exists permission_updated_at timestamptz;
alter table public.hris_users add column if not exists permission_updated_by uuid;

alter table public.resources add column if not exists module text;
alter table public.resources add column if not exists description text;
alter table public.resources add column if not exists is_active boolean not null default true;
alter table public.resources add column if not exists high_risk boolean not null default false;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.role_permissions'::regclass
      and contype = 'c'
  loop
    execute format('alter table public.role_permissions drop constraint %I', constraint_row.conname);
  end loop;
end;
$$;

alter table public.role_permissions
  add constraint role_permissions_allowed_actions_check
  check (permissions <@ array[
    'view','create','edit','submit','review','approve','reject','return','cancel',
    'finalize','manage','delete','export','download','assign','reassign','publish'
  ]::text[]);

update public.roles
set display_name = case when id = 'GeneralManager' then 'General Manager' else id end,
    description = case id
      when 'Admin' then 'Administers system access, configuration, security, integrations, and audit controls.'
      when 'Auditor' then 'Reviews authorized records, reports, and audit evidence without operational approval authority.'
      when 'Board of Director' then 'Provides global executive and HR governance authority across all business units.'
      when 'Business Unit Manager' then 'Manages people, operations, and approvals within the assigned business unit.'
      when 'Employee' then 'Uses employee self-service and accesses authorized personal information.'
      when 'Finance Staff' then 'Manages authorized payroll and financial processing activities.'
      when 'GeneralManager' then 'Oversees assigned business operations, managers, and approval workflows.'
      when 'HR Manager' then 'Leads global HR operations, governance, approvals, analytics, and employee lifecycle programs.'
      when 'HR Staff' then 'Performs authorized HR operations, recruitment, records, and employee-service activities.'
      when 'IT' then 'Administers technical systems and diagnoses access issues without protected HR-content authority.'
      when 'Manager' then 'Manages direct reports and performs assigned team-level workflow actions.'
      when 'Operations Director' then 'Oversees assigned operations and cross-functional operational approvals.'
      when 'Recruiter' then 'Archived role. Recruitment responsibilities were transferred to HR Staff.'
      when 'test role' then 'Archived non-production test role.'
      else description
    end,
    dashboard_type = case id
      when 'Board of Director' then 'executive'
      when 'HR Manager' then 'hr'
      when 'Admin' then 'admin'
      when 'IT' then 'admin_it'
      when 'Manager' then 'manager'
      when 'Business Unit Manager' then 'manager'
      when 'GeneralManager' then 'manager'
      when 'Operations Director' then 'manager'
      else 'employee'
    end,
    default_data_scope = case id
      when 'Board of Director' then 'GLOBAL'
      when 'HR Manager' then 'GLOBAL'
      when 'HR Staff' then 'GLOBAL'
      when 'Finance Staff' then 'GLOBAL'
      when 'Auditor' then 'GLOBAL'
      when 'Admin' then 'GLOBAL'
      when 'IT' then 'GLOBAL'
      when 'Manager' then 'DIRECT_REPORTS'
      when 'Employee' then 'SELF'
      else 'HOME_ONLY'
    end,
    is_active = id in (
      'Admin','Auditor','Board of Director','Business Unit Manager','Employee',
      'Finance Staff','GeneralManager','HR Manager','HR Staff','IT','Manager','Operations Director'
    ),
    updated_at = now();

-- Resource catalog used by navigation, routes, services, workflow checks and RLS.
insert into public.resources (id, group_name, module, description, high_risk)
values
  ('HRDashboard','Dashboard and analytics','Dashboard','Full HR dashboard',false),
  ('ManagerDashboard','Dashboard and analytics','Dashboard','Manager dashboard',false),
  ('ExecutiveDashboard','Dashboard and analytics','Dashboard','Executive dashboard',false),
  ('EmployeeDashboard','Dashboard and analytics','Dashboard','Employee self-service dashboard',false),
  ('EmployeeAnalytics','Dashboard and analytics','Analytics','Employee analytics',true),
  ('RecruitmentAnalytics','Dashboard and analytics','Analytics','Recruitment analytics',false),
  ('DisciplineAnalytics','Dashboard and analytics','Analytics','Employee-relations analytics',true),
  ('PayrollReports','Dashboard and analytics','Payroll','Payroll reports',true),
  ('EmployeeList','Employees and 201 files','Employees','Employee directory',false),
  ('EmployeeProfile','Employees and 201 files','Employees','Employee profile',false),
  ('PersonalInformation','Employees and 201 files','Employees','Personal information',true),
  ('EmploymentInformation','Employees and 201 files','Employees','Employment information',false),
  ('CompensationSalary','Employees and 201 files','Employees','Compensation and salary',true),
  ('GovernmentNumbers','Employees and 201 files','Employees','Government identifiers',true),
  ('BankingInformation','Employees and 201 files','Employees','Banking information',true),
  ('EmployeeDocuments','Employees and 201 files','Employees','Employee documents',true),
  ('PersonnelActionNotices','Employees and 201 files','PAN','Personnel action notices',true),
  ('Onboarding','Employees and 201 files','Lifecycle','Onboarding',false),
  ('OffboardingResignation','Employees and 201 files','Lifecycle','Offboarding and resignation',true),
  ('ContractsSigning','Employees and 201 files','Lifecycle','Contracts and signing',true),
  ('CertificateEmployment','Employees and 201 files','COE','Certificate of employment',false),
  ('DailyTimeReview','Attendance and payroll','Timekeeping','Daily time review',false),
  ('ClockInOut','Attendance and payroll','Timekeeping','Clock in and out',false),
  ('ClockLogs','Attendance and payroll','Timekeeping','Clock logs',false),
  ('AttendanceExceptions','Attendance and payroll','Timekeeping','Attendance exceptions',false),
  ('Overtime','Attendance and payroll','OT','Overtime requests',false),
  ('WorkFromHome','Attendance and payroll','WFH','Work-from-home requests',false),
  ('ManpowerPlanning','Attendance and payroll','Manpower','Manpower planning',false),
  ('PayrollPreparation','Attendance and payroll','Payroll','Payroll preparation',true),
  ('PayrollStaging','Attendance and payroll','Payroll','Payroll staging',true),
  ('GovernmentReports','Attendance and payroll','Payroll','Government reports',true),
  ('FinalPay','Attendance and payroll','Payroll','Final pay calculations',true),
  ('PayrollConfiguration','Attendance and payroll','Payroll','Payroll configuration',true),
  ('IncidentReports','Employee relations','Feedback','Incident reports',true),
  ('NTEs','Employee relations','Feedback','Notices to explain',true),
  ('DisciplinaryCases','Employee relations','Feedback','Disciplinary cases',true),
  ('CoachingLogs','Employee relations','Coaching','Coaching logs',true),
  ('MemoLibrary','Employee relations','Feedback','Memo library',false),
  ('CodeOfDiscipline','Employee relations','Feedback','Code of discipline',false),
  ('FeedbackTemplates','Employee relations','Feedback','Feedback templates',false),
  ('DisciplinaryPipeline','Employee relations','Feedback','Disciplinary pipeline',true),
  ('EvaluationResults','Evaluation','Evaluation','Evaluation results',true),
  ('QuestionBank','Evaluation','Evaluation','Question bank',false),
  ('EvaluationTimelines','Evaluation','Evaluation','Evaluation timelines',false),
  ('Awards','Evaluation','Evaluation','Awards',false),
  ('PerformanceReports','Evaluation','Evaluation','Performance reports',true),
  ('JobRequisitions','Recruitment','Recruitment','Job requisitions',false),
  ('JobPosts','Recruitment','Recruitment','Job posts',false),
  ('ApplicationPages','Recruitment','Recruitment','Application pages',false),
  ('Applicants','Recruitment','Recruitment','Applicants',true),
  ('Candidates','Recruitment','Recruitment','Candidates',true),
  ('Interviews','Recruitment','Recruitment','Interviews',true),
  ('InterviewFeedback','Recruitment','Recruitment','Interview feedback',true),
  ('Offers','Recruitment','Recruitment','Recruitment offers',true),
  ('Announcements','Helpdesk and communications','Helpdesk','Announcements',false),
  ('KnowledgeBase','Helpdesk and communications','Helpdesk','Knowledge base',false),
  ('CompanyCalendar','Helpdesk and communications','Helpdesk','Company calendar',false),
  ('OrganizationalChart','Helpdesk and communications','Employees','Organizational chart',false),
  ('Notifications','Helpdesk and communications','Helpdesk','Notifications',false),
  ('RolesPermissions','System administration','Settings','Roles and permissions',true),
  ('UserManagement','System administration','Settings','User management',true),
  ('Departments','System administration','Settings','Department configuration',true),
  ('BusinessUnits','System administration','Settings','Business-unit configuration',true),
  ('Sites','System administration','Settings','Site configuration',true),
  ('LeavePolicies','System administration','Settings','Leave policies',true),
  ('Holidays','System administration','Settings','Holiday configuration',false),
  ('SystemSettings','System administration','Settings','System settings',true),
  ('SecurityConfiguration','System administration','Settings','Security configuration',true),
  ('IntegrationManagement','System administration','Settings','Integration management',true)
on conflict (id) do update
set group_name = excluded.group_name,
    module = excluded.module,
    description = excluded.description,
    high_risk = excluded.high_risk,
    is_active = true;

update public.resources
set module = coalesce(module, group_name),
    description = coalesce(description, id),
    is_active = true;

-- ---------------------------------------------------------------------------
-- Normalized assignments, sensitive permissions, workflows, and audit
-- ---------------------------------------------------------------------------

create table if not exists public.user_roles (
  user_id uuid not null references public.hris_users(id) on delete restrict,
  role_id text not null references public.roles(id) on delete restrict,
  is_primary boolean not null default false,
  scope_type text not null default 'SELF' check (scope_type in (
    'SELF','DIRECT_REPORTS','DEPARTMENT','HOME_ONLY','SPECIFIC','GLOBAL'
  )),
  allowed_business_unit_ids uuid[] not null default '{}'::uuid[],
  dashboard_type text not null default 'employee',
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.hris_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.hris_users(id) on delete set null,
  primary key (user_id, role_id)
);

create unique index if not exists user_roles_one_active_primary_idx
  on public.user_roles(user_id) where is_active and is_primary;

create table if not exists public.user_multi_role_allowlist (
  user_id uuid primary key references public.hris_users(id) on delete restrict,
  max_active_roles integer not null default 1 check (max_active_roles between 1 and 2),
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.role_sensitive_permissions (
  role_id text not null references public.roles(id) on delete restrict,
  field_key text not null,
  permissions text[] not null default '{}'::text[] check (permissions <@ array['view','edit','download','export']::text[]),
  updated_at timestamptz not null default now(),
  primary key (role_id, field_key)
);

create table if not exists public.role_workflow_permissions (
  role_id text not null references public.roles(id) on delete restrict,
  workflow_key text not null,
  actions text[] not null default '{}'::text[] check (actions <@ array[
    'submit','review','approve','reject','return','cancel','finalize'
  ]::text[]),
  updated_at timestamptz not null default now(),
  primary key (role_id, workflow_key)
);

create table if not exists public.rbac_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.hris_users(id) on delete set null,
  target_user_id uuid references public.hris_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_value jsonb,
  after_value jsonb,
  request_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.rbac_cache_versions (
  user_id uuid primary key references public.hris_users(id) on delete cascade,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

create or replace function public.current_hris_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from public.hris_users u where u.auth_user_id = auth.uid() limit 1
$$;

create or replace function public.current_hris_roles()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(ur.role_id order by ur.is_primary desc, ur.role_id), '{}'::text[])
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = public.current_hris_user_id()
    and ur.is_active
    and r.is_active
$$;

create or replace function public.has_active_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_role = any(public.current_hris_roles())
$$;

create or replace function public.current_hris_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ur.role_id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = public.current_hris_user_id()
    and ur.is_active and ur.is_primary and r.is_active
  limit 1
$$;

create or replace function public.has_feature_permission(p_resource text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.is_active
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.resources res on res.id = rp.resource_id and res.is_active
    where ur.user_id = public.current_hris_user_id()
      and ur.is_active
      and rp.resource_id = p_resource
      and (p_action = any(rp.permissions) or 'manage' = any(rp.permissions))
  )
$$;

create or replace function public.has_sensitive_permission(p_field text, p_action text default 'view')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.is_active
    join public.role_sensitive_permissions sp on sp.role_id = ur.role_id
    where ur.user_id = public.current_hris_user_id()
      and ur.is_active
      and sp.field_key = p_field
      and p_action = any(sp.permissions)
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
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.is_active
    join public.role_workflow_permissions wp on wp.role_id = ur.role_id
    where ur.user_id = public.current_hris_user_id()
      and ur.is_active
      and wp.workflow_key = p_workflow
      and p_action = any(wp.actions)
  )
$$;

create or replace function public.current_data_scope()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with scopes as (
    select ur.scope_type, ur.allowed_business_unit_ids,
      case ur.scope_type
        when 'GLOBAL' then 6 when 'SPECIFIC' then 5 when 'HOME_ONLY' then 4
        when 'DEPARTMENT' then 3 when 'DIRECT_REPORTS' then 2 else 1
      end as rank
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.is_active
    where ur.user_id = public.current_hris_user_id() and ur.is_active
  ), chosen as (
    select scope_type from scopes order by rank desc limit 1
  )
  select jsonb_build_object(
    'type', coalesce((select scope_type from chosen), 'NONE'),
    'allowedBuIds', coalesce((select to_jsonb(array_agg(distinct bu))
      from scopes s cross join lateral unnest(s.allowed_business_unit_ids) bu), '[]'::jsonb)
  )
$$;

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
  select * into viewer from public.hris_users where id = public.current_hris_user_id();
  select * into target_user from public.hris_users where id = p_target_user_id;
  if viewer.id is null or target_user.id is null then return false; end if;
  if viewer.id = target_user.id then return true; end if;
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
    return viewer.business_unit_id is not null and viewer.business_unit_id = target_user.business_unit_id;
  end if;
  if scope_type = 'DEPARTMENT' then
    return viewer.department_id is not null and viewer.department_id = target_user.department_id;
  end if;
  if scope_type = 'DIRECT_REPORTS' then
    return target_user.reports_to in (viewer.id::text, viewer.auth_user_id::text, viewer.employee_id, viewer.full_name);
  end if;
  return false;
end;
$$;

create or replace function public.get_my_hris_bootstrap()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(profile)
  from (
    select u.id, u.full_name, u.role, u.status, u.department, u.business_unit,
      u.position, u.date_hired, u.is_photo_enrolled, u.email,
      u.business_unit_id, u.department_id, u.reports_to, u.employee_id,
      u.data_access_scope, u.dashboard_type, u.permission_diagnostic,
      u.permission_updated_at, u.permission_updated_by
    from public.hris_users u
    where u.id = public.current_hris_user_id()
  ) profile
$$;

create or replace function public.is_system_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.has_active_role('Admin') $$;

create or replace function public.is_hr_or_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.has_active_role('Board of Director')
      or public.has_active_role('HR Manager')
      or public.has_active_role('HR Staff')
$$;

-- ---------------------------------------------------------------------------
-- Seed normalized assignments and exact production account requirements
-- ---------------------------------------------------------------------------

insert into public.user_roles (
  user_id, role_id, is_primary, scope_type, allowed_business_unit_ids,
  dashboard_type, is_active
)
select
  u.id,
  case when u.role = 'Recruiter' then 'HR Staff'
       when u.role = 'test role' then 'Employee'
       else u.role end,
  true,
  case
    when u.data_access_scope->>'type' in ('GLOBAL','SPECIFIC','HOME_ONLY') then u.data_access_scope->>'type'
    else coalesce(r.default_data_scope, 'SELF')
  end,
  coalesce(array(select jsonb_array_elements_text(coalesce(u.data_access_scope->'allowedBuIds', '[]'::jsonb))::uuid), '{}'::uuid[]),
  coalesce(u.dashboard_type, r.dashboard_type, 'employee'),
  true
from public.hris_users u
join public.roles r on r.id = case when u.role = 'Recruiter' then 'HR Staff' when u.role = 'test role' then 'Employee' else u.role end
on conflict (user_id, role_id) do update
set is_primary = excluded.is_primary,
    scope_type = excluded.scope_type,
    allowed_business_unit_ids = excluded.allowed_business_unit_ids,
    dashboard_type = excluded.dashboard_type,
    is_active = true,
    updated_at = now();

update public.hris_users
set role = case when role = 'Recruiter' then 'HR Staff' when role = 'test role' then 'Employee' else role end,
    permission_updated_at = now()
where role in ('Recruiter', 'test role');

insert into public.user_multi_role_allowlist (user_id, max_active_roles, reason)
select id, 2, case lower(email)
  when 'kay@thenextperience.com' then 'Approved Admin and Board of Director combination'
  else 'Approved Admin and IT combination'
end
from public.hris_users
where lower(email) in ('kay@thenextperience.com', 'it@thenextperience.com')
on conflict (user_id) do update set max_active_roles = 2, reason = excluded.reason;

-- Exact assignments. Primary role is deliberately the business role so legacy
-- single-role policies never turn technical Admin into implicit HR authority.
delete from public.user_roles
where user_id in (
  select id from public.hris_users where lower(email) in (
    'kay@thenextperience.com','it@thenextperience.com','hrs@thenextperience.com'
  )
);

insert into public.user_roles (user_id, role_id, is_primary, scope_type, dashboard_type, is_active)
select u.id, assignment.role_id, assignment.is_primary, 'GLOBAL', assignment.dashboard_type, true
from public.hris_users u
join (values
  ('kay@thenextperience.com','Board of Director',true,'executive'),
  ('kay@thenextperience.com','Admin',false,'executive'),
  ('it@thenextperience.com','IT',true,'admin_it'),
  ('it@thenextperience.com','Admin',false,'admin_it'),
  ('hrs@thenextperience.com','HR Manager',true,'hr')
) as assignment(email, role_id, is_primary, dashboard_type)
  on lower(u.email) = assignment.email;

update public.hris_users set
  role = 'Board of Director', dashboard_type = 'executive',
  data_access_scope = jsonb_build_object('type','GLOBAL'),
  permission_diagnostic = null, permission_updated_at = now()
where lower(email) = 'kay@thenextperience.com';

update public.hris_users set
  role = 'IT', dashboard_type = 'admin_it',
  data_access_scope = jsonb_build_object('type','GLOBAL'),
  permission_diagnostic = null, permission_updated_at = now()
where lower(email) = 'it@thenextperience.com';

update public.hris_users set
  role = 'HR Manager', dashboard_type = 'hr',
  data_access_scope = jsonb_build_object('type','GLOBAL'),
  permission_diagnostic = null, permission_updated_at = now()
where lower(email) = 'hrs@thenextperience.com';

-- BOD and HR Manager always have global business-unit authority.
update public.user_roles
set scope_type = 'GLOBAL', allowed_business_unit_ids = '{}', updated_at = now()
where role_id in ('Board of Director','HR Manager') and is_active;

update public.hris_users u
set data_access_scope = jsonb_build_object('type','GLOBAL'), permission_updated_at = now()
where exists (
  select 1 from public.user_roles ur
  where ur.user_id = u.id and ur.is_active and ur.role_id in ('Board of Director','HR Manager')
);

-- ---------------------------------------------------------------------------
-- Feature permissions: preserve approved roles, transfer Recruiter to HR Staff,
-- add detailed resources, and explicitly separate Admin technical access.
-- ---------------------------------------------------------------------------

insert into public.role_permissions (role_id, resource_id, permissions, updated_at)
select 'HR Staff', rp.resource_id,
       array(select distinct p from unnest(coalesce(existing.permissions,'{}') || rp.permissions) p order by p),
       now()
from public.role_permissions rp
left join public.role_permissions existing
  on existing.role_id = 'HR Staff' and existing.resource_id = rp.resource_id
where rp.role_id = 'Recruiter'
on conflict (role_id, resource_id) do update
set permissions = excluded.permissions, updated_at = now();

insert into public.role_permissions (role_id, resource_id, permissions, updated_at)
values ('HR Staff','Recruitment',array['view','create','edit','submit','review','manage','export','download']::text[],now())
on conflict (role_id, resource_id) do update
set permissions = array(select distinct p from unnest(public.role_permissions.permissions || excluded.permissions) p order by p),
    updated_at = now();

-- Copy coarse permissions to their detailed resources for transition compatibility.
with mapping(resource_id, parent_id) as (values
  ('HRDashboard','Dashboard'),('ManagerDashboard','Dashboard'),('ExecutiveDashboard','Dashboard'),('EmployeeDashboard','Dashboard'),
  ('EmployeeAnalytics','Analytics'),('RecruitmentAnalytics','Analytics'),('DisciplineAnalytics','Analytics'),('PayrollReports','Payroll'),
  ('EmployeeList','Employees'),('EmployeeProfile','Employees'),('PersonalInformation','Employees'),('EmploymentInformation','Employees'),
  ('CompensationSalary','Employees'),('GovernmentNumbers','Employees'),('BankingInformation','Employees'),('EmployeeDocuments','Employees'),
  ('PersonnelActionNotices','PAN'),('Onboarding','Lifecycle'),('OffboardingResignation','Lifecycle'),('ContractsSigning','Lifecycle'),
  ('CertificateEmployment','COE'),('DailyTimeReview','Timekeeping'),('ClockInOut','Timekeeping'),('ClockLogs','Timekeeping'),
  ('AttendanceExceptions','Timekeeping'),('Overtime','OT'),('WorkFromHome','WFH'),('ManpowerPlanning','Manpower'),
  ('PayrollPreparation','Payroll'),('PayrollStaging','Payroll'),('GovernmentReports','Payroll'),('FinalPay','Payroll'),
  ('PayrollConfiguration','Payroll'),('IncidentReports','Feedback'),('NTEs','Feedback'),('DisciplinaryCases','Feedback'),
  ('CoachingLogs','Coaching'),('MemoLibrary','Feedback'),('CodeOfDiscipline','Feedback'),('FeedbackTemplates','Feedback'),
  ('DisciplinaryPipeline','Feedback'),('EvaluationResults','Evaluation'),('QuestionBank','Evaluation'),('EvaluationTimelines','Evaluation'),
  ('Awards','Evaluation'),('PerformanceReports','Evaluation'),('JobRequisitions','Recruitment'),('JobPosts','Recruitment'),
  ('ApplicationPages','Recruitment'),('Applicants','Recruitment'),('Candidates','Recruitment'),('Interviews','Recruitment'),
  ('InterviewFeedback','Recruitment'),('Offers','Recruitment'),('Announcements','Helpdesk'),('KnowledgeBase','Helpdesk'),
  ('CompanyCalendar','Helpdesk'),('OrganizationalChart','Employees'),('Notifications','Helpdesk'),('RolesPermissions','Settings'),
  ('UserManagement','Settings'),('Departments','Settings'),('BusinessUnits','Settings'),('Sites','Settings'),
  ('LeavePolicies','Settings'),('Holidays','Settings'),('SystemSettings','Settings'),('SecurityConfiguration','Settings'),
  ('IntegrationManagement','Settings')
)
insert into public.role_permissions (role_id, resource_id, permissions, updated_at)
select rp.role_id, m.resource_id, rp.permissions, now()
from mapping m
join public.role_permissions rp on rp.resource_id = m.parent_id
join public.roles r on r.id = rp.role_id and r.is_active
on conflict (role_id, resource_id) do nothing;

-- Technical Admin is not an HR-content bypass.
delete from public.role_permissions where role_id in ('Admin','IT');

insert into public.role_permissions (role_id, resource_id, permissions)
select 'Admin', r.id,
  case when r.id in ('Dashboard','AuditLog') then array['view','export','download']::text[]
       else array['view','create','edit','review','manage','delete','export','download','assign','reassign','publish']::text[] end
from public.resources r
where r.id in (
  'Dashboard','Settings','AuditLog','RolesPermissions','UserManagement','Departments','BusinessUnits',
  'Sites','LeavePolicies','Holidays','SystemSettings','SecurityConfiguration','IntegrationManagement'
);

insert into public.role_permissions (role_id, resource_id, permissions)
select 'IT', r.id,
  case when r.id in ('Dashboard','AuditLog','SecurityConfiguration') then array['view','export']::text[]
       else array['view','create','edit','manage']::text[] end
from public.resources r
where r.id in ('Dashboard','AuditLog','Helpdesk','Assets','Settings','SecurityConfiguration','IntegrationManagement');

-- BOD and HR Manager are identical for feature authority. System resources are
-- read-only; HR/business resources receive explicit action-level authority.
delete from public.role_permissions where role_id in ('Board of Director','HR Manager');

insert into public.role_permissions (role_id, resource_id, permissions)
select role_id, r.id,
  case
    when r.group_name = 'System administration' or r.id in ('Settings','RolesPermissions','UserManagement')
      then array['view','export','download']::text[]
    when r.id = 'AuditLog'
      then array['view','export','download']::text[]
    else array['view','create','edit','submit','review','approve','reject','return','cancel','finalize','manage','export','download','assign','reassign','publish']::text[]
  end
from (values ('Board of Director'),('HR Manager')) as authority(role_id)
cross join public.resources r
where r.is_active;

-- ---------------------------------------------------------------------------
-- Sensitive-field and workflow matrices
-- ---------------------------------------------------------------------------

delete from public.role_sensitive_permissions;

insert into public.role_sensitive_permissions (role_id, field_key, permissions)
select role_id, field_key, array['view','edit','download','export']::text[]
from (values ('Board of Director'),('HR Manager')) roles(role_id)
cross join (values
  ('salary_compensation'),('bank_information'),('sss'),('tin'),('pagibig'),('philhealth'),
  ('employee_documents'),('benefits_medical'),('disciplinary_records'),('ntes'),
  ('investigation_evidence'),('evaluation_results'),('payroll_staging'),('final_pay')
) fields(field_key);

insert into public.role_sensitive_permissions (role_id, field_key, permissions)
values
  ('HR Staff','sss',array['view','edit']),('HR Staff','tin',array['view','edit']),
  ('HR Staff','pagibig',array['view','edit']),('HR Staff','philhealth',array['view','edit']),
  ('HR Staff','employee_documents',array['view','edit','download']),
  ('HR Staff','benefits_medical',array['view','edit']),
  ('HR Staff','disciplinary_records',array['view','edit']),('HR Staff','ntes',array['view','edit']),
  ('Finance Staff','salary_compensation',array['view','edit','export']),
  ('Finance Staff','bank_information',array['view','edit']),
  ('Finance Staff','sss',array['view']),('Finance Staff','tin',array['view']),
  ('Finance Staff','pagibig',array['view']),('Finance Staff','philhealth',array['view']),
  ('Finance Staff','payroll_staging',array['view','edit','export']),
  ('Finance Staff','final_pay',array['view','edit','export']),
  ('Auditor','employee_documents',array['view','download']),
  ('Auditor','disciplinary_records',array['view']),('Auditor','evaluation_results',array['view']);

delete from public.role_workflow_permissions;

insert into public.role_workflow_permissions (role_id, workflow_key, actions)
select role_id, workflow_key, array['submit','review','approve','reject','return','cancel','finalize']::text[]
from (values ('Board of Director'),('HR Manager')) roles(role_id)
cross join (values
  ('Leave'),('Overtime'),('WFH'),('Manpower'),('JobRequisitions'),('PersonnelActionNotices'),
  ('IncidentReports'),('NTEs'),('DisciplinaryDecisions'),('Benefits'),('COE'),('AssetRequests'),
  ('PayrollPreparation'),('FinalPay'),('Evaluations'),('Awards'),('RecruitmentOffers'),
  ('Resignation'),('Clearance')
) workflows(workflow_key);

insert into public.role_workflow_permissions (role_id, workflow_key, actions)
values
  ('HR Staff','Leave',array['submit','review','return','cancel']),
  ('HR Staff','Overtime',array['submit','review','return','cancel']),
  ('HR Staff','WFH',array['submit','review','return','cancel']),
  ('HR Staff','Manpower',array['submit','review','return']),
  ('HR Staff','JobRequisitions',array['submit','review','return']),
  ('HR Staff','RecruitmentOffers',array['submit','review','return','cancel']),
  ('HR Staff','PersonnelActionNotices',array['submit','review','return']),
  ('HR Staff','IncidentReports',array['submit','review','return']),
  ('HR Staff','NTEs',array['submit','review','return']),
  ('HR Staff','Benefits',array['submit','review','return']),
  ('HR Staff','COE',array['submit','review','return']),
  ('HR Staff','AssetRequests',array['submit','review','return']),
  ('HR Staff','Evaluations',array['submit','review','return']),
  ('Business Unit Manager','Leave',array['submit','review','approve','reject','return','cancel']),
  ('Business Unit Manager','Overtime',array['submit','review','approve','reject','return','cancel']),
  ('Business Unit Manager','WFH',array['submit','review','approve','reject','return','cancel']),
  ('Business Unit Manager','Manpower',array['submit','review','approve','reject','return']),
  ('Manager','Leave',array['submit','review','approve','reject','return','cancel']),
  ('Manager','Overtime',array['submit','review','approve','reject','return','cancel']),
  ('Manager','WFH',array['submit','review','approve','reject','return','cancel']),
  ('Operations Director','WFH',array['review','approve','reject','return']),
  ('Operations Director','Manpower',array['review','approve','reject','return']),
  ('GeneralManager','Leave',array['review','approve','reject','return']),
  ('GeneralManager','Overtime',array['review','approve','reject','return']),
  ('GeneralManager','WFH',array['review','approve','reject','return']),
  ('GeneralManager','Manpower',array['review','approve','reject','return']),
  ('Employee','Leave',array['submit','cancel']),
  ('Employee','Overtime',array['submit','cancel']),
  ('Employee','WFH',array['submit','cancel']),
  ('Employee','Manpower',array['submit','cancel']),
  ('Employee','COE',array['submit','cancel']),
  ('Employee','AssetRequests',array['submit','cancel']),
  ('Employee','Resignation',array['submit','cancel']),
  ('Employee','Clearance',array['submit','cancel']),
  ('HR Staff','Resignation',array['review','return']),
  ('HR Staff','Clearance',array['review','return']);

-- ---------------------------------------------------------------------------
-- Exact parity test and drift prevention
-- ---------------------------------------------------------------------------

create or replace function public.assert_bod_hr_manager_parity()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare mismatch_count integer;
begin
  select count(*) into mismatch_count
  from (
    (select resource_id, permissions from public.role_permissions where role_id = 'Board of Director'
     except
     select resource_id, permissions from public.role_permissions where role_id = 'HR Manager')
    union all
    (select resource_id, permissions from public.role_permissions where role_id = 'HR Manager'
     except
     select resource_id, permissions from public.role_permissions where role_id = 'Board of Director')
    union all
    (select field_key, permissions from public.role_sensitive_permissions where role_id = 'Board of Director'
     except
     select field_key, permissions from public.role_sensitive_permissions where role_id = 'HR Manager')
    union all
    (select field_key, permissions from public.role_sensitive_permissions where role_id = 'HR Manager'
     except
     select field_key, permissions from public.role_sensitive_permissions where role_id = 'Board of Director')
    union all
    (select workflow_key, actions from public.role_workflow_permissions where role_id = 'Board of Director'
     except
     select workflow_key, actions from public.role_workflow_permissions where role_id = 'HR Manager')
    union all
    (select workflow_key, actions from public.role_workflow_permissions where role_id = 'HR Manager'
     except
     select workflow_key, actions from public.role_workflow_permissions where role_id = 'Board of Director')
  ) differences;
  if mismatch_count > 0 then
    raise exception 'Board of Director and HR Manager authority parity failed (% differences)', mismatch_count;
  end if;
  return true;
end;
$$;

select public.assert_bod_hr_manager_parity();

create or replace function public.enforce_bod_hr_manager_parity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_bod_hr_manager_parity();
  return null;
end;
$$;

drop trigger if exists enforce_bod_hr_manager_feature_parity on public.role_permissions;
create constraint trigger enforce_bod_hr_manager_feature_parity
after insert or update or delete on public.role_permissions
deferrable initially deferred for each row execute function public.enforce_bod_hr_manager_parity();
drop trigger if exists enforce_bod_hr_manager_sensitive_parity on public.role_sensitive_permissions;
create constraint trigger enforce_bod_hr_manager_sensitive_parity
after insert or update or delete on public.role_sensitive_permissions
deferrable initially deferred for each row execute function public.enforce_bod_hr_manager_parity();
drop trigger if exists enforce_bod_hr_manager_workflow_parity on public.role_workflow_permissions;
create constraint trigger enforce_bod_hr_manager_workflow_parity
after insert or update or delete on public.role_workflow_permissions
deferrable initially deferred for each row execute function public.enforce_bod_hr_manager_parity();

-- ---------------------------------------------------------------------------
-- Effective-access and atomic administration RPCs
-- ---------------------------------------------------------------------------

create or replace function public.get_my_effective_rbac()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.current_hris_user_id() as id),
  assigned as (
    select ur.role_id, ur.is_primary, ur.dashboard_type, ur.scope_type, ur.allowed_business_unit_ids
    from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = (select id from me) and ur.is_active and r.is_active
  ), features as (
    select rp.resource_id, array_agg(distinct action order by action) actions
    from assigned a join public.role_permissions rp on rp.role_id = a.role_id
    cross join lateral unnest(rp.permissions) action group by rp.resource_id
  ), sensitive as (
    select sp.field_key, array_agg(distinct action order by action) actions
    from assigned a join public.role_sensitive_permissions sp on sp.role_id = a.role_id
    cross join lateral unnest(sp.permissions) action group by sp.field_key
  ), workflows as (
    select wp.workflow_key, array_agg(distinct action order by action) actions
    from assigned a join public.role_workflow_permissions wp on wp.role_id = a.role_id
    cross join lateral unnest(wp.actions) action group by wp.workflow_key
  )
  select case
    when (select id from me) is null then jsonb_build_object('authorized',false,'diagnostic','No HRIS profile is linked to this authenticated account.')
    when not exists (select 1 from assigned) then jsonb_build_object('authorized',false,'diagnostic','No active approved role assignment was found.')
    else jsonb_build_object(
      'authorized', true,
      'userId', (select id from me),
      'roles', (select jsonb_agg(role_id order by is_primary desc, role_id) from assigned),
      'primaryRole', (select role_id from assigned where is_primary limit 1),
      'dashboardType', (select dashboard_type from assigned order by is_primary desc limit 1),
      'dataScope', public.current_data_scope(),
      'features', coalesce((select jsonb_object_agg(resource_id, to_jsonb(actions)) from features), '{}'::jsonb),
      'sensitive', coalesce((select jsonb_object_agg(field_key, to_jsonb(actions)) from sensitive), '{}'::jsonb),
      'workflows', coalesce((select jsonb_object_agg(workflow_key, to_jsonb(actions)) from workflows), '{}'::jsonb),
      'cacheVersion', coalesce((select version from public.rbac_cache_versions where user_id = (select id from me)), 1)
    )
  end
$$;

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
  actor_id uuid := public.current_hris_user_id();
  before_state jsonb;
  max_roles integer := 1;
  role_id text;
  final_admins integer;
begin
  if actor_id is null or not public.has_active_role('Admin') then
    raise exception 'Forbidden: Admin role assignment authority is required.' using errcode = '42501';
  end if;
  if actor_id = p_target_user_id then
    raise exception 'Self-promotion and self-role changes are not permitted.' using errcode = '42501';
  end if;
  if p_scope_type not in ('SELF','DIRECT_REPORTS','DEPARTMENT','HOME_ONLY','SPECIFIC','GLOBAL') then
    raise exception 'Invalid data scope: %', p_scope_type;
  end if;
  if p_primary_role is null or not (p_primary_role = any(p_role_ids)) then
    raise exception 'The primary role must be included in assigned roles.';
  end if;
  if cardinality(p_role_ids) <> cardinality(array(select distinct unnest(p_role_ids))) then
    raise exception 'Duplicate role assignments are not permitted.';
  end if;
  select coalesce(a.max_active_roles,1) into max_roles
  from (select p_target_user_id id) x left join public.user_multi_role_allowlist a on a.user_id = x.id;
  if cardinality(p_role_ids) > max_roles then
    raise exception 'This account is approved for at most % active role(s).', max_roles;
  end if;
  if exists (
    select 1 from unnest(p_role_ids) requested(role_id)
    left join public.roles r on r.id = requested.role_id
    where r.id is null or not r.is_active
  ) then
    raise exception 'One or more requested roles are unknown or inactive.';
  end if;
  if 'Admin' = any(p_role_ids) and not public.has_active_role('Admin') then
    raise exception 'Only an Admin can assign Admin.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(ur)), '[]'::jsonb) into before_state
  from public.user_roles ur where ur.user_id = p_target_user_id and ur.is_active;

  if exists (select 1 from public.user_roles where user_id = p_target_user_id and role_id = 'Admin' and is_active)
     and not ('Admin' = any(p_role_ids)) then
    select count(distinct ur.user_id) into final_admins
    from public.user_roles ur join public.hris_users u on u.id = ur.user_id
    where ur.role_id = 'Admin' and ur.is_active and lower(u.status) = 'active';
    if final_admins <= 1 then
      raise exception 'Cannot remove the final active Admin.';
    end if;
  end if;

  perform set_config('app.rbac_role_update','allowed',true);
  update public.user_roles set is_active = false, is_primary = false, updated_at = now(), updated_by = actor_id
  where user_id = p_target_user_id;

  foreach role_id in array p_role_ids loop
    insert into public.user_roles (
      user_id, role_id, is_primary, scope_type, allowed_business_unit_ids,
      dashboard_type, is_active, assigned_by, updated_by
    ) values (
      p_target_user_id, role_id, role_id = p_primary_role, p_scope_type,
      coalesce(p_allowed_business_unit_ids,'{}'),
      coalesce(p_dashboard_type,(select dashboard_type from public.roles where id = p_primary_role)),
      true, actor_id, actor_id
    )
    on conflict (user_id, role_id) do update set
      is_primary = excluded.is_primary, scope_type = excluded.scope_type,
      allowed_business_unit_ids = excluded.allowed_business_unit_ids,
      dashboard_type = excluded.dashboard_type, is_active = true,
      updated_at = now(), updated_by = actor_id;
  end loop;

  update public.hris_users set
    role = p_primary_role,
    dashboard_type = coalesce(p_dashboard_type,(select dashboard_type from public.roles where id = p_primary_role)),
    data_access_scope = jsonb_build_object('type',p_scope_type,'allowedBuIds',coalesce(to_jsonb(p_allowed_business_unit_ids),'[]'::jsonb)),
    permission_updated_at = now(), permission_updated_by = actor_id, permission_diagnostic = null
  where id = p_target_user_id;

  insert into public.rbac_cache_versions(user_id,version,updated_at)
  values (p_target_user_id,2,now())
  on conflict (user_id) do update set version = public.rbac_cache_versions.version + 1, updated_at = now();

  insert into public.rbac_audit_log(actor_user_id,target_user_id,action,entity_type,entity_id,before_value,after_value)
  values (actor_id,p_target_user_id,'SET_USER_ROLES','user',p_target_user_id::text,before_state,
    (select coalesce(jsonb_agg(to_jsonb(ur)), '[]'::jsonb) from public.user_roles ur where ur.user_id = p_target_user_id and ur.is_active));

  return jsonb_build_object('success',true,'targetUserId',p_target_user_id,'roles',p_role_ids,'primaryRole',p_primary_role);
end;
$$;

create or replace function public.admin_replace_role_permissions(p_role text, p_matrix jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := public.current_hris_user_id(); linked_role text;
begin
  if actor_id is null or not public.has_active_role('Admin') then
    raise exception 'Forbidden: Admin permission-management authority is required.' using errcode = '42501';
  end if;
  if p_role in ('Recruiter','test role') or not exists (select 1 from public.roles where id=p_role and is_active) then
    raise exception 'Unknown or inactive role.';
  end if;
  linked_role := case when p_role='Board of Director' then 'HR Manager' when p_role='HR Manager' then 'Board of Director' end;
  delete from public.role_permissions where role_id in (p_role,coalesce(linked_role,p_role));
  insert into public.role_permissions(role_id,resource_id,permissions,updated_at)
  select target.role_id, entry.key, array(select jsonb_array_elements_text(entry.value)), now()
  from jsonb_each(p_matrix) entry
  cross join lateral (values (p_role),(linked_role)) target(role_id)
  where target.role_id is not null
    and exists(select 1 from public.resources r where r.id=entry.key and r.is_active);
  perform public.assert_bod_hr_manager_parity();
  insert into public.rbac_audit_log(actor_user_id,action,entity_type,entity_id,after_value)
  values(actor_id,'REPLACE_ROLE_PERMISSIONS','role',p_role,p_matrix);
  update public.rbac_cache_versions set version=version+1,updated_at=now();
  return true;
end;
$$;

create or replace function public.admin_replace_role_authority(
  p_role text,
  p_sensitive_matrix jsonb,
  p_workflow_matrix jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := public.current_hris_user_id(); linked_role text;
begin
  if actor_id is null or not public.has_active_role('Admin') then
    raise exception 'Forbidden: Admin authority-management permission is required.' using errcode = '42501';
  end if;
  if p_role in ('Recruiter','test role') or not exists (select 1 from public.roles where id=p_role and is_active) then
    raise exception 'Unknown or inactive role.';
  end if;
  linked_role := case when p_role='Board of Director' then 'HR Manager' when p_role='HR Manager' then 'Board of Director' end;

  if exists (
    select 1 from jsonb_each(p_sensitive_matrix) entry
    cross join lateral jsonb_array_elements_text(entry.value) action
    where action not in ('view','edit','download','export')
  ) then raise exception 'Sensitive-data matrix contains an invalid action.'; end if;
  if exists (
    select 1 from jsonb_each(p_workflow_matrix) entry
    cross join lateral jsonb_array_elements_text(entry.value) action
    where action not in ('submit','review','approve','reject','return','cancel','finalize')
  ) then raise exception 'Workflow matrix contains an invalid action.'; end if;

  delete from public.role_sensitive_permissions where role_id in (p_role,coalesce(linked_role,p_role));
  insert into public.role_sensitive_permissions(role_id,field_key,permissions,updated_at)
  select target.role_id, entry.key, array(select jsonb_array_elements_text(entry.value)), now()
  from jsonb_each(p_sensitive_matrix) entry
  cross join lateral (values (p_role),(linked_role)) target(role_id)
  where target.role_id is not null and jsonb_array_length(entry.value) > 0;

  delete from public.role_workflow_permissions where role_id in (p_role,coalesce(linked_role,p_role));
  insert into public.role_workflow_permissions(role_id,workflow_key,actions,updated_at)
  select target.role_id, entry.key, array(select jsonb_array_elements_text(entry.value)), now()
  from jsonb_each(p_workflow_matrix) entry
  cross join lateral (values (p_role),(linked_role)) target(role_id)
  where target.role_id is not null and jsonb_array_length(entry.value) > 0;

  perform public.assert_bod_hr_manager_parity();
  insert into public.rbac_audit_log(actor_user_id,action,entity_type,entity_id,after_value)
  values(actor_id,'REPLACE_ROLE_AUTHORITY','role',p_role,
    jsonb_build_object('sensitive',p_sensitive_matrix,'workflows',p_workflow_matrix));
  update public.rbac_cache_versions set version=version+1,updated_at=now();
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sensitive profile RPC and column protection
-- ---------------------------------------------------------------------------

create or replace function public.get_accessible_hris_users()
returns setof public.hris_users
language plpgsql
stable
security definer
set search_path = ''
as $$
declare row_value public.hris_users; own_row boolean;
begin
  for row_value in select u.* from public.hris_users u where public.can_access_hris_user(u.id) loop
    own_row := row_value.id = public.current_hris_user_id();
    if not own_row then row_value.auth_user_id := null; end if;
    if not own_row and not public.has_feature_permission('PersonalInformation','view') then
      row_value.birth_date := null;
      row_value.emergency_contact_name := null;
      row_value.emergency_contact_relationship := null;
      row_value.emergency_contact_phone := null;
      row_value.tax_status := null;
    end if;
    if not own_row and not public.has_sensitive_permission('sss') then row_value.sss_no := null; end if;
    if not own_row and not public.has_sensitive_permission('tin') then row_value.tin := null; end if;
    if not own_row and not public.has_sensitive_permission('pagibig') then row_value.pagibig_no := null; end if;
    if not own_row and not public.has_sensitive_permission('philhealth') then row_value.philhealth_no := null; end if;
    if not own_row and not public.has_sensitive_permission('bank_information') then
      row_value.bank_name := null; row_value.bank_account_number := null; row_value.bank_account_type := null;
    end if;
    if not own_row and not public.has_sensitive_permission('salary_compensation') then
      row_value.rate_amount := null; row_value.salary_basic := null; row_value.salary_deminimis := null; row_value.salary_reimbursable := null;
    end if;
    return next row_value;
  end loop;
end;
$$;

-- Status transitions are authorized independently from row visibility. This
-- closes the legacy gap where a user who could update their own request could
-- submit an arbitrary final status through the API.
create or replace function public.guard_workflow_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare workflow_key text := tg_argv[0]; requested_action text;
begin
  if new.status::text is not distinct from old.status::text then return new; end if;
  requested_action := case
    when lower(new.status::text) in ('approved','wfh_approved','wfh_for_timekeeping') then 'approve'
    when lower(new.status::text) in ('rejected','wfh_rejected') then 'reject'
    when lower(new.status::text) in ('cancelled','canceled') then 'cancel'
    when lower(new.status::text) in ('finalized','completed') then 'finalize'
    when lower(new.status::text) in ('pending','submitted','wfh_pending_submission') then 'submit'
    else 'review'
  end;
  if not public.has_workflow_permission(workflow_key, requested_action) then
    raise exception 'Workflow action % is not authorized for %.', requested_action, workflow_key using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_leave_status_transition on public.leave_requests;
create trigger guard_leave_status_transition before update of status on public.leave_requests
for each row execute function public.guard_workflow_status_transition('Leave');
drop trigger if exists guard_wfh_status_transition on public.wfh_requests;
create trigger guard_wfh_status_transition before update of status on public.wfh_requests
for each row execute function public.guard_workflow_status_transition('WFH');
drop trigger if exists guard_ot_status_transition on public.ot_requests;
create trigger guard_ot_status_transition before update of status on public.ot_requests
for each row execute function public.guard_workflow_status_transition('Overtime');
drop trigger if exists guard_manpower_status_transition on public.manpower_requests;
create trigger guard_manpower_status_transition before update of status on public.manpower_requests
for each row execute function public.guard_workflow_status_transition('Manpower');

create or replace function public.get_hris_user_profile(p_user_id uuid)
returns public.hris_users
language sql
stable
security definer
set search_path = ''
as $$ select u from public.get_accessible_hris_users() u where u.id=p_user_id limit 1 $$;

create or replace function public.guard_hris_user_security_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.role,new.data_access_scope,new.dashboard_type,new.auth_user_id)
       is distinct from (old.role,old.data_access_scope,old.dashboard_type,old.auth_user_id)
     and current_setting('app.rbac_role_update',true) <> 'allowed' then
    raise exception 'Role, scope, dashboard, and authentication links must be changed through the audited RBAC function.' using errcode='42501';
  end if;
  if (new.sss_no is distinct from old.sss_no and not public.has_sensitive_permission('sss','edit'))
      or (new.tin is distinct from old.tin and not public.has_sensitive_permission('tin','edit'))
      or (new.pagibig_no is distinct from old.pagibig_no and not public.has_sensitive_permission('pagibig','edit'))
      or (new.philhealth_no is distinct from old.philhealth_no and not public.has_sensitive_permission('philhealth','edit'))
      or ((new.bank_name,new.bank_account_number,new.bank_account_type) is distinct from (old.bank_name,old.bank_account_number,old.bank_account_type)
          and not public.has_sensitive_permission('bank_information','edit'))
      or ((new.rate_amount,new.salary_basic,new.salary_deminimis,new.salary_reimbursable) is distinct from (old.rate_amount,old.salary_basic,old.salary_deminimis,old.salary_reimbursable)
          and not public.has_sensitive_permission('salary_compensation','edit')) then
    raise exception 'Protected HR field update is not authorized.' using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_hris_user_security_update on public.hris_users;
create trigger guard_hris_user_security_update before update on public.hris_users
for each row execute function public.guard_hris_user_security_update();

-- ---------------------------------------------------------------------------
-- RLS and grants: same resolver for tables, services, routes and UI
-- ---------------------------------------------------------------------------

alter table public.user_roles enable row level security;
alter table public.user_multi_role_allowlist enable row level security;
alter table public.role_sensitive_permissions enable row level security;
alter table public.role_workflow_permissions enable row level security;
alter table public.rbac_audit_log enable row level security;
alter table public.rbac_cache_versions enable row level security;

do $$
declare p record;
begin
  for p in select policyname,tablename from pg_policies
           where schemaname='public' and tablename in (
             'roles','resources','role_permissions','user_roles','user_multi_role_allowlist',
             'role_sensitive_permissions','role_workflow_permissions','rbac_audit_log','rbac_cache_versions','hris_users'
           )
  loop execute format('drop policy if exists %I on public.%I',p.policyname,p.tablename); end loop;
end;
$$;

-- Replace the remaining legacy hard-coded Admin/HR policies that would make a
-- technical Admin an HR-content bypass. Existing self/manager policies remain.
drop policy if exists attendance_exceptions_admin_hr on public.attendance_exceptions;
drop policy if exists attendance_records_admin_hr on public.attendance_records;
drop policy if exists ot_requests_admin_hr on public.ot_requests;
drop policy if exists time_events_admin_hr on public.time_events;
drop policy if exists attendance_exceptions_hr_authority on public.attendance_exceptions;
drop policy if exists attendance_records_hr_authority on public.attendance_records;

-- Replace broad legacy workflow policies with centralized feature, scope, and
-- workflow checks. The existing row-owner/manager policies remain compatible,
-- while the status-transition triggers enforce the action ceiling.
drop policy if exists leave_hr_admin_all on public.leave_requests;
drop policy if exists wfh_hr_admin_all on public.wfh_requests;
drop policy if exists wfh_bod_read_all on public.wfh_requests;
drop policy if exists wfh_bod_update_all on public.wfh_requests;
drop policy if exists ot_hr_admin_all on public.ot_requests;
drop policy if exists manpower_hr_admin_all on public.manpower_requests;
drop policy if exists time_hr_admin_all on public.time_events;
drop policy if exists leave_authorized_view on public.leave_requests;
drop policy if exists leave_authorized_insert on public.leave_requests;
drop policy if exists leave_authorized_update on public.leave_requests;
drop policy if exists wfh_authorized_view on public.wfh_requests;
drop policy if exists wfh_authorized_insert on public.wfh_requests;
drop policy if exists wfh_authorized_update on public.wfh_requests;
drop policy if exists ot_authorized_view on public.ot_requests;
drop policy if exists ot_authorized_insert on public.ot_requests;
drop policy if exists ot_authorized_update on public.ot_requests;
drop policy if exists manpower_authorized_view on public.manpower_requests;
drop policy if exists manpower_authorized_insert on public.manpower_requests;
drop policy if exists manpower_authorized_update on public.manpower_requests;
drop policy if exists leave_employee_own on public.leave_requests;
drop policy if exists leave_manager_read_team on public.leave_requests;
drop policy if exists leave_manager_update_team on public.leave_requests;
drop policy if exists wfh_employee_own on public.wfh_requests;
drop policy if exists wfh_manager_read_team on public.wfh_requests;
drop policy if exists wfh_manager_update_team on public.wfh_requests;
drop policy if exists ot_employee_own on public.ot_requests;
drop policy if exists ot_requests_own on public.ot_requests;
drop policy if exists ot_requests_admin_hr on public.ot_requests;
drop policy if exists ot_requests_manager_approve on public.ot_requests;
drop policy if exists ot_manager_read_team on public.ot_requests;
drop policy if exists ot_manager_update_team on public.ot_requests;
drop policy if exists manpower_manager_own on public.manpower_requests;

create policy leave_authorized_view on public.leave_requests for select to authenticated using (
  public.has_feature_permission('Leave','view') and public.can_access_hris_user(employee_id)
);
create policy leave_authorized_insert on public.leave_requests for insert to authenticated with check (
  employee_id = public.current_hris_user_id()
  and public.has_feature_permission('Leave','create')
  and public.has_workflow_permission('Leave','submit')
);
create policy leave_authorized_update on public.leave_requests for update to authenticated using (
  public.can_access_hris_user(employee_id) and (
    public.has_workflow_permission('Leave','review') or public.has_workflow_permission('Leave','approve')
    or public.has_workflow_permission('Leave','reject') or public.has_workflow_permission('Leave','return')
    or public.has_workflow_permission('Leave','cancel') or public.has_workflow_permission('Leave','finalize')
  )
) with check (public.can_access_hris_user(employee_id));

create policy wfh_authorized_view on public.wfh_requests for select to authenticated using (
  public.has_feature_permission('WFH','view') and public.can_access_hris_user(employee_id)
);
create policy wfh_authorized_insert on public.wfh_requests for insert to authenticated with check (
  employee_id = public.current_hris_user_id()
  and public.has_feature_permission('WFH','create')
  and public.has_workflow_permission('WFH','submit')
);
create policy wfh_authorized_update on public.wfh_requests for update to authenticated using (
  public.can_access_hris_user(employee_id) and (
    public.has_workflow_permission('WFH','review') or public.has_workflow_permission('WFH','approve')
    or public.has_workflow_permission('WFH','reject') or public.has_workflow_permission('WFH','return')
    or public.has_workflow_permission('WFH','cancel') or public.has_workflow_permission('WFH','finalize')
  )
) with check (public.can_access_hris_user(employee_id));

create policy ot_authorized_view on public.ot_requests for select to authenticated using (
  public.has_feature_permission('OT','view') and public.can_access_hris_user(employee_id)
);
create policy ot_authorized_insert on public.ot_requests for insert to authenticated with check (
  employee_id = public.current_hris_user_id()
  and public.has_feature_permission('OT','create')
  and public.has_workflow_permission('Overtime','submit')
);
create policy ot_authorized_update on public.ot_requests for update to authenticated using (
  public.can_access_hris_user(employee_id) and (
    public.has_workflow_permission('Overtime','review') or public.has_workflow_permission('Overtime','approve')
    or public.has_workflow_permission('Overtime','reject') or public.has_workflow_permission('Overtime','return')
    or public.has_workflow_permission('Overtime','cancel') or public.has_workflow_permission('Overtime','finalize')
  )
) with check (public.can_access_hris_user(employee_id));

create policy manpower_authorized_view on public.manpower_requests for select to authenticated using (
  public.has_feature_permission('Manpower','view') and public.can_access_hris_user(requester_id)
);
create policy manpower_authorized_insert on public.manpower_requests for insert to authenticated with check (
  requester_id = public.current_hris_user_id()
  and public.has_feature_permission('Manpower','create')
  and public.has_workflow_permission('Manpower','submit')
);
create policy manpower_authorized_update on public.manpower_requests for update to authenticated using (
  public.can_access_hris_user(requester_id) and (
    public.has_workflow_permission('Manpower','review') or public.has_workflow_permission('Manpower','approve')
    or public.has_workflow_permission('Manpower','reject') or public.has_workflow_permission('Manpower','return')
    or public.has_workflow_permission('Manpower','cancel') or public.has_workflow_permission('Manpower','finalize')
  )
) with check (public.can_access_hris_user(requester_id));

create policy attendance_exceptions_hr_authority on public.attendance_exceptions
  for all to authenticated using (public.is_hr_or_admin()) with check (public.is_hr_or_admin());
create policy attendance_records_hr_authority on public.attendance_records
  for all to authenticated using (public.is_hr_or_admin()) with check (public.is_hr_or_admin());

drop policy if exists app_settings_admin_write on public.app_settings;
drop policy if exists app_settings_system_admin_write on public.app_settings;
create policy app_settings_system_admin_write on public.app_settings
  for all to authenticated using (public.is_system_admin()) with check (public.is_system_admin());

drop policy if exists permissions_matrix_admin_write on public.permissions_matrix;
drop policy if exists permissions_matrix_system_admin_write on public.permissions_matrix;
create policy permissions_matrix_system_admin_write on public.permissions_matrix
  for all to authenticated using (public.is_system_admin()) with check (public.is_system_admin());

drop policy if exists approver_configs_delete_admin_bod on public.approver_configs;
drop policy if exists approver_configs_insert_admin_bod on public.approver_configs;
drop policy if exists approver_configs_update_admin_bod on public.approver_configs;
drop policy if exists approver_configs_hr_authority_write on public.approver_configs;
create policy approver_configs_hr_authority_write on public.approver_configs
  for all to authenticated
  using (public.has_active_role('Board of Director') or public.has_active_role('HR Manager'))
  with check (public.has_active_role('Board of Director') or public.has_active_role('HR Manager'));

-- System reference data is administered by technical Admin, not by possession
-- of general HR-content access.
drop policy if exists ref_write on public.business_units;
drop policy if exists ref_write on public.departments;
drop policy if exists ref_write on public.sites;
drop policy if exists ref_write on public.leave_policies;
drop policy if exists ref_write on public.holidays;
drop policy if exists business_units_system_admin_write on public.business_units;
drop policy if exists departments_system_admin_write on public.departments;
drop policy if exists sites_system_admin_write on public.sites;
drop policy if exists leave_policies_system_admin_write on public.leave_policies;
drop policy if exists holidays_system_admin_write on public.holidays;
create policy business_units_system_admin_write on public.business_units for all to authenticated using (public.is_system_admin()) with check (public.is_system_admin());
create policy departments_system_admin_write on public.departments for all to authenticated using (public.is_system_admin()) with check (public.is_system_admin());
create policy sites_system_admin_write on public.sites for all to authenticated using (public.is_system_admin()) with check (public.is_system_admin());
create policy leave_policies_system_admin_write on public.leave_policies for all to authenticated using (public.is_system_admin()) with check (public.is_system_admin());
create policy holidays_system_admin_write on public.holidays for all to authenticated using (public.is_system_admin()) with check (public.is_system_admin());

drop policy if exists audit_logs_select on public.audit_logs;
drop policy if exists audit_logs_authorized_select on public.audit_logs;
create policy audit_logs_authorized_select on public.audit_logs for select to authenticated
  using (public.has_feature_permission('AuditLog','view'));

drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_scoped_select on public.notifications;
create policy notifications_scoped_select on public.notifications for select to authenticated using (
  user_id = public.current_hris_user_id()::text
  or (public.has_feature_permission('Notifications','view') and public.is_hr_or_admin())
);

drop policy if exists user_documents_select on public.user_documents;
drop policy if exists user_documents_update on public.user_documents;
drop policy if exists user_documents_scoped_select on public.user_documents;
drop policy if exists user_documents_scoped_update on public.user_documents;
create policy user_documents_scoped_select on public.user_documents for select to authenticated using (
  user_id = public.current_hris_user_id()
  or (public.has_sensitive_permission('employee_documents','view') and public.can_access_hris_user(user_id))
);
create policy user_documents_scoped_update on public.user_documents for update to authenticated using (
  public.has_sensitive_permission('employee_documents','edit') and public.can_access_hris_user(user_id)
) with check (
  public.has_sensitive_permission('employee_documents','edit') and public.can_access_hris_user(user_id)
);

create policy roles_active_read on public.roles for select to authenticated using (is_active or public.is_system_admin());
create policy resources_active_read on public.resources for select to authenticated using (is_active or public.is_system_admin());
create policy role_permissions_read on public.role_permissions for select to authenticated using (
  exists(select 1 from public.roles r where r.id=role_id and r.is_active)
);
create policy user_roles_self_or_admin_read on public.user_roles for select to authenticated using (
  user_id=public.current_hris_user_id() or public.is_system_admin()
  or public.has_feature_permission('UserManagement','view')
);
create policy role_allowlist_admin_read on public.user_multi_role_allowlist for select to authenticated using (public.is_system_admin());
create policy sensitive_matrix_self_or_admin_read on public.role_sensitive_permissions for select to authenticated using (
  role_id=any(public.current_hris_roles()) or public.is_system_admin()
);
create policy workflow_matrix_self_or_admin_read on public.role_workflow_permissions for select to authenticated using (
  role_id=any(public.current_hris_roles()) or public.is_system_admin()
);
create policy rbac_audit_admin_read on public.rbac_audit_log for select to authenticated using (
  public.is_system_admin() or public.has_feature_permission('AuditLog','view')
);
create policy rbac_cache_self_read on public.rbac_cache_versions for select to authenticated using (user_id=public.current_hris_user_id());

create policy hris_users_central_select on public.hris_users for select to authenticated using (public.can_access_hris_user(id));
create policy hris_users_authorized_insert on public.hris_users for insert to authenticated with check (public.has_feature_permission('Employees','create'));
create policy hris_users_self_register on public.hris_users for insert to authenticated with check (auth_user_id=auth.uid());
create policy hris_users_authorized_update on public.hris_users for update to authenticated using (
  id=public.current_hris_user_id() or (public.has_feature_permission('Employees','edit') and public.can_access_hris_user(id))
) with check (
  id=public.current_hris_user_id() or (public.has_feature_permission('Employees','edit') and public.can_access_hris_user(id))
);
create policy hris_users_authorized_delete on public.hris_users for delete to authenticated using (
  public.has_feature_permission('Employees','delete') and public.can_access_hris_user(id)
);

revoke insert, update, delete on public.roles, public.resources, public.role_permissions,
  public.user_roles, public.user_multi_role_allowlist, public.role_sensitive_permissions,
  public.role_workflow_permissions, public.rbac_audit_log, public.rbac_cache_versions from authenticated;

grant select on public.user_roles, public.user_multi_role_allowlist,
  public.role_sensitive_permissions, public.role_workflow_permissions,
  public.rbac_audit_log, public.rbac_cache_versions to authenticated;

-- Column-level protection is activated by the follow-up migration only after
-- the transition-compatible frontend is live. Until then, row scope is already
-- centralized but the legacy app can continue using its existing select lists.

revoke all on function public.admin_set_user_roles(uuid,text[],text,text,uuid[],text) from public,anon;
revoke all on function public.admin_replace_role_permissions(text,jsonb) from public,anon;
revoke all on function public.admin_replace_role_authority(text,jsonb,jsonb) from public,anon;
grant execute on function public.admin_set_user_roles(uuid,text[],text,text,uuid[],text) to authenticated;
grant execute on function public.admin_replace_role_permissions(text,jsonb) to authenticated;
grant execute on function public.admin_replace_role_authority(text,jsonb,jsonb) to authenticated;
grant execute on function public.get_my_effective_rbac() to authenticated;
grant execute on function public.get_my_hris_bootstrap() to authenticated;
grant execute on function public.get_accessible_hris_users() to authenticated;
grant execute on function public.get_hris_user_profile(uuid) to authenticated;
grant execute on function public.has_feature_permission(text,text) to authenticated;
grant execute on function public.has_sensitive_permission(text,text) to authenticated;
grant execute on function public.has_workflow_permission(text,text) to authenticated;
grant execute on function public.assert_bod_hr_manager_parity() to authenticated;

-- Record the migration and the two safe legacy-role reassignments.
insert into public.rbac_audit_log(actor_user_id,target_user_id,action,entity_type,entity_id,before_value,after_value)
select null,u.id,'MIGRATE_LEGACY_ROLE','user',u.id::text,
  jsonb_build_object('role',case when u.role='HR Staff' then 'Recruiter' else 'test role' end),
  jsonb_build_object('role',u.role)
from public.hris_users u
where u.id in (
  'be457ef4-03a5-4909-b35c-e378633d00b8'::uuid,
  '0a8dfd33-3e95-4358-9837-51707a9739ac'::uuid
)
and not exists (
  select 1 from public.rbac_audit_log a
  where a.target_user_id=u.id and a.action='MIGRATE_LEGACY_ROLE'
);

insert into public.rbac_audit_log(actor_user_id,target_user_id,action,entity_type,entity_id,before_value,after_value)
select null,u.id,'PRODUCTION_RBAC_ASSIGNMENT','user',u.id::text,
  (select assignment
   from private.rbac_migration_snapshots s
   cross join lateral jsonb_array_elements(s.user_assignments) assignment
   where s.snapshot_key='pre-rbac-20260823-fde428f'
     and lower(assignment->>'email')=lower(u.email)
   limit 1),
  jsonb_build_object(
    'roles',(select jsonb_agg(ur.role_id order by ur.is_primary desc,ur.role_id) from public.user_roles ur where ur.user_id=u.id and ur.is_active),
    'primaryRole',u.role,'dashboardType',u.dashboard_type,'dataScope',u.data_access_scope
  )
from public.hris_users u
where lower(u.email) in ('kay@thenextperience.com','it@thenextperience.com','hrs@thenextperience.com')
and not exists (
  select 1 from public.rbac_audit_log a
  where a.target_user_id=u.id and a.action='PRODUCTION_RBAC_ASSIGNMENT'
);

-- Blocking validation: exact assignments, only approved active roles, parity,
-- and approval baselines must remain unchanged inside this transaction.
do $$
declare baseline jsonb; after_counts jsonb; original_auth_sub text := current_setting('request.jwt.claim.sub',true);
begin
  perform public.assert_bod_hr_manager_parity();

  if (select count(*) from public.roles where is_active) <> 12 then
    raise exception 'RBAC validation failed: expected exactly 12 active approved roles.';
  end if;
  if exists(select 1 from public.roles where id in ('Recruiter','test role') and is_active) then
    raise exception 'RBAC validation failed: legacy roles remain active.';
  end if;
  if exists(select 1 from public.hris_users where role in ('Recruiter','test role')) then
    raise exception 'RBAC validation failed: a user still depends on a legacy role.';
  end if;
  if (select array_agg(role_id order by role_id) from public.user_roles ur join public.hris_users u on u.id=ur.user_id
      where lower(u.email)='kay@thenextperience.com' and ur.is_active) <> array['Admin','Board of Director']::text[] then
    raise exception 'RBAC validation failed: Kay role assignment mismatch.';
  end if;
  if (select array_agg(role_id order by role_id) from public.user_roles ur join public.hris_users u on u.id=ur.user_id
      where lower(u.email)='it@thenextperience.com' and ur.is_active) <> array['Admin','IT']::text[] then
    raise exception 'RBAC validation failed: IT role assignment mismatch.';
  end if;
  if (select array_agg(role_id order by role_id) from public.user_roles ur join public.hris_users u on u.id=ur.user_id
      where lower(u.email)='hrs@thenextperience.com' and ur.is_active) <> array['HR Manager']::text[] then
    raise exception 'RBAC validation failed: Jed role assignment mismatch.';
  end if;

  perform set_config('request.jwt.claim.sub',(select auth_user_id::text from public.hris_users where lower(email)='kay@thenextperience.com'),true);
  if public.current_hris_roles() <> array['Board of Director','Admin']::text[]
     or public.current_data_scope()->>'type' <> 'GLOBAL'
     or not public.has_workflow_permission('Leave','approve')
     or not public.has_workflow_permission('WFH','approve')
     or not public.has_workflow_permission('Overtime','approve')
     or not public.has_workflow_permission('Manpower','approve')
     or not public.has_sensitive_permission('salary_compensation','view')
     or not public.has_feature_permission('RolesPermissions','manage') then
    raise exception 'RBAC validation failed: Kay effective authority mismatch.';
  end if;

  perform set_config('request.jwt.claim.sub',(select auth_user_id::text from public.hris_users where lower(email)='it@thenextperience.com'),true);
  if public.current_hris_roles() <> array['IT','Admin']::text[]
     or public.current_data_scope()->>'type' <> 'GLOBAL'
     or public.has_workflow_permission('Leave','approve')
     or public.has_workflow_permission('WFH','approve')
     or public.has_workflow_permission('Overtime','approve')
     or public.has_workflow_permission('Manpower','approve')
     or public.has_sensitive_permission('salary_compensation','view')
     or public.has_sensitive_permission('bank_information','view')
     or not public.has_feature_permission('RolesPermissions','manage') then
    raise exception 'RBAC validation failed: IT technical/sensitive authority boundary mismatch.';
  end if;

  perform set_config('request.jwt.claim.sub',(select auth_user_id::text from public.hris_users where lower(email)='hrs@thenextperience.com'),true);
  if public.current_hris_roles() <> array['HR Manager']::text[]
     or public.current_data_scope()->>'type' <> 'GLOBAL'
     or not public.has_workflow_permission('Leave','approve')
     or not public.has_workflow_permission('WFH','approve')
     or not public.has_workflow_permission('Overtime','approve')
     or not public.has_workflow_permission('Manpower','approve')
     or not public.has_sensitive_permission('salary_compensation','view')
     or public.has_feature_permission('RolesPermissions','manage') then
    raise exception 'RBAC validation failed: Jed HR authority or Admin ceiling mismatch.';
  end if;

  perform set_config('request.jwt.claim.sub',(select auth_user_id::text from public.hris_users where id='be457ef4-03a5-4909-b35c-e378633d00b8'::uuid),true);
  if not public.has_active_role('HR Staff') or not public.has_feature_permission('Recruitment','manage') then
    raise exception 'RBAC validation failed: former Recruiter lost recruitment access.';
  end if;
  perform set_config('request.jwt.claim.sub',coalesce(original_auth_sub,''),true);

  select approval_baseline into baseline from private.rbac_migration_snapshots where snapshot_key='pre-rbac-20260823-fde428f';
  after_counts := jsonb_build_object(
    'leave',(select count(*) from public.leave_requests where status='Pending'),
    'wfh',(select count(*) from public.wfh_requests where status in ('WFH_PENDING_BOD_APPROVAL','WFH_PENDING_DEPT_HEAD_APPROVAL')),
    'overtime',(select count(*) from public.ot_requests where status::text='PendingBOD'),
    'manpower',(select count(*) from public.manpower_requests where status='Pending')
  );
  if (baseline#>>'{leave,count}')::int <> (after_counts->>'leave')::int
    or (baseline#>>'{wfh,count}')::int <> (after_counts->>'wfh')::int
    or (baseline#>>'{overtime,count}')::int <> (after_counts->>'overtime')::int
    or (baseline#>>'{manpower,count}')::int <> (after_counts->>'manpower')::int then
    raise exception 'RBAC validation failed: pending approval baseline changed. Before %, after %', baseline, after_counts;
  end if;
end;
$$;
