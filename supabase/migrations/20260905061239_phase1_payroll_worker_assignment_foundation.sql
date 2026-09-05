-- Phase 1B: effective-dated worker classification and payroll assignment foundation.
-- Additive only. No legacy employee, salary, attendance, leave, or payroll data is
-- copied or rewritten by this migration.

create table if not exists public.payroll_worker_classifications (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  approval_status text not null default 'draft',
  is_active boolean not null default true,
  source_document_ref text,
  source_url text,
  source_version text,
  requested_by_user_id uuid references public.hris_users(id) on delete set null,
  requested_at timestamptz,
  approved_by_user_id uuid references public.hris_users(id) on delete set null,
  approved_at timestamptz,
  approval_note text,
  created_by_user_id uuid references public.hris_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_worker_classifications_code_not_blank check (btrim(code) <> ''),
  constraint payroll_worker_classifications_name_not_blank check (btrim(name) <> ''),
  constraint payroll_worker_classifications_status_check check (
    approval_status in ('draft', 'approved', 'active', 'superseded', 'archived')
  ),
  constraint payroll_worker_classifications_approval_evidence_check check (
    approval_status in ('draft', 'archived')
    or (
      approved_by_user_id is not null
      and approved_at is not null
      and nullif(btrim(source_document_ref), '') is not null
    )
  ),
  constraint payroll_worker_classifications_request_timestamp_check check (
    (requested_by_user_id is null and requested_at is null)
    or (requested_by_user_id is not null and requested_at is not null)
  ),
  constraint payroll_worker_classifications_maker_checker_check check (
    approved_by_user_id is null
    or requested_by_user_id is null
    or approved_by_user_id <> requested_by_user_id
  )
);

create unique index if not exists payroll_worker_classifications_code_lower_uidx
  on public.payroll_worker_classifications (lower(code));

create table if not exists public.payroll_legal_engagements (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  payment_stream text not null,
  is_employee boolean not null default false,
  is_independent_contractor boolean not null default false,
  approval_status text not null default 'draft',
  is_active boolean not null default true,
  source_document_ref text,
  source_url text,
  source_version text,
  requested_by_user_id uuid references public.hris_users(id) on delete set null,
  requested_at timestamptz,
  approved_by_user_id uuid references public.hris_users(id) on delete set null,
  approved_at timestamptz,
  approval_note text,
  created_by_user_id uuid references public.hris_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_legal_engagements_code_not_blank check (btrim(code) <> ''),
  constraint payroll_legal_engagements_name_not_blank check (btrim(name) <> ''),
  constraint payroll_legal_engagements_stream_check check (
    payment_stream in ('employee_payroll', 'professional_fee', 'other')
  ),
  constraint payroll_legal_engagements_worker_flags_check check (
    not (is_employee and is_independent_contractor)
  ),
  constraint payroll_legal_engagements_status_check check (
    approval_status in ('draft', 'approved', 'active', 'superseded', 'archived')
  ),
  constraint payroll_legal_engagements_approval_evidence_check check (
    approval_status in ('draft', 'archived')
    or (
      approved_by_user_id is not null
      and approved_at is not null
      and nullif(btrim(source_document_ref), '') is not null
    )
  ),
  constraint payroll_legal_engagements_request_timestamp_check check (
    (requested_by_user_id is null and requested_at is null)
    or (requested_by_user_id is not null and requested_at is not null)
  ),
  constraint payroll_legal_engagements_maker_checker_check check (
    approved_by_user_id is null
    or requested_by_user_id is null
    or approved_by_user_id <> requested_by_user_id
  )
);

create unique index if not exists payroll_legal_engagements_code_lower_uidx
  on public.payroll_legal_engagements (lower(code));

create table if not exists public.payroll_employment_statuses (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  approval_status text not null default 'draft',
  is_active boolean not null default true,
  source_document_ref text,
  source_url text,
  source_version text,
  requested_by_user_id uuid references public.hris_users(id) on delete set null,
  requested_at timestamptz,
  approved_by_user_id uuid references public.hris_users(id) on delete set null,
  approved_at timestamptz,
  approval_note text,
  created_by_user_id uuid references public.hris_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_employment_statuses_code_not_blank check (btrim(code) <> ''),
  constraint payroll_employment_statuses_name_not_blank check (btrim(name) <> ''),
  constraint payroll_employment_statuses_status_check check (
    approval_status in ('draft', 'approved', 'active', 'superseded', 'archived')
  ),
  constraint payroll_employment_statuses_approval_evidence_check check (
    approval_status in ('draft', 'archived')
    or (
      approved_by_user_id is not null
      and approved_at is not null
      and nullif(btrim(source_document_ref), '') is not null
    )
  ),
  constraint payroll_employment_statuses_request_timestamp_check check (
    (requested_by_user_id is null and requested_at is null)
    or (requested_by_user_id is not null and requested_at is not null)
  ),
  constraint payroll_employment_statuses_maker_checker_check check (
    approved_by_user_id is null
    or requested_by_user_id is null
    or approved_by_user_id <> requested_by_user_id
  )
);

create unique index if not exists payroll_employment_statuses_code_lower_uidx
  on public.payroll_employment_statuses (lower(code));

create table if not exists public.payroll_pay_bases (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  unit text not null,
  description text,
  approval_status text not null default 'draft',
  is_active boolean not null default true,
  source_document_ref text,
  source_url text,
  source_version text,
  requested_by_user_id uuid references public.hris_users(id) on delete set null,
  requested_at timestamptz,
  approved_by_user_id uuid references public.hris_users(id) on delete set null,
  approved_at timestamptz,
  approval_note text,
  created_by_user_id uuid references public.hris_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_pay_bases_code_not_blank check (btrim(code) <> ''),
  constraint payroll_pay_bases_name_not_blank check (btrim(name) <> ''),
  constraint payroll_pay_bases_unit_check check (
    unit in ('monthly', 'daily', 'hourly', 'other')
  ),
  constraint payroll_pay_bases_status_check check (
    approval_status in ('draft', 'approved', 'active', 'superseded', 'archived')
  ),
  constraint payroll_pay_bases_approval_evidence_check check (
    approval_status in ('draft', 'archived')
    or (
      approved_by_user_id is not null
      and approved_at is not null
      and nullif(btrim(source_document_ref), '') is not null
    )
  ),
  constraint payroll_pay_bases_request_timestamp_check check (
    (requested_by_user_id is null and requested_at is null)
    or (requested_by_user_id is not null and requested_at is not null)
  ),
  constraint payroll_pay_bases_maker_checker_check check (
    approved_by_user_id is null
    or requested_by_user_id is null
    or approved_by_user_id <> requested_by_user_id
  )
);

create unique index if not exists payroll_pay_bases_code_lower_uidx
  on public.payroll_pay_bases (lower(code));

create table if not exists public.payroll_worker_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hris_users(id) on delete restrict,
  payroll_group_id uuid not null references public.payroll_groups(id) on delete restrict,
  worker_classification_id uuid not null references public.payroll_worker_classifications(id) on delete restrict,
  legal_engagement_id uuid not null references public.payroll_legal_engagements(id) on delete restrict,
  employment_status_id uuid not null references public.payroll_employment_statuses(id) on delete restrict,
  pay_basis_id uuid not null references public.payroll_pay_bases(id) on delete restrict,
  business_unit_id uuid references public.business_units(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  site_id uuid references public.sites(id) on delete restrict,
  position_title text,
  effective_start_date date not null,
  effective_end_date date,
  version integer not null default 1,
  record_status text not null default 'draft',
  source_document_ref text,
  source_url text,
  source_version text,
  change_reason text not null,
  requested_by_user_id uuid references public.hris_users(id) on delete set null,
  requested_at timestamptz,
  approved_by_user_id uuid references public.hris_users(id) on delete set null,
  approved_at timestamptz,
  approval_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_worker_assignments_effective_range_check check (
    effective_end_date is null or effective_end_date > effective_start_date
  ),
  constraint payroll_worker_assignments_version_check check (version > 0),
  constraint payroll_worker_assignments_status_check check (
    record_status in ('draft', 'approved', 'active', 'superseded', 'archived')
  ),
  constraint payroll_worker_assignments_reason_not_blank check (btrim(change_reason) <> ''),
  constraint payroll_worker_assignments_approval_evidence_check check (
    record_status in ('draft', 'archived')
    or (
      approved_by_user_id is not null
      and approved_at is not null
      and nullif(btrim(source_document_ref), '') is not null
    )
  ),
  constraint payroll_worker_assignments_request_timestamp_check check (
    (requested_by_user_id is null and requested_at is null)
    or (requested_by_user_id is not null and requested_at is not null)
  ),
  constraint payroll_worker_assignments_maker_checker_check check (
    approved_by_user_id is null
    or requested_by_user_id is null
    or approved_by_user_id <> requested_by_user_id
  ),
  constraint payroll_worker_assignments_employee_version_key unique (employee_id, version)
);

create index if not exists payroll_worker_assignments_employee_effective_idx
  on public.payroll_worker_assignments (employee_id, effective_start_date, effective_end_date);

create index if not exists payroll_worker_assignments_payroll_group_idx
  on public.payroll_worker_assignments (payroll_group_id);

create index if not exists payroll_worker_assignments_worker_classification_idx
  on public.payroll_worker_assignments (worker_classification_id);

create index if not exists payroll_worker_assignments_legal_engagement_idx
  on public.payroll_worker_assignments (legal_engagement_id);

create index if not exists payroll_worker_assignments_employment_status_idx
  on public.payroll_worker_assignments (employment_status_id);

create index if not exists payroll_worker_assignments_pay_basis_idx
  on public.payroll_worker_assignments (pay_basis_id);

create index if not exists payroll_worker_assignments_business_unit_idx
  on public.payroll_worker_assignments (business_unit_id);

create index if not exists payroll_worker_assignments_department_idx
  on public.payroll_worker_assignments (department_id);

create index if not exists payroll_worker_assignments_site_idx
  on public.payroll_worker_assignments (site_id);

create index if not exists payroll_worker_assignments_requested_by_idx
  on public.payroll_worker_assignments (requested_by_user_id);

create index if not exists payroll_worker_assignments_approved_by_idx
  on public.payroll_worker_assignments (approved_by_user_id);

create index if not exists payroll_worker_classifications_created_by_idx
  on public.payroll_worker_classifications (created_by_user_id);

create index if not exists payroll_worker_classifications_requested_by_idx
  on public.payroll_worker_classifications (requested_by_user_id);

create index if not exists payroll_worker_classifications_approved_by_idx
  on public.payroll_worker_classifications (approved_by_user_id);

create index if not exists payroll_legal_engagements_created_by_idx
  on public.payroll_legal_engagements (created_by_user_id);

create index if not exists payroll_legal_engagements_requested_by_idx
  on public.payroll_legal_engagements (requested_by_user_id);

create index if not exists payroll_legal_engagements_approved_by_idx
  on public.payroll_legal_engagements (approved_by_user_id);

create index if not exists payroll_employment_statuses_created_by_idx
  on public.payroll_employment_statuses (created_by_user_id);

create index if not exists payroll_employment_statuses_requested_by_idx
  on public.payroll_employment_statuses (requested_by_user_id);

create index if not exists payroll_employment_statuses_approved_by_idx
  on public.payroll_employment_statuses (approved_by_user_id);

create index if not exists payroll_pay_bases_created_by_idx
  on public.payroll_pay_bases (created_by_user_id);

create index if not exists payroll_pay_bases_requested_by_idx
  on public.payroll_pay_bases (requested_by_user_id);

create index if not exists payroll_pay_bases_approved_by_idx
  on public.payroll_pay_bases (approved_by_user_id);

create or replace function private.guard_payroll_worker_catalog()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_referenced boolean;
begin
  if tg_op = 'INSERT' and new.approval_status <> 'draft' then
    raise exception 'A new payroll worker catalog value must begin in draft status.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    if new.approval_status is distinct from old.approval_status
       and not (
         (old.approval_status = 'draft' and new.approval_status in ('approved', 'archived'))
         or (old.approval_status = 'approved' and new.approval_status in ('active', 'superseded', 'archived'))
         or (old.approval_status = 'active' and new.approval_status in ('superseded', 'archived'))
         or (old.approval_status = 'superseded' and new.approval_status = 'archived')
       ) then
      raise exception 'Invalid payroll worker catalog status transition: % -> %.', old.approval_status, new.approval_status using errcode = '22023';
    end if;

    execute pg_catalog.format(
      'select exists (select 1 from public.payroll_worker_assignments where %I = $1)',
      tg_argv[0]
    ) into is_referenced using old.id;

    if is_referenced and (
      (pg_catalog.to_jsonb(new)->>'code') is distinct from (pg_catalog.to_jsonb(old)->>'code')
      or (pg_catalog.to_jsonb(new)->>'name') is distinct from (pg_catalog.to_jsonb(old)->>'name')
      or (pg_catalog.to_jsonb(new)->>'unit') is distinct from (pg_catalog.to_jsonb(old)->>'unit')
      or (pg_catalog.to_jsonb(new)->>'payment_stream') is distinct from (pg_catalog.to_jsonb(old)->>'payment_stream')
      or (pg_catalog.to_jsonb(new)->>'is_employee') is distinct from (pg_catalog.to_jsonb(old)->>'is_employee')
      or (pg_catalog.to_jsonb(new)->>'is_independent_contractor') is distinct from (pg_catalog.to_jsonb(old)->>'is_independent_contractor')
    ) then
      raise exception 'A payroll worker catalog value already used by an assignment is immutable; create a new value instead.' using errcode = '55000';
    end if;

    new.updated_at := pg_catalog.now();
  end if;

  return new;
end;
$$;

create or replace function private.prevent_payroll_worker_catalog_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Payroll worker catalog values are append-only; archive the value instead of deleting it.' using errcode = '55000';
end;
$$;

create or replace function private.guard_payroll_worker_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  group_business_unit_id uuid;
  group_start_date date;
  group_end_date date;
  engagement_stream text;
  engagement_is_employee boolean;
  engagement_is_contractor boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format('payroll-worker-assignment:%s', new.employee_id),
      0
    )
  );

  if tg_op = 'INSERT' and new.record_status <> 'draft' then
    raise exception 'A new payroll worker assignment must begin in draft status.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    if new.record_status is distinct from old.record_status
       and not (
         (old.record_status = 'draft' and new.record_status in ('approved', 'archived'))
         or (old.record_status = 'approved' and new.record_status in ('active', 'superseded', 'archived'))
         or (old.record_status = 'active' and new.record_status in ('superseded', 'archived'))
         or (old.record_status = 'superseded' and new.record_status = 'archived')
       ) then
      raise exception 'Invalid payroll worker assignment status transition: % -> %.', old.record_status, new.record_status using errcode = '22023';
    end if;

    if old.record_status <> 'draft'
       and (
         new.employee_id is distinct from old.employee_id
         or new.payroll_group_id is distinct from old.payroll_group_id
         or new.worker_classification_id is distinct from old.worker_classification_id
         or new.legal_engagement_id is distinct from old.legal_engagement_id
         or new.employment_status_id is distinct from old.employment_status_id
         or new.pay_basis_id is distinct from old.pay_basis_id
         or new.business_unit_id is distinct from old.business_unit_id
         or new.department_id is distinct from old.department_id
         or new.site_id is distinct from old.site_id
         or new.position_title is distinct from old.position_title
         or new.effective_start_date is distinct from old.effective_start_date
         or new.effective_end_date is distinct from old.effective_end_date
         or new.version is distinct from old.version
         or new.source_document_ref is distinct from old.source_document_ref
         or new.source_url is distinct from old.source_url
         or new.source_version is distinct from old.source_version
         or new.change_reason is distinct from old.change_reason
         or new.requested_by_user_id is distinct from old.requested_by_user_id
         or new.requested_at is distinct from old.requested_at
         or new.approved_by_user_id is distinct from old.approved_by_user_id
         or new.approved_at is distinct from old.approved_at
         or new.approval_note is distinct from old.approval_note
       ) then
      raise exception 'An approved or historical payroll worker assignment is immutable; create a new version instead.' using errcode = '55000';
    end if;
  end if;

  select pg.business_unit_id, pg.effective_start_date, pg.effective_end_date
    into group_business_unit_id, group_start_date, group_end_date
  from public.payroll_groups pg
  where pg.id = new.payroll_group_id;

  if not found then
    raise exception 'The payroll group for this worker assignment does not exist.' using errcode = '23503';
  end if;

  if new.effective_start_date < group_start_date
     or (group_end_date is not null and (
       new.effective_end_date is null
       or new.effective_end_date > group_end_date
     )) then
    raise exception 'Worker assignment effective dates must be within the selected payroll-group version.' using errcode = '22023';
  end if;

  if group_business_unit_id is not null
     and new.business_unit_id is distinct from group_business_unit_id then
    raise exception 'The worker assignment business unit must match the payroll group business unit.' using errcode = '22023';
  end if;

  if new.department_id is not null and new.business_unit_id is not null
     and not exists (
       select 1
       from public.departments d
       where d.id = new.department_id
         and d.business_unit_id = new.business_unit_id
     ) then
    raise exception 'The worker assignment department does not belong to its business unit.' using errcode = '22023';
  end if;

  if new.site_id is not null and new.business_unit_id is not null
     and not exists (
       select 1
       from public.sites s
       where s.id = new.site_id
         and s.business_unit_id = new.business_unit_id
     ) then
    raise exception 'The worker assignment site does not belong to its business unit.' using errcode = '22023';
  end if;

  select le.payment_stream, le.is_employee, le.is_independent_contractor
    into engagement_stream, engagement_is_employee, engagement_is_contractor
  from public.payroll_legal_engagements le
  where le.id = new.legal_engagement_id;

  if engagement_stream <> 'employee_payroll'
     or not engagement_is_employee
     or engagement_is_contractor then
    raise exception 'Professional-fee or contractor engagements must use the separate payable stream and cannot be assigned to employee payroll.' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' or (old.record_status = 'draft' and new.record_status in ('approved', 'active')) then
    if new.record_status in ('approved', 'active')
       and (
         not exists (
           select 1 from public.payroll_worker_classifications c
           where c.id = new.worker_classification_id
             and c.is_active
             and c.approval_status in ('approved', 'active')
         )
         or not exists (
           select 1 from public.payroll_legal_engagements le
           where le.id = new.legal_engagement_id
             and le.is_active
             and le.approval_status in ('approved', 'active')
         )
         or not exists (
           select 1 from public.payroll_employment_statuses es
           where es.id = new.employment_status_id
             and es.is_active
             and es.approval_status in ('approved', 'active')
         )
         or not exists (
           select 1 from public.payroll_pay_bases pb
           where pb.id = new.pay_basis_id
             and pb.is_active
             and pb.approval_status in ('approved', 'active')
         )
       ) then
      raise exception 'An approved or active worker assignment may reference only active, approved worker catalog values.' using errcode = '22023';
    end if;
  end if;

  if new.record_status in ('draft', 'approved', 'active')
     and exists (
       select 1
       from public.payroll_worker_assignments existing
       where existing.id <> new.id
         and existing.employee_id = new.employee_id
         and existing.record_status in ('draft', 'approved', 'active')
         and pg_catalog.daterange(
           existing.effective_start_date,
           coalesce(existing.effective_end_date, 'infinity'::date),
           '[)'
         ) && pg_catalog.daterange(
           new.effective_start_date,
           coalesce(new.effective_end_date, 'infinity'::date),
           '[)'
         )
     ) then
    raise exception 'Worker assignment versions for one employee cannot have overlapping effective dates.' using errcode = '23P01';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function private.prevent_payroll_worker_assignment_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.record_status <> 'draft' then
    raise exception 'Only a draft payroll worker assignment may be deleted.' using errcode = '55000';
  end if;
  return old;
end;
$$;

drop trigger if exists payroll_worker_classifications_guard on public.payroll_worker_classifications;
create trigger payroll_worker_classifications_guard
before insert or update on public.payroll_worker_classifications
for each row execute function private.guard_payroll_worker_catalog('worker_classification_id');

drop trigger if exists payroll_worker_classifications_delete_guard on public.payroll_worker_classifications;
create trigger payroll_worker_classifications_delete_guard
before delete on public.payroll_worker_classifications
for each row execute function private.prevent_payroll_worker_catalog_delete();

drop trigger if exists payroll_legal_engagements_guard on public.payroll_legal_engagements;
create trigger payroll_legal_engagements_guard
before insert or update on public.payroll_legal_engagements
for each row execute function private.guard_payroll_worker_catalog('legal_engagement_id');

drop trigger if exists payroll_legal_engagements_delete_guard on public.payroll_legal_engagements;
create trigger payroll_legal_engagements_delete_guard
before delete on public.payroll_legal_engagements
for each row execute function private.prevent_payroll_worker_catalog_delete();

drop trigger if exists payroll_employment_statuses_guard on public.payroll_employment_statuses;
create trigger payroll_employment_statuses_guard
before insert or update on public.payroll_employment_statuses
for each row execute function private.guard_payroll_worker_catalog('employment_status_id');

drop trigger if exists payroll_employment_statuses_delete_guard on public.payroll_employment_statuses;
create trigger payroll_employment_statuses_delete_guard
before delete on public.payroll_employment_statuses
for each row execute function private.prevent_payroll_worker_catalog_delete();

drop trigger if exists payroll_pay_bases_guard on public.payroll_pay_bases;
create trigger payroll_pay_bases_guard
before insert or update on public.payroll_pay_bases
for each row execute function private.guard_payroll_worker_catalog('pay_basis_id');

drop trigger if exists payroll_pay_bases_delete_guard on public.payroll_pay_bases;
create trigger payroll_pay_bases_delete_guard
before delete on public.payroll_pay_bases
for each row execute function private.prevent_payroll_worker_catalog_delete();

drop trigger if exists payroll_worker_assignments_guard on public.payroll_worker_assignments;
create trigger payroll_worker_assignments_guard
before insert or update on public.payroll_worker_assignments
for each row execute function private.guard_payroll_worker_assignment();

drop trigger if exists payroll_worker_assignments_delete_guard on public.payroll_worker_assignments;
create trigger payroll_worker_assignments_delete_guard
before delete on public.payroll_worker_assignments
for each row execute function private.prevent_payroll_worker_assignment_delete();

alter table public.payroll_worker_classifications enable row level security;
alter table public.payroll_legal_engagements enable row level security;
alter table public.payroll_employment_statuses enable row level security;
alter table public.payroll_pay_bases enable row level security;
alter table public.payroll_worker_assignments enable row level security;

drop policy if exists payroll_worker_classifications_authorized_read on public.payroll_worker_classifications;
create policy payroll_worker_classifications_authorized_read
on public.payroll_worker_classifications
for select to authenticated
using (private.payroll_configuration_access());

drop policy if exists payroll_legal_engagements_authorized_read on public.payroll_legal_engagements;
create policy payroll_legal_engagements_authorized_read
on public.payroll_legal_engagements
for select to authenticated
using (private.payroll_configuration_access());

drop policy if exists payroll_employment_statuses_authorized_read on public.payroll_employment_statuses;
create policy payroll_employment_statuses_authorized_read
on public.payroll_employment_statuses
for select to authenticated
using (private.payroll_configuration_access());

drop policy if exists payroll_pay_bases_authorized_read on public.payroll_pay_bases;
create policy payroll_pay_bases_authorized_read
on public.payroll_pay_bases
for select to authenticated
using (private.payroll_configuration_access());

drop policy if exists payroll_worker_assignments_authorized_read on public.payroll_worker_assignments;
create policy payroll_worker_assignments_authorized_read
on public.payroll_worker_assignments
for select to authenticated
using (private.payroll_configuration_access());

revoke all on table
  public.payroll_worker_classifications,
  public.payroll_legal_engagements,
  public.payroll_employment_statuses,
  public.payroll_pay_bases,
  public.payroll_worker_assignments
from public, anon, authenticated;

grant select on table
  public.payroll_worker_classifications,
  public.payroll_legal_engagements,
  public.payroll_employment_statuses,
  public.payroll_pay_bases,
  public.payroll_worker_assignments
to authenticated;

grant all on table
  public.payroll_worker_classifications,
  public.payroll_legal_engagements,
  public.payroll_employment_statuses,
  public.payroll_pay_bases,
  public.payroll_worker_assignments
to service_role;

revoke all on function private.guard_payroll_worker_catalog() from public, anon, authenticated;
revoke all on function private.prevent_payroll_worker_catalog_delete() from public, anon, authenticated;
revoke all on function private.guard_payroll_worker_assignment() from public, anon, authenticated;
revoke all on function private.prevent_payroll_worker_assignment_delete() from public, anon, authenticated;

comment on table public.payroll_worker_classifications is
  'Configurable worker-classification catalog. Values begin as draft and require approved source evidence before use in an approved assignment.';

comment on table public.payroll_legal_engagements is
  'Configurable legal-engagement catalog. Professional-fee and contractor streams remain separate from employee payroll assignments.';

comment on table public.payroll_employment_statuses is
  'Configurable employment-status catalog. Do not infer payroll treatment from the legacy hris_users.employment_status text.';

comment on table public.payroll_pay_bases is
  'Configurable pay-basis catalog. Divisors and proration methods are separate policy rules and are not hardcoded here.';

comment on table public.payroll_worker_assignments is
  'Effective-dated, versioned worker-to-payroll assignment. Approved and historical defining fields are immutable; corrections append a new version.';
