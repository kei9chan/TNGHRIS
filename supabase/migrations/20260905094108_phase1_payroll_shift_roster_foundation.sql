-- Phase 1D: versioned shift presets and effective-dated payroll roster.
-- Additive only. Legacy shift_templates, shift_assignments, attendance records,
-- and time events remain unchanged. No roster or employee data is seeded.

create table if not exists public.payroll_shift_presets (
  id uuid primary key default gen_random_uuid(),
  preset_code text not null,
  preset_name text not null,
  description text,
  shift_kind text not null default 'regular',
  timezone text not null default 'Asia/Manila',
  scheduled_minutes integer not null,
  break_minutes integer not null default 0,
  break_policy jsonb not null default '{}'::jsonb,
  legal_entity_id uuid references public.payroll_legal_entities(id) on delete restrict,
  payroll_group_id uuid references public.payroll_groups(id) on delete restrict,
  business_unit_id uuid references public.business_units(id) on delete restrict,
  site_id uuid references public.sites(id) on delete restrict,
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
  constraint payroll_shift_presets_code_not_blank check (btrim(preset_code) <> ''),
  constraint payroll_shift_presets_name_not_blank check (btrim(preset_name) <> ''),
  constraint payroll_shift_presets_kind_check check (
    shift_kind in ('regular', 'overnight', 'flexible', 'split', 'broken', 'rest_day', 'other')
  ),
  constraint payroll_shift_presets_timezone_not_blank check (btrim(timezone) <> ''),
  constraint payroll_shift_presets_minutes_check check (scheduled_minutes > 0),
  constraint payroll_shift_presets_break_check check (
    break_minutes >= 0 and break_minutes < scheduled_minutes
  ),
  constraint payroll_shift_presets_effective_range_check check (
    effective_end_date is null or effective_end_date > effective_start_date
  ),
  constraint payroll_shift_presets_version_check check (version > 0),
  constraint payroll_shift_presets_status_check check (
    approval_status in ('draft', 'approved', 'active', 'superseded', 'archived')
  ),
  constraint payroll_shift_presets_approval_evidence_check check (
    approval_status in ('draft', 'archived')
    or (
      approved_by_user_id is not null
      and approved_at is not null
      and nullif(btrim(source_document_ref), '') is not null
    )
  ),
  constraint payroll_shift_presets_request_timestamp_check check (
    (requested_by_user_id is null and requested_at is null)
    or (requested_by_user_id is not null and requested_at is not null)
  ),
  constraint payroll_shift_presets_maker_checker_check check (
    approved_by_user_id is null
    or requested_by_user_id is null
    or approved_by_user_id <> requested_by_user_id
  ),
  constraint payroll_shift_presets_scope_check check (
    payroll_group_id is null or legal_entity_id is not null
  )
);

create unique index if not exists payroll_shift_presets_global_version_uidx
  on public.payroll_shift_presets (lower(preset_code), version)
  where legal_entity_id is null and payroll_group_id is null;

create unique index if not exists payroll_shift_presets_legal_entity_version_uidx
  on public.payroll_shift_presets (lower(preset_code), version, legal_entity_id)
  where legal_entity_id is not null and payroll_group_id is null;

create unique index if not exists payroll_shift_presets_group_version_uidx
  on public.payroll_shift_presets (lower(preset_code), version, payroll_group_id)
  where payroll_group_id is not null;

create index if not exists payroll_shift_presets_effective_idx
  on public.payroll_shift_presets (
    legal_entity_id,
    payroll_group_id,
    business_unit_id,
    site_id,
    lower(preset_code),
    effective_start_date,
    effective_end_date
  );

create index if not exists payroll_shift_presets_legal_entity_idx
  on public.payroll_shift_presets (legal_entity_id);

create index if not exists payroll_shift_presets_payroll_group_idx
  on public.payroll_shift_presets (payroll_group_id);

create index if not exists payroll_shift_presets_business_unit_idx
  on public.payroll_shift_presets (business_unit_id);

create index if not exists payroll_shift_presets_site_idx
  on public.payroll_shift_presets (site_id);

create index if not exists payroll_shift_presets_requested_by_idx
  on public.payroll_shift_presets (requested_by_user_id);

create index if not exists payroll_shift_presets_approved_by_idx
  on public.payroll_shift_presets (approved_by_user_id);

create index if not exists payroll_shift_presets_created_by_idx
  on public.payroll_shift_presets (created_by_user_id);

create table if not exists public.payroll_shift_preset_segments (
  id uuid primary key default gen_random_uuid(),
  shift_preset_id uuid not null references public.payroll_shift_presets(id) on delete restrict,
  segment_number integer not null,
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean not null default false,
  scheduled_minutes integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_shift_preset_segments_number_check check (segment_number > 0),
  constraint payroll_shift_preset_segments_minutes_check check (scheduled_minutes > 0),
  constraint payroll_shift_preset_segments_time_check check (
    (crosses_midnight and end_time < start_time)
    or (not crosses_midnight and end_time > start_time)
  ),
  constraint payroll_shift_preset_segments_unique_number unique (shift_preset_id, segment_number)
);

create index if not exists payroll_shift_preset_segments_preset_idx
  on public.payroll_shift_preset_segments (shift_preset_id, segment_number);

create table if not exists public.payroll_recurring_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hris_users(id) on delete restrict,
  worker_assignment_id uuid not null,
  shift_preset_id uuid not null references public.payroll_shift_presets(id) on delete restrict,
  day_of_week smallint not null,
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
  created_by_user_id uuid references public.hris_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_recurring_schedule_rules_worker_assignment_employee_fkey
    foreign key (worker_assignment_id, employee_id)
    references public.payroll_worker_assignments(id, employee_id)
    on delete restrict,
  constraint payroll_recurring_schedule_rules_day_check check (day_of_week between 1 and 7),
  constraint payroll_recurring_schedule_rules_effective_range_check check (
    effective_end_date is null or effective_end_date > effective_start_date
  ),
  constraint payroll_recurring_schedule_rules_version_check check (version > 0),
  constraint payroll_recurring_schedule_rules_status_check check (
    record_status in ('draft', 'approved', 'active', 'superseded', 'archived')
  ),
  constraint payroll_recurring_schedule_rules_reason_not_blank check (btrim(change_reason) <> ''),
  constraint payroll_recurring_schedule_rules_approval_evidence_check check (
    record_status in ('draft', 'archived')
    or (
      approved_by_user_id is not null
      and approved_at is not null
      and nullif(btrim(source_document_ref), '') is not null
    )
  ),
  constraint payroll_recurring_schedule_rules_request_timestamp_check check (
    (requested_by_user_id is null and requested_at is null)
    or (requested_by_user_id is not null and requested_at is not null)
  ),
  constraint payroll_recurring_schedule_rules_maker_checker_check check (
    approved_by_user_id is null
    or requested_by_user_id is null
    or approved_by_user_id <> requested_by_user_id
  ),
  constraint payroll_recurring_schedule_rules_id_employee_key unique (id, employee_id)
);

create index if not exists payroll_recurring_schedule_rules_employee_effective_idx
  on public.payroll_recurring_schedule_rules (
    employee_id, day_of_week, effective_start_date, effective_end_date
  );

create index if not exists payroll_recurring_schedule_rules_assignment_idx
  on public.payroll_recurring_schedule_rules (worker_assignment_id, day_of_week);

create index if not exists payroll_recurring_schedule_rules_shift_preset_idx
  on public.payroll_recurring_schedule_rules (shift_preset_id);

create index if not exists payroll_recurring_schedule_rules_requested_by_idx
  on public.payroll_recurring_schedule_rules (requested_by_user_id);

create index if not exists payroll_recurring_schedule_rules_approved_by_idx
  on public.payroll_recurring_schedule_rules (approved_by_user_id);

create index if not exists payroll_recurring_schedule_rules_created_by_idx
  on public.payroll_recurring_schedule_rules (created_by_user_id);

create table if not exists public.payroll_employee_schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hris_users(id) on delete restrict,
  worker_assignment_id uuid not null,
  shift_preset_id uuid not null references public.payroll_shift_presets(id) on delete restrict,
  shift_date date not null,
  recurring_rule_id uuid,
  schedule_source text not null default 'recurring',
  is_override boolean not null default false,
  override_reason text,
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
  created_by_user_id uuid references public.hris_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_employee_schedules_worker_assignment_employee_fkey
    foreign key (worker_assignment_id, employee_id)
    references public.payroll_worker_assignments(id, employee_id)
    on delete restrict,
  constraint payroll_employee_schedules_recurring_rule_employee_fkey
    foreign key (recurring_rule_id, employee_id)
    references public.payroll_recurring_schedule_rules(id, employee_id)
    on delete restrict,
  constraint payroll_employee_schedules_source_check check (
    (schedule_source = 'recurring' and not is_override and recurring_rule_id is not null)
    or (schedule_source in ('manual', 'change_of_shift', 'shift_swap', 'import')
        and is_override)
  ),
  constraint payroll_employee_schedules_override_reason_check check (
    not is_override or nullif(btrim(override_reason), '') is not null
  ),
  constraint payroll_employee_schedules_version_check check (version > 0),
  constraint payroll_employee_schedules_status_check check (
    record_status in ('draft', 'approved', 'active', 'superseded', 'archived')
  ),
  constraint payroll_employee_schedules_reason_not_blank check (btrim(change_reason) <> ''),
  constraint payroll_employee_schedules_approval_evidence_check check (
    record_status in ('draft', 'archived')
    or (
      approved_by_user_id is not null
      and approved_at is not null
      and nullif(btrim(source_document_ref), '') is not null
    )
  ),
  constraint payroll_employee_schedules_request_timestamp_check check (
    (requested_by_user_id is null and requested_at is null)
    or (requested_by_user_id is not null and requested_at is not null)
  ),
  constraint payroll_employee_schedules_maker_checker_check check (
    approved_by_user_id is null
    or requested_by_user_id is null
    or approved_by_user_id <> requested_by_user_id
  ),
  constraint payroll_employee_schedules_id_employee_key unique (id, employee_id)
);

create unique index if not exists payroll_employee_schedules_one_current_per_day_uidx
  on public.payroll_employee_schedules (employee_id, shift_date)
  where record_status in ('draft', 'approved', 'active');

create index if not exists payroll_employee_schedules_employee_date_idx
  on public.payroll_employee_schedules (employee_id, shift_date);

create index if not exists payroll_employee_schedules_assignment_date_idx
  on public.payroll_employee_schedules (worker_assignment_id, shift_date);

create index if not exists payroll_employee_schedules_shift_preset_date_idx
  on public.payroll_employee_schedules (shift_preset_id, shift_date);

create index if not exists payroll_employee_schedules_recurring_rule_idx
  on public.payroll_employee_schedules (recurring_rule_id);

create index if not exists payroll_employee_schedules_requested_by_idx
  on public.payroll_employee_schedules (requested_by_user_id);

create index if not exists payroll_employee_schedules_approved_by_idx
  on public.payroll_employee_schedules (approved_by_user_id);

create index if not exists payroll_employee_schedules_created_by_idx
  on public.payroll_employee_schedules (created_by_user_id);

create or replace function private.guard_payroll_shift_preset()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  referenced boolean;
  group_legal_entity_id uuid;
  group_business_unit_id uuid;
  segment_total integer;
begin
  if tg_op = 'INSERT' and new.approval_status <> 'draft' then
    raise exception 'A new shift preset must begin in draft status.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    if new.approval_status is distinct from old.approval_status
       and not (
         (old.approval_status = 'draft' and new.approval_status in ('approved', 'archived'))
         or (old.approval_status = 'approved' and new.approval_status in ('active', 'superseded', 'archived'))
         or (old.approval_status = 'active' and new.approval_status in ('superseded', 'archived'))
         or (old.approval_status = 'superseded' and new.approval_status = 'archived')
       ) then
      raise exception 'Invalid shift-preset status transition: % -> %.', old.approval_status, new.approval_status using errcode = '22023';
    end if;

    if new.approval_status in ('superseded', 'archived') then
      new.is_active := false;
    end if;

    select exists (
      select 1 from public.payroll_recurring_schedule_rules where shift_preset_id = old.id
      union all
      select 1 from public.payroll_employee_schedules where shift_preset_id = old.id
    ) into referenced;

    if referenced and (
      new.preset_code is distinct from old.preset_code
      or new.preset_name is distinct from old.preset_name
      or new.description is distinct from old.description
      or new.shift_kind is distinct from old.shift_kind
      or new.timezone is distinct from old.timezone
      or new.scheduled_minutes is distinct from old.scheduled_minutes
      or new.break_minutes is distinct from old.break_minutes
      or new.break_policy is distinct from old.break_policy
      or new.legal_entity_id is distinct from old.legal_entity_id
      or new.payroll_group_id is distinct from old.payroll_group_id
      or new.business_unit_id is distinct from old.business_unit_id
      or new.site_id is distinct from old.site_id
      or new.effective_start_date is distinct from old.effective_start_date
      or new.effective_end_date is distinct from old.effective_end_date
      or new.version is distinct from old.version
    ) then
      raise exception 'A shift preset used by a roster is immutable; create a new preset version instead.' using errcode = '55000';
    end if;
  end if;

  if new.payroll_group_id is not null then
    select pg.legal_entity_id, pg.business_unit_id
      into group_legal_entity_id, group_business_unit_id
    from public.payroll_groups pg
    where pg.id = new.payroll_group_id;

    if not found then
      raise exception 'The payroll group for this shift preset does not exist.' using errcode = '23503';
    end if;

    if new.legal_entity_id is distinct from group_legal_entity_id then
      raise exception 'A shift preset payroll group must belong to its selected legal entity.' using errcode = '22023';
    end if;

    if new.business_unit_id is not null
       and group_business_unit_id is not null
       and new.business_unit_id is distinct from group_business_unit_id then
      raise exception 'A shift preset business unit must match its payroll group.' using errcode = '22023';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format(
        'payroll-shift-preset:%s:%s:%s:%s',
        coalesce(new.legal_entity_id::text, 'global'),
        coalesce(new.payroll_group_id::text, 'global'),
        coalesce(new.business_unit_id::text, 'global'),
        pg_catalog.lower(new.preset_code)
      ),
      0
    )
  );

  if new.approval_status in ('approved', 'active') then
    select coalesce(sum(s.scheduled_minutes), 0)::integer
      into segment_total
    from public.payroll_shift_preset_segments s
    where s.shift_preset_id = new.id;

    if segment_total = 0 then
      raise exception 'An approved or active shift preset must have at least one segment.' using errcode = '22023';
    end if;

    if segment_total <> new.scheduled_minutes then
      raise exception 'Shift-preset segment minutes (%) must equal scheduled minutes (%).', segment_total, new.scheduled_minutes using errcode = '22023';
    end if;
  end if;

  if new.approval_status in ('draft', 'approved', 'active')
     and exists (
       select 1
       from public.payroll_shift_presets existing
       where existing.id <> new.id
         and pg_catalog.lower(existing.preset_code) = pg_catalog.lower(new.preset_code)
         and existing.legal_entity_id is not distinct from new.legal_entity_id
         and existing.payroll_group_id is not distinct from new.payroll_group_id
         and existing.business_unit_id is not distinct from new.business_unit_id
         and existing.site_id is not distinct from new.site_id
         and existing.approval_status in ('draft', 'approved', 'active')
         and pg_catalog.daterange(existing.effective_start_date, coalesce(existing.effective_end_date, 'infinity'::date), '[)')
           && pg_catalog.daterange(new.effective_start_date, coalesce(new.effective_end_date, 'infinity'::date), '[)')
     ) then
    raise exception 'Shift-preset versions with the same scope cannot have overlapping effective dates.' using errcode = '23P01';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function private.prevent_payroll_shift_preset_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Shift presets are append-only; archive the preset instead of deleting it.' using errcode = '55000';
end;
$$;

create or replace function private.guard_payroll_shift_preset_segment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  preset_status text;
begin
  select approval_status into preset_status
  from public.payroll_shift_presets
  where id = coalesce(new.shift_preset_id, old.shift_preset_id);

  if not found then
    raise exception 'The shift preset for this segment does not exist.' using errcode = '23503';
  end if;

  if preset_status <> 'draft' then
    raise exception 'Shift segments may only be changed while the preset is in draft status.' using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and new.shift_preset_id is distinct from old.shift_preset_id then
    raise exception 'A shift-preset segment cannot be moved to another preset.' using errcode = '55000';
  end if;

  if tg_op <> 'DELETE' then
    new.updated_at := pg_catalog.now();
    return new;
  end if;

  return old;
end;
$$;

create or replace function private.guard_payroll_recurring_schedule_rule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  assignment_start_date date;
  assignment_end_date date;
  assignment_status text;
  assignment_group_id uuid;
  assignment_business_unit_id uuid;
  assignment_site_id uuid;
  group_legal_entity_id uuid;
  preset_start_date date;
  preset_end_date date;
  preset_status text;
  preset_active boolean;
  preset_group_id uuid;
  preset_business_unit_id uuid;
  preset_site_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format('payroll-recurring-roster:%s:%s', new.worker_assignment_id, new.day_of_week),
      0
    )
  );

  if tg_op = 'INSERT' and new.record_status <> 'draft' then
    raise exception 'A new recurring schedule rule must begin in draft status.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    if new.record_status is distinct from old.record_status
       and not (
         (old.record_status = 'draft' and new.record_status in ('approved', 'archived'))
         or (old.record_status = 'approved' and new.record_status in ('active', 'superseded', 'archived'))
         or (old.record_status = 'active' and new.record_status in ('superseded', 'archived'))
         or (old.record_status = 'superseded' and new.record_status = 'archived')
       ) then
      raise exception 'Invalid recurring schedule-rule status transition: % -> %.', old.record_status, new.record_status using errcode = '22023';
    end if;

    if old.record_status <> 'draft'
       and (
         new.employee_id is distinct from old.employee_id
         or new.worker_assignment_id is distinct from old.worker_assignment_id
         or new.shift_preset_id is distinct from old.shift_preset_id
         or new.day_of_week is distinct from old.day_of_week
         or new.effective_start_date is distinct from old.effective_start_date
         or new.effective_end_date is distinct from old.effective_end_date
         or new.version is distinct from old.version
         or new.source_document_ref is distinct from old.source_document_ref
         or new.source_url is distinct from old.source_url
         or new.source_version is distinct from old.source_version
         or new.change_reason is distinct from old.change_reason
       ) then
      raise exception 'Approved or historical recurring schedule rules are immutable; create a new version instead.' using errcode = '55000';
    end if;
  end if;

  select wa.effective_start_date,
         wa.effective_end_date,
         wa.record_status,
         wa.payroll_group_id,
         wa.business_unit_id,
         wa.site_id,
         pg.legal_entity_id
    into assignment_start_date,
         assignment_end_date,
         assignment_status,
         assignment_group_id,
         assignment_business_unit_id,
         assignment_site_id,
         group_legal_entity_id
  from public.payroll_worker_assignments wa
  join public.payroll_groups pg on pg.id = wa.payroll_group_id
  where wa.id = new.worker_assignment_id
    and wa.employee_id = new.employee_id;

  if not found then
    raise exception 'The recurring schedule rule must reference the selected employee''s worker assignment.' using errcode = '23503';
  end if;

  if new.effective_start_date < assignment_start_date
     or (assignment_end_date is not null and (new.effective_end_date is null or new.effective_end_date > assignment_end_date)) then
    raise exception 'Recurring schedule-rule dates must be within the worker-assignment version.' using errcode = '22023';
  end if;

  select sp.effective_start_date,
         sp.effective_end_date,
         sp.approval_status,
         sp.is_active,
         sp.payroll_group_id,
         sp.business_unit_id,
         sp.site_id
    into preset_start_date,
         preset_end_date,
         preset_status,
         preset_active,
         preset_group_id,
         preset_business_unit_id,
         preset_site_id
  from public.payroll_shift_presets sp
  where sp.id = new.shift_preset_id;

  if not found then
    raise exception 'The recurring schedule rule shift preset does not exist.' using errcode = '23503';
  end if;

  if new.effective_start_date < preset_start_date
     or (preset_end_date is not null and (new.effective_end_date is null or new.effective_end_date > preset_end_date)) then
    raise exception 'Recurring schedule-rule dates must be within the shift-preset version.' using errcode = '22023';
  end if;

  if preset_group_id is not null and preset_group_id <> assignment_group_id then
    raise exception 'The shift preset payroll group must match the worker assignment payroll group.' using errcode = '22023';
  end if;
  if preset_business_unit_id is not null and assignment_business_unit_id is not null
     and preset_business_unit_id <> assignment_business_unit_id then
    raise exception 'The shift preset business unit must match the worker assignment business unit.' using errcode = '22023';
  end if;
  if preset_site_id is not null and assignment_site_id is not null
     and preset_site_id <> assignment_site_id then
    raise exception 'The shift preset site must match the worker assignment site.' using errcode = '22023';
  end if;

  if new.record_status in ('approved', 'active')
     and (assignment_status not in ('approved', 'active') or preset_status not in ('approved', 'active') or not preset_active) then
    raise exception 'Approved or active recurring schedule rules require an approved worker assignment and active shift preset.' using errcode = '22023';
  end if;

  if new.record_status in ('draft', 'approved', 'active')
     and exists (
       select 1
       from public.payroll_recurring_schedule_rules existing
       where existing.id <> new.id
         and existing.worker_assignment_id = new.worker_assignment_id
         and existing.day_of_week = new.day_of_week
         and existing.record_status in ('draft', 'approved', 'active')
         and pg_catalog.daterange(existing.effective_start_date, coalesce(existing.effective_end_date, 'infinity'::date), '[)')
           && pg_catalog.daterange(new.effective_start_date, coalesce(new.effective_end_date, 'infinity'::date), '[)')
     ) then
    raise exception 'Recurring schedule-rule versions cannot overlap for one worker assignment and weekday.' using errcode = '23P01';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function private.prevent_payroll_recurring_schedule_rule_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.record_status <> 'draft' then
    raise exception 'Only a draft recurring schedule rule may be deleted.' using errcode = '55000';
  end if;
  return old;
end;
$$;

create or replace function private.guard_payroll_employee_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  assignment_start_date date;
  assignment_end_date date;
  assignment_status text;
  assignment_group_id uuid;
  assignment_business_unit_id uuid;
  assignment_site_id uuid;
  group_legal_entity_id uuid;
  preset_start_date date;
  preset_end_date date;
  preset_status text;
  preset_active boolean;
  preset_group_id uuid;
  preset_business_unit_id uuid;
  preset_site_id uuid;
  rule_status text;
  rule_day smallint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format('payroll-employee-schedule:%s:%s', new.employee_id, new.shift_date),
      0
    )
  );

  if tg_op = 'INSERT' and new.record_status <> 'draft' then
    raise exception 'A new employee schedule must begin in draft status.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    if new.record_status is distinct from old.record_status
       and not (
         (old.record_status = 'draft' and new.record_status in ('approved', 'archived'))
         or (old.record_status = 'approved' and new.record_status in ('active', 'superseded', 'archived'))
         or (old.record_status = 'active' and new.record_status in ('superseded', 'archived'))
         or (old.record_status = 'superseded' and new.record_status = 'archived')
       ) then
      raise exception 'Invalid employee-schedule status transition: % -> %.', old.record_status, new.record_status using errcode = '22023';
    end if;

    if old.record_status <> 'draft'
       and (
         new.employee_id is distinct from old.employee_id
         or new.worker_assignment_id is distinct from old.worker_assignment_id
         or new.shift_preset_id is distinct from old.shift_preset_id
         or new.shift_date is distinct from old.shift_date
         or new.recurring_rule_id is distinct from old.recurring_rule_id
         or new.schedule_source is distinct from old.schedule_source
         or new.is_override is distinct from old.is_override
         or new.override_reason is distinct from old.override_reason
         or new.version is distinct from old.version
         or new.source_document_ref is distinct from old.source_document_ref
         or new.source_url is distinct from old.source_url
         or new.source_version is distinct from old.source_version
         or new.change_reason is distinct from old.change_reason
       ) then
      raise exception 'Approved or historical employee schedules are immutable; supersede them with a new version instead.' using errcode = '55000';
    end if;
  end if;

  select wa.effective_start_date,
         wa.effective_end_date,
         wa.record_status,
         wa.payroll_group_id,
         wa.business_unit_id,
         wa.site_id,
         pg.legal_entity_id
    into assignment_start_date,
         assignment_end_date,
         assignment_status,
         assignment_group_id,
         assignment_business_unit_id,
         assignment_site_id,
         group_legal_entity_id
  from public.payroll_worker_assignments wa
  join public.payroll_groups pg on pg.id = wa.payroll_group_id
  where wa.id = new.worker_assignment_id
    and wa.employee_id = new.employee_id;

  if not found then
    raise exception 'The employee schedule must reference the selected employee''s worker assignment.' using errcode = '23503';
  end if;

  if new.shift_date < assignment_start_date
     or (assignment_end_date is not null and new.shift_date >= assignment_end_date) then
    raise exception 'The scheduled date must fall within the worker-assignment version.' using errcode = '22023';
  end if;

  select sp.effective_start_date,
         sp.effective_end_date,
         sp.approval_status,
         sp.is_active,
         sp.payroll_group_id,
         sp.business_unit_id,
         sp.site_id
    into preset_start_date,
         preset_end_date,
         preset_status,
         preset_active,
         preset_group_id,
         preset_business_unit_id,
         preset_site_id
  from public.payroll_shift_presets sp
  where sp.id = new.shift_preset_id;

  if not found then
    raise exception 'The employee schedule shift preset does not exist.' using errcode = '23503';
  end if;

  if new.shift_date < preset_start_date
     or (preset_end_date is not null and new.shift_date >= preset_end_date) then
    raise exception 'The scheduled date must fall within the shift-preset version.' using errcode = '22023';
  end if;

  if preset_group_id is not null and preset_group_id <> assignment_group_id then
    raise exception 'The shift preset payroll group must match the worker assignment payroll group.' using errcode = '22023';
  end if;
  if preset_business_unit_id is not null and assignment_business_unit_id is not null
     and preset_business_unit_id <> assignment_business_unit_id then
    raise exception 'The shift preset business unit must match the worker assignment business unit.' using errcode = '22023';
  end if;
  if preset_site_id is not null and assignment_site_id is not null
     and preset_site_id <> assignment_site_id then
    raise exception 'The shift preset site must match the worker assignment site.' using errcode = '22023';
  end if;

  if new.recurring_rule_id is not null then
    select rr.record_status,
           rr.day_of_week
      into rule_status, rule_day
    from public.payroll_recurring_schedule_rules rr
    where rr.id = new.recurring_rule_id
      and rr.employee_id = new.employee_id
      and new.shift_date >= rr.effective_start_date
      and (rr.effective_end_date is null or new.shift_date < rr.effective_end_date);

    if not found then
      raise exception 'The recurring schedule rule must cover this employee and scheduled date.' using errcode = '22023';
    end if;

    if rule_day <> extract(isodow from new.shift_date)::smallint then
      raise exception 'The recurring schedule rule weekday does not match the scheduled date.' using errcode = '22023';
    end if;

    if new.schedule_source = 'recurring' and rule_status not in ('approved', 'active') then
      raise exception 'A recurring employee schedule requires an approved recurring schedule rule.' using errcode = '22023';
    end if;
  elsif new.schedule_source = 'recurring' then
    raise exception 'A recurring employee schedule must identify its recurring schedule rule.' using errcode = '22023';
  end if;

  if new.record_status in ('approved', 'active')
     and (assignment_status not in ('approved', 'active') or preset_status not in ('approved', 'active') or not preset_active) then
    raise exception 'Approved or active employee schedules require an approved worker assignment and active shift preset.' using errcode = '22023';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function private.prevent_payroll_employee_schedule_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.record_status <> 'draft' then
    raise exception 'Only a draft employee schedule may be deleted.' using errcode = '55000';
  end if;
  return old;
end;
$$;

drop trigger if exists payroll_shift_presets_guard on public.payroll_shift_presets;
create trigger payroll_shift_presets_guard
before insert or update on public.payroll_shift_presets
for each row execute function private.guard_payroll_shift_preset();

drop trigger if exists payroll_shift_presets_delete_guard on public.payroll_shift_presets;
create trigger payroll_shift_presets_delete_guard
before delete on public.payroll_shift_presets
for each row execute function private.prevent_payroll_shift_preset_delete();

drop trigger if exists payroll_shift_preset_segments_guard on public.payroll_shift_preset_segments;
create trigger payroll_shift_preset_segments_guard
before insert or update or delete on public.payroll_shift_preset_segments
for each row execute function private.guard_payroll_shift_preset_segment();

drop trigger if exists payroll_recurring_schedule_rules_guard on public.payroll_recurring_schedule_rules;
create trigger payroll_recurring_schedule_rules_guard
before insert or update on public.payroll_recurring_schedule_rules
for each row execute function private.guard_payroll_recurring_schedule_rule();

drop trigger if exists payroll_recurring_schedule_rules_delete_guard on public.payroll_recurring_schedule_rules;
create trigger payroll_recurring_schedule_rules_delete_guard
before delete on public.payroll_recurring_schedule_rules
for each row execute function private.prevent_payroll_recurring_schedule_rule_delete();

drop trigger if exists payroll_employee_schedules_guard on public.payroll_employee_schedules;
create trigger payroll_employee_schedules_guard
before insert or update on public.payroll_employee_schedules
for each row execute function private.guard_payroll_employee_schedule();

drop trigger if exists payroll_employee_schedules_delete_guard on public.payroll_employee_schedules;
create trigger payroll_employee_schedules_delete_guard
before delete on public.payroll_employee_schedules
for each row execute function private.prevent_payroll_employee_schedule_delete();

alter table public.payroll_shift_presets enable row level security;
alter table public.payroll_shift_preset_segments enable row level security;
alter table public.payroll_recurring_schedule_rules enable row level security;
alter table public.payroll_employee_schedules enable row level security;

drop policy if exists payroll_shift_presets_authorized_read on public.payroll_shift_presets;
create policy payroll_shift_presets_authorized_read
on public.payroll_shift_presets
for select to authenticated
using (private.payroll_configuration_access());

drop policy if exists payroll_shift_preset_segments_authorized_read on public.payroll_shift_preset_segments;
create policy payroll_shift_preset_segments_authorized_read
on public.payroll_shift_preset_segments
for select to authenticated
using (private.payroll_configuration_access());

drop policy if exists payroll_recurring_schedule_rules_authorized_read on public.payroll_recurring_schedule_rules;
create policy payroll_recurring_schedule_rules_authorized_read
on public.payroll_recurring_schedule_rules
for select to authenticated
using (private.payroll_configuration_access());

drop policy if exists payroll_employee_schedules_authorized_read on public.payroll_employee_schedules;
create policy payroll_employee_schedules_authorized_read
on public.payroll_employee_schedules
for select to authenticated
using (private.payroll_configuration_access());

revoke all on table
  public.payroll_shift_presets,
  public.payroll_shift_preset_segments,
  public.payroll_recurring_schedule_rules,
  public.payroll_employee_schedules
from public, anon, authenticated;

grant select on table
  public.payroll_shift_presets,
  public.payroll_shift_preset_segments,
  public.payroll_recurring_schedule_rules,
  public.payroll_employee_schedules
to authenticated;

grant all on table
  public.payroll_shift_presets,
  public.payroll_shift_preset_segments,
  public.payroll_recurring_schedule_rules,
  public.payroll_employee_schedules
to service_role;

revoke all on function private.guard_payroll_shift_preset() from public, anon, authenticated;
revoke all on function private.prevent_payroll_shift_preset_delete() from public, anon, authenticated;
revoke all on function private.guard_payroll_shift_preset_segment() from public, anon, authenticated;
revoke all on function private.guard_payroll_recurring_schedule_rule() from public, anon, authenticated;
revoke all on function private.prevent_payroll_recurring_schedule_rule_delete() from public, anon, authenticated;
revoke all on function private.guard_payroll_employee_schedule() from public, anon, authenticated;
revoke all on function private.prevent_payroll_employee_schedule_delete() from public, anon, authenticated;

comment on table public.payroll_shift_presets is
  'Versioned payroll shift catalog. Approved presets require normalized work segments; legacy shift templates remain separate.';
comment on table public.payroll_shift_preset_segments is
  'Normalized work segments for regular, overnight, split, and broken shift presets. Segment minutes are planned paid work minutes.';
comment on table public.payroll_recurring_schedule_rules is
  'Effective-dated weekly roster rules linked to a worker assignment and versioned shift preset.';
comment on table public.payroll_employee_schedules is
  'Canonical employee/date schedule mapping. Overrides preserve the source rule and never rewrite legacy schedules or raw time events.';
