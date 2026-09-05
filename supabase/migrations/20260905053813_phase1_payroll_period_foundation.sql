-- Phase 1A: payroll organization, calendar, and period-control foundation.
-- Additive only. No legacy payroll or attendance table is modified, and no
-- sample payroll data is copied into the database by this migration.

create table if not exists public.payroll_legal_entities (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  legal_name text not null,
  currency_code text not null default 'PHP',
  default_timezone text not null default 'Asia/Manila',
  is_active boolean not null default true,
  created_by_user_id uuid references public.hris_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_legal_entities_code_not_blank check (btrim(code) <> ''),
  constraint payroll_legal_entities_name_not_blank check (btrim(legal_name) <> ''),
  constraint payroll_legal_entities_currency_code_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint payroll_legal_entities_timezone_not_blank check (btrim(default_timezone) <> '')
);

create unique index if not exists payroll_legal_entities_code_lower_uidx
  on public.payroll_legal_entities (lower(code));

create table if not exists public.payroll_groups (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public.payroll_legal_entities(id),
  business_unit_id uuid references public.business_units(id) on delete set null,
  code text not null,
  name text not null,
  pay_frequency text not null,
  timezone text not null default 'Asia/Manila',
  currency_code text not null default 'PHP',
  effective_start_date date not null,
  effective_end_date date,
  is_active boolean not null default true,
  created_by_user_id uuid references public.hris_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_groups_code_not_blank check (btrim(code) <> ''),
  constraint payroll_groups_name_not_blank check (btrim(name) <> ''),
  constraint payroll_groups_frequency_check check (pay_frequency in ('weekly', 'biweekly', 'semi_monthly', 'monthly', 'other')),
  constraint payroll_groups_currency_code_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint payroll_groups_timezone_not_blank check (btrim(timezone) <> ''),
  constraint payroll_groups_effective_range_check check (
    effective_end_date is null or effective_end_date > effective_start_date
  )
);

create unique index if not exists payroll_groups_identity_version_uidx
  on public.payroll_groups (legal_entity_id, lower(code), effective_start_date);

create index if not exists payroll_groups_business_unit_idx
  on public.payroll_groups (business_unit_id);

create table if not exists public.payroll_calendar_rules (
  id uuid primary key default gen_random_uuid(),
  payroll_group_id uuid not null references public.payroll_groups(id),
  calendar_code text not null,
  version integer not null default 1,
  frequency text not null,
  timezone text not null default 'Asia/Manila',
  cutoff_rule jsonb not null default '{}'::jsonb,
  pay_date_rule jsonb not null default '{}'::jsonb,
  attendance_close_rule jsonb not null default '{}'::jsonb,
  adjustment_deadline_rule jsonb not null default '{}'::jsonb,
  rounding_rule jsonb not null default '{}'::jsonb,
  effective_start_date date not null,
  effective_end_date date,
  approval_status text not null default 'draft',
  source_document_ref text,
  source_url text,
  source_version text,
  requested_by_user_id uuid references public.hris_users(id) on delete set null,
  requested_at timestamptz,
  approved_by_user_id uuid references public.hris_users(id) on delete set null,
  approved_at timestamptz,
  approval_note text,
  test_scenario_version text,
  impact_review jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_calendar_rules_code_not_blank check (btrim(calendar_code) <> ''),
  constraint payroll_calendar_rules_version_check check (version > 0),
  constraint payroll_calendar_rules_frequency_check check (frequency in ('weekly', 'biweekly', 'semi_monthly', 'monthly', 'other')),
  constraint payroll_calendar_rules_timezone_not_blank check (btrim(timezone) <> ''),
  constraint payroll_calendar_rules_effective_range_check check (
    effective_end_date is null or effective_end_date > effective_start_date
  ),
  constraint payroll_calendar_rules_status_check check (
    approval_status in ('draft', 'approved', 'active', 'superseded', 'archived')
  ),
  constraint payroll_calendar_rules_approval_evidence_check check (
    approval_status in ('draft', 'archived')
    or (approved_by_user_id is not null and approved_at is not null)
  )
);

create unique index if not exists payroll_calendar_rules_version_uidx
  on public.payroll_calendar_rules (payroll_group_id, lower(calendar_code), version);

create index if not exists payroll_calendar_rules_effective_idx
  on public.payroll_calendar_rules (payroll_group_id, effective_start_date, effective_end_date);

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  payroll_group_id uuid not null references public.payroll_groups(id),
  calendar_rule_id uuid not null references public.payroll_calendar_rules(id),
  period_type text not null default 'regular',
  period_start_date date not null,
  period_end_date date not null,
  attendance_close_date date,
  adjustment_deadline_date date,
  pay_date date not null,
  timezone text not null default 'Asia/Manila',
  status text not null default 'draft',
  status_reason text not null default 'Initial draft',
  created_by_user_id uuid references public.hris_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  locked_at timestamptz,
  posted_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  constraint payroll_periods_type_check check (period_type in ('regular', 'off_cycle', 'supplemental', 'final_pay', 'thirteenth_month', 'other')),
  constraint payroll_periods_status_check check (
    status in (
      'draft',
      'collecting_inputs',
      'ready_for_calculation',
      'calculated',
      'reviewed',
      'approved',
      'locked',
      'posted',
      'disbursement_prepared',
      'paid',
      'voided',
      'reissued'
    )
  ),
  constraint payroll_periods_date_range_check check (period_end_date >= period_start_date),
  constraint payroll_periods_attendance_close_check check (
    attendance_close_date is null or attendance_close_date >= period_end_date
  ),
  constraint payroll_periods_adjustment_deadline_check check (
    adjustment_deadline_date is null or attendance_close_date is null or adjustment_deadline_date >= attendance_close_date
  ),
  constraint payroll_periods_timezone_not_blank check (btrim(timezone) <> ''),
  constraint payroll_periods_status_reason_not_blank check (btrim(status_reason) <> '')
);

create unique index if not exists payroll_periods_identity_uidx
  on public.payroll_periods (payroll_group_id, period_start_date, period_end_date, period_type);

create index if not exists payroll_periods_status_pay_date_idx
  on public.payroll_periods (status, pay_date);

create table if not exists public.payroll_period_status_history (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id),
  from_status text,
  to_status text not null,
  actor_user_id uuid references public.hris_users(id) on delete set null,
  actor_source text not null,
  reason text not null,
  correlation_id uuid,
  created_at timestamptz not null default now(),
  constraint payroll_period_status_history_actor_source_check check (
    actor_source in ('user', 'system_job', 'migration')
  ),
  constraint payroll_period_status_history_reason_not_blank check (btrim(reason) <> '')
);

create index if not exists payroll_period_status_history_period_idx
  on public.payroll_period_status_history (payroll_period_id, created_at);

create or replace function private.prevent_payroll_group_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.payroll_groups existing
    where existing.id <> new.id
      and existing.legal_entity_id = new.legal_entity_id
      and lower(existing.code) = lower(new.code)
      and daterange(
        existing.effective_start_date,
        coalesce(existing.effective_end_date, 'infinity'::date),
        '[)'
      ) && daterange(
        new.effective_start_date,
        coalesce(new.effective_end_date, 'infinity'::date),
        '[)'
      )
  ) then
    raise exception 'Payroll group versions cannot have overlapping effective dates.' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_payroll_calendar_rule_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.payroll_calendar_rules existing
    where existing.id <> new.id
      and existing.payroll_group_id = new.payroll_group_id
      and lower(existing.calendar_code) = lower(new.calendar_code)
      and daterange(
        existing.effective_start_date,
        coalesce(existing.effective_end_date, 'infinity'::date),
        '[)'
      ) && daterange(
        new.effective_start_date,
        coalesce(new.effective_end_date, 'infinity'::date),
        '[)'
      )
  ) then
    raise exception 'Payroll calendar rule versions cannot have overlapping effective dates.' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create or replace function private.guard_payroll_period_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      if nullif(btrim(new.status_reason), '') is null then
        raise exception 'A reason is required for every payroll-period status change.' using errcode = '22023';
      end if;

      if not (
        (old.status = 'draft' and new.status in ('collecting_inputs', 'voided'))
        or (old.status = 'collecting_inputs' and new.status in ('draft', 'ready_for_calculation', 'voided'))
        or (old.status = 'ready_for_calculation' and new.status in ('collecting_inputs', 'calculated', 'voided'))
        or (old.status = 'calculated' and new.status in ('ready_for_calculation', 'reviewed', 'voided'))
        or (old.status = 'reviewed' and new.status in ('calculated', 'approved', 'voided'))
        or (old.status = 'approved' and new.status in ('reviewed', 'locked', 'voided'))
        or (old.status = 'locked' and new.status in ('posted', 'voided'))
        or (old.status = 'posted' and new.status = 'disbursement_prepared')
        or (old.status = 'disbursement_prepared' and new.status = 'paid')
      ) then
        raise exception 'Invalid payroll-period status transition: % -> %.', old.status, new.status using errcode = '22023';
      end if;
    end if;

    if old.status in ('locked', 'posted', 'disbursement_prepared', 'paid', 'voided', 'reissued')
       and (
         new.payroll_group_id is distinct from old.payroll_group_id
         or new.calendar_rule_id is distinct from old.calendar_rule_id
         or new.period_type is distinct from old.period_type
         or new.period_start_date is distinct from old.period_start_date
         or new.period_end_date is distinct from old.period_end_date
         or new.attendance_close_date is distinct from old.attendance_close_date
         or new.adjustment_deadline_date is distinct from old.adjustment_deadline_date
         or new.pay_date is distinct from old.pay_date
         or new.timezone is distinct from old.timezone
       ) then
      raise exception 'Locked or posted payroll periods cannot have their defining inputs changed.' using errcode = '55000';
    end if;

    if new.status = 'locked' and old.status is distinct from 'locked' then
      new.locked_at := coalesce(new.locked_at, now());
    elsif new.status = 'posted' and old.status is distinct from 'posted' then
      new.posted_at := coalesce(new.posted_at, now());
    elsif new.status = 'paid' and old.status is distinct from 'paid' then
      new.paid_at := coalesce(new.paid_at, now());
    elsif new.status = 'voided' and old.status is distinct from 'voided' then
      new.voided_at := coalesce(new.voided_at, now());
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.record_payroll_period_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
begin
  if tg_op = 'INSERT' then
    insert into public.payroll_period_status_history (
      payroll_period_id,
      from_status,
      to_status,
      actor_user_id,
      actor_source,
      reason
    ) values (
      new.id,
      null,
      new.status,
      actor_id,
      case when actor_id is null then 'system_job' else 'user' end,
      coalesce(nullif(btrim(new.status_reason), ''), 'Status recorded')
    );
  elsif new.status is distinct from old.status then
    insert into public.payroll_period_status_history (
      payroll_period_id,
      from_status,
      to_status,
      actor_user_id,
      actor_source,
      reason
    ) values (
      new.id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      actor_id,
      case when actor_id is null then 'system_job' else 'user' end,
      coalesce(nullif(btrim(new.status_reason), ''), 'Status recorded')
    );
  end if;
  return new;
end;
$$;

create or replace function private.prevent_payroll_period_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    raise exception 'Only a draft payroll period may be deleted.' using errcode = '55000';
  end if;
  return old;
end;
$$;

create or replace function private.prevent_payroll_period_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Payroll-period status history is append-only.' using errcode = '55000';
end;
$$;

drop trigger if exists payroll_groups_no_overlap on public.payroll_groups;
create trigger payroll_groups_no_overlap
before insert or update on public.payroll_groups
for each row execute function private.prevent_payroll_group_overlap();

drop trigger if exists payroll_calendar_rules_no_overlap on public.payroll_calendar_rules;
create trigger payroll_calendar_rules_no_overlap
before insert or update on public.payroll_calendar_rules
for each row execute function private.prevent_payroll_calendar_rule_overlap();

drop trigger if exists payroll_period_status_guard on public.payroll_periods;
create trigger payroll_period_status_guard
before update on public.payroll_periods
for each row execute function private.guard_payroll_period_status();

drop trigger if exists payroll_period_status_history_writer on public.payroll_periods;
create trigger payroll_period_status_history_writer
after insert or update of status on public.payroll_periods
for each row execute function private.record_payroll_period_status_change();

drop trigger if exists payroll_period_delete_guard on public.payroll_periods;
create trigger payroll_period_delete_guard
before delete on public.payroll_periods
for each row execute function private.prevent_payroll_period_delete();

drop trigger if exists payroll_period_status_history_update_guard on public.payroll_period_status_history;
create trigger payroll_period_status_history_update_guard
before update or delete on public.payroll_period_status_history
for each row execute function private.prevent_payroll_period_history_mutation();

create or replace function private.payroll_configuration_access()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_hr_or_admin()
      or public.has_active_role('Finance Staff');
$$;

revoke all on function private.payroll_configuration_access() from public;
grant execute on function private.payroll_configuration_access() to authenticated;

alter table public.payroll_legal_entities enable row level security;
alter table public.payroll_groups enable row level security;
alter table public.payroll_calendar_rules enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_period_status_history enable row level security;

drop policy if exists payroll_legal_entities_authorized_read on public.payroll_legal_entities;
create policy payroll_legal_entities_authorized_read
on public.payroll_legal_entities
for select to authenticated
using (private.payroll_configuration_access());

drop policy if exists payroll_groups_authorized_read on public.payroll_groups;
create policy payroll_groups_authorized_read
on public.payroll_groups
for select to authenticated
using (private.payroll_configuration_access());

drop policy if exists payroll_calendar_rules_authorized_read on public.payroll_calendar_rules;
create policy payroll_calendar_rules_authorized_read
on public.payroll_calendar_rules
for select to authenticated
using (private.payroll_configuration_access());

drop policy if exists payroll_periods_authorized_read on public.payroll_periods;
create policy payroll_periods_authorized_read
on public.payroll_periods
for select to authenticated
using (private.payroll_configuration_access());

drop policy if exists payroll_period_status_history_authorized_read on public.payroll_period_status_history;
create policy payroll_period_status_history_authorized_read
on public.payroll_period_status_history
for select to authenticated
using (private.payroll_configuration_access());

revoke all on table
  public.payroll_legal_entities,
  public.payroll_groups,
  public.payroll_calendar_rules,
  public.payroll_periods,
  public.payroll_period_status_history
from public, anon, authenticated;

grant select on table
  public.payroll_legal_entities,
  public.payroll_groups,
  public.payroll_calendar_rules,
  public.payroll_periods,
  public.payroll_period_status_history
to authenticated;

grant all on table
  public.payroll_legal_entities,
  public.payroll_groups,
  public.payroll_calendar_rules,
  public.payroll_periods,
  public.payroll_period_status_history
to service_role;

revoke all on function private.prevent_payroll_group_overlap() from public, anon, authenticated;
revoke all on function private.prevent_payroll_calendar_rule_overlap() from public, anon, authenticated;
revoke all on function private.guard_payroll_period_status() from public, anon, authenticated;
revoke all on function private.record_payroll_period_status_change() from public, anon, authenticated;
revoke all on function private.prevent_payroll_period_delete() from public, anon, authenticated;
revoke all on function private.prevent_payroll_period_history_mutation() from public, anon, authenticated;

comment on table public.payroll_legal_entities is
  'Payroll legal-entity scope. Populated only after HR/Finance approval; no row-level payroll data belongs here.';
comment on table public.payroll_groups is
  'Effective-dated payroll population and schedule scope. Versions may not overlap for the same entity/code.';
comment on table public.payroll_calendar_rules is
  'Versioned payroll cutoff/pay-date rules. JSON rule fields remain draft until source, approval, tests, and impact review are recorded.';
comment on table public.payroll_periods is
  'Concrete payroll periods with a database-enforced lifecycle. Defining inputs become immutable after locking.';
comment on table public.payroll_period_status_history is
  'Append-only payroll period status history; never edit or delete entries.';
