-- Foundational schema baseline for clean Supabase preview branches.
--
-- Production-safe: every object is created conditionally, no rows are updated
-- or deleted, and constraints are added only when absent.
--
-- This version intentionally sorts before 20260427125254_create_resolutions_table,
-- whose incident_report_id foreign key requires public.incident_reports.
--
-- Definitions were generated read-only from the live main PostgreSQL catalog.
-- Two columns added later by non-idempotent historical migrations are omitted:
--   public.wfh_requests.end_date
--   public.employee_awards.is_acknowledged_by_employee
-- Legacy repository migrations also add these columns non-idempotently:
--   public.coaching_sessions.time
--   public.coaching_sessions.medium
--   public.coaching_sessions.meeting_link
--   public.ntes.body
--
-- Foreign keys to tables created by later recorded migrations are deferred
-- to those migrations. Foundational table-to-table constraints are preserved.

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'announcement_type') then
    create type public.announcement_type as enum ('General', 'Policy');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'asset_request_status') then
    create type public.asset_request_status as enum ('Pending', 'Returned', 'Approved', 'Rejected', 'Fulfilled');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'asset_request_type') then
    create type public.asset_request_type as enum ('Request', 'Return');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'asset_status') then
    create type public.asset_status as enum ('Available', 'Assigned', 'In Repair', 'Retired');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'award_status') then
    create type public.award_status as enum ('Draft', 'Submitted', 'Approved', 'Issued', 'Rejected', 'PendingApproval', 'Pending Approval');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'badge_level') then
    create type public.badge_level as enum ('Bronze', 'Silver', 'Gold');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'benefit_request_status') then
    create type public.benefit_request_status as enum ('Pending HR Review', 'Pending Board Approval', 'Approved', 'Fulfilled', 'Rejected', 'Cancelled');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'coaching_status') then
    create type public.coaching_status as enum ('Draft', 'Scheduled', 'Completed', 'Acknowledged', 'Accepted', 'Declined');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'coaching_trigger') then
    create type public.coaching_trigger as enum ('Attendance', 'Performance', 'Behavior', 'Skill Gap', 'Career Development');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'coe_purpose') then
    create type public.coe_purpose as enum ('LOAN_APPLICATION', 'TRAVEL', 'VISA_APPLICATION', 'SCHOOL_APPLICATION', 'LEGAL_PURPOSES', 'OTHERS', 'VISA_TRAVEL', 'SCHOOL_EDUCATION', 'GOVERNMENT_LEGAL', 'GENERAL_EMPLOYMENT');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'coe_request_status') then
    create type public.coe_request_status as enum ('Pending', 'Approved', 'Rejected', 'Pending HR Manager Approval', 'Returned for Revision');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'day_type_tier') then
    create type public.day_type_tier as enum ('Regular', 'Weekend', 'Holiday', 'Peak');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'envelope_status') then
    create type public.envelope_status as enum ('Draft', 'Pending Approval', 'Out for Signature', 'Completed', 'Declined', 'Voided');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'ir_status') then
    create type public.ir_status as enum ('Draft', 'Submitted', 'HR Review', 'Returned for Revision', 'Rejected', 'Converted', 'NoAction', 'Closed');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'job_employment_type') then
    create type public.job_employment_type as enum ('Full-Time', 'Part-Time', 'Contract');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'job_location_type') then
    create type public.job_location_type as enum ('Onsite', 'Hybrid', 'Remote');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'job_requisition_role') then
    create type public.job_requisition_role as enum ('HR', 'Final');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'job_requisition_status') then
    create type public.job_requisition_status as enum ('Draft', 'PendingApproval', 'Approved', 'Rejected');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'job_requisition_step_status') then
    create type public.job_requisition_step_status as enum ('Pending', 'Approved', 'Rejected');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'memo_status') then
    create type public.memo_status as enum ('Published', 'Draft', 'Archived');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'nte_status') then
    create type public.nte_status as enum ('Draft', 'PendingApproval', 'Approved', 'Rejected', 'Issued', 'Response Submitted', 'Waiver', 'Hearing Scheduled', 'Closed');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'onboarding_checklist_status') then
    create type public.onboarding_checklist_status as enum ('Pending', 'InProgress', 'PendingApproval', 'Completed', 'Cancelled', 'Pending Approval', 'Approved', 'Rejected');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'onboarding_template_type') then
    create type public.onboarding_template_type as enum ('Onboarding', 'Offboarding');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'ot_status') then
    create type public.ot_status as enum ('Draft', 'Submitted', 'Approved', 'Rejected', 'PendingGM', 'PendingBOD');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'pan_status') then
    create type public.pan_status as enum ('Draft', 'Pending Approval', 'Pending Employee', 'Completed', 'Declined', 'Returned for Edits', 'Cancelled');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'pulse_survey_status') then
    create type public.pulse_survey_status as enum ('Draft', 'Active', 'Closed');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'severity_level') then
    create type public.severity_level as enum ('Low', 'Medium', 'High', 'Critical');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'ticket_category') then
    create type public.ticket_category as enum ('IT', 'HR', 'Finance', 'General');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'ticket_priority') then
    create type public.ticket_priority as enum ('Low', 'Medium', 'High', 'Urgent');
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'ticket_status') then
    create type public.ticket_status as enum ('New', 'Assigned', 'In Progress', 'Pending Resolution', 'Resolved', 'Closed');
  end if;
end
$baseline$;

create sequence if not exists public.incident_reports_case_number_seq increment by 1 minvalue 1 maxvalue 2147483647 start with 1 cache 1 no cycle;

create sequence if not exists public.ntes_nte_number_seq increment by 1 minvalue 1 maxvalue 2147483647 start with 1 cache 1 no cycle;

create table if not exists public.announcements (
  id uuid default gen_random_uuid() not null,
  title text not null,
  message text not null,
  type public.announcement_type default 'General'::announcement_type not null,
  target_group text default 'All'::text not null,
  business_unit_id uuid,
  attachment_url text,
  acknowledgement_user_ids uuid[] default '{}'::uuid[] not null,
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.applicant_page_themes (
  id uuid default gen_random_uuid() not null,
  business_unit_id uuid not null,
  name text not null,
  slug text not null,
  is_active boolean default true not null,
  page_title text not null,
  hero_headline text not null,
  hero_description text,
  primary_color text not null,
  secondary_color text,
  background_color text not null,
  hero_image_url text,
  logo_url text,
  sections jsonb default '[]'::jsonb,
  cta_text text,
  cta_link text,
  created_by_user_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.asset_assignments (
  id uuid default gen_random_uuid() not null,
  asset_id uuid not null,
  employee_id uuid not null,
  date_assigned timestamp with time zone default now() not null,
  date_returned timestamp with time zone,
  condition_on_assign text not null,
  condition_on_return text,
  manager_proof_url_on_return text,
  is_acknowledged boolean default false,
  acknowledged_at timestamp with time zone,
  signed_document_url text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.asset_requests (
  id uuid default gen_random_uuid() not null,
  request_type public.asset_request_type not null,
  employee_id uuid not null,
  employee_name text not null,
  asset_id uuid,
  asset_description text not null,
  justification text not null,
  status public.asset_request_status default 'Pending'::asset_request_status not null,
  requested_at timestamp with time zone default now() not null,
  manager_id uuid not null,
  manager_notes text,
  approved_at timestamp with time zone,
  rejected_at timestamp with time zone,
  fulfilled_at timestamp with time zone,
  employee_submission_notes text,
  employee_proof_url text,
  employee_submitted_at timestamp with time zone,
  rejection_reason text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  approval_stage text,
  required_bod_approvals smallint default 2 not null,
  bod_approval_count smallint default 0 not null,
  manager_approved_by uuid,
  manager_approved_at timestamp with time zone,
  approval_issue text
);

create table if not exists public.assets (
  id uuid default gen_random_uuid() not null,
  asset_tag text not null,
  name text not null,
  type text not null,
  business_unit_id text not null,
  serial_number text,
  purchase_date date not null,
  value numeric(14,2) default 0 not null,
  status public.asset_status default 'Available'::asset_status not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  brand text,
  model text,
  description text,
  condition text,
  warranty_expiry date
);

create table if not exists public.award_templates (
  id uuid default gen_random_uuid() not null,
  title text not null,
  description text,
  badge_icon_url text,
  is_active boolean default true not null,
  created_by_user_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  design jsonb,
  business_unit_id uuid,
  category text,
  award_value_label text,
  is_default boolean default false not null,
  is_preset boolean default false not null,
  preset_key text,
  sort_order integer default 0 not null,
  template_status text default 'published'::text not null,
  badge_key text,
  is_system boolean default false not null
);

create table if not exists public.benefit_requests (
  id uuid default gen_random_uuid() not null,
  employee_id uuid not null,
  employee_name text not null,
  benefit_type_id uuid not null,
  benefit_type_name text not null,
  amount numeric(12,2),
  details text not null,
  date_needed date not null,
  status public.benefit_request_status default 'Pending HR Review'::benefit_request_status not null,
  submission_date timestamp with time zone default now() not null,
  hr_endorsed_by uuid,
  hr_endorsed_at timestamp with time zone,
  bod_approved_by uuid,
  bod_approved_at timestamp with time zone,
  fulfilled_by uuid,
  fulfilled_at timestamp with time zone,
  voucher_code text,
  rejection_reason text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.benefit_types (
  id uuid default gen_random_uuid() not null,
  name text not null,
  description text not null,
  max_value numeric(12,2),
  requires_bod_approval boolean default false not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.business_units (
  id uuid default gen_random_uuid() not null,
  name text not null,
  code text,
  color text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.coaching_sessions (
  id uuid default gen_random_uuid() not null,
  employee_id uuid not null,
  employee_name text not null,
  coach_id uuid not null,
  coach_name text not null,
  trigger public.coaching_trigger not null,
  context text not null,
  date timestamp with time zone not null,
  status public.coaching_status default 'Draft'::coaching_status not null,
  root_cause text,
  action_plan text,
  follow_up_date timestamp with time zone,
  employee_signature_url text,
  coach_signature_url text,
  acknowledged_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.coe_requests (
  id uuid default gen_random_uuid() not null,
  employee_id uuid not null,
  employee_name text not null,
  employee_position text,
  employee_business_unit_id uuid,
  employee_department_id uuid,
  purpose public.coe_purpose not null,
  other_purpose_detail text,
  date_requested date default CURRENT_DATE not null,
  status public.coe_request_status default 'Pending'::coe_request_status not null,
  rejection_reason text,
  generated_document_url text,
  approved_by uuid,
  approved_at timestamp with time zone,
  requested_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  template_id uuid,
  template_snapshot jsonb,
  employee_snapshot jsonb,
  snapshot_created_at timestamp with time zone,
  generation_source text,
  fallback_reason text,
  document_version integer default 1 not null,
  return_reason text,
  returned_by uuid,
  returned_at timestamp with time zone,
  approval_content_edited boolean default false not null
);

create table if not exists public.coe_templates (
  id uuid default gen_random_uuid() not null,
  business_unit_id uuid not null,
  logo_url text,
  address text,
  body text not null,
  signatory_name text not null,
  signatory_position text not null,
  is_active boolean default true not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  name text default 'Certificate of Employment'::text not null,
  description text,
  document_title text default 'Certificate of Employment'::text not null,
  style_key text default 'classic-corporate'::text not null,
  primary_color text default '#1e3a8a'::text not null,
  accent_color text default '#64748b'::text not null,
  font_family text default 'Times New Roman'::text not null,
  signature_url text,
  footer_text text,
  layout_settings jsonb default jsonb_build_object('marginTopMm', 20, 'marginRightMm', 20, 'marginBottomMm', 20, 'marginLeftMm', 20, 'lineHeight', 1.6, 'textAlignment', 'justify', 'logoAlignment', 'center', 'logoHeightMm', 24) not null,
  status text default 'Draft'::text not null,
  version integer default 1 not null,
  is_preset boolean default false not null,
  preset_key text,
  created_from_template_id uuid,
  archived_at timestamp with time zone,
  archived_by uuid,
  purposes text[] default '{}'::text[] not null,
  recommended_purposes text[] default '{}'::text[] not null
);

create table if not exists public.contract_templates (
  id uuid default gen_random_uuid() not null,
  title text not null,
  description text,
  owning_business_unit_id uuid,
  is_default boolean default false not null,
  logo_url text,
  logo_position text,
  logo_max_width integer,
  body text not null,
  sections jsonb default '[]'::jsonb not null,
  footer text,
  company_signatory jsonb,
  employee_signatory jsonb,
  witnesses jsonb default '[]'::jsonb,
  acknowledgment_body text,
  acknowledgment_parties jsonb default '[]'::jsonb,
  versions jsonb default '[]'::jsonb,
  active_version integer,
  created_by_user_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  document_settings jsonb default jsonb_build_object('pageSize', 'A4', 'marginTopMm', 20, 'marginRightMm', 20, 'marginBottomMm', 20, 'marginLeftMm', 20, 'fontFamily', 'Times New Roman', 'fontSizePt', 12, 'lineHeight', 1.45, 'showPageNumbers', false, 'showFooter', true) not null
);

create table if not exists public.demand_types (
  id uuid default gen_random_uuid() not null,
  business_unit_id uuid,
  tier public.day_type_tier not null,
  label text not null,
  color text default 'bg-gray-100 text-gray-800'::text not null,
  description text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.departments (
  id uuid default gen_random_uuid() not null,
  business_unit_id uuid not null,
  name text not null,
  code text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.discipline_categories (
  name text not null,
  created_at timestamp with time zone default now() not null,
  description text,
  display_order integer default 0 not null,
  is_active boolean default true not null,
  archived_at timestamp with time zone,
  archived_by uuid,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.discipline_entries (
  id uuid default gen_random_uuid() not null,
  code text not null,
  category text not null,
  description text not null,
  severity public.severity_level not null,
  sanctions jsonb default '[]'::jsonb not null,
  last_modified_at timestamp with time zone default now() not null,
  business_unit_id uuid,
  is_active boolean default true not null,
  archived_at timestamp with time zone,
  archived_by uuid,
  last_modified_by_user_id uuid
);

create table if not exists public.employee_awards (
  id uuid default gen_random_uuid() not null,
  employee_id uuid not null,
  award_template_id uuid not null,
  notes text,
  level public.badge_level default 'Bronze'::badge_level not null,
  status public.award_status default 'PendingApproval'::award_status not null,
  business_unit_id uuid,
  certificate_snapshot_url text,
  created_by_user_id uuid,
  approver_id uuid,
  submitted_at timestamp with time zone,
  decided_at timestamp with time zone,
  rejection_reason text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  department_id uuid,
  approver_steps jsonb default '[]'::jsonb not null,
  issued_at timestamp with time zone,
  issued_by uuid
);

create table if not exists public.envelopes (
  id uuid default gen_random_uuid() not null,
  template_id uuid,
  template_title text,
  employee_id uuid,
  employee_name text,
  title text not null,
  routing_steps jsonb default '[]'::jsonb not null,
  due_date date,
  status public.envelope_status default 'Draft'::envelope_status not null,
  created_by_user_id uuid,
  created_at timestamp with time zone default now() not null,
  events jsonb default '[]'::jsonb not null,
  content_snapshot jsonb,
  updated_at timestamp with time zone default now() not null,
  attachments jsonb default '[]'::jsonb not null
);

create table if not exists public.evaluation_evaluators (
  id uuid default gen_random_uuid() not null,
  evaluation_id uuid not null,
  type text not null,
  weight integer default 0 not null,
  user_id uuid,
  business_unit_id uuid,
  department_id uuid,
  is_anonymous boolean default false not null,
  exclude_subject boolean default true not null
);

create table if not exists public.evaluation_question_sets (
  id uuid default gen_random_uuid() not null,
  name text not null,
  description text,
  is_default boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.evaluation_questions (
  id uuid default gen_random_uuid() not null,
  question_set_id uuid not null,
  title text not null,
  description text,
  question_type text not null,
  is_archived boolean default false not null,
  target_employee_levels text[] default '{}'::text[],
  target_evaluator_roles text[] default '{}'::text[],
  created_at timestamp with time zone default now() not null
);

create table if not exists public.evaluation_submissions (
  id uuid default gen_random_uuid() not null,
  evaluation_id uuid not null,
  subject_employee_id uuid not null,
  rater_id uuid not null,
  rater_group text not null,
  scores jsonb default '[]'::jsonb not null,
  submitted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.evaluation_timelines (
  id uuid default gen_random_uuid() not null,
  name text not null,
  type text not null,
  rollout_date date not null,
  created_at timestamp with time zone default now() not null,
  end_date date,
  status text default 'Active'::text not null
);

create table if not exists public.evaluations (
  id uuid default gen_random_uuid() not null,
  name text not null,
  timeline_id uuid,
  target_business_unit_ids uuid[] default '{}'::uuid[] not null,
  target_employee_ids uuid[] default '{}'::uuid[] not null,
  question_set_ids uuid[] default '{}'::uuid[] not null,
  status text default 'InProgress'::text not null,
  due_date date not null,
  is_employee_visible boolean default false not null,
  acknowledged_by uuid[] default '{}'::uuid[] not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  request_key text,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.feedback_templates (
  id uuid default gen_random_uuid() not null,
  title text not null,
  body text not null,
  "from" text,
  subject text,
  cc text,
  logo_url text,
  signatory_name text,
  signatory_title text,
  signatory_signature_url text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.helpdesk_calendar_events (
  id uuid default gen_random_uuid() not null,
  title text not null,
  start timestamp with time zone not null,
  "end" timestamp with time zone not null,
  color text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.holidays (
  id uuid default gen_random_uuid() not null,
  name text not null,
  date date not null,
  type text not null,
  is_paid boolean default true not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.hris_users (
  id uuid default gen_random_uuid() not null,
  email text not null,
  first_name text not null,
  last_name text not null,
  full_name text not null,
  role text default 'Employee'::text not null,
  status text default 'Inactive'::text not null,
  is_photo_enrolled boolean default false not null,
  business_unit text,
  department text,
  "position" text,
  date_hired date,
  sss_no text,
  pagibig_no text,
  philhealth_no text,
  tin text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  bank_name text,
  bank_account_number text,
  bank_account_type text,
  created_at timestamp with time zone default now() not null,
  auth_user_id uuid not null,
  business_unit_id uuid,
  department_id uuid,
  leave_quota_vacation numeric(8,2),
  leave_quota_sick numeric(8,2),
  leave_last_credit_date date,
  employment_status text,
  rate_type text,
  rate_amount numeric,
  tax_status text,
  salary_basic numeric,
  salary_deminimis numeric,
  salary_reimbursable numeric,
  birth_date date,
  data_access_scope jsonb default jsonb_build_object('type', 'HOME_ONLY'),
  reports_to text,
  employee_id text,
  leave_quota_offset numeric default 0,
  dashboard_type text,
  permission_diagnostic text,
  permission_updated_at timestamp with time zone,
  permission_updated_by uuid,
  is_duplicate boolean default false not null,
  account_lifecycle_reason text,
  account_inactivated_at timestamp with time zone,
  account_inactivated_by uuid,
  account_reactivated_at timestamp with time zone,
  account_reactivated_by uuid,
  duplicate_marked_at timestamp with time zone,
  duplicate_marked_by uuid,
  end_date date,
  pre_end_employment_status text,
  pre_deactivation_banned_until timestamp with time zone
);

create table if not exists public.incident_reports (
  id uuid default gen_random_uuid() not null,
  category text not null,
  description text not null,
  location text,
  date_time timestamp with time zone not null,
  reported_by uuid,
  involved_employee_ids uuid[] not null,
  involved_employee_names text[] not null,
  witness_ids uuid[] default '{}'::uuid[],
  witness_names text[] default '{}'::text[],
  status public.ir_status default 'Submitted'::ir_status not null,
  pipeline_stage text,
  nte_ids uuid[] default '{}'::uuid[],
  resolution_id uuid,
  chat_thread jsonb default '[]'::jsonb not null,
  attachment_url text,
  signature_data_url text,
  assigned_to_id uuid,
  assigned_to_name text,
  business_unit_id uuid,
  business_unit_name text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  case_number integer default nextval('incident_reports_case_number_seq'::regclass) not null,
  sla_deadline timestamp with time zone default (now() + '3 days'::interval),
  follow_up_count integer default 0 not null,
  last_follow_up_at timestamp with time zone,
  follow_up_history jsonb default '[]'::jsonb not null,
  attachment_urls jsonb default '[]'::jsonb not null,
  revision_notes text,
  rejection_reason text,
  revision_history jsonb default '[]'::jsonb not null,
  nte_processing_complete boolean default false not null,
  nte_processing_summary jsonb default jsonb_build_object('totalEmployees', 0, 'employeesWithNte', 0, 'activeNtes', 0, 'statusCounts', '{}'::jsonb) not null
);

create table if not exists public.job_applications (
  id uuid default gen_random_uuid() not null,
  candidate_id uuid not null,
  job_post_id uuid,
  requisition_id uuid,
  stage text default 'New'::text not null,
  cover_letter text,
  resume_url text,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  role_id text,
  role_slug text,
  role_title_snapshot text,
  department_snapshot text,
  location_snapshot text,
  employment_type_snapshot text,
  work_arrangement_snapshot text,
  role_answers jsonb default '{}'::jsonb not null,
  source_application_page text,
  application_reference text,
  submission_token text,
  resume_file_url text,
  resume_file_path text,
  resume_link text,
  rejected_at timestamp with time zone,
  rejected_by uuid,
  rejection_reason text,
  rejection_email_sent_at timestamp with time zone,
  rejection_email_subject text
);

create table if not exists public.job_candidates (
  id uuid default gen_random_uuid() not null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  source text not null,
  portfolio_url text,
  tags text[] default '{}'::text[],
  consent_at timestamp with time zone default now(),
  created_at timestamp with time zone default now() not null,
  current_city text,
  linkedin_url text,
  current_employer text,
  years_relevant_experience text,
  earliest_start_date date
);

create table if not exists public.job_interview_feedback (
  id uuid default gen_random_uuid() not null,
  interview_id uuid not null,
  reviewer_user_id uuid not null,
  score numeric,
  competency_scores jsonb default '{}'::jsonb,
  strengths text,
  concerns text,
  hire_recommendation text,
  submitted_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.job_interviews (
  id uuid default gen_random_uuid() not null,
  application_id uuid not null,
  interviewer_id uuid,
  start_at timestamp with time zone not null,
  end_at timestamp with time zone,
  location text,
  type text default 'Remote'::text,
  status text default 'Scheduled'::text,
  notes text,
  created_at timestamp with time zone default now() not null,
  panel_user_ids uuid[] default '{}'::uuid[] not null,
  calendar_event_id text,
  google_meet_link text,
  calendar_invite_status text default 'not_requested'::text not null,
  applicant_invite_status text default 'not_requested'::text not null,
  panel_invite_status text default 'not_requested'::text not null,
  confirmation_email_status text default 'not_requested'::text not null,
  applicant_invite_sent_at timestamp with time zone,
  panel_invite_sent_at timestamp with time zone,
  confirmation_email_sent_at timestamp with time zone,
  calendar_error text,
  google_calendar_link text,
  meeting_provider text,
  attendee_meeting_url text,
  zoom_meeting_id text,
  zoom_host_user_id text,
  zoom_host_email text,
  zoom_alternative_host_emails text[] default '{}'::text[] not null,
  custom_provider_name text,
  integration_status jsonb default '{}'::jsonb not null,
  calendar_attendee_statuses jsonb default '[]'::jsonb not null,
  interview_round text default 'Round 1'::text not null,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  updated_at timestamp with time zone,
  calendar_idempotency_key text
);

create table if not exists public.job_offers (
  id uuid default gen_random_uuid() not null,
  application_id uuid not null,
  offer_number text not null,
  base_pay numeric not null,
  allowance_json jsonb default '{}'::jsonb not null,
  start_date date not null,
  probation_months integer default 0 not null,
  employment_type text not null,
  status text default 'Draft'::text not null,
  reporting_to text,
  job_description text,
  created_by_user_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  offer_details jsonb default '{}'::jsonb not null,
  draft_step smallint default 1 not null,
  offer_expiration_date date,
  logo_url text,
  logo_path text,
  last_saved_at timestamp with time zone,
  sent_at timestamp with time zone,
  sent_by_user_id uuid,
  recipient_email text,
  email_subject text,
  email_message text,
  secure_token uuid default gen_random_uuid() not null,
  revision integer default 1 not null,
  viewed_at timestamp with time zone,
  accepted_at timestamp with time zone,
  signed_at timestamp with time zone,
  declined_at timestamp with time zone,
  decline_reason text,
  signature_name text,
  signature_type text,
  signature_path text,
  signed_pdf_path text,
  require_signature boolean default true not null,
  offer_template_id uuid,
  offer_template_name text,
  offer_template_snapshot jsonb default '{}'::jsonb not null,
  approval_status text default 'Not Requested'::text not null,
  approval_request_id uuid,
  employment_type_custom_name text,
  employment_end_date date,
  supersedes_offer_id uuid
);

create table if not exists public.job_post_templates (
  id uuid default gen_random_uuid() not null,
  name text not null,
  created_by_user_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  background_color text default '#FDEEF4'::text not null,
  card_color text default '#FFFFFF'::text not null,
  text_color text default '#1F2937'::text not null,
  accent_color text default '#EF4444'::text not null,
  background_image text,
  logo_image text,
  headline text not null,
  job_title text not null,
  description text not null,
  details jsonb default '[]'::jsonb not null,
  col1_title text,
  col1_content text,
  col2_title text,
  col2_content text,
  contact_title text,
  email1 text,
  email2 text,
  subject_line text,
  button_text text,
  mode text,
  template_key text,
  business_unit text,
  status text default 'Draft'::text not null,
  is_starter boolean default false not null,
  sections jsonb default '[]'::jsonb not null,
  cta_link text,
  brand_wordmark text
);

create table if not exists public.job_posts (
  id uuid default gen_random_uuid() not null,
  requisition_id uuid,
  business_unit_id uuid,
  title text not null,
  slug text not null,
  description text not null,
  requirements text,
  benefits text,
  location_label text,
  employment_type text not null,
  status text default 'Draft'::text not null,
  published_at timestamp with time zone,
  channels jsonb default jsonb_build_object('careerSite', true, 'qr', false, 'social', false, 'jobBoards', false) not null,
  referral_bonus numeric,
  created_by_user_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  application_open_at timestamp with time zone,
  application_close_at timestamp with time zone,
  is_active boolean default true not null,
  is_archived boolean default false not null,
  is_featured boolean default false not null,
  is_urgent boolean default false not null,
  department_label text,
  role_details jsonb default '{}'::jsonb not null
);

create table if not exists public.job_requisitions (
  id uuid default gen_random_uuid() not null,
  req_code text,
  title text not null,
  department_id uuid not null,
  business_unit_id uuid not null,
  headcount integer default 1 not null,
  employment_type public.job_employment_type default 'Full-Time'::job_employment_type not null,
  location_type public.job_location_type default 'Onsite'::job_location_type not null,
  work_location text,
  budgeted_salary_min numeric(14,2),
  budgeted_salary_max numeric(14,2),
  justification text not null,
  created_by_user_id uuid not null,
  status public.job_requisition_status default 'Draft'::job_requisition_status not null,
  is_urgent boolean default false not null,
  routing_steps jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  hiring_manager_id uuid
);

create table if not exists public.kb_articles (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  title text not null,
  category_id uuid not null,
  content text not null,
  tags text[] default '{}'::text[] not null,
  last_updated_at timestamp with time zone default now() not null,
  view_count integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.kb_categories (
  id uuid default gen_random_uuid() not null,
  name text not null,
  description text not null,
  icon text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.leave_policies (
  id uuid default gen_random_uuid() not null,
  leave_type_id uuid not null,
  accrual_rule text not null,
  carry_over_cap numeric,
  allow_negative boolean default false not null,
  default_entitlement numeric,
  tiers jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.leave_requests (
  id uuid default gen_random_uuid() not null,
  employee_id uuid not null,
  employee_name text not null,
  leave_type_id uuid not null,
  start_date date not null,
  end_date date not null,
  start_time text,
  end_time text,
  duration_days numeric(6,2) not null,
  reason text,
  status text default 'Pending'::text not null,
  approver_chain jsonb,
  history_log jsonb,
  attachment_url text,
  approver_id uuid,
  business_unit_id uuid,
  department_id uuid,
  created_at timestamp with time zone default now() not null,
  approval_route text,
  approval_reason text,
  approval_context jsonb default '{}'::jsonb not null,
  approval_routed_at timestamp with time zone,
  direct_manager_id uuid,
  approver_configuration_required boolean default false not null,
  approval_configuration_note text
);

create table if not exists public.leave_types (
  id uuid default gen_random_uuid() not null,
  name text not null,
  paid boolean default true not null,
  unit text default 'day'::text not null,
  min_increment numeric(5,2) default 0.5 not null,
  requires_doc_after_days numeric(5,2),
  created_at timestamp with time zone default now() not null
);

create table if not exists public.manpower_requests (
  id uuid default gen_random_uuid() not null,
  business_unit_id uuid,
  business_unit_name text,
  requester_id uuid not null,
  requester_name text not null,
  date_needed date not null,
  forecasted_pax integer default 0,
  general_note text,
  items jsonb not null,
  grand_total numeric(12,2) default 0,
  status text default 'Pending'::text not null,
  approved_by uuid,
  approved_at timestamp with time zone,
  rejection_reason text,
  created_at timestamp with time zone default now() not null,
  justification text,
  department_id uuid,
  approval_stage text default 'BUSINESS_UNIT_MANAGER'::text not null,
  approval_issue text,
  approval_history jsonb default '[]'::jsonb not null
);

create table if not exists public.memos (
  id uuid default gen_random_uuid() not null,
  title text not null,
  body text not null,
  effective_date date not null,
  target_departments text[] default '{}'::text[] not null,
  target_business_units text[] default '{}'::text[] not null,
  acknowledgement_required boolean default false not null,
  acknowledgement_tracker text[] default '{}'::text[] not null,
  tags text[] default '{}'::text[] not null,
  attachments text[] default '{}'::text[] not null,
  status public.memo_status default 'Draft'::memo_status not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  acknowledgement_signatures jsonb default '[]'::jsonb not null,
  memo_number text,
  memo_type text,
  target_employee_ids uuid[] default '{}'::uuid[] not null,
  publication_date date,
  notes text
);

create table if not exists public.ntes (
  id uuid default gen_random_uuid() not null,
  incident_report_id uuid not null,
  template_id uuid,
  issued_by_user_id uuid,
  issued_by_name text,
  recipients uuid[] not null,
  recipient_names text[] not null,
  response_deadline timestamp with time zone,
  details text,
  evidence_link text,
  status public.nte_status default 'Draft'::nte_status not null,
  approver_ids uuid[] default '{}'::uuid[],
  approver_names text[] default '{}'::text[],
  approval_log jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  nte_number text default nextval('ntes_nte_number_seq'::regclass) not null,
  employee_response text,
  employee_response_evidence_url text,
  employee_response_signature_url text,
  response_date timestamp with time zone,
  memo_ids text[] default '{}'::text[] not null,
  discipline_code_ids text[] default '{}'::text[] not null,
  nte_code text,
  revision_note text,
  revision_requested_at timestamp with time zone,
  revision_requested_by uuid,
  closure_reason text,
  closed_at timestamp with time zone,
  closed_by uuid,
  workflow_history jsonb default '[]'::jsonb not null,
  recipient_employee_id uuid,
  recipient_name_snapshot text,
  approval_version integer default 1 not null
);

create table if not exists public.onboarding_checklist_templates (
  id uuid default gen_random_uuid() not null,
  name text not null,
  template_type public.onboarding_template_type default 'Onboarding'::onboarding_template_type not null,
  target_role text not null,
  tasks jsonb default '[]'::jsonb not null,
  created_by_user_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  is_active boolean default true not null,
  archived_at timestamp with time zone,
  archived_by uuid
);

create table if not exists public.onboarding_checklists (
  id uuid default gen_random_uuid() not null,
  employee_id uuid not null,
  template_id uuid not null,
  start_date date not null,
  notify boolean default true not null,
  status public.onboarding_checklist_status default 'Pending'::onboarding_checklist_status not null,
  created_by_user_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  tasks jsonb
);

create table if not exists public.operating_hours (
  id uuid default gen_random_uuid() not null,
  business_unit_id uuid not null,
  day_of_week integer not null,
  open_time time without time zone not null,
  close_time time without time zone not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.ot_requests (
  id uuid default gen_random_uuid() not null,
  employee_id uuid not null,
  employee_name text not null,
  date date not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  reason text not null,
  status public.ot_status default 'Submitted'::ot_status not null,
  submitted_at timestamp with time zone default now(),
  approved_hours numeric(6,2),
  manager_note text,
  attachment_url text,
  history_log jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  hours numeric,
  approved_by uuid,
  approved_at timestamp with time zone,
  business_unit_id uuid,
  department_id uuid,
  ot_type text default 'Paid'::text,
  paid_ot_type text default 'Regular Overtime'::text,
  is_converted boolean default false,
  converted_at timestamp with time zone,
  approval_route text,
  approval_reason text,
  approval_context jsonb default '{}'::jsonb not null,
  approval_routed_at timestamp with time zone,
  direct_manager_id uuid,
  approver_configuration_required boolean default false not null,
  approval_configuration_note text
);

create table if not exists public.pan_templates (
  id uuid default gen_random_uuid() not null,
  name text not null,
  action_taken jsonb default '{}'::jsonb not null,
  notes text,
  logo_url text,
  preparer_name text,
  preparer_signature_url text,
  created_by_user_id uuid,
  is_default boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  business_unit_id uuid
);

create table if not exists public.pans (
  id uuid default gen_random_uuid() not null,
  employee_id uuid not null,
  employee_name text not null,
  effective_date date not null,
  status public.pan_status default 'Draft'::pan_status not null,
  action_taken jsonb default '{}'::jsonb not null,
  particulars jsonb default '{}'::jsonb not null,
  tenure text,
  notes text,
  routing_steps jsonb default '[]'::jsonb not null,
  signed_at timestamp with time zone,
  signature_data_url text,
  signature_name text,
  logo_url text,
  pdf_hash text,
  preparer_name text,
  preparer_signature_url text,
  template_id uuid,
  created_by_user_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  salary_from jsonb default '{}'::jsonb,
  workflow_version integer default 1 not null,
  approval_completed_at timestamp with time zone,
  rejection_reason text,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  cancellation_reason text,
  accepted_at timestamp with time zone,
  accepted_by uuid,
  applied_at timestamp with time zone,
  business_unit_id uuid
);

create table if not exists public.pipeline_stages (
  id uuid default gen_random_uuid() not null,
  code text,
  name text not null,
  sort_order integer default 0 not null,
  is_locked boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.profile_change_requests (
  id uuid default gen_random_uuid() not null,
  employee_id uuid not null,
  changed_by uuid not null,
  field text not null,
  old_value jsonb,
  new_value jsonb,
  status text default 'Pending Approval'::text not null,
  submission_id uuid not null,
  rejection_reason text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.pulse_survey_questions (
  id uuid default gen_random_uuid() not null,
  section_id uuid not null,
  text text not null,
  question_type text not null,
  sort_order integer default 0 not null
);

create table if not exists public.pulse_survey_responses (
  id uuid default gen_random_uuid() not null,
  survey_id uuid not null,
  respondent_id uuid not null,
  submitted_at timestamp with time zone default now() not null,
  answers jsonb not null
);

create table if not exists public.pulse_survey_sections (
  id uuid default gen_random_uuid() not null,
  survey_id uuid not null,
  title text not null,
  description text,
  sort_order integer default 0 not null
);

create table if not exists public.pulse_surveys (
  id uuid default gen_random_uuid() not null,
  title text not null,
  description text,
  start_date date not null,
  end_date date,
  status public.pulse_survey_status default 'Draft'::pulse_survey_status not null,
  is_anonymous boolean default false not null,
  target_department_ids uuid[] default '{}'::uuid[],
  created_by_user_id uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.resources (
  id text not null,
  group_name text default 'General'::text,
  created_at timestamp with time zone default now() not null,
  module text,
  description text,
  is_active boolean default true not null,
  high_risk boolean default false not null
);

create table if not exists public.role_permissions (
  role_id text not null,
  resource_id text not null,
  permissions text[] not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.roles (
  id text not null,
  description text,
  created_at timestamp with time zone default now() not null,
  display_name text,
  is_active boolean default true not null,
  dashboard_type text default 'employee'::text not null,
  default_data_scope text default 'SELF'::text not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.service_areas (
  id uuid default gen_random_uuid() not null,
  business_unit_id uuid not null,
  name text not null,
  capacity integer default 0,
  description text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.shift_assignments (
  id uuid default gen_random_uuid() not null,
  employee_id uuid not null,
  shift_template_id uuid,
  date date not null,
  business_unit_id uuid,
  department_id uuid,
  assigned_area_id uuid,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  site_id uuid,
  location_id uuid
);

create table if not exists public.shift_templates (
  id uuid default gen_random_uuid() not null,
  name text not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  break_minutes integer default 0,
  business_unit_id uuid,
  is_night_shift boolean default false,
  created_by uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  grace_period_minutes integer default 15 not null,
  color text default '#3B82F6'::text not null,
  is_flexible boolean default false not null,
  min_hours_per_day numeric,
  min_days_per_week integer
);

create table if not exists public.sites (
  id uuid default gen_random_uuid() not null,
  name text not null,
  timezone text,
  business_unit_id uuid,
  created_at timestamp with time zone default now() not null,
  latitude double precision,
  longitude double precision,
  radius_meters double precision default 100,
  allowed_wifi_ssids text[] default '{}'::text[],
  grace_period_minutes integer default 0,
  updated_at timestamp with time zone default now()
);

create table if not exists public.staffing_requirements (
  id uuid default gen_random_uuid() not null,
  business_unit_id uuid not null,
  area_id uuid not null,
  day_type_tier text not null,
  role text not null,
  min_count integer default 1 not null,
  start_time time without time zone,
  end_time time without time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.time_events (
  id uuid default gen_random_uuid() not null,
  employee_id uuid not null,
  timestamp timestamp with time zone default now() not null,
  type text not null,
  source text not null,
  location_id uuid,
  site_name text,
  timezone text,
  anomaly_tags text[] default '{}'::text[],
  app_version text,
  ip_hash text,
  device_id text,
  platform text,
  jailbreak_flag boolean default false,
  emulator_flag boolean default false,
  photo_url text,
  notes text,
  created_by uuid,
  manager_id uuid,
  inserted_at timestamp with time zone default now() not null,
  site_id text generated always as ((location_id)::text) stored
);

create table if not exists public.tickets (
  id uuid default gen_random_uuid() not null,
  requester_id uuid not null,
  requester_name text not null,
  description text not null,
  category public.ticket_category not null,
  priority public.ticket_priority default 'Medium'::ticket_priority not null,
  status public.ticket_status default 'New'::ticket_status not null,
  created_at timestamp with time zone default now() not null,
  assigned_to_id uuid,
  assigned_to_name text,
  assigned_at timestamp with time zone,
  resolved_at timestamp with time zone,
  sla_deadline timestamp with time zone,
  chat_thread jsonb default '[]'::jsonb,
  attachments text[],
  business_unit_id uuid,
  business_unit_name text,
  follow_up_count integer default 0 not null,
  last_follow_up_at timestamp with time zone,
  follow_up_history jsonb default '[]'::jsonb not null
);

create table if not exists public.wfh_requests (
  id uuid default gen_random_uuid() not null,
  employee_id uuid not null,
  employee_name text not null,
  date date not null,
  reason text,
  status text default 'Pending'::text not null,
  report_link text,
  approved_by uuid,
  approved_at timestamp with time zone,
  rejection_reason text,
  business_unit_id uuid,
  department_id uuid,
  created_at timestamp with time zone default now() not null,
  approval_route text,
  approval_reason text,
  approval_context jsonb default '{}'::jsonb not null,
  approval_routed_at timestamp with time zone,
  direct_manager_id uuid,
  approver_configuration_required boolean default false not null,
  approval_configuration_note text
);

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.announcements'::regclass and conname = 'announcements_pkey') then
    alter table public.announcements add constraint announcements_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.applicant_page_themes'::regclass and conname = 'applicant_page_themes_pkey') then
    alter table public.applicant_page_themes add constraint applicant_page_themes_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.applicant_page_themes'::regclass and conname = 'applicant_page_themes_slug_key') then
    alter table public.applicant_page_themes add constraint applicant_page_themes_slug_key UNIQUE (slug);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.asset_assignments'::regclass and conname = 'asset_assignments_pkey') then
    alter table public.asset_assignments add constraint asset_assignments_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.asset_requests'::regclass and conname = 'asset_requests_pkey') then
    alter table public.asset_requests add constraint asset_requests_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.assets'::regclass and conname = 'assets_asset_tag_key') then
    alter table public.assets add constraint assets_asset_tag_key UNIQUE (asset_tag);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.assets'::regclass and conname = 'assets_pkey') then
    alter table public.assets add constraint assets_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.award_templates'::regclass and conname = 'award_templates_pkey') then
    alter table public.award_templates add constraint award_templates_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.benefit_requests'::regclass and conname = 'benefit_requests_pkey') then
    alter table public.benefit_requests add constraint benefit_requests_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.benefit_types'::regclass and conname = 'benefit_types_pkey') then
    alter table public.benefit_types add constraint benefit_types_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.business_units'::regclass and conname = 'business_units_code_key') then
    alter table public.business_units add constraint business_units_code_key UNIQUE (code);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.business_units'::regclass and conname = 'business_units_name_key') then
    alter table public.business_units add constraint business_units_name_key UNIQUE (name);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.business_units'::regclass and conname = 'business_units_pkey') then
    alter table public.business_units add constraint business_units_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.coaching_sessions'::regclass and conname = 'coaching_sessions_pkey') then
    alter table public.coaching_sessions add constraint coaching_sessions_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.coe_requests'::regclass and conname = 'coe_requests_pkey') then
    alter table public.coe_requests add constraint coe_requests_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.coe_templates'::regclass and conname = 'coe_templates_pkey') then
    alter table public.coe_templates add constraint coe_templates_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.contract_templates'::regclass and conname = 'contract_templates_pkey') then
    alter table public.contract_templates add constraint contract_templates_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.demand_types'::regclass and conname = 'demand_types_pkey') then
    alter table public.demand_types add constraint demand_types_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.departments'::regclass and conname = 'departments_business_unit_id_name_key') then
    alter table public.departments add constraint departments_business_unit_id_name_key UNIQUE (business_unit_id, name);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.departments'::regclass and conname = 'departments_pkey') then
    alter table public.departments add constraint departments_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.discipline_categories'::regclass and conname = 'discipline_categories_pkey') then
    alter table public.discipline_categories add constraint discipline_categories_pkey PRIMARY KEY (name);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.discipline_entries'::regclass and conname = 'discipline_entries_code_key') then
    alter table public.discipline_entries add constraint discipline_entries_code_key UNIQUE (code);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.discipline_entries'::regclass and conname = 'discipline_entries_pkey') then
    alter table public.discipline_entries add constraint discipline_entries_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.employee_awards'::regclass and conname = 'employee_awards_pkey') then
    alter table public.employee_awards add constraint employee_awards_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.envelopes'::regclass and conname = 'envelopes_pkey') then
    alter table public.envelopes add constraint envelopes_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluation_evaluators'::regclass and conname = 'evaluation_evaluators_pkey') then
    alter table public.evaluation_evaluators add constraint evaluation_evaluators_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluation_question_sets'::regclass and conname = 'evaluation_question_sets_pkey') then
    alter table public.evaluation_question_sets add constraint evaluation_question_sets_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluation_questions'::regclass and conname = 'evaluation_questions_pkey') then
    alter table public.evaluation_questions add constraint evaluation_questions_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluation_submissions'::regclass and conname = 'evaluation_submissions_evaluation_id_subject_employee_id_ra_key') then
    alter table public.evaluation_submissions add constraint evaluation_submissions_evaluation_id_subject_employee_id_ra_key UNIQUE (evaluation_id, subject_employee_id, rater_id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluation_submissions'::regclass and conname = 'evaluation_submissions_pkey') then
    alter table public.evaluation_submissions add constraint evaluation_submissions_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluation_timelines'::regclass and conname = 'evaluation_timelines_pkey') then
    alter table public.evaluation_timelines add constraint evaluation_timelines_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluations'::regclass and conname = 'evaluations_pkey') then
    alter table public.evaluations add constraint evaluations_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.feedback_templates'::regclass and conname = 'feedback_templates_pkey') then
    alter table public.feedback_templates add constraint feedback_templates_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.helpdesk_calendar_events'::regclass and conname = 'helpdesk_calendar_events_pkey') then
    alter table public.helpdesk_calendar_events add constraint helpdesk_calendar_events_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.holidays'::regclass and conname = 'holidays_pkey') then
    alter table public.holidays add constraint holidays_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hris_users'::regclass and conname = 'hris_users_auth_user_id_key') then
    alter table public.hris_users add constraint hris_users_auth_user_id_key UNIQUE (auth_user_id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hris_users'::regclass and conname = 'hris_users_pkey') then
    alter table public.hris_users add constraint hris_users_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.incident_reports'::regclass and conname = 'incident_reports_pkey') then
    alter table public.incident_reports add constraint incident_reports_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_applications'::regclass and conname = 'job_applications_pkey') then
    alter table public.job_applications add constraint job_applications_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_candidates'::regclass and conname = 'job_candidates_pkey') then
    alter table public.job_candidates add constraint job_candidates_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_interview_feedback'::regclass and conname = 'job_interview_feedback_pkey') then
    alter table public.job_interview_feedback add constraint job_interview_feedback_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_interviews'::regclass and conname = 'job_interviews_pkey') then
    alter table public.job_interviews add constraint job_interviews_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_offers'::regclass and conname = 'job_offers_offer_number_key') then
    alter table public.job_offers add constraint job_offers_offer_number_key UNIQUE (offer_number);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_offers'::regclass and conname = 'job_offers_pkey') then
    alter table public.job_offers add constraint job_offers_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_post_templates'::regclass and conname = 'job_post_templates_pkey') then
    alter table public.job_post_templates add constraint job_post_templates_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_posts'::regclass and conname = 'job_posts_pkey') then
    alter table public.job_posts add constraint job_posts_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_posts'::regclass and conname = 'job_posts_slug_key') then
    alter table public.job_posts add constraint job_posts_slug_key UNIQUE (slug);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_requisitions'::regclass and conname = 'job_requisitions_pkey') then
    alter table public.job_requisitions add constraint job_requisitions_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.kb_articles'::regclass and conname = 'kb_articles_pkey') then
    alter table public.kb_articles add constraint kb_articles_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.kb_articles'::regclass and conname = 'kb_articles_slug_key') then
    alter table public.kb_articles add constraint kb_articles_slug_key UNIQUE (slug);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.kb_categories'::regclass and conname = 'kb_categories_pkey') then
    alter table public.kb_categories add constraint kb_categories_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.leave_policies'::regclass and conname = 'leave_policies_pkey') then
    alter table public.leave_policies add constraint leave_policies_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.leave_requests'::regclass and conname = 'leave_requests_pkey') then
    alter table public.leave_requests add constraint leave_requests_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.leave_types'::regclass and conname = 'leave_types_name_key') then
    alter table public.leave_types add constraint leave_types_name_key UNIQUE (name);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.leave_types'::regclass and conname = 'leave_types_pkey') then
    alter table public.leave_types add constraint leave_types_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.manpower_requests'::regclass and conname = 'manpower_requests_pkey') then
    alter table public.manpower_requests add constraint manpower_requests_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.memos'::regclass and conname = 'memos_pkey') then
    alter table public.memos add constraint memos_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.ntes'::regclass and conname = 'ntes_pkey') then
    alter table public.ntes add constraint ntes_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.onboarding_checklist_templates'::regclass and conname = 'onboarding_checklist_templates_pkey') then
    alter table public.onboarding_checklist_templates add constraint onboarding_checklist_templates_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.onboarding_checklists'::regclass and conname = 'onboarding_checklists_pkey') then
    alter table public.onboarding_checklists add constraint onboarding_checklists_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.operating_hours'::regclass and conname = 'operating_hours_business_unit_id_day_of_week_key') then
    alter table public.operating_hours add constraint operating_hours_business_unit_id_day_of_week_key UNIQUE (business_unit_id, day_of_week);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.operating_hours'::regclass and conname = 'operating_hours_pkey') then
    alter table public.operating_hours add constraint operating_hours_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.ot_requests'::regclass and conname = 'ot_requests_pkey') then
    alter table public.ot_requests add constraint ot_requests_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pan_templates'::regclass and conname = 'pan_templates_pkey') then
    alter table public.pan_templates add constraint pan_templates_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pans'::regclass and conname = 'pans_pkey') then
    alter table public.pans add constraint pans_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pipeline_stages'::regclass and conname = 'pipeline_stages_code_key') then
    alter table public.pipeline_stages add constraint pipeline_stages_code_key UNIQUE (code);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pipeline_stages'::regclass and conname = 'pipeline_stages_pkey') then
    alter table public.pipeline_stages add constraint pipeline_stages_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profile_change_requests'::regclass and conname = 'profile_change_requests_pkey') then
    alter table public.profile_change_requests add constraint profile_change_requests_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pulse_survey_questions'::regclass and conname = 'pulse_survey_questions_pkey') then
    alter table public.pulse_survey_questions add constraint pulse_survey_questions_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pulse_survey_responses'::regclass and conname = 'pulse_survey_responses_pkey') then
    alter table public.pulse_survey_responses add constraint pulse_survey_responses_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pulse_survey_responses'::regclass and conname = 'uq_response_once') then
    alter table public.pulse_survey_responses add constraint uq_response_once UNIQUE (survey_id, respondent_id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pulse_survey_sections'::regclass and conname = 'pulse_survey_sections_pkey') then
    alter table public.pulse_survey_sections add constraint pulse_survey_sections_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pulse_surveys'::regclass and conname = 'pulse_surveys_pkey') then
    alter table public.pulse_surveys add constraint pulse_surveys_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.resources'::regclass and conname = 'resources_pkey') then
    alter table public.resources add constraint resources_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.role_permissions'::regclass and conname = 'role_permissions_pkey') then
    alter table public.role_permissions add constraint role_permissions_pkey PRIMARY KEY (role_id, resource_id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.roles'::regclass and conname = 'roles_pkey') then
    alter table public.roles add constraint roles_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.service_areas'::regclass and conname = 'service_areas_pkey') then
    alter table public.service_areas add constraint service_areas_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.shift_assignments'::regclass and conname = 'shift_assignments_pkey') then
    alter table public.shift_assignments add constraint shift_assignments_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.shift_templates'::regclass and conname = 'shift_templates_pkey') then
    alter table public.shift_templates add constraint shift_templates_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.sites'::regclass and conname = 'sites_pkey') then
    alter table public.sites add constraint sites_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.staffing_requirements'::regclass and conname = 'staffing_requirements_pkey') then
    alter table public.staffing_requirements add constraint staffing_requirements_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.time_events'::regclass and conname = 'time_events_pkey') then
    alter table public.time_events add constraint time_events_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.tickets'::regclass and conname = 'tickets_pkey') then
    alter table public.tickets add constraint tickets_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.wfh_requests'::regclass and conname = 'wfh_requests_pkey') then
    alter table public.wfh_requests add constraint wfh_requests_pkey PRIMARY KEY (id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.assets'::regclass and conname = 'assets_type_check') then
    alter table public.assets add constraint assets_type_check CHECK (type = ANY (ARRAY['Laptop'::text, 'Mobile Phone'::text, 'Monitor'::text, 'Software License'::text, 'Other'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.contract_templates'::regclass and conname = 'contract_templates_logo_position_check') then
    alter table public.contract_templates add constraint contract_templates_logo_position_check CHECK (logo_position = ANY (ARRAY['left'::text, 'center'::text, 'right'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluation_evaluators'::regclass and conname = 'evaluation_evaluators_type_check') then
    alter table public.evaluation_evaluators add constraint evaluation_evaluators_type_check CHECK (type = ANY (ARRAY['Group'::text, 'Individual'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluation_timelines'::regclass and conname = 'evaluation_timelines_status_check') then
    alter table public.evaluation_timelines add constraint evaluation_timelines_status_check CHECK (status = ANY (ARRAY['Active'::text, 'Draft'::text, 'Completed'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.helpdesk_calendar_events'::regclass and conname = 'helpdesk_calendar_events_color_check') then
    alter table public.helpdesk_calendar_events add constraint helpdesk_calendar_events_color_check CHECK (color = ANY (ARRAY['blue'::text, 'green'::text, 'red'::text, 'yellow'::text, 'purple'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.holidays'::regclass and conname = 'holidays_type_check') then
    alter table public.holidays add constraint holidays_type_check CHECK (type = ANY (ARRAY['Regular'::text, 'Special Non-Working'::text, 'Double Pay'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_applications'::regclass and conname = 'job_applications_stage_check') then
    alter table public.job_applications add constraint job_applications_stage_check CHECK (stage = ANY (ARRAY['New'::text, 'Screen'::text, 'Interview'::text, 'Offer'::text, 'Hired'::text, 'Rejected'::text, 'Withdrawn'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_candidates'::regclass and conname = 'job_candidates_source_check') then
    alter table public.job_candidates add constraint job_candidates_source_check CHECK (source = ANY (ARRAY['Career Site'::text, 'Job Board'::text, 'Referral'::text, 'Sourced'::text, 'Internal'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_interview_feedback'::regclass and conname = 'job_interview_feedback_hire_recommendation_check') then
    alter table public.job_interview_feedback add constraint job_interview_feedback_hire_recommendation_check CHECK (hire_recommendation = ANY (ARRAY['Yes'::text, 'No'::text, 'Maybe'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_interviews'::regclass and conname = 'job_interviews_status_check') then
    alter table public.job_interviews add constraint job_interviews_status_check CHECK (status = ANY (ARRAY['Scheduled'::text, 'Completed'::text, 'Cancelled'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_interviews'::regclass and conname = 'job_interviews_type_check') then
    alter table public.job_interviews add constraint job_interviews_type_check CHECK (type = ANY (ARRAY['Onsite'::text, 'Remote'::text, 'Phone'::text, 'Panel'::text, 'Other'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_posts'::regclass and conname = 'job_posts_employment_type_check') then
    alter table public.job_posts add constraint job_posts_employment_type_check CHECK (employment_type = ANY (ARRAY['Full-Time'::text, 'Part-Time'::text, 'Contract'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_posts'::regclass and conname = 'job_posts_status_check') then
    alter table public.job_posts add constraint job_posts_status_check CHECK (status = ANY (ARRAY['Draft'::text, 'Published'::text, 'Paused'::text, 'Closed'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.leave_policies'::regclass and conname = 'leave_policies_accrual_rule_check') then
    alter table public.leave_policies add constraint leave_policies_accrual_rule_check CHECK (accrual_rule = ANY (ARRAY['none'::text, 'monthly'::text, 'annually'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.leave_types'::regclass and conname = 'leave_types_unit_check') then
    alter table public.leave_types add constraint leave_types_unit_check CHECK (unit = ANY (ARRAY['day'::text, 'hour'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.manpower_requests'::regclass and conname = 'manpower_requests_status_check') then
    alter table public.manpower_requests add constraint manpower_requests_status_check CHECK (status = ANY (ARRAY['Pending'::text, 'Approved'::text, 'Rejected'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.operating_hours'::regclass and conname = 'operating_hours_day_of_week_check') then
    alter table public.operating_hours add constraint operating_hours_day_of_week_check CHECK (day_of_week >= 0 AND day_of_week <= 6);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pulse_survey_questions'::regclass and conname = 'pulse_survey_questions_question_type_check') then
    alter table public.pulse_survey_questions add constraint pulse_survey_questions_question_type_check CHECK (question_type = ANY (ARRAY['rating'::text, 'text'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.staffing_requirements'::regclass and conname = 'staffing_requirements_day_type_tier_check') then
    alter table public.staffing_requirements add constraint staffing_requirements_day_type_tier_check CHECK (day_type_tier = ANY (ARRAY['Off-Peak'::text, 'Peak'::text, 'Super Peak'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.time_events'::regclass and conname = 'time_events_source_check') then
    alter table public.time_events add constraint time_events_source_check CHECK (source = ANY (ARRAY['MobileGPS'::text, 'QRKiosk'::text, 'WebPhoto'::text, 'Manual'::text, 'Biometrics'::text, 'System'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.time_events'::regclass and conname = 'time_events_type_check') then
    alter table public.time_events add constraint time_events_type_check CHECK (type = ANY (ARRAY['ClockIn'::text, 'ClockOut'::text, 'BreakStart'::text, 'BreakEnd'::text]));
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.announcements'::regclass and conname = 'announcements_business_unit_id_fkey') then
    alter table public.announcements add constraint announcements_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.announcements'::regclass and conname = 'announcements_created_by_user_id_fkey') then
    alter table public.announcements add constraint announcements_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.applicant_page_themes'::regclass and conname = 'applicant_page_themes_business_unit_id_fkey') then
    alter table public.applicant_page_themes add constraint applicant_page_themes_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.applicant_page_themes'::regclass and conname = 'applicant_page_themes_created_by_user_id_fkey') then
    alter table public.applicant_page_themes add constraint applicant_page_themes_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.asset_assignments'::regclass and conname = 'asset_assignments_asset_id_fkey') then
    alter table public.asset_assignments add constraint asset_assignments_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.asset_assignments'::regclass and conname = 'asset_assignments_employee_id_fkey') then
    alter table public.asset_assignments add constraint asset_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.asset_requests'::regclass and conname = 'asset_requests_asset_id_fkey') then
    alter table public.asset_requests add constraint asset_requests_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.asset_requests'::regclass and conname = 'asset_requests_employee_id_fkey') then
    alter table public.asset_requests add constraint asset_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.asset_requests'::regclass and conname = 'asset_requests_manager_approved_by_fkey') then
    alter table public.asset_requests add constraint asset_requests_manager_approved_by_fkey FOREIGN KEY (manager_approved_by) REFERENCES hris_users(id) ON DELETE RESTRICT;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.asset_requests'::regclass and conname = 'asset_requests_manager_id_fkey') then
    alter table public.asset_requests add constraint asset_requests_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.award_templates'::regclass and conname = 'award_templates_business_unit_id_fkey') then
    alter table public.award_templates add constraint award_templates_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.award_templates'::regclass and conname = 'award_templates_created_by_user_id_fkey') then
    alter table public.award_templates add constraint award_templates_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.benefit_requests'::regclass and conname = 'benefit_requests_benefit_type_id_fkey') then
    alter table public.benefit_requests add constraint benefit_requests_benefit_type_id_fkey FOREIGN KEY (benefit_type_id) REFERENCES benefit_types(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.benefit_requests'::regclass and conname = 'benefit_requests_bod_approved_by_fkey') then
    alter table public.benefit_requests add constraint benefit_requests_bod_approved_by_fkey FOREIGN KEY (bod_approved_by) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.benefit_requests'::regclass and conname = 'benefit_requests_employee_id_fkey') then
    alter table public.benefit_requests add constraint benefit_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.benefit_requests'::regclass and conname = 'benefit_requests_fulfilled_by_fkey') then
    alter table public.benefit_requests add constraint benefit_requests_fulfilled_by_fkey FOREIGN KEY (fulfilled_by) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.benefit_requests'::regclass and conname = 'benefit_requests_hr_endorsed_by_fkey') then
    alter table public.benefit_requests add constraint benefit_requests_hr_endorsed_by_fkey FOREIGN KEY (hr_endorsed_by) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.coaching_sessions'::regclass and conname = 'coaching_sessions_coach_id_fkey') then
    alter table public.coaching_sessions add constraint coaching_sessions_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.coaching_sessions'::regclass and conname = 'coaching_sessions_employee_id_fkey') then
    alter table public.coaching_sessions add constraint coaching_sessions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.coe_requests'::regclass and conname = 'coe_requests_approved_by_fkey') then
    alter table public.coe_requests add constraint coe_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.coe_requests'::regclass and conname = 'coe_requests_employee_business_unit_id_fkey') then
    alter table public.coe_requests add constraint coe_requests_employee_business_unit_id_fkey FOREIGN KEY (employee_business_unit_id) REFERENCES business_units(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.coe_requests'::regclass and conname = 'coe_requests_employee_department_id_fkey') then
    alter table public.coe_requests add constraint coe_requests_employee_department_id_fkey FOREIGN KEY (employee_department_id) REFERENCES departments(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.coe_requests'::regclass and conname = 'coe_requests_employee_id_fkey') then
    alter table public.coe_requests add constraint coe_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.coe_requests'::regclass and conname = 'coe_requests_requested_by_fkey') then
    alter table public.coe_requests add constraint coe_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.coe_requests'::regclass and conname = 'coe_requests_returned_by_fkey') then
    alter table public.coe_requests add constraint coe_requests_returned_by_fkey FOREIGN KEY (returned_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.coe_requests'::regclass and conname = 'coe_requests_template_id_fkey') then
    alter table public.coe_requests add constraint coe_requests_template_id_fkey FOREIGN KEY (template_id) REFERENCES coe_templates(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.coe_templates'::regclass and conname = 'coe_templates_archived_by_fkey') then
    alter table public.coe_templates add constraint coe_templates_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.coe_templates'::regclass and conname = 'coe_templates_business_unit_id_fkey') then
    alter table public.coe_templates add constraint coe_templates_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.coe_templates'::regclass and conname = 'coe_templates_created_by_fkey') then
    alter table public.coe_templates add constraint coe_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.coe_templates'::regclass and conname = 'coe_templates_created_from_template_id_fkey') then
    alter table public.coe_templates add constraint coe_templates_created_from_template_id_fkey FOREIGN KEY (created_from_template_id) REFERENCES coe_templates(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.contract_templates'::regclass and conname = 'contract_templates_created_by_user_id_fkey') then
    alter table public.contract_templates add constraint contract_templates_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.contract_templates'::regclass and conname = 'contract_templates_owning_business_unit_id_fkey') then
    alter table public.contract_templates add constraint contract_templates_owning_business_unit_id_fkey FOREIGN KEY (owning_business_unit_id) REFERENCES business_units(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.demand_types'::regclass and conname = 'demand_types_business_unit_id_fkey') then
    alter table public.demand_types add constraint demand_types_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.departments'::regclass and conname = 'departments_business_unit_id_fkey') then
    alter table public.departments add constraint departments_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.discipline_categories'::regclass and conname = 'discipline_categories_archived_by_fkey') then
    alter table public.discipline_categories add constraint discipline_categories_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.discipline_entries'::regclass and conname = 'discipline_entries_archived_by_fkey') then
    alter table public.discipline_entries add constraint discipline_entries_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.discipline_entries'::regclass and conname = 'discipline_entries_business_unit_id_fkey') then
    alter table public.discipline_entries add constraint discipline_entries_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.discipline_entries'::regclass and conname = 'discipline_entries_last_modified_by_user_id_fkey') then
    alter table public.discipline_entries add constraint discipline_entries_last_modified_by_user_id_fkey FOREIGN KEY (last_modified_by_user_id) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.discipline_entries'::regclass and conname = 'fk_discipline_category') then
    alter table public.discipline_entries add constraint fk_discipline_category FOREIGN KEY (category) REFERENCES discipline_categories(name) ON UPDATE CASCADE ON DELETE RESTRICT;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.employee_awards'::regclass and conname = 'employee_awards_approver_id_fkey') then
    alter table public.employee_awards add constraint employee_awards_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.employee_awards'::regclass and conname = 'employee_awards_award_template_id_fkey') then
    alter table public.employee_awards add constraint employee_awards_award_template_id_fkey FOREIGN KEY (award_template_id) REFERENCES award_templates(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.employee_awards'::regclass and conname = 'employee_awards_business_unit_id_fkey') then
    alter table public.employee_awards add constraint employee_awards_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.employee_awards'::regclass and conname = 'employee_awards_created_by_user_id_fkey') then
    alter table public.employee_awards add constraint employee_awards_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.employee_awards'::regclass and conname = 'employee_awards_department_id_fkey') then
    alter table public.employee_awards add constraint employee_awards_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.employee_awards'::regclass and conname = 'employee_awards_employee_id_fkey') then
    alter table public.employee_awards add constraint employee_awards_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hris_users(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.employee_awards'::regclass and conname = 'employee_awards_issued_by_fkey') then
    alter table public.employee_awards add constraint employee_awards_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.envelopes'::regclass and conname = 'envelopes_created_by_user_id_fkey') then
    alter table public.envelopes add constraint envelopes_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.envelopes'::regclass and conname = 'envelopes_employee_id_fkey') then
    alter table public.envelopes add constraint envelopes_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.envelopes'::regclass and conname = 'envelopes_template_id_fkey') then
    alter table public.envelopes add constraint envelopes_template_id_fkey FOREIGN KEY (template_id) REFERENCES contract_templates(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluation_evaluators'::regclass and conname = 'evaluation_evaluators_business_unit_id_fkey') then
    alter table public.evaluation_evaluators add constraint evaluation_evaluators_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluation_evaluators'::regclass and conname = 'evaluation_evaluators_department_id_fkey') then
    alter table public.evaluation_evaluators add constraint evaluation_evaluators_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluation_evaluators'::regclass and conname = 'evaluation_evaluators_evaluation_id_fkey') then
    alter table public.evaluation_evaluators add constraint evaluation_evaluators_evaluation_id_fkey FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluation_evaluators'::regclass and conname = 'evaluation_evaluators_user_id_fkey') then
    alter table public.evaluation_evaluators add constraint evaluation_evaluators_user_id_fkey FOREIGN KEY (user_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluation_questions'::regclass and conname = 'evaluation_questions_question_set_id_fkey') then
    alter table public.evaluation_questions add constraint evaluation_questions_question_set_id_fkey FOREIGN KEY (question_set_id) REFERENCES evaluation_question_sets(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluation_submissions'::regclass and conname = 'evaluation_submissions_evaluation_id_fkey') then
    alter table public.evaluation_submissions add constraint evaluation_submissions_evaluation_id_fkey FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluation_submissions'::regclass and conname = 'evaluation_submissions_rater_id_fkey') then
    alter table public.evaluation_submissions add constraint evaluation_submissions_rater_id_fkey FOREIGN KEY (rater_id) REFERENCES hris_users(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluation_submissions'::regclass and conname = 'evaluation_submissions_subject_employee_id_fkey') then
    alter table public.evaluation_submissions add constraint evaluation_submissions_subject_employee_id_fkey FOREIGN KEY (subject_employee_id) REFERENCES hris_users(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluations'::regclass and conname = 'evaluations_created_by_fkey') then
    alter table public.evaluations add constraint evaluations_created_by_fkey FOREIGN KEY (created_by) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.evaluations'::regclass and conname = 'evaluations_timeline_id_fkey') then
    alter table public.evaluations add constraint evaluations_timeline_id_fkey FOREIGN KEY (timeline_id) REFERENCES evaluation_timelines(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.feedback_templates'::regclass and conname = 'feedback_templates_created_by_fkey') then
    alter table public.feedback_templates add constraint feedback_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hris_users'::regclass and conname = 'hris_users_account_inactivated_by_fkey') then
    alter table public.hris_users add constraint hris_users_account_inactivated_by_fkey FOREIGN KEY (account_inactivated_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hris_users'::regclass and conname = 'hris_users_account_reactivated_by_fkey') then
    alter table public.hris_users add constraint hris_users_account_reactivated_by_fkey FOREIGN KEY (account_reactivated_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hris_users'::regclass and conname = 'hris_users_business_unit_id_fkey') then
    alter table public.hris_users add constraint hris_users_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hris_users'::regclass and conname = 'hris_users_department_id_fkey') then
    alter table public.hris_users add constraint hris_users_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hris_users'::regclass and conname = 'hris_users_duplicate_marked_by_fkey') then
    alter table public.hris_users add constraint hris_users_duplicate_marked_by_fkey FOREIGN KEY (duplicate_marked_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.incident_reports'::regclass and conname = 'incident_reports_assigned_to_id_fkey') then
    alter table public.incident_reports add constraint incident_reports_assigned_to_id_fkey FOREIGN KEY (assigned_to_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.incident_reports'::regclass and conname = 'incident_reports_business_unit_id_fkey') then
    alter table public.incident_reports add constraint incident_reports_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.incident_reports'::regclass and conname = 'incident_reports_reported_by_fkey') then
    alter table public.incident_reports add constraint incident_reports_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_applications'::regclass and conname = 'job_applications_candidate_id_fkey') then
    alter table public.job_applications add constraint job_applications_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES job_candidates(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_applications'::regclass and conname = 'job_applications_job_post_id_fkey') then
    alter table public.job_applications add constraint job_applications_job_post_id_fkey FOREIGN KEY (job_post_id) REFERENCES job_posts(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_applications'::regclass and conname = 'job_applications_requisition_id_fkey') then
    alter table public.job_applications add constraint job_applications_requisition_id_fkey FOREIGN KEY (requisition_id) REFERENCES job_requisitions(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_interview_feedback'::regclass and conname = 'job_interview_feedback_interview_id_fkey') then
    alter table public.job_interview_feedback add constraint job_interview_feedback_interview_id_fkey FOREIGN KEY (interview_id) REFERENCES job_interviews(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_interview_feedback'::regclass and conname = 'job_interview_feedback_reviewer_user_id_fkey') then
    alter table public.job_interview_feedback add constraint job_interview_feedback_reviewer_user_id_fkey FOREIGN KEY (reviewer_user_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_interviews'::regclass and conname = 'job_interviews_application_id_fkey') then
    alter table public.job_interviews add constraint job_interviews_application_id_fkey FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_interviews'::regclass and conname = 'job_interviews_interviewer_id_fkey') then
    alter table public.job_interviews add constraint job_interviews_interviewer_id_fkey FOREIGN KEY (interviewer_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_offers'::regclass and conname = 'job_offers_application_id_fkey') then
    alter table public.job_offers add constraint job_offers_application_id_fkey FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_offers'::regclass and conname = 'job_offers_created_by_user_id_fkey') then
    alter table public.job_offers add constraint job_offers_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_offers'::regclass and conname = 'job_offers_sent_by_user_id_fkey') then
    alter table public.job_offers add constraint job_offers_sent_by_user_id_fkey FOREIGN KEY (sent_by_user_id) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_offers'::regclass and conname = 'job_offers_supersedes_offer_id_fkey') then
    alter table public.job_offers add constraint job_offers_supersedes_offer_id_fkey FOREIGN KEY (supersedes_offer_id) REFERENCES job_offers(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_post_templates'::regclass and conname = 'job_post_templates_created_by_user_id_fkey') then
    alter table public.job_post_templates add constraint job_post_templates_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_posts'::regclass and conname = 'job_posts_business_unit_id_fkey') then
    alter table public.job_posts add constraint job_posts_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_posts'::regclass and conname = 'job_posts_created_by_user_id_fkey') then
    alter table public.job_posts add constraint job_posts_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_posts'::regclass and conname = 'job_posts_requisition_id_fkey') then
    alter table public.job_posts add constraint job_posts_requisition_id_fkey FOREIGN KEY (requisition_id) REFERENCES job_requisitions(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_requisitions'::regclass and conname = 'job_requisitions_business_unit_id_fkey') then
    alter table public.job_requisitions add constraint job_requisitions_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_requisitions'::regclass and conname = 'job_requisitions_created_by_user_id_fkey') then
    alter table public.job_requisitions add constraint job_requisitions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_requisitions'::regclass and conname = 'job_requisitions_department_id_fkey') then
    alter table public.job_requisitions add constraint job_requisitions_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.job_requisitions'::regclass and conname = 'job_requisitions_hiring_manager_id_fkey') then
    alter table public.job_requisitions add constraint job_requisitions_hiring_manager_id_fkey FOREIGN KEY (hiring_manager_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.kb_articles'::regclass and conname = 'kb_articles_category_id_fkey') then
    alter table public.kb_articles add constraint kb_articles_category_id_fkey FOREIGN KEY (category_id) REFERENCES kb_categories(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.leave_policies'::regclass and conname = 'leave_policies_leave_type_id_fkey') then
    alter table public.leave_policies add constraint leave_policies_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.leave_requests'::regclass and conname = 'leave_requests_approver_id_fkey') then
    alter table public.leave_requests add constraint leave_requests_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.leave_requests'::regclass and conname = 'leave_requests_business_unit_id_fkey') then
    alter table public.leave_requests add constraint leave_requests_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.leave_requests'::regclass and conname = 'leave_requests_department_id_fkey') then
    alter table public.leave_requests add constraint leave_requests_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.leave_requests'::regclass and conname = 'leave_requests_direct_manager_id_fkey') then
    alter table public.leave_requests add constraint leave_requests_direct_manager_id_fkey FOREIGN KEY (direct_manager_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.leave_requests'::regclass and conname = 'leave_requests_employee_id_fkey') then
    alter table public.leave_requests add constraint leave_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hris_users(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.leave_requests'::regclass and conname = 'leave_requests_leave_type_id_fkey') then
    alter table public.leave_requests add constraint leave_requests_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE RESTRICT;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.manpower_requests'::regclass and conname = 'manpower_requests_approved_by_fkey') then
    alter table public.manpower_requests add constraint manpower_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.manpower_requests'::regclass and conname = 'manpower_requests_business_unit_id_fkey') then
    alter table public.manpower_requests add constraint manpower_requests_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.manpower_requests'::regclass and conname = 'manpower_requests_department_id_fkey') then
    alter table public.manpower_requests add constraint manpower_requests_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.manpower_requests'::regclass and conname = 'manpower_requests_requester_id_fkey') then
    alter table public.manpower_requests add constraint manpower_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES hris_users(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.memos'::regclass and conname = 'memos_created_by_fkey') then
    alter table public.memos add constraint memos_created_by_fkey FOREIGN KEY (created_by) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.ntes'::regclass and conname = 'ntes_closed_by_fkey') then
    alter table public.ntes add constraint ntes_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.ntes'::regclass and conname = 'ntes_incident_report_id_fkey') then
    alter table public.ntes add constraint ntes_incident_report_id_fkey FOREIGN KEY (incident_report_id) REFERENCES incident_reports(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.ntes'::regclass and conname = 'ntes_issued_by_user_id_fkey') then
    alter table public.ntes add constraint ntes_issued_by_user_id_fkey FOREIGN KEY (issued_by_user_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.ntes'::regclass and conname = 'ntes_recipient_employee_id_fkey') then
    alter table public.ntes add constraint ntes_recipient_employee_id_fkey FOREIGN KEY (recipient_employee_id) REFERENCES hris_users(id) ON DELETE RESTRICT;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.ntes'::regclass and conname = 'ntes_revision_requested_by_fkey') then
    alter table public.ntes add constraint ntes_revision_requested_by_fkey FOREIGN KEY (revision_requested_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.onboarding_checklist_templates'::regclass and conname = 'onboarding_checklist_templates_archived_by_fkey') then
    alter table public.onboarding_checklist_templates add constraint onboarding_checklist_templates_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.onboarding_checklist_templates'::regclass and conname = 'onboarding_checklist_templates_created_by_user_id_fkey') then
    alter table public.onboarding_checklist_templates add constraint onboarding_checklist_templates_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.onboarding_checklists'::regclass and conname = 'onboarding_checklists_created_by_user_id_fkey') then
    alter table public.onboarding_checklists add constraint onboarding_checklists_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.onboarding_checklists'::regclass and conname = 'onboarding_checklists_employee_id_fkey') then
    alter table public.onboarding_checklists add constraint onboarding_checklists_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hris_users(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.onboarding_checklists'::regclass and conname = 'onboarding_checklists_template_id_fkey') then
    alter table public.onboarding_checklists add constraint onboarding_checklists_template_id_fkey FOREIGN KEY (template_id) REFERENCES onboarding_checklist_templates(id) ON DELETE RESTRICT;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.operating_hours'::regclass and conname = 'operating_hours_business_unit_id_fkey') then
    alter table public.operating_hours add constraint operating_hours_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.ot_requests'::regclass and conname = 'ot_requests_direct_manager_id_fkey') then
    alter table public.ot_requests add constraint ot_requests_direct_manager_id_fkey FOREIGN KEY (direct_manager_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.ot_requests'::regclass and conname = 'ot_requests_employee_id_fkey') then
    alter table public.ot_requests add constraint ot_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hris_users(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pan_templates'::regclass and conname = 'pan_templates_business_unit_id_fkey') then
    alter table public.pan_templates add constraint pan_templates_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pan_templates'::regclass and conname = 'pan_templates_created_by_user_id_fkey') then
    alter table public.pan_templates add constraint pan_templates_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pans'::regclass and conname = 'pans_accepted_by_fkey') then
    alter table public.pans add constraint pans_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pans'::regclass and conname = 'pans_business_unit_id_fkey') then
    alter table public.pans add constraint pans_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pans'::regclass and conname = 'pans_cancelled_by_fkey') then
    alter table public.pans add constraint pans_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pans'::regclass and conname = 'pans_created_by_user_id_fkey') then
    alter table public.pans add constraint pans_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pans'::regclass and conname = 'pans_employee_id_fkey') then
    alter table public.pans add constraint pans_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hris_users(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pans'::regclass and conname = 'pans_template_id_fkey') then
    alter table public.pans add constraint pans_template_id_fkey FOREIGN KEY (template_id) REFERENCES pan_templates(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profile_change_requests'::regclass and conname = 'profile_change_requests_changed_by_fkey') then
    alter table public.profile_change_requests add constraint profile_change_requests_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES hris_users(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profile_change_requests'::regclass and conname = 'profile_change_requests_employee_id_fkey') then
    alter table public.profile_change_requests add constraint profile_change_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hris_users(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pulse_survey_questions'::regclass and conname = 'pulse_survey_questions_section_id_fkey') then
    alter table public.pulse_survey_questions add constraint pulse_survey_questions_section_id_fkey FOREIGN KEY (section_id) REFERENCES pulse_survey_sections(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pulse_survey_responses'::regclass and conname = 'pulse_survey_responses_respondent_id_fkey') then
    alter table public.pulse_survey_responses add constraint pulse_survey_responses_respondent_id_fkey FOREIGN KEY (respondent_id) REFERENCES hris_users(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pulse_survey_responses'::regclass and conname = 'pulse_survey_responses_survey_id_fkey') then
    alter table public.pulse_survey_responses add constraint pulse_survey_responses_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES pulse_surveys(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pulse_survey_sections'::regclass and conname = 'pulse_survey_sections_survey_id_fkey') then
    alter table public.pulse_survey_sections add constraint pulse_survey_sections_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES pulse_surveys(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pulse_surveys'::regclass and conname = 'pulse_surveys_created_by_user_id_fkey') then
    alter table public.pulse_surveys add constraint pulse_surveys_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.role_permissions'::regclass and conname = 'role_permissions_resource_id_fkey') then
    alter table public.role_permissions add constraint role_permissions_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.role_permissions'::regclass and conname = 'role_permissions_role_id_fkey') then
    alter table public.role_permissions add constraint role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.service_areas'::regclass and conname = 'service_areas_business_unit_id_fkey') then
    alter table public.service_areas add constraint service_areas_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.shift_assignments'::regclass and conname = 'shift_assignments_assigned_area_id_fkey') then
    alter table public.shift_assignments add constraint shift_assignments_assigned_area_id_fkey FOREIGN KEY (assigned_area_id) REFERENCES service_areas(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.shift_assignments'::regclass and conname = 'shift_assignments_business_unit_id_fkey') then
    alter table public.shift_assignments add constraint shift_assignments_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.shift_assignments'::regclass and conname = 'shift_assignments_created_by_fkey') then
    alter table public.shift_assignments add constraint shift_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.shift_assignments'::regclass and conname = 'shift_assignments_department_id_fkey') then
    alter table public.shift_assignments add constraint shift_assignments_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.shift_assignments'::regclass and conname = 'shift_assignments_employee_id_fkey') then
    alter table public.shift_assignments add constraint shift_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hris_users(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.shift_assignments'::regclass and conname = 'shift_assignments_shift_template_id_fkey') then
    alter table public.shift_assignments add constraint shift_assignments_shift_template_id_fkey FOREIGN KEY (shift_template_id) REFERENCES shift_templates(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.shift_templates'::regclass and conname = 'shift_templates_business_unit_id_fkey') then
    alter table public.shift_templates add constraint shift_templates_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.shift_templates'::regclass and conname = 'shift_templates_created_by_fkey') then
    alter table public.shift_templates add constraint shift_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.sites'::regclass and conname = 'sites_business_unit_id_fkey') then
    alter table public.sites add constraint sites_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.staffing_requirements'::regclass and conname = 'staffing_requirements_area_id_fkey') then
    alter table public.staffing_requirements add constraint staffing_requirements_area_id_fkey FOREIGN KEY (area_id) REFERENCES service_areas(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.staffing_requirements'::regclass and conname = 'staffing_requirements_business_unit_id_fkey') then
    alter table public.staffing_requirements add constraint staffing_requirements_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.time_events'::regclass and conname = 'time_events_created_by_fkey') then
    alter table public.time_events add constraint time_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.time_events'::regclass and conname = 'time_events_employee_id_fkey') then
    alter table public.time_events add constraint time_events_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hris_users(id) ON DELETE CASCADE;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.time_events'::regclass and conname = 'time_events_location_id_fkey') then
    alter table public.time_events add constraint time_events_location_id_fkey FOREIGN KEY (location_id) REFERENCES sites(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.time_events'::regclass and conname = 'time_events_manager_id_fkey') then
    alter table public.time_events add constraint time_events_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.tickets'::regclass and conname = 'tickets_business_unit_id_fkey') then
    alter table public.tickets add constraint tickets_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.tickets'::regclass and conname = 'tickets_requester_id_fkey') then
    alter table public.tickets add constraint tickets_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.wfh_requests'::regclass and conname = 'wfh_requests_approved_by_fkey') then
    alter table public.wfh_requests add constraint wfh_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES hris_users(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.wfh_requests'::regclass and conname = 'wfh_requests_business_unit_id_fkey') then
    alter table public.wfh_requests add constraint wfh_requests_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.wfh_requests'::regclass and conname = 'wfh_requests_department_id_fkey') then
    alter table public.wfh_requests add constraint wfh_requests_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.wfh_requests'::regclass and conname = 'wfh_requests_direct_manager_id_fkey') then
    alter table public.wfh_requests add constraint wfh_requests_direct_manager_id_fkey FOREIGN KEY (direct_manager_id) REFERENCES hris_users(id);
  end if;
end
$baseline$;

do $baseline$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.wfh_requests'::regclass and conname = 'wfh_requests_employee_id_fkey') then
    alter table public.wfh_requests add constraint wfh_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hris_users(id) ON DELETE CASCADE;
  end if;
end
$baseline$;
