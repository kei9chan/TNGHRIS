-- Phase 1C: configurable pay components and effective-dated compensation history.
-- Additive only. No legacy salary fields or payroll data are copied or rewritten.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payroll_worker_assignments'::regclass
      and conname = 'payroll_worker_assignments_id_employee_key'
  ) then
    alter table public.payroll_worker_assignments
      add constraint payroll_worker_assignments_id_employee_key unique (id, employee_id);
  end if;
end;
$$;

create table if not exists public.payroll_pay_components (
  id uuid primary key default gen_random_uuid(),
  component_code text not null,
  component_name text not null,
  description text,
  component_type text not null,
  payroll_stream text not null default 'employee_payroll',
  calculation_method text not null,
  value_unit text not null,
  tax_treatment text not null,
  thirteenth_month_treatment text not null,
  statutory_base_codes text[] not null default '{}'::text[],
  payer_scope text not null,
  recurrence_type text not null,
  proration_method text not null,
  deduction_priority integer,
  insufficient_net_pay_treatment text not null,
  gl_expense_account_code text,
  gl_liability_account_code text,
  default_cost_center_code text,
  legal_entity_id uuid references public.payroll_legal_entities(id) on delete restrict,
  payroll_group_id uuid references public.payroll_groups(id) on delete restrict,
  effective_start_date date not null,
  effective_end_date date,
  version integer not null default 1,
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
  constraint payroll_pay_components_code_not_blank check (btrim(component_code) <> ''),
  constraint payroll_pay_components_name_not_blank check (btrim(component_name) <> ''),
  constraint payroll_pay_components_type_check check (
    component_type in ('earning', 'employee_deduction', 'employer_cost', 'informational')
  ),
  constraint payroll_pay_components_stream_check check (
    payroll_stream in ('employee_payroll', 'professional_fee', 'other')
  ),
  constraint payroll_pay_components_calculation_method_check check (
    calculation_method in ('fixed_amount', 'unit_rate', 'percentage', 'formula_defined')
  ),
  constraint payroll_pay_components_value_unit_check check (
    value_unit in ('currency_amount', 'days', 'hours', 'percentage', 'rate', 'other')
  ),
  constraint payroll_pay_components_tax_treatment_check check (
    tax_treatment in ('taxable', 'non_taxable', 'rule_defined', 'not_applicable')
  ),
  constraint payroll_pay_components_thirteenth_month_check check (
    thirteenth_month_treatment in ('included', 'excluded', 'rule_defined', 'not_applicable')
  ),
  constraint payroll_pay_components_statutory_codes_check check (
    array_position(statutory_base_codes, '') is null
  ),
  constraint payroll_pay_components_payer_scope_check check (
    payer_scope in ('employee', 'employer', 'both', 'not_applicable')
  ),
  constraint payroll_pay_components_recurrence_check check (
    recurrence_type in ('recurring', 'one_time', 'transactional')
  ),
  constraint payroll_pay_components_proration_check check (
    proration_method in ('policy_defined', 'prorate', 'do_not_prorate', 'not_applicable')
  ),
  constraint payroll_pay_components_deduction_priority_check check (
    (component_type = 'employee_deduction' and deduction_priority is not null and deduction_priority > 0)
    or (component_type <> 'employee_deduction' and deduction_priority is null)
  ),
  constraint payroll_pay_components_insufficient_net_check check (
    insufficient_net_pay_treatment in ('block_payroll', 'partial_allowed', 'carry_forward', 'manual_review', 'not_applicable')
  ),
  constraint payroll_pay_components_effective_range_check check (
    effective_end_date is null or effective_end_date > effective_start_date
  ),
  constraint payroll_pay_components_version_check check (version > 0),
  constraint payroll_pay_components_status_check check (
    approval_status in ('draft', 'approved', 'active', 'superseded', 'archived')
  ),
  constraint payroll_pay_components_approval_evidence_check check (
    approval_status in ('draft', 'archived')
    or (
      approved_by_user_id is not null
      and approved_at is not null
      and nullif(btrim(source_document_ref), '') is not null
    )
  ),
  constraint payroll_pay_components_request_timestamp_check check (
    (requested_by_user_id is null and requested_at is null)
    or (requested_by_user_id is not null and requested_at is not null)
  ),
  constraint payroll_pay_components_maker_checker_check check (
    approved_by_user_id is null
    or requested_by_user_id is null
    or approved_by_user_id <> requested_by_user_id
  ),
  constraint payroll_pay_components_scope_check check (
    legal_entity_id is not null or payroll_group_id is null
  )
);

create unique index if not exists payroll_pay_components_global_version_uidx
  on public.payroll_pay_components (lower(component_code), version)
  where legal_entity_id is null and payroll_group_id is null;

create unique index if not exists payroll_pay_components_legal_entity_version_uidx
  on public.payroll_pay_components (lower(component_code), version, legal_entity_id)
  where legal_entity_id is not null and payroll_group_id is null;

create unique index if not exists payroll_pay_components_group_version_uidx
  on public.payroll_pay_components (lower(component_code), version, payroll_group_id)
  where payroll_group_id is not null;

create index if not exists payroll_pay_components_effective_idx
  on public.payroll_pay_components (
    legal_entity_id,
    payroll_group_id,
    lower(component_code),
    effective_start_date,
    effective_end_date
  );

create index if not exists payroll_pay_components_legal_entity_idx
  on public.payroll_pay_components (legal_entity_id);

create index if not exists payroll_pay_components_payroll_group_idx
  on public.payroll_pay_components (payroll_group_id);

create index if not exists payroll_pay_components_requested_by_idx
  on public.payroll_pay_components (requested_by_user_id);

create index if not exists payroll_pay_components_approved_by_idx
  on public.payroll_pay_components (approved_by_user_id);

create index if not exists payroll_pay_components_created_by_idx
  on public.payroll_pay_components (created_by_user_id);

create table if not exists public.payroll_compensation_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hris_users(id) on delete restrict,
  worker_assignment_id uuid not null,
  pay_component_id uuid not null references public.payroll_pay_components(id) on delete restrict,
  amount numeric(20,6) not null,
  amount_unit text not null,
  currency_code text not null default 'PHP',
  effective_start_date date not null,
  effective_end_date date,
  version integer not null default 1,
  record_status text not null default 'draft',
  change_type text not null,
  is_retroactive boolean not null default false,
  retro_pay_status text not null default 'not_applicable',
  retro_pay_reference text,
  retro_pay_waiver_reason text,
  source_document_ref text,
  source_url text,
  source_version text,
  change_reason text not null,
  requested_by_user_id uuid references public.hris_users(id) on delete set null,
  requested_at timestamptz,
  approved_by_user_id uuid references public.hris_users(id) on delete set null,
  approved_at timestamptz,
  approval_note text,
  created_by_user_id uuid references public.hris_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_compensation_history_worker_assignment_employee_fkey
    foreign key (worker_assignment_id, employee_id)
    references public.payroll_worker_assignments(id, employee_id)
    on delete restrict,
  constraint payroll_compensation_history_amount_check check (amount >= 0),
  constraint payroll_compensation_history_amount_unit_check check (
    amount_unit in ('currency_amount', 'monthly_rate', 'daily_rate', 'hourly_rate', 'percentage', 'other')
  ),
  constraint payroll_compensation_history_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint payroll_compensation_history_effective_range_check check (
    effective_end_date is null or effective_end_date > effective_start_date
  ),
  constraint payroll_compensation_history_version_check check (version > 0),
  constraint payroll_compensation_history_status_check check (
    record_status in ('draft', 'approved', 'active', 'superseded', 'archived')
  ),
  constraint payroll_compensation_history_change_type_check check (
    change_type in ('new_assignment', 'salary_change', 'component_change', 'correction', 'termination', 'other')
  ),
  constraint payroll_compensation_history_retro_status_check check (
    (not is_retroactive and retro_pay_status = 'not_applicable')
    or (is_retroactive and retro_pay_status in ('required', 'linked', 'waived'))
  ),
  constraint payroll_compensation_history_retro_reference_check check (
    (retro_pay_status <> 'linked' or nullif(btrim(retro_pay_reference), '') is not null)
    and (retro_pay_status <> 'waived' or nullif(btrim(retro_pay_waiver_reason), '') is not null)
  ),
  constraint payroll_compensation_history_active_retro_check check (
    record_status <> 'active'
    or not is_retroactive
    or retro_pay_status in ('linked', 'waived')
  ),
  constraint payroll_compensation_history_reason_not_blank check (btrim(change_reason) <> ''),
  constraint payroll_compensation_history_approval_evidence_check check (
    record_status in ('draft', 'archived')
    or (
      approved_by_user_id is not null
      and approved_at is not null
      and nullif(btrim(source_document_ref), '') is not null
    )
  ),
  constraint payroll_compensation_history_request_timestamp_check check (
    (requested_by_user_id is null and requested_at is null)
    or (requested_by_user_id is not null and requested_at is not null)
  ),
  constraint payroll_compensation_history_maker_checker_check check (
    approved_by_user_id is null
    or requested_by_user_id is null
    or approved_by_user_id <> requested_by_user_id
  ),
  constraint payroll_compensation_history_employee_component_version_key
    unique (employee_id, pay_component_id, version)
);

create index if not exists payroll_compensation_history_employee_effective_idx
  on public.payroll_compensation_history (
    employee_id,
    effective_start_date,
    effective_end_date
  );

create index if not exists payroll_compensation_history_component_idx
  on public.payroll_compensation_history (pay_component_id);

create index if not exists payroll_compensation_history_worker_assignment_idx
  on public.payroll_compensation_history (worker_assignment_id);

create index if not exists payroll_compensation_history_worker_assignment_employee_idx
  on public.payroll_compensation_history (worker_assignment_id, employee_id);

create index if not exists payroll_compensation_history_requested_by_idx
  on public.payroll_compensation_history (requested_by_user_id);

create index if not exists payroll_compensation_history_approved_by_idx
  on public.payroll_compensation_history (approved_by_user_id);

create index if not exists payroll_compensation_history_created_by_idx
  on public.payroll_compensation_history (created_by_user_id);

create or replace function private.guard_payroll_pay_component()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_referenced boolean;
begin
  if tg_op = 'INSERT' and new.approval_status <> 'draft' then
    raise exception 'A new pay component must begin in draft status.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    if new.approval_status is distinct from old.approval_status
       and not (
         (old.approval_status = 'draft' and new.approval_status in ('approved', 'archived'))
         or (old.approval_status = 'approved' and new.approval_status in ('active', 'superseded', 'archived'))
         or (old.approval_status = 'active' and new.approval_status in ('superseded', 'archived'))
         or (old.approval_status = 'superseded' and new.approval_status = 'archived')
       ) then
      raise exception 'Invalid pay-component status transition: % -> %.', old.approval_status, new.approval_status using errcode = '22023';
    end if;

    if new.approval_status in ('superseded', 'archived') then
      new.is_active := false;
    end if;

    execute pg_catalog.format(
      'select exists (select 1 from public.payroll_compensation_history where pay_component_id = $1)'
    ) into is_referenced using old.id;

    if is_referenced and (
      new.component_code is distinct from old.component_code
      or new.component_name is distinct from old.component_name
      or new.description is distinct from old.description
      or new.component_type is distinct from old.component_type
      or new.payroll_stream is distinct from old.payroll_stream
      or new.calculation_method is distinct from old.calculation_method
      or new.value_unit is distinct from old.value_unit
      or new.tax_treatment is distinct from old.tax_treatment
      or new.thirteenth_month_treatment is distinct from old.thirteenth_month_treatment
      or new.statutory_base_codes is distinct from old.statutory_base_codes
      or new.payer_scope is distinct from old.payer_scope
      or new.recurrence_type is distinct from old.recurrence_type
      or new.proration_method is distinct from old.proration_method
      or new.deduction_priority is distinct from old.deduction_priority
      or new.insufficient_net_pay_treatment is distinct from old.insufficient_net_pay_treatment
      or new.legal_entity_id is distinct from old.legal_entity_id
      or new.payroll_group_id is distinct from old.payroll_group_id
      or new.effective_start_date is distinct from old.effective_start_date
      or new.effective_end_date is distinct from old.effective_end_date
      or new.version is distinct from old.version
    ) then
      raise exception 'A pay component used by compensation history is immutable; create a new component version instead.' using errcode = '55000';
    end if;

    new.updated_at := pg_catalog.now();
  end if;

  if new.payroll_group_id is not null
     and new.legal_entity_id is not null
     and not exists (
       select 1
       from public.payroll_groups pg
       where pg.id = new.payroll_group_id
         and pg.legal_entity_id = new.legal_entity_id
     ) then
    raise exception 'A pay component payroll group must belong to its selected legal entity.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format(
        'payroll-component:%s:%s:%s',
        coalesce(new.legal_entity_id::text, 'global'),
        coalesce(new.payroll_group_id::text, 'global'),
        pg_catalog.lower(new.component_code)
      ),
      0
    )
  );

  if new.approval_status in ('draft', 'approved', 'active')
     and exists (
       select 1
       from public.payroll_pay_components existing
       where existing.id <> new.id
         and pg_catalog.lower(existing.component_code) = pg_catalog.lower(new.component_code)
         and existing.legal_entity_id is not distinct from new.legal_entity_id
         and existing.payroll_group_id is not distinct from new.payroll_group_id
         and existing.approval_status in ('draft', 'approved', 'active')
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
    raise exception 'Pay-component versions with the same scope cannot have overlapping effective dates.' using errcode = '23P01';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function private.prevent_payroll_pay_component_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Pay components are append-only; archive the component instead of deleting it.' using errcode = '55000';
end;
$$;

create or replace function private.validate_payroll_pay_component_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  group_start_date date;
  group_end_date date;
begin
  if new.payroll_group_id is not null then
    select pg.effective_start_date, pg.effective_end_date
      into group_start_date, group_end_date
    from public.payroll_groups pg
    where pg.id = new.payroll_group_id;

    if not found then
      raise exception 'The payroll group for this pay component does not exist.' using errcode = '23503';
    end if;

    if new.effective_start_date < group_start_date
       or (group_end_date is not null and (
         new.effective_end_date is null
         or new.effective_end_date > group_end_date
       )) then
      raise exception 'Pay-component effective dates must be within the selected payroll-group version.' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.guard_payroll_compensation_history()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  assignment_start_date date;
  assignment_end_date date;
  assignment_status text;
  assignment_group_id uuid;
  group_legal_entity_id uuid;
  component_start_date date;
  component_end_date date;
  component_legal_entity_id uuid;
  component_group_id uuid;
  component_stream text;
  component_status text;
  component_is_active boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format(
        'payroll-compensation:%s:%s',
        new.employee_id,
        new.pay_component_id
      ),
      0
    )
  );

  if tg_op = 'INSERT' and new.record_status <> 'draft' then
    raise exception 'A new compensation-history row must begin in draft status.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    if new.record_status is distinct from old.record_status
       and not (
         (old.record_status = 'draft' and new.record_status in ('approved', 'archived'))
         or (old.record_status = 'approved' and new.record_status in ('active', 'superseded', 'archived'))
         or (old.record_status = 'active' and new.record_status in ('superseded', 'archived'))
         or (old.record_status = 'superseded' and new.record_status = 'archived')
       ) then
      raise exception 'Invalid compensation-history status transition: % -> %.', old.record_status, new.record_status using errcode = '22023';
    end if;

    if old.record_status <> 'draft'
       and (
         new.employee_id is distinct from old.employee_id
         or new.worker_assignment_id is distinct from old.worker_assignment_id
         or new.pay_component_id is distinct from old.pay_component_id
         or new.amount is distinct from old.amount
         or new.amount_unit is distinct from old.amount_unit
         or new.currency_code is distinct from old.currency_code
         or new.effective_start_date is distinct from old.effective_start_date
         or new.effective_end_date is distinct from old.effective_end_date
         or new.version is distinct from old.version
         or new.change_type is distinct from old.change_type
         or new.is_retroactive is distinct from old.is_retroactive
         or new.retro_pay_status is distinct from old.retro_pay_status
         or new.retro_pay_reference is distinct from old.retro_pay_reference
         or new.retro_pay_waiver_reason is distinct from old.retro_pay_waiver_reason
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
      raise exception 'Approved or historical compensation rows are immutable; create a new version instead.' using errcode = '55000';
    end if;
  end if;

  select wa.effective_start_date,
         wa.effective_end_date,
         wa.record_status,
         wa.payroll_group_id,
         pg.legal_entity_id
    into assignment_start_date,
         assignment_end_date,
         assignment_status,
         assignment_group_id,
         group_legal_entity_id
  from public.payroll_worker_assignments wa
  join public.payroll_groups pg on pg.id = wa.payroll_group_id
  where wa.id = new.worker_assignment_id
    and wa.employee_id = new.employee_id;

  if not found then
    raise exception 'The compensation row must reference the selected employee''s worker assignment.' using errcode = '23503';
  end if;

  if new.effective_start_date < assignment_start_date
     or (assignment_end_date is not null and (
       new.effective_end_date is null
       or new.effective_end_date > assignment_end_date
     )) then
    raise exception 'Compensation effective dates must be within the worker-assignment version.' using errcode = '22023';
  end if;

  select pc.effective_start_date,
         pc.effective_end_date,
         pc.legal_entity_id,
         pc.payroll_group_id,
         pc.payroll_stream,
         pc.approval_status,
         pc.is_active
    into component_start_date,
         component_end_date,
         component_legal_entity_id,
         component_group_id,
         component_stream,
         component_status,
         component_is_active
  from public.payroll_pay_components pc
  where pc.id = new.pay_component_id;

  if not found then
    raise exception 'The pay component for this compensation row does not exist.' using errcode = '23503';
  end if;

  if component_stream <> 'employee_payroll' then
    raise exception 'Professional-fee or other-stream components must not be placed in employee compensation history.' using errcode = '22023';
  end if;

  if component_group_id is not null and component_group_id <> assignment_group_id then
    raise exception 'The pay component payroll group must match the worker assignment payroll group.' using errcode = '22023';
  end if;

  if component_legal_entity_id is not null and component_legal_entity_id <> group_legal_entity_id then
    raise exception 'The pay component legal entity must match the worker assignment legal entity.' using errcode = '22023';
  end if;

  if new.effective_start_date < component_start_date
     or (component_end_date is not null and (
       new.effective_end_date is null
       or new.effective_end_date > component_end_date
     )) then
    raise exception 'Compensation effective dates must be within the pay-component version.' using errcode = '22023';
  end if;

  if new.record_status in ('approved', 'active')
     and (
       assignment_status not in ('approved', 'active')
       or component_status not in ('approved', 'active')
       or not component_is_active
     ) then
    raise exception 'Approved or active compensation requires an approved worker assignment and active pay component.' using errcode = '22023';
  end if;

  if new.record_status in ('draft', 'approved', 'active')
     and exists (
       select 1
       from public.payroll_compensation_history existing
       where existing.id <> new.id
         and existing.employee_id = new.employee_id
         and existing.pay_component_id = new.pay_component_id
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
    raise exception 'Compensation-history versions for one employee and component cannot have overlapping effective dates.' using errcode = '23P01';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function private.prevent_payroll_compensation_history_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.record_status <> 'draft' then
    raise exception 'Only a draft compensation-history row may be deleted.' using errcode = '55000';
  end if;
  return old;
end;
$$;

drop trigger if exists payroll_pay_components_guard on public.payroll_pay_components;
create trigger payroll_pay_components_guard
before insert or update on public.payroll_pay_components
for each row execute function private.guard_payroll_pay_component();

drop trigger if exists payroll_pay_components_delete_guard on public.payroll_pay_components;
create trigger payroll_pay_components_delete_guard
before delete on public.payroll_pay_components
for each row execute function private.prevent_payroll_pay_component_delete();

drop trigger if exists payroll_pay_components_scope_guard on public.payroll_pay_components;
create trigger payroll_pay_components_scope_guard
before insert or update on public.payroll_pay_components
for each row execute function private.validate_payroll_pay_component_scope();

drop trigger if exists payroll_compensation_history_guard on public.payroll_compensation_history;
create trigger payroll_compensation_history_guard
before insert or update on public.payroll_compensation_history
for each row execute function private.guard_payroll_compensation_history();

drop trigger if exists payroll_compensation_history_delete_guard on public.payroll_compensation_history;
create trigger payroll_compensation_history_delete_guard
before delete on public.payroll_compensation_history
for each row execute function private.prevent_payroll_compensation_history_delete();

alter table public.payroll_pay_components enable row level security;
alter table public.payroll_compensation_history enable row level security;

drop policy if exists payroll_pay_components_authorized_read on public.payroll_pay_components;
create policy payroll_pay_components_authorized_read
on public.payroll_pay_components
for select to authenticated
using (private.payroll_configuration_access());

drop policy if exists payroll_compensation_history_authorized_read on public.payroll_compensation_history;
create policy payroll_compensation_history_authorized_read
on public.payroll_compensation_history
for select to authenticated
using (private.payroll_configuration_access());

revoke all on table
  public.payroll_pay_components,
  public.payroll_compensation_history
from public, anon, authenticated;

grant select on table
  public.payroll_pay_components,
  public.payroll_compensation_history
to authenticated;

grant all on table
  public.payroll_pay_components,
  public.payroll_compensation_history
to service_role;

revoke all on function private.guard_payroll_pay_component() from public, anon, authenticated;
revoke all on function private.prevent_payroll_pay_component_delete() from public, anon, authenticated;
revoke all on function private.validate_payroll_pay_component_scope() from public, anon, authenticated;
revoke all on function private.guard_payroll_compensation_history() from public, anon, authenticated;
revoke all on function private.prevent_payroll_compensation_history_delete() from public, anon, authenticated;

comment on table public.payroll_pay_components is
  'Versioned pay-component catalog. Tax, contribution, proration, deduction, and GL semantics are configuration inputs and require approved source evidence.';

comment on table public.payroll_compensation_history is
  'Exact, effective-dated employee compensation history. Approved rows are immutable; retroactive changes require an explicit retro-pay reference or documented waiver before activation.';
