-- Complete production RBAC matrix export.
-- Run with a privileged Supabase database connection; these queries are read-only.

-- Feature-permission matrix: every approved role, resource, module, and action list.
select
  r.id as role_id,
  r.display_name,
  res.group_name,
  res.module,
  res.id as resource_id,
  coalesce(rp.permissions, array[]::text[]) as actions
from public.roles r
cross join public.resources res
left join public.role_permissions rp
  on rp.role_id = r.id and rp.resource_id = res.id
where r.is_active
order by r.display_name, res.group_name, res.module, res.id;

-- Data-scope matrix and dashboard presentation.
select
  id as role_id,
  display_name,
  dashboard_type,
  default_data_scope
from public.roles
where is_active
order by display_name;

-- Sensitive-field matrix.
with sensitive_fields(field_key) as (
  values
    ('salary_compensation'),
    ('bank_information'),
    ('sss'),
    ('tin'),
    ('pagibig'),
    ('philhealth'),
    ('employee_documents'),
    ('benefits_medical'),
    ('disciplinary_records'),
    ('ntes'),
    ('investigation_evidence'),
    ('evaluation_results'),
    ('payroll_staging'),
    ('final_pay'),
    ('security_pins'),
    ('authentication_fields')
)
select
  r.id as role_id,
  r.display_name,
  sf.field_key,
  coalesce(rsp.permissions, array[]::text[]) as actions
from public.roles r
cross join sensitive_fields sf
left join public.role_sensitive_permissions rsp
  on rsp.role_id = r.id and rsp.field_key = sf.field_key
where r.is_active
order by r.display_name, sf.field_key;

-- Workflow-action matrix.
with workflow_definitions(workflow_key) as (
  values
    ('Leave'),
    ('Overtime'),
    ('WFH'),
    ('Manpower'),
    ('JobRequisitions'),
    ('PersonnelActionNotices'),
    ('IncidentReports'),
    ('NTEs'),
    ('DisciplinaryDecisions'),
    ('Benefits'),
    ('COE'),
    ('AssetRequests'),
    ('PayrollPreparation'),
    ('FinalPay'),
    ('Evaluations'),
    ('Awards'),
    ('RecruitmentOffers'),
    ('Resignation'),
    ('Clearance')
)
select
  r.id as role_id,
  r.display_name,
  w.workflow_key,
  coalesce(rwp.actions, array[]::text[]) as actions
from public.roles r
cross join workflow_definitions w
left join public.role_workflow_permissions rwp
  on rwp.role_id = r.id and rwp.workflow_key = w.workflow_key
where r.is_active
order by r.display_name, w.workflow_key;

-- Dashboard/navigation matrix. Navigation is derived from feature actions; this
-- result provides every visible resource and its effective dashboard type.
select
  r.id as role_id,
  r.display_name,
  r.dashboard_type,
  res.module,
  res.id as resource_id,
  rp.permissions
from public.roles r
join public.role_permissions rp on rp.role_id = r.id
join public.resources res on res.id = rp.resource_id
where r.is_active
  and ('view' = any(rp.permissions) or 'manage' = any(rp.permissions))
order by r.display_name, res.module, res.id;

-- Parity proof. Returns true or raises on any feature, sensitive, or workflow drift.
select public.assert_bod_hr_manager_parity() as bod_hr_manager_parity;

-- Active user assignments and allowed scopes.
select
  u.id,
  u.email,
  u.role as primary_role,
  array_agg(ur.role_id order by ur.is_primary desc, ur.role_id)
    filter (where ur.is_active) as active_roles,
  u.dashboard_type,
  u.data_access_scope,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'role', ur.role_id,
        'primary', ur.is_primary,
        'scope', ur.scope_type,
        'allowedBusinessUnitIds', ur.allowed_business_unit_ids,
        'dashboardType', ur.dashboard_type
      ) order by ur.is_primary desc, ur.role_id
    ) filter (where ur.is_active),
    '[]'::jsonb
  ) as role_scope_assignments,
  u.permission_updated_at,
  u.permission_updated_by
from public.hris_users u
left join public.user_roles ur on ur.user_id = u.id
group by u.id
order by lower(u.email);
