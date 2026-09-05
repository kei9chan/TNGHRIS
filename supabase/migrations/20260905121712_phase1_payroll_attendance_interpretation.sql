-- Phase 1G: versioned attendance interpretation and exception foundation.
-- Additive only. Legacy attendance, time_events, leave, and payroll rows remain
-- unchanged. No employee or attendance data is seeded.

create table if not exists public.payroll_attendance_rule_sets (
  id uuid primary key default gen_random_uuid(),
  rule_code text not null,
  rule_name text not null,
  description text,
  timezone text not null default 'Asia/Manila',
  legal_entity_id uuid references public.payroll_legal_entities(id) on delete restrict,
  payroll_group_id uuid references public.payroll_groups(id) on delete restrict,
  business_unit_id uuid references public.business_units(id) on delete restrict,
  site_id uuid references public.sites(id) on delete restrict,
  effective_start_date date not null,
  effective_end_date date,
  version integer not null default 1,
  approval_status text not null default 'draft',
  is_active boolean not null default true,
  grace_period_minutes integer not null,
  no_show_buffer_minutes integer not null,
  meal_break_minutes integer not null,
  meal_break_policy jsonb not null default '{}'::jsonb,
  rounding_policy jsonb not null default '{}'::jsonb,
  early_clock_in_policy text not null,
  late_clock_out_policy text not null,
  missing_punch_policy text not null,
  source_document_ref text,
  source_url text,
  source_version text,
  test_scenario_version text,
  requested_by_user_id uuid references public.hris_users(id) on delete set null,
  requested_at timestamptz,
  approved_by_user_id uuid references public.hris_users(id) on delete set null,
  approved_at timestamptz,
  approval_note text,
  created_by_user_id uuid references public.hris_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_attendance_rule_sets_code_not_blank check (btrim(rule_code) <> ''),
  constraint payroll_attendance_rule_sets_name_not_blank check (btrim(rule_name) <> ''),
  constraint payroll_attendance_rule_sets_timezone_not_blank check (btrim(timezone) <> ''),
  constraint payroll_attendance_rule_sets_effective_range_check check (
    effective_end_date is null or effective_end_date > effective_start_date
  ),
  constraint payroll_attendance_rule_sets_version_check check (version > 0),
  constraint payroll_attendance_rule_sets_status_check check (
    approval_status in ('draft', 'approved', 'active', 'superseded', 'archived')
  ),
  constraint payroll_attendance_rule_sets_active_status_check check (
    approval_status <> 'active' or is_active
  ),
  constraint payroll_attendance_rule_sets_grace_check check (
    grace_period_minutes between 0 and 1440
  ),
  constraint payroll_attendance_rule_sets_no_show_buffer_check check (
    no_show_buffer_minutes between 0 and 1440
  ),
  constraint payroll_attendance_rule_sets_meal_break_check check (
    meal_break_minutes between 0 and 1440
  ),
  constraint payroll_attendance_rule_sets_policy_object_check check (
    jsonb_typeof(meal_break_policy) = 'object'
    and jsonb_typeof(rounding_policy) = 'object'
  ),
  constraint payroll_attendance_rule_sets_early_clock_in_check check (
    early_clock_in_policy in ('exclude_unapproved', 'include', 'review')
  ),
  constraint payroll_attendance_rule_sets_late_clock_out_check check (
    late_clock_out_policy in ('exclude_unapproved', 'include', 'review')
  ),
  constraint payroll_attendance_rule_sets_missing_punch_check check (
    missing_punch_policy in ('needs_review', 'manual_correction', 'schedule_assumption')
  ),
  constraint payroll_attendance_rule_sets_approval_evidence_check check (
    approval_status in ('draft', 'archived')
    or (
      approved_by_user_id is not null
      and approved_at is not null
      and nullif(btrim(source_document_ref), '') is not null
      and nullif(btrim(test_scenario_version), '') is not null
    )
  ),
  constraint payroll_attendance_rule_sets_request_timestamp_check check (
    (requested_by_user_id is null and requested_at is null)
    or (requested_by_user_id is not null and requested_at is not null)
  ),
  constraint payroll_attendance_rule_sets_maker_checker_check check (
    approved_by_user_id is null
    or requested_by_user_id is null
    or approved_by_user_id <> requested_by_user_id
  ),
  constraint payroll_attendance_rule_sets_scope_check check (
    payroll_group_id is null or legal_entity_id is not null
  )
);

create unique index if not exists payroll_attendance_rule_sets_global_version_uidx
  on public.payroll_attendance_rule_sets (lower(rule_code), version)
  where legal_entity_id is null and payroll_group_id is null;
create unique index if not exists payroll_attendance_rule_sets_entity_version_uidx
  on public.payroll_attendance_rule_sets (lower(rule_code), version, legal_entity_id)
  where legal_entity_id is not null and payroll_group_id is null;
create unique index if not exists payroll_attendance_rule_sets_group_version_uidx
  on public.payroll_attendance_rule_sets (lower(rule_code), version, payroll_group_id)
  where payroll_group_id is not null;
create index if not exists payroll_attendance_rule_sets_effective_idx
  on public.payroll_attendance_rule_sets (
    legal_entity_id, payroll_group_id, business_unit_id, site_id,
    lower(rule_code), effective_start_date, effective_end_date
  );
create index if not exists payroll_attendance_rule_sets_requested_by_idx
  on public.payroll_attendance_rule_sets (requested_by_user_id);
create index if not exists payroll_attendance_rule_sets_approved_by_idx
  on public.payroll_attendance_rule_sets (approved_by_user_id);

create table if not exists public.payroll_attendance_interpretations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hris_users(id) on delete restrict,
  work_date date not null,
  employee_schedule_id uuid,
  attendance_rule_set_id uuid not null references public.payroll_attendance_rule_sets(id) on delete restrict,
  holiday_date_id uuid references public.payroll_holiday_dates(id) on delete restrict,
  interpretation_version integer not null default 1,
  record_status text not null default 'draft',
  interpretation_source text not null default 'system',
  schedule_timezone text not null default 'Asia/Manila',
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  scheduled_work_minutes integer not null default 0,
  scheduled_break_minutes integer not null default 0,
  first_clock_in_at timestamptz,
  last_clock_out_at timestamptz,
  actual_work_minutes integer not null default 0,
  break_minutes integer not null default 0,
  late_minutes integer not null default 0,
  undertime_minutes integer not null default 0,
  absence_minutes integer not null default 0,
  absence_status text not null default 'needs_review',
  missing_clock_in boolean not null default false,
  missing_clock_out boolean not null default false,
  source_event_count integer not null default 0,
  schedule_snapshot jsonb not null default '{}'::jsonb,
  rule_snapshot jsonb not null default '{}'::jsonb,
  input_snapshot jsonb not null default '{}'::jsonb,
  status_reason text not null default 'Initial draft',
  reviewed_by_user_id uuid references public.hris_users(id) on delete set null,
  reviewed_at timestamptz,
  approved_by_user_id uuid references public.hris_users(id) on delete set null,
  approved_at timestamptz,
  supersedes_interpretation_id uuid references public.payroll_attendance_interpretations(id) on delete restrict,
  created_by_user_id uuid references public.hris_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_attendance_interpretations_employee_schedule_fkey
    foreign key (employee_schedule_id, employee_id)
    references public.payroll_employee_schedules(id, employee_id)
    on delete restrict,
  constraint payroll_attendance_interpretations_id_employee_key unique (id, employee_id),
  constraint payroll_attendance_interpretations_version_check check (interpretation_version > 0),
  constraint payroll_attendance_interpretations_status_check check (
    record_status in ('draft', 'needs_review', 'resolved', 'approved', 'superseded', 'voided')
  ),
  constraint payroll_attendance_interpretations_source_check check (
    interpretation_source in ('system', 'manual_rebuild', 'correction')
  ),
  constraint payroll_attendance_interpretations_timezone_not_blank check (btrim(schedule_timezone) <> ''),
  constraint payroll_attendance_interpretations_scheduled_minutes_check check (
    scheduled_work_minutes >= 0 and scheduled_break_minutes >= 0
  ),
  constraint payroll_attendance_interpretations_scheduled_time_check check (
    (scheduled_start_at is null and scheduled_end_at is null)
    or (scheduled_start_at is not null and scheduled_end_at is not null and scheduled_end_at > scheduled_start_at)
  ),
  constraint payroll_attendance_interpretations_actual_time_check check (
    first_clock_in_at is null or last_clock_out_at is null or last_clock_out_at >= first_clock_in_at
  ),
  constraint payroll_attendance_interpretations_minutes_check check (
    actual_work_minutes >= 0
    and break_minutes >= 0
    and late_minutes >= 0
    and undertime_minutes >= 0
    and absence_minutes >= 0
    and absence_minutes <= scheduled_work_minutes
  ),
  constraint payroll_attendance_interpretations_absence_status_check check (
    absence_status in ('not_scheduled', 'present', 'partial', 'absent', 'needs_review')
  ),
  constraint payroll_attendance_interpretations_event_count_check check (source_event_count >= 0),
  constraint payroll_attendance_interpretations_snapshot_object_check check (
    jsonb_typeof(schedule_snapshot) = 'object'
    and jsonb_typeof(rule_snapshot) = 'object'
    and jsonb_typeof(input_snapshot) = 'object'
  ),
  constraint payroll_attendance_interpretations_reason_not_blank check (btrim(status_reason) <> ''),
  constraint payroll_attendance_interpretations_review_evidence_check check (
    record_status not in ('resolved', 'approved')
    or (reviewed_by_user_id is not null and reviewed_at is not null)
  ),
  constraint payroll_attendance_interpretations_approval_evidence_check check (
    record_status <> 'approved'
    or (
      approved_by_user_id is not null
      and approved_at is not null
      and reviewed_by_user_id is not null
      and reviewed_by_user_id <> approved_by_user_id
    )
  ),
  constraint payroll_attendance_interpretations_snapshot_evidence_check check (
    record_status = 'draft'
    or (
      schedule_snapshot <> '{}'::jsonb
      and rule_snapshot <> '{}'::jsonb
      and input_snapshot <> '{}'::jsonb
    )
  ),
  constraint payroll_attendance_interpretations_self_supersede_check check (
    supersedes_interpretation_id is null or supersedes_interpretation_id <> id
  )
);

create unique index if not exists payroll_attendance_interpretations_version_uidx
  on public.payroll_attendance_interpretations (employee_id, work_date, interpretation_version);
create unique index if not exists payroll_attendance_interpretations_one_current_uidx
  on public.payroll_attendance_interpretations (employee_id, work_date)
  where record_status in ('draft', 'needs_review', 'resolved', 'approved');
create index if not exists payroll_attendance_interpretations_employee_date_idx
  on public.payroll_attendance_interpretations (employee_id, work_date desc, record_status);
create index if not exists payroll_attendance_interpretations_schedule_date_idx
  on public.payroll_attendance_interpretations (employee_schedule_id, work_date);
create index if not exists payroll_attendance_interpretations_rule_date_idx
  on public.payroll_attendance_interpretations (attendance_rule_set_id, work_date);
create index if not exists payroll_attendance_interpretations_holiday_date_idx
  on public.payroll_attendance_interpretations (holiday_date_id)
  where holiday_date_id is not null;
create index if not exists payroll_attendance_interpretations_review_idx
  on public.payroll_attendance_interpretations (reviewed_by_user_id, reviewed_at desc)
  where reviewed_by_user_id is not null;
create index if not exists payroll_attendance_interpretations_approval_idx
  on public.payroll_attendance_interpretations (approved_by_user_id, approved_at desc)
  where approved_by_user_id is not null;

create table if not exists public.payroll_attendance_interpretation_inputs (
  id uuid primary key default gen_random_uuid(),
  attendance_interpretation_id uuid not null references public.payroll_attendance_interpretations(id) on delete restrict,
  raw_event_id uuid not null references public.payroll_raw_time_events(id) on delete restrict,
  event_sequence integer not null,
  event_role text not null,
  include_in_work_minutes boolean not null default false,
  include_in_break_minutes boolean not null default false,
  exclusion_reason text,
  created_at timestamptz not null default now(),
  constraint payroll_attendance_interpretation_inputs_sequence_check check (event_sequence > 0),
  constraint payroll_attendance_interpretation_inputs_role_check check (
    event_role in ('clock_in', 'clock_out', 'break_start', 'break_end', 'duplicate', 'ignored', 'other')
  ),
  constraint payroll_attendance_interpretation_inputs_inclusion_check check (
    event_role not in ('duplicate', 'ignored')
    or (not include_in_work_minutes and not include_in_break_minutes)
  ),
  constraint payroll_attendance_interpretation_inputs_exclusion_check check (
    (include_in_work_minutes and include_in_break_minutes = false)
    or include_in_work_minutes = false
    or exclusion_reason is null
  ),
  constraint payroll_attendance_interpretation_inputs_unique_event unique (
    attendance_interpretation_id, raw_event_id
  ),
  constraint payroll_attendance_interpretation_inputs_unique_sequence unique (
    attendance_interpretation_id, event_sequence
  )
);

create index if not exists payroll_attendance_interpretation_inputs_interpretation_idx
  on public.payroll_attendance_interpretation_inputs (attendance_interpretation_id, event_sequence);
create index if not exists payroll_attendance_interpretation_inputs_raw_event_idx
  on public.payroll_attendance_interpretation_inputs (raw_event_id);

create table if not exists public.payroll_attendance_exceptions (
  id uuid primary key default gen_random_uuid(),
  attendance_interpretation_id uuid,
  employee_id uuid not null references public.hris_users(id) on delete restrict,
  work_date date not null,
  raw_event_id uuid references public.payroll_raw_time_events(id) on delete restrict,
  exception_type text not null,
  severity text not null default 'blocking',
  status text not null default 'open',
  deduplication_key text not null,
  detection_source text not null default 'system',
  details text not null,
  evidence jsonb not null default '{}'::jsonb,
  requested_by_user_id uuid references public.hris_users(id) on delete set null,
  detected_at timestamptz not null default now(),
  acknowledged_by_user_id uuid references public.hris_users(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by_user_id uuid references public.hris_users(id) on delete set null,
  resolved_at timestamptz,
  resolution_code text,
  resolution_note text,
  resolution_document_ref text,
  resolution_approved_by_user_id uuid references public.hris_users(id) on delete set null,
  resolution_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_attendance_exceptions_interpretation_employee_fkey
    foreign key (attendance_interpretation_id, employee_id)
    references public.payroll_attendance_interpretations(id, employee_id)
    on delete restrict,
  constraint payroll_attendance_exceptions_raw_event_employee_check check (
    raw_event_id is not null or attendance_interpretation_id is not null or detection_source = 'system'
  ),
  constraint payroll_attendance_exceptions_type_check check (
    exception_type in (
      'no_schedule', 'missing_clock_in', 'missing_clock_out', 'unpaired_event',
      'duplicate_event', 'unresolved_identity', 'no_show', 'early_clock_in',
      'late_clock_out', 'invalid_timezone', 'location_review', 'outside_schedule',
      'late', 'undertime', 'break', 'manual_review', 'other'
    )
  ),
  constraint payroll_attendance_exceptions_severity_check check (
    severity in ('info', 'warning', 'blocking')
  ),
  constraint payroll_attendance_exceptions_status_check check (
    status in ('open', 'acknowledged', 'resolved', 'rejected', 'waived', 'reopened')
  ),
  constraint payroll_attendance_exceptions_key_not_blank check (btrim(deduplication_key) <> ''),
  constraint payroll_attendance_exceptions_source_check check (
    detection_source in ('system', 'import', 'employee', 'manager', 'hr', 'finance')
  ),
  constraint payroll_attendance_exceptions_details_not_blank check (btrim(details) <> ''),
  constraint payroll_attendance_exceptions_evidence_object_check check (
    jsonb_typeof(evidence) = 'object'
  ),
  constraint payroll_attendance_exceptions_requester_check check (
    requested_by_user_id is not null or detection_source = 'system'
  ),
  constraint payroll_attendance_exceptions_acknowledgment_evidence_check check (
    status <> 'acknowledged'
    or (acknowledged_by_user_id is not null and acknowledged_at is not null)
  ),
  constraint payroll_attendance_exceptions_resolution_evidence_check check (
    status not in ('resolved', 'rejected', 'waived')
    or (
      resolved_by_user_id is not null
      and resolved_at is not null
      and nullif(btrim(resolution_note), '') is not null
    )
  ),
  constraint payroll_attendance_exceptions_waiver_approval_check check (
    status <> 'waived'
    or (resolution_approved_by_user_id is not null and resolution_approved_at is not null)
  ),
  constraint payroll_attendance_exceptions_maker_checker_check check (
    resolution_approved_by_user_id is null
    or (
      (resolved_by_user_id is null or resolution_approved_by_user_id <> resolved_by_user_id)
      and (requested_by_user_id is null or resolution_approved_by_user_id <> requested_by_user_id)
    )
  )
);

create unique index if not exists payroll_attendance_exceptions_open_uidx
  on public.payroll_attendance_exceptions (
    employee_id,
    work_date,
    exception_type,
    deduplication_key,
    coalesce(attendance_interpretation_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status in ('open', 'acknowledged', 'reopened');
create index if not exists payroll_attendance_exceptions_employee_date_idx
  on public.payroll_attendance_exceptions (employee_id, work_date desc, status);
create index if not exists payroll_attendance_exceptions_interpretation_idx
  on public.payroll_attendance_exceptions (attendance_interpretation_id, status)
  where attendance_interpretation_id is not null;
create index if not exists payroll_attendance_exceptions_raw_event_idx
  on public.payroll_attendance_exceptions (raw_event_id)
  where raw_event_id is not null;
create index if not exists payroll_attendance_exceptions_open_queue_idx
  on public.payroll_attendance_exceptions (severity, detected_at desc)
  where status in ('open', 'acknowledged', 'reopened');
create index if not exists payroll_attendance_exceptions_requested_by_idx
  on public.payroll_attendance_exceptions (requested_by_user_id)
  where requested_by_user_id is not null;
create index if not exists payroll_attendance_exceptions_resolved_by_idx
  on public.payroll_attendance_exceptions (resolved_by_user_id, resolved_at desc)
  where resolved_by_user_id is not null;

create or replace function private.guard_payroll_attendance_rule_set()
returns trigger language plpgsql set search_path = '' as $phase1g$
declare
  group_entity uuid;
  group_business_unit uuid;
  referenced boolean;
begin
  if tg_op = 'INSERT' and new.approval_status <> 'draft' then
    raise exception 'A new attendance rule set must begin in draft status.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    if new.approval_status is distinct from old.approval_status and not (
      (old.approval_status = 'draft' and new.approval_status in ('approved', 'archived'))
      or (old.approval_status = 'approved' and new.approval_status in ('active', 'superseded', 'archived'))
      or (old.approval_status = 'active' and new.approval_status in ('superseded', 'archived'))
      or (old.approval_status = 'superseded' and new.approval_status = 'archived')
    ) then
      raise exception 'Invalid attendance-rule status transition: % -> %.', old.approval_status, new.approval_status
        using errcode = '22023';
    end if;

    if new.approval_status in ('superseded', 'archived') then
      new.is_active := false;
    end if;

    select exists (
      select 1 from public.payroll_attendance_interpretations
      where attendance_rule_set_id = old.id
    ) into referenced;

    if referenced and (
      new.rule_code is distinct from old.rule_code
      or new.rule_name is distinct from old.rule_name
      or new.description is distinct from old.description
      or new.timezone is distinct from old.timezone
      or new.legal_entity_id is distinct from old.legal_entity_id
      or new.payroll_group_id is distinct from old.payroll_group_id
      or new.business_unit_id is distinct from old.business_unit_id
      or new.site_id is distinct from old.site_id
      or new.effective_start_date is distinct from old.effective_start_date
      or new.effective_end_date is distinct from old.effective_end_date
      or new.version is distinct from old.version
      or new.grace_period_minutes is distinct from old.grace_period_minutes
      or new.no_show_buffer_minutes is distinct from old.no_show_buffer_minutes
      or new.meal_break_minutes is distinct from old.meal_break_minutes
      or new.meal_break_policy is distinct from old.meal_break_policy
      or new.rounding_policy is distinct from old.rounding_policy
      or new.early_clock_in_policy is distinct from old.early_clock_in_policy
      or new.late_clock_out_policy is distinct from old.late_clock_out_policy
      or new.missing_punch_policy is distinct from old.missing_punch_policy
    ) then
      raise exception 'An attendance rule set used by an interpretation is immutable; create a new version instead.'
        using errcode = '55000';
    end if;
  end if;

  if new.payroll_group_id is not null then
    select pg.legal_entity_id, pg.business_unit_id
      into group_entity, group_business_unit
    from public.payroll_groups pg
    where pg.id = new.payroll_group_id;
    if not found then
      raise exception 'The attendance rule set payroll group does not exist.' using errcode = '23503';
    end if;
    if new.legal_entity_id is distinct from group_entity then
      raise exception 'The attendance rule set payroll group must match its legal entity.' using errcode = '22023';
    end if;
    if new.business_unit_id is not null and group_business_unit is not null
       and new.business_unit_id is distinct from group_business_unit then
      raise exception 'The attendance rule set business unit must match its payroll group.' using errcode = '22023';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format(
        'payroll-attendance-rule:%s:%s:%s:%s',
        coalesce(new.legal_entity_id::text, 'global'),
        coalesce(new.payroll_group_id::text, 'global'),
        coalesce(new.business_unit_id::text, 'global'),
        pg_catalog.lower(new.rule_code)
      ),
      0
    )
  );

  if new.approval_status in ('draft', 'approved', 'active') and exists (
    select 1
    from public.payroll_attendance_rule_sets existing
    where existing.id <> new.id
      and pg_catalog.lower(existing.rule_code) = pg_catalog.lower(new.rule_code)
      and existing.legal_entity_id is not distinct from new.legal_entity_id
      and existing.payroll_group_id is not distinct from new.payroll_group_id
      and existing.business_unit_id is not distinct from new.business_unit_id
      and existing.site_id is not distinct from new.site_id
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
    raise exception 'Attendance rule sets with the same scope cannot overlap.' using errcode = '23P01';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$phase1g$;

create or replace function private.prevent_payroll_attendance_rule_set_delete()
returns trigger language plpgsql set search_path = '' as $phase1g$
begin
  raise exception 'Attendance rule sets are append-only; archive or supersede the rule set instead of deleting it.'
    using errcode = '55000';
end;
$phase1g$;

create or replace function private.guard_payroll_attendance_interpretation()
returns trigger language plpgsql set search_path = '' as $phase1g$
declare
  rule_status text;
  rule_start date;
  rule_end date;
  schedule_employee_id uuid;
  schedule_date date;
  schedule_status text;
  holiday_date date;
  holiday_status text;
  prior_employee_id uuid;
  prior_work_date date;
  prior_version integer;
  has_blocking_exception boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format('payroll-attendance-interpretation:%s:%s', new.employee_id, new.work_date),
      0
    )
  );

  if tg_op = 'INSERT' then
    if new.record_status <> 'draft' then
      raise exception 'A new attendance interpretation must begin in draft status.' using errcode = '22023';
    end if;
    if new.supersedes_interpretation_id is not null then
      select employee_id, work_date, interpretation_version
        into prior_employee_id, prior_work_date, prior_version
      from public.payroll_attendance_interpretations
      where id = new.supersedes_interpretation_id;
      if not found then
        raise exception 'The superseded attendance interpretation does not exist.' using errcode = '23503';
      end if;
      if prior_employee_id is distinct from new.employee_id or prior_work_date is distinct from new.work_date then
        raise exception 'An interpretation can supersede only the same employee and work date.' using errcode = '22023';
      end if;
      if new.interpretation_version <= prior_version then
        raise exception 'A superseding interpretation must have a higher version.' using errcode = '22023';
      end if;
    end if;
  else
    if new.record_status is distinct from old.record_status and not (
      (old.record_status = 'draft' and new.record_status in ('needs_review', 'voided'))
      or (old.record_status = 'needs_review' and new.record_status in ('resolved', 'voided'))
      or (old.record_status = 'resolved' and new.record_status in ('approved', 'superseded', 'voided'))
      or (old.record_status = 'approved' and new.record_status in ('superseded', 'voided'))
      or (old.record_status = 'superseded' and new.record_status = 'voided')
    ) then
      raise exception 'Invalid attendance-interpretation status transition: % -> %.', old.record_status, new.record_status
        using errcode = '22023';
    end if;

    if old.record_status <> 'draft' and (
      new.employee_id is distinct from old.employee_id
      or new.work_date is distinct from old.work_date
      or new.employee_schedule_id is distinct from old.employee_schedule_id
      or new.attendance_rule_set_id is distinct from old.attendance_rule_set_id
      or new.holiday_date_id is distinct from old.holiday_date_id
      or new.interpretation_version is distinct from old.interpretation_version
      or new.interpretation_source is distinct from old.interpretation_source
      or new.schedule_timezone is distinct from old.schedule_timezone
      or new.scheduled_start_at is distinct from old.scheduled_start_at
      or new.scheduled_end_at is distinct from old.scheduled_end_at
      or new.scheduled_work_minutes is distinct from old.scheduled_work_minutes
      or new.scheduled_break_minutes is distinct from old.scheduled_break_minutes
      or new.first_clock_in_at is distinct from old.first_clock_in_at
      or new.last_clock_out_at is distinct from old.last_clock_out_at
      or new.actual_work_minutes is distinct from old.actual_work_minutes
      or new.break_minutes is distinct from old.break_minutes
      or new.late_minutes is distinct from old.late_minutes
      or new.undertime_minutes is distinct from old.undertime_minutes
      or new.absence_minutes is distinct from old.absence_minutes
      or new.absence_status is distinct from old.absence_status
      or new.missing_clock_in is distinct from old.missing_clock_in
      or new.missing_clock_out is distinct from old.missing_clock_out
      or new.source_event_count is distinct from old.source_event_count
      or new.schedule_snapshot is distinct from old.schedule_snapshot
      or new.rule_snapshot is distinct from old.rule_snapshot
      or new.input_snapshot is distinct from old.input_snapshot
      or new.supersedes_interpretation_id is distinct from old.supersedes_interpretation_id
    ) then
      raise exception 'A non-draft attendance interpretation is immutable; create a correction version instead.'
        using errcode = '55000';
    end if;
  end if;

  select approval_status, effective_start_date, effective_end_date
    into rule_status, rule_start, rule_end
  from public.payroll_attendance_rule_sets
  where id = new.attendance_rule_set_id;
  if not found then
    raise exception 'The attendance interpretation rule set does not exist.' using errcode = '23503';
  end if;
  if rule_status not in ('approved', 'active') then
    raise exception 'Attendance interpretation requires an approved or active rule set.' using errcode = '55000';
  end if;
  if new.work_date < rule_start or (rule_end is not null and new.work_date >= rule_end) then
    raise exception 'The attendance rule set is not effective for the interpretation date.' using errcode = '22023';
  end if;

  if new.employee_schedule_id is not null then
    select employee_id, shift_date, record_status
      into schedule_employee_id, schedule_date, schedule_status
    from public.payroll_employee_schedules
    where id = new.employee_schedule_id;
    if not found then
      raise exception 'The attendance interpretation schedule does not exist.' using errcode = '23503';
    end if;
    if schedule_employee_id is distinct from new.employee_id or schedule_date is distinct from new.work_date then
      raise exception 'The attendance interpretation schedule must match the employee and work date.' using errcode = '22023';
    end if;
    if schedule_status not in ('approved', 'active') then
      raise exception 'Attendance interpretation requires an approved or active schedule.' using errcode = '55000';
    end if;
  end if;

  if new.holiday_date_id is not null then
    select hd.holiday_date, hc.approval_status
      into holiday_date, holiday_status
    from public.payroll_holiday_dates hd
    join public.payroll_holiday_calendars hc on hc.id = hd.holiday_calendar_id
    where hd.id = new.holiday_date_id;
    if not found then
      raise exception 'The attendance interpretation holiday date does not exist.' using errcode = '23503';
    end if;
    if holiday_date is distinct from new.work_date then
      raise exception 'The holiday date must match the attendance work date.' using errcode = '22023';
    end if;
    if holiday_status not in ('approved', 'active') then
      raise exception 'Attendance interpretation requires an approved or active holiday calendar.' using errcode = '55000';
    end if;
  end if;

  if new.record_status in ('needs_review', 'resolved', 'approved')
     and (new.schedule_snapshot = '{}'::jsonb or new.rule_snapshot = '{}'::jsonb or new.input_snapshot = '{}'::jsonb) then
    raise exception 'A calculated attendance interpretation must retain schedule, rule, and input snapshots.' using errcode = '22023';
  end if;

  if new.record_status in ('resolved', 'approved') then
    select exists (
      select 1
      from public.payroll_attendance_exceptions ae
      where ae.attendance_interpretation_id = new.id
        and ae.severity = 'blocking'
        and ae.status in ('open', 'acknowledged', 'reopened')
    ) into has_blocking_exception;
    if has_blocking_exception then
      raise exception 'Blocking attendance exceptions must be resolved before the interpretation can be finalized.'
        using errcode = '55000';
    end if;
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$phase1g$;

create or replace function private.guard_payroll_attendance_interpretation_input()
returns trigger language plpgsql set search_path = '' as $phase1g$
declare
  interpretation_employee_id uuid;
  interpretation_status text;
  raw_employee_id uuid;
  raw_status text;
begin
  select employee_id, record_status
    into interpretation_employee_id, interpretation_status
  from public.payroll_attendance_interpretations
  where id = coalesce(new.attendance_interpretation_id, old.attendance_interpretation_id);
  if not found then
    raise exception 'The attendance interpretation does not exist.' using errcode = '23503';
  end if;

  if tg_op = 'DELETE' then
    if interpretation_status <> 'draft' then
      raise exception 'Inputs for a non-draft attendance interpretation cannot be deleted.' using errcode = '55000';
    end if;
    return old;
  end if;

  if interpretation_status <> 'draft' and tg_op = 'UPDATE' then
    raise exception 'Inputs for a non-draft attendance interpretation are immutable.' using errcode = '55000';
  end if;

  select employee_id, event_status
    into raw_employee_id, raw_status
  from public.payroll_raw_time_events
  where id = new.raw_event_id;
  if not found then
    raise exception 'The referenced raw time event does not exist.' using errcode = '23503';
  end if;
  if raw_employee_id is null or raw_employee_id is distinct from interpretation_employee_id then
    raise exception 'An attendance interpretation input must reference a resolved event for the same employee.'
      using errcode = '22023';
  end if;
  if raw_status <> 'received' then
    raise exception 'Only received, non-duplicate raw events may be linked as attendance inputs.' using errcode = '55000';
  end if;

  return new;
end;
$phase1g$;

create or replace function private.guard_payroll_attendance_exception()
returns trigger language plpgsql set search_path = '' as $phase1g$
declare
  interpretation_employee_id uuid;
  interpretation_work_date date;
  raw_employee_id uuid;
begin
  if tg_op = 'INSERT' and new.status <> 'open' then
    raise exception 'A new attendance exception must begin in open status.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status and not (
      (old.status = 'open' and new.status in ('acknowledged', 'resolved', 'rejected', 'waived'))
      or (old.status = 'acknowledged' and new.status in ('open', 'resolved', 'rejected', 'waived'))
      or (old.status in ('resolved', 'rejected', 'waived') and new.status = 'reopened')
      or (old.status = 'reopened' and new.status in ('acknowledged', 'resolved', 'rejected', 'waived'))
    ) then
      raise exception 'Invalid attendance-exception status transition: % -> %.', old.status, new.status
        using errcode = '22023';
    end if;

    if new.attendance_interpretation_id is distinct from old.attendance_interpretation_id
       or new.employee_id is distinct from old.employee_id
       or new.work_date is distinct from old.work_date
       or new.raw_event_id is distinct from old.raw_event_id
       or new.exception_type is distinct from old.exception_type
       or new.severity is distinct from old.severity
       or new.deduplication_key is distinct from old.deduplication_key
       or new.detection_source is distinct from old.detection_source
       or new.details is distinct from old.details
       or new.evidence is distinct from old.evidence
       or new.requested_by_user_id is distinct from old.requested_by_user_id
       or new.detected_at is distinct from old.detected_at then
      raise exception 'Attendance exception evidence is immutable; create a new exception or reopen it.'
        using errcode = '55000';
    end if;
  end if;

  if new.attendance_interpretation_id is not null then
    select employee_id, work_date
      into interpretation_employee_id, interpretation_work_date
    from public.payroll_attendance_interpretations
    where id = new.attendance_interpretation_id;
    if not found then
      raise exception 'The attendance exception interpretation does not exist.' using errcode = '23503';
    end if;
    if interpretation_employee_id is distinct from new.employee_id
       or interpretation_work_date is distinct from new.work_date then
      raise exception 'The attendance exception must match its interpretation employee and date.' using errcode = '22023';
    end if;
  end if;

  if new.raw_event_id is not null then
    select employee_id into raw_employee_id
    from public.payroll_raw_time_events
    where id = new.raw_event_id;
    if not found then
      raise exception 'The attendance exception raw event does not exist.' using errcode = '23503';
    end if;
    if raw_employee_id is not null and raw_employee_id is distinct from new.employee_id then
      raise exception 'The attendance exception raw event must match the employee.' using errcode = '22023';
    end if;
  end if;

  if new.status = 'waived' and new.resolution_approved_by_user_id is null then
    raise exception 'Waiving an attendance exception requires a separate approver.' using errcode = '22023';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$phase1g$;

create or replace function private.prevent_payroll_attendance_exception_delete()
returns trigger language plpgsql set search_path = '' as $phase1g$
begin
  raise exception 'Attendance exceptions are append-only; resolve, reject, waive, or reopen the exception instead of deleting it.'
    using errcode = '55000';
end;
$phase1g$;

drop trigger if exists payroll_attendance_rule_sets_guard on public.payroll_attendance_rule_sets;
create trigger payroll_attendance_rule_sets_guard
before insert or update on public.payroll_attendance_rule_sets
for each row execute function private.guard_payroll_attendance_rule_set();
drop trigger if exists payroll_attendance_rule_sets_delete_guard on public.payroll_attendance_rule_sets;
create trigger payroll_attendance_rule_sets_delete_guard
before delete on public.payroll_attendance_rule_sets
for each row execute function private.prevent_payroll_attendance_rule_set_delete();

drop trigger if exists payroll_attendance_interpretations_guard on public.payroll_attendance_interpretations;
create trigger payroll_attendance_interpretations_guard
before insert or update on public.payroll_attendance_interpretations
for each row execute function private.guard_payroll_attendance_interpretation();

drop trigger if exists payroll_attendance_interpretation_inputs_guard on public.payroll_attendance_interpretation_inputs;
create trigger payroll_attendance_interpretation_inputs_guard
before insert or update or delete on public.payroll_attendance_interpretation_inputs
for each row execute function private.guard_payroll_attendance_interpretation_input();

drop trigger if exists payroll_attendance_exceptions_guard on public.payroll_attendance_exceptions;
create trigger payroll_attendance_exceptions_guard
before insert or update on public.payroll_attendance_exceptions
for each row execute function private.guard_payroll_attendance_exception();
drop trigger if exists payroll_attendance_exceptions_delete_guard on public.payroll_attendance_exceptions;
create trigger payroll_attendance_exceptions_delete_guard
before delete on public.payroll_attendance_exceptions
for each row execute function private.prevent_payroll_attendance_exception_delete();

alter table public.payroll_attendance_rule_sets enable row level security;
alter table public.payroll_attendance_interpretations enable row level security;
alter table public.payroll_attendance_interpretation_inputs enable row level security;
alter table public.payroll_attendance_exceptions enable row level security;

drop policy if exists payroll_attendance_rule_sets_authorized_read on public.payroll_attendance_rule_sets;
create policy payroll_attendance_rule_sets_authorized_read
on public.payroll_attendance_rule_sets
for select to authenticated
using (private.payroll_configuration_access());
drop policy if exists payroll_attendance_interpretations_authorized_read on public.payroll_attendance_interpretations;
create policy payroll_attendance_interpretations_authorized_read
on public.payroll_attendance_interpretations
for select to authenticated
using (private.payroll_time_data_access());
drop policy if exists payroll_attendance_interpretation_inputs_authorized_read on public.payroll_attendance_interpretation_inputs;
create policy payroll_attendance_interpretation_inputs_authorized_read
on public.payroll_attendance_interpretation_inputs
for select to authenticated
using (private.payroll_time_data_access());
drop policy if exists payroll_attendance_exceptions_authorized_read on public.payroll_attendance_exceptions;
create policy payroll_attendance_exceptions_authorized_read
on public.payroll_attendance_exceptions
for select to authenticated
using (private.payroll_time_data_access());

revoke all on table
  public.payroll_attendance_rule_sets,
  public.payroll_attendance_interpretations,
  public.payroll_attendance_interpretation_inputs,
  public.payroll_attendance_exceptions
from public, anon, authenticated;
grant select on table
  public.payroll_attendance_rule_sets,
  public.payroll_attendance_interpretations,
  public.payroll_attendance_interpretation_inputs,
  public.payroll_attendance_exceptions
to authenticated;
grant all on table
  public.payroll_attendance_rule_sets,
  public.payroll_attendance_interpretations,
  public.payroll_attendance_interpretation_inputs,
  public.payroll_attendance_exceptions
to service_role;

revoke all on function private.guard_payroll_attendance_rule_set() from public, anon, authenticated;
revoke all on function private.prevent_payroll_attendance_rule_set_delete() from public, anon, authenticated;
revoke all on function private.guard_payroll_attendance_interpretation() from public, anon, authenticated;
revoke all on function private.guard_payroll_attendance_interpretation_input() from public, anon, authenticated;
revoke all on function private.guard_payroll_attendance_exception() from public, anon, authenticated;
revoke all on function private.prevent_payroll_attendance_exception_delete() from public, anon, authenticated;

comment on table public.payroll_attendance_rule_sets is
  'Effective-dated, approval-controlled attendance interpretation policies. No grace, break, rounding, or no-show policy is hardcoded in the engine.';
comment on table public.payroll_attendance_interpretations is
  'Versioned derived attendance result. Preserve source snapshots and create a correction version instead of rewriting finalized interpretations.';
comment on table public.payroll_attendance_interpretation_inputs is
  'Links a derived attendance interpretation to the raw time events used, ignored, or classified as duplicates.';
comment on table public.payroll_attendance_exceptions is
  'Versioned exception workflow for attendance review. Open blocking exceptions prevent interpretation finalization.';
