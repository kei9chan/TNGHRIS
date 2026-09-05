-- Phase 1J: missing-punch and no-show correction requests.
-- Corrections append new manual raw events and rebuild a new interpretation.
-- Original raw events, interpretations, and exception evidence remain immutable.

create table if not exists public.payroll_attendance_correction_requests (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid not null references public.payroll_attendance_exceptions(id) on delete restrict,
  attendance_interpretation_id uuid not null,
  employee_id uuid not null references public.hris_users(id) on delete restrict,
  work_date date not null,
  requested_by_user_id uuid not null references public.hris_users(id) on delete restrict,
  requested_clock_in_at timestamptz,
  requested_clock_out_at timestamptz,
  reason text not null,
  source_document_ref text,
  source_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'pending_review',
  reviewed_by_user_id uuid references public.hris_users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  applied_interpretation_id uuid references public.payroll_attendance_interpretations(id) on delete restrict,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_attendance_correction_requests_interpretation_employee_fkey
    foreign key (attendance_interpretation_id, employee_id)
    references public.payroll_attendance_interpretations(id, employee_id)
    on delete restrict,
  constraint payroll_attendance_correction_requests_punch_check check (
    requested_clock_in_at is not null or requested_clock_out_at is not null
  ),
  constraint payroll_attendance_correction_requests_order_check check (
    requested_clock_in_at is null
    or requested_clock_out_at is null
    or requested_clock_out_at > requested_clock_in_at
  ),
  constraint payroll_attendance_correction_requests_reason_check check (
    nullif(btrim(reason), '') is not null
  ),
  constraint payroll_attendance_correction_requests_snapshot_check check (
    jsonb_typeof(source_snapshot) = 'object'
  ),
  constraint payroll_attendance_correction_requests_status_check check (
    status in ('pending_review', 'approved', 'rejected', 'cancelled', 'applied')
  ),
  constraint payroll_attendance_correction_requests_review_evidence_check check (
    status = 'pending_review'
    or (reviewed_by_user_id is not null and reviewed_at is not null)
  ),
  constraint payroll_attendance_correction_requests_applied_evidence_check check (
    status <> 'applied'
    or (applied_interpretation_id is not null and applied_at is not null)
  )
);

create index if not exists payroll_attendance_correction_requests_employee_date_idx
  on public.payroll_attendance_correction_requests (employee_id, work_date, status);
create index if not exists payroll_attendance_correction_requests_exception_idx
  on public.payroll_attendance_correction_requests (exception_id, created_at desc);
create index if not exists payroll_attendance_correction_requests_status_idx
  on public.payroll_attendance_correction_requests (status, created_at desc);
create unique index if not exists payroll_attendance_correction_requests_pending_exception_uidx
  on public.payroll_attendance_correction_requests (exception_id)
  where status = 'pending_review';

create table if not exists public.payroll_attendance_correction_request_actions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.payroll_attendance_correction_requests(id) on delete restrict,
  employee_id uuid not null references public.hris_users(id) on delete restrict,
  work_date date not null,
  action_code text not null,
  previous_status text not null,
  new_status text not null,
  note text,
  actor_user_id uuid not null references public.hris_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payroll_attendance_correction_request_actions_action_check check (
    action_code in ('submit', 'approve', 'reject', 'cancel', 'apply')
  ),
  constraint payroll_attendance_correction_request_actions_status_check check (
    previous_status in ('pending_review', 'approved', 'rejected', 'cancelled', 'applied')
    and new_status in ('pending_review', 'approved', 'rejected', 'cancelled', 'applied')
  )
);

create index if not exists payroll_attendance_correction_request_actions_request_idx
  on public.payroll_attendance_correction_request_actions (request_id, created_at desc);
create index if not exists payroll_attendance_correction_request_actions_employee_date_idx
  on public.payroll_attendance_correction_request_actions (employee_id, work_date, created_at desc);

create or replace function private.prevent_payroll_attendance_correction_request_action_mutation()
returns trigger
language plpgsql
set search_path = ''
as $phase1j$
begin
  raise exception 'Attendance correction request history is append-only.' using errcode = '55000';
end;
$phase1j$;

drop trigger if exists payroll_attendance_correction_request_actions_mutation_guard
  on public.payroll_attendance_correction_request_actions;
create trigger payroll_attendance_correction_request_actions_mutation_guard
before update or delete on public.payroll_attendance_correction_request_actions
for each row execute function private.prevent_payroll_attendance_correction_request_action_mutation();

create or replace function private.guard_payroll_attendance_correction_request()
returns trigger
language plpgsql
set search_path = ''
as $phase1j$
declare
  exception_employee_id uuid;
  exception_work_date date;
  exception_interpretation_id uuid;
begin
  select ae.employee_id, ae.work_date, ae.attendance_interpretation_id
    into exception_employee_id, exception_work_date, exception_interpretation_id
  from public.payroll_attendance_exceptions ae
  where ae.id = new.exception_id;

  if not found then
    raise exception 'The attendance exception for this correction request does not exist.' using errcode = '23503';
  end if;

  if exception_interpretation_id is null
     or exception_interpretation_id is distinct from new.attendance_interpretation_id
     or exception_employee_id is distinct from new.employee_id
     or exception_work_date is distinct from new.work_date then
    raise exception 'The correction request must match its attendance exception.' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending_review' then
      raise exception 'A new attendance correction request must begin in pending_review status.' using errcode = '22023';
    end if;
    if new.reviewed_by_user_id is not null or new.reviewed_at is not null
       or new.applied_interpretation_id is not null or new.applied_at is not null then
      raise exception 'A new attendance correction request cannot contain review or application evidence.' using errcode = '22023';
    end if;
  else
    if new.exception_id is distinct from old.exception_id
       or new.attendance_interpretation_id is distinct from old.attendance_interpretation_id
       or new.employee_id is distinct from old.employee_id
       or new.work_date is distinct from old.work_date
       or new.requested_by_user_id is distinct from old.requested_by_user_id
       or new.requested_clock_in_at is distinct from old.requested_clock_in_at
       or new.requested_clock_out_at is distinct from old.requested_clock_out_at
       or new.reason is distinct from old.reason
       or new.source_document_ref is distinct from old.source_document_ref
       or new.source_snapshot is distinct from old.source_snapshot then
      raise exception 'Submitted attendance correction evidence is immutable.' using errcode = '55000';
    end if;

    if new.status is distinct from old.status and not (
      (old.status = 'pending_review' and new.status in ('approved', 'rejected', 'cancelled'))
      or (old.status = 'approved' and new.status = 'applied')
    ) then
      raise exception 'Invalid attendance correction status transition: % -> %.', old.status, new.status
        using errcode = '22023';
    end if;

    if old.status <> 'pending_review' and (
      new.reviewed_by_user_id is distinct from old.reviewed_by_user_id
      or new.reviewed_at is distinct from old.reviewed_at
      or new.review_note is distinct from old.review_note
    ) then
      raise exception 'Review evidence is immutable after the correction request is reviewed.' using errcode = '55000';
    end if;
  end if;

  if new.status = 'pending_review' and (
    new.reviewed_by_user_id is not null or new.reviewed_at is not null
    or new.applied_interpretation_id is not null or new.applied_at is not null
  ) then
    raise exception 'A pending attendance correction cannot contain review or application evidence.' using errcode = '22023';
  end if;

  if new.status <> 'pending_review'
     and (new.reviewed_by_user_id is null or new.reviewed_at is null) then
    raise exception 'A reviewed attendance correction must retain reviewer and review time.' using errcode = '22023';
  end if;

  if new.status = 'applied'
     and (new.applied_interpretation_id is null or new.applied_at is null) then
    raise exception 'An applied attendance correction must retain its new interpretation.' using errcode = '22023';
  end if;

  if new.status <> 'applied'
     and (new.applied_interpretation_id is not null or new.applied_at is not null) then
    raise exception 'Only an applied attendance correction may contain application evidence.' using errcode = '22023';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$phase1j$;

drop trigger if exists payroll_attendance_correction_requests_guard
  on public.payroll_attendance_correction_requests;
create trigger payroll_attendance_correction_requests_guard
before insert or update on public.payroll_attendance_correction_requests
for each row execute function private.guard_payroll_attendance_correction_request();

-- Mark interpretations created by the correction RPC as correction versions
-- without duplicating the Phase 1H calculation engine. The local transaction
-- settings are set only by the trusted correction function below.
create or replace function private.mark_payroll_attendance_correction_source()
returns trigger
language plpgsql
set search_path = ''
as $phase1j$
declare
  v_source text;
  v_request_id uuid;
  v_supersedes_id uuid;
  v_prior public.payroll_attendance_interpretations%rowtype;
begin
  v_source := pg_catalog.current_setting('payroll.attendance_correction_source', true);
  if tg_op = 'INSERT' and v_source = 'correction' then
    v_request_id := nullif(pg_catalog.current_setting('payroll.attendance_correction_request_id', true), '')::uuid;
    v_supersedes_id := nullif(pg_catalog.current_setting('payroll.attendance_correction_supersedes_id', true), '')::uuid;

    if v_supersedes_id is not null then
      select * into v_prior
      from public.payroll_attendance_interpretations i
      where i.id = v_supersedes_id
      for update;
      if not found then
        raise exception 'The attendance interpretation to supersede was not found.' using errcode = '23503';
      end if;
      if v_prior.employee_id is distinct from new.employee_id
         or v_prior.work_date is distinct from new.work_date
         or v_prior.record_status <> 'voided' then
        raise exception 'A correction may supersede only the voided interpretation for the same employee and date.' using errcode = '22023';
      end if;
      new.supersedes_interpretation_id := v_supersedes_id;
    end if;

    new.interpretation_source := 'correction';
    new.input_snapshot := new.input_snapshot || pg_catalog.jsonb_build_object(
      'correction_request_id', v_request_id,
      'correction_supersedes_interpretation_id', new.supersedes_interpretation_id
    );
  end if;
  return new;
end;
$phase1j$;

drop trigger if exists aaa_payroll_attendance_correction_source
  on public.payroll_attendance_interpretations;
create trigger aaa_payroll_attendance_correction_source
before insert on public.payroll_attendance_interpretations
for each row execute function private.mark_payroll_attendance_correction_source();

create or replace function public.submit_payroll_attendance_correction_request(
  p_exception_id uuid,
  p_clock_in_at timestamptz default null,
  p_clock_out_at timestamptz default null,
  p_reason text default null,
  p_source_document_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $phase1j$
declare
  v_actor_id uuid;
  v_has_payroll_access boolean;
  v_is_direct_manager boolean;
  v_exception public.payroll_attendance_exceptions%rowtype;
  v_interpretation public.payroll_attendance_interpretations%rowtype;
  v_request public.payroll_attendance_correction_requests%rowtype;
  v_action_id uuid;
  v_reason text;
  v_source_document_ref text;
  v_existing_request uuid;
begin
  if auth.uid() is null then
    raise exception 'An authenticated user is required to submit an attendance correction.' using errcode = '42501';
  end if;

  v_actor_id := public.current_hris_user_id();
  if v_actor_id is null then
    raise exception 'The authenticated user is not linked to an active HRIS user.' using errcode = '42501';
  end if;

  v_reason := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_source_document_ref := nullif(pg_catalog.btrim(coalesce(p_source_document_ref, '')), '');
  if v_reason is null then
    raise exception 'A correction reason is required.' using errcode = '22023';
  end if;
  if p_clock_in_at is null and p_clock_out_at is null then
    raise exception 'At least one corrected punch is required.' using errcode = '22023';
  end if;
  if p_clock_in_at is not null and p_clock_out_at is not null and p_clock_out_at <= p_clock_in_at then
    raise exception 'The corrected clock-out must be after the corrected clock-in.' using errcode = '22023';
  end if;

  select * into v_exception
  from public.payroll_attendance_exceptions ae
  where ae.id = p_exception_id
  for update;
  if not found then
    raise exception 'Attendance exception not found.' using errcode = 'P0002';
  end if;
  if v_exception.exception_type not in ('missing_clock_in', 'missing_clock_out', 'no_show') then
    raise exception 'This exception type does not accept a missing-punch correction.' using errcode = '22023';
  end if;
  if v_exception.status not in ('open', 'acknowledged', 'reopened') then
    raise exception 'Only open, acknowledged, or reopened exceptions can receive a correction request.' using errcode = '55000';
  end if;
  if v_exception.attendance_interpretation_id is null then
    raise exception 'The exception has no attendance interpretation to correct.' using errcode = '22023';
  end if;

  if v_exception.exception_type = 'missing_clock_in' and p_clock_in_at is null then
    raise exception 'A missing clock-in correction must include a clock-in time.' using errcode = '22023';
  end if;
  if v_exception.exception_type = 'missing_clock_out' and p_clock_out_at is null then
    raise exception 'A missing clock-out correction must include a clock-out time.' using errcode = '22023';
  end if;
  if v_exception.exception_type = 'no_show'
     and (p_clock_in_at is null or p_clock_out_at is null) then
    raise exception 'A no-show correction must include both clock-in and clock-out times.' using errcode = '22023';
  end if;

  select * into v_interpretation
  from public.payroll_attendance_interpretations i
  where i.id = v_exception.attendance_interpretation_id
  for update;
  if not found then
    raise exception 'The attendance interpretation to correct was not found.' using errcode = 'P0002';
  end if;
  if v_interpretation.record_status not in ('draft', 'needs_review') then
    raise exception 'Only draft or needs_review attendance interpretations can be corrected.' using errcode = '55000';
  end if;

  if v_interpretation.scheduled_start_at is not null then
    if p_clock_in_at is not null and (
      p_clock_in_at < v_interpretation.scheduled_start_at - interval '6 hours'
      or p_clock_in_at > v_interpretation.scheduled_end_at + interval '6 hours'
    ) then
      raise exception 'The corrected clock-in is outside the scheduled attendance window.' using errcode = '22023';
    end if;
    if p_clock_out_at is not null and (
      p_clock_out_at < v_interpretation.scheduled_start_at - interval '6 hours'
      or p_clock_out_at > v_interpretation.scheduled_end_at + interval '6 hours'
    ) then
      raise exception 'The corrected clock-out is outside the scheduled attendance window.' using errcode = '22023';
    end if;
  end if;

  v_has_payroll_access := private.payroll_time_data_access();
  v_is_direct_manager := private.is_direct_reporting_manager(v_actor_id, v_exception.employee_id);
  if not v_has_payroll_access
     and not v_is_direct_manager
     and v_actor_id is distinct from v_exception.employee_id then
    raise exception 'You are not authorized to submit this attendance correction.' using errcode = '42501';
  end if;

  select id into v_existing_request
  from public.payroll_attendance_correction_requests r
  where r.exception_id = v_exception.id and r.status = 'pending_review'
  limit 1;
  if v_existing_request is not null then
    raise exception 'A correction request is already pending for this exception.' using errcode = '23505';
  end if;

  insert into public.payroll_attendance_correction_requests (
    exception_id,
    attendance_interpretation_id,
    employee_id,
    work_date,
    requested_by_user_id,
    requested_clock_in_at,
    requested_clock_out_at,
    reason,
    source_document_ref,
    source_snapshot
  ) values (
    v_exception.id,
    v_interpretation.id,
    v_exception.employee_id,
    v_exception.work_date,
    v_actor_id,
    p_clock_in_at,
    p_clock_out_at,
    v_reason,
    v_source_document_ref,
    pg_catalog.jsonb_build_object(
      'exception', pg_catalog.jsonb_build_object(
        'id', v_exception.id,
        'exception_type', v_exception.exception_type,
        'status', v_exception.status,
        'details', v_exception.details,
        'evidence', v_exception.evidence
      ),
      'interpretation', pg_catalog.jsonb_build_object(
        'id', v_interpretation.id,
        'work_date', v_interpretation.work_date,
        'interpretation_version', v_interpretation.interpretation_version,
        'record_status', v_interpretation.record_status,
        'scheduled_start_at', v_interpretation.scheduled_start_at,
        'scheduled_end_at', v_interpretation.scheduled_end_at,
        'first_clock_in_at', v_interpretation.first_clock_in_at,
        'last_clock_out_at', v_interpretation.last_clock_out_at,
        'source_event_count', v_interpretation.source_event_count
      ),
      'submitted_clock_in_at', p_clock_in_at,
      'submitted_clock_out_at', p_clock_out_at,
      'submitted_at', pg_catalog.clock_timestamp()
    )
  ) returning * into v_request;

  insert into public.payroll_attendance_correction_request_actions (
    request_id, employee_id, work_date, action_code,
    previous_status, new_status, note, actor_user_id
  ) values (
    v_request.id, v_request.employee_id, v_request.work_date, 'submit',
    'pending_review', 'pending_review', v_reason, v_actor_id
  ) returning id into v_action_id;

  return pg_catalog.jsonb_build_object(
    'request', pg_catalog.to_jsonb(v_request),
    'action_id', v_action_id
  );
end;
$phase1j$;

create or replace function public.review_payroll_attendance_correction_request(
  p_request_id uuid,
  p_action text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $phase1j$
declare
  v_actor_id uuid;
  v_action text;
  v_note text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_has_payroll_access boolean;
  v_request public.payroll_attendance_correction_requests%rowtype;
  v_interpretation public.payroll_attendance_interpretations%rowtype;
  v_batch public.payroll_time_ingestion_batches%rowtype;
  v_new_interpretation public.payroll_attendance_interpretations%rowtype;
  v_old_exception record;
  v_payroll_group_id uuid;
  v_action_id uuid;
  v_apply_action_id uuid;
  v_run_summary jsonb;
  v_clock_in_event_id uuid;
  v_clock_out_event_id uuid;
  v_event_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'An authenticated user is required to review an attendance correction.' using errcode = '42501';
  end if;

  v_actor_id := public.current_hris_user_id();
  if v_actor_id is null then
    raise exception 'The authenticated user is not linked to an active HRIS user.' using errcode = '42501';
  end if;

  v_action := lower(nullif(pg_catalog.btrim(coalesce(p_action, '')), ''));
  if v_action not in ('approve', 'reject', 'cancel') then
    raise exception 'Unsupported attendance correction review action.' using errcode = '22023';
  end if;
  v_note := nullif(pg_catalog.btrim(coalesce(p_review_note, '')), '');

  select * into v_request
  from public.payroll_attendance_correction_requests r
  where r.id = p_request_id
  for update;
  if not found then
    raise exception 'Attendance correction request not found.' using errcode = 'P0002';
  end if;
  if v_request.status <> 'pending_review' then
    raise exception 'Only pending attendance corrections can be reviewed.' using errcode = '55000';
  end if;

  if v_action = 'cancel' then
    if v_request.requested_by_user_id is distinct from v_actor_id then
      raise exception 'Only the correction requester can cancel a pending request.' using errcode = '42501';
    end if;
    v_note := coalesce(v_note, 'Cancelled by the correction requester.');
    update public.payroll_attendance_correction_requests
       set status = 'cancelled',
           reviewed_by_user_id = v_actor_id,
           reviewed_at = v_now,
           review_note = v_note
     where id = v_request.id
     returning * into v_request;

    insert into public.payroll_attendance_correction_request_actions (
      request_id, employee_id, work_date, action_code,
      previous_status, new_status, note, actor_user_id
    ) values (
      v_request.id, v_request.employee_id, v_request.work_date, 'cancel',
      'pending_review', 'cancelled', v_note, v_actor_id
    ) returning id into v_action_id;

    return pg_catalog.jsonb_build_object(
      'request', pg_catalog.to_jsonb(v_request),
      'action_id', v_action_id
    );
  end if;

  v_has_payroll_access := private.payroll_time_data_access();
  if not v_has_payroll_access then
    raise exception 'Only HR, Finance, or system administrators may approve or reject an attendance correction.' using errcode = '42501';
  end if;
  if v_request.requested_by_user_id = v_actor_id then
    raise exception 'The correction requester cannot approve or reject the same request.' using errcode = '42501';
  end if;
  if v_action = 'reject' and v_note is null then
    raise exception 'A rejection note is required.' using errcode = '22023';
  end if;

  if v_action = 'reject' then
    update public.payroll_attendance_correction_requests
       set status = 'rejected',
           reviewed_by_user_id = v_actor_id,
           reviewed_at = v_now,
           review_note = v_note
     where id = v_request.id
     returning * into v_request;

    insert into public.payroll_attendance_correction_request_actions (
      request_id, employee_id, work_date, action_code,
      previous_status, new_status, note, actor_user_id
    ) values (
      v_request.id, v_request.employee_id, v_request.work_date, 'reject',
      'pending_review', 'rejected', v_note, v_actor_id
    ) returning id into v_action_id;

    return pg_catalog.jsonb_build_object(
      'request', pg_catalog.to_jsonb(v_request),
      'action_id', v_action_id
    );
  end if;

  select * into v_interpretation
  from public.payroll_attendance_interpretations i
  where i.id = v_request.attendance_interpretation_id
  for update;
  if not found or v_interpretation.record_status not in ('draft', 'needs_review') then
    raise exception 'The attendance interpretation is no longer eligible for correction.' using errcode = '55000';
  end if;

  select wa.payroll_group_id into v_payroll_group_id
  from public.payroll_employee_schedules pes
  join public.payroll_worker_assignments wa
    on wa.id = pes.worker_assignment_id
   and wa.employee_id = pes.employee_id
  where pes.id = v_interpretation.employee_schedule_id
    and pes.employee_id = v_request.employee_id;
  if v_payroll_group_id is null then
    raise exception 'The attendance schedule has no payroll group for correction rebuild.' using errcode = '22023';
  end if;

  update public.payroll_attendance_correction_requests
     set status = 'approved',
         reviewed_by_user_id = v_actor_id,
         reviewed_at = v_now,
         review_note = coalesce(v_note, 'Approved for attendance interpretation rebuild.')
   where id = v_request.id
   returning * into v_request;

  insert into public.payroll_attendance_correction_request_actions (
    request_id, employee_id, work_date, action_code,
    previous_status, new_status, note, actor_user_id
  ) values (
    v_request.id, v_request.employee_id, v_request.work_date, 'approve',
    'pending_review', 'approved', v_request.review_note, v_actor_id
  ) returning id into v_action_id;

  insert into public.payroll_time_ingestion_batches (
    source_type,
    source_system,
    source_batch_key,
    source_timezone,
    status,
    manifest,
    requested_by_user_id
  ) values (
    'manual',
    'payroll-correction',
    'correction:' || v_request.id::text,
    coalesce(v_interpretation.schedule_timezone, 'Asia/Manila'),
    'received',
    pg_catalog.jsonb_build_object(
      'correction_request_id', v_request.id,
      'exception_id', v_request.exception_id,
      'submitted_by_user_id', v_request.requested_by_user_id,
      'approved_by_user_id', v_actor_id
    ),
    v_actor_id
  ) returning * into v_batch;

  if v_request.requested_clock_in_at is not null then
    insert into public.payroll_raw_time_events (
      ingestion_batch_id,
      employee_id,
      source_type,
      source_system,
      source_event_id,
      idempotency_key,
      event_kind,
      work_context,
      submission_mode,
      event_occurred_at,
      source_timestamp_text,
      event_timezone,
      device_id,
      raw_payload
    ) values (
      v_batch.id,
      v_request.employee_id,
      'manual',
      'payroll-correction',
      v_request.id::text || ':clock_in',
      v_request.id::text || ':clock_in',
      'clock_in',
      'unknown',
      'manual',
      v_request.requested_clock_in_at,
      v_request.requested_clock_in_at::text,
      coalesce(v_interpretation.schedule_timezone, 'Asia/Manila'),
      'payroll-attendance-correction',
      pg_catalog.jsonb_build_object(
        'correction_request_id', v_request.id,
        'reason', v_request.reason,
        'source_document_ref', v_request.source_document_ref,
        'submitted_by_user_id', v_request.requested_by_user_id,
        'approved_by_user_id', v_actor_id
      )
    ) returning id into v_clock_in_event_id;
    v_event_count := v_event_count + 1;
  end if;

  if v_request.requested_clock_out_at is not null then
    insert into public.payroll_raw_time_events (
      ingestion_batch_id,
      employee_id,
      source_type,
      source_system,
      source_event_id,
      idempotency_key,
      event_kind,
      work_context,
      submission_mode,
      event_occurred_at,
      source_timestamp_text,
      event_timezone,
      device_id,
      raw_payload
    ) values (
      v_batch.id,
      v_request.employee_id,
      'manual',
      'payroll-correction',
      v_request.id::text || ':clock_out',
      v_request.id::text || ':clock_out',
      'clock_out',
      'unknown',
      'manual',
      v_request.requested_clock_out_at,
      v_request.requested_clock_out_at::text,
      coalesce(v_interpretation.schedule_timezone, 'Asia/Manila'),
      'payroll-attendance-correction',
      pg_catalog.jsonb_build_object(
        'correction_request_id', v_request.id,
        'reason', v_request.reason,
        'source_document_ref', v_request.source_document_ref,
        'submitted_by_user_id', v_request.requested_by_user_id,
        'approved_by_user_id', v_actor_id
      )
    ) returning id into v_clock_out_event_id;
    v_event_count := v_event_count + 1;
  end if;

  update public.payroll_time_ingestion_batches
     set status = 'processed',
         total_received = v_event_count,
         total_accepted = v_event_count,
         updated_at = pg_catalog.now()
   where id = v_batch.id;

  update public.payroll_attendance_interpretations
     set record_status = 'voided',
         status_reason = 'Voided after approved attendance correction request ' || v_request.id::text || '.'
   where id = v_interpretation.id;

  for v_old_exception in
    select ae.*
    from public.payroll_attendance_exceptions ae
    where ae.attendance_interpretation_id = v_interpretation.id
      and ae.status in ('open', 'acknowledged', 'reopened')
    order by ae.id
  loop
    update public.payroll_attendance_exceptions
       set status = 'resolved',
           resolved_by_user_id = v_actor_id,
           resolved_at = v_now,
           resolution_code = 'approved_manual_correction',
           resolution_note = 'Resolved by approved attendance correction request ' || v_request.id::text || '.',
           resolution_document_ref = v_request.source_document_ref,
           resolution_approved_by_user_id = null,
           resolution_approved_at = null
     where id = v_old_exception.id;

    insert into public.payroll_attendance_exception_actions (
      exception_id, employee_id, work_date, action_code,
      previous_status, new_status, resolution_code,
      resolution_note, resolution_document_ref, actor_user_id
    ) values (
      v_old_exception.id, v_old_exception.employee_id, v_old_exception.work_date, 'resolve',
      v_old_exception.status, 'resolved', 'approved_manual_correction',
      'Resolved by approved attendance correction request ' || v_request.id::text || '.',
      v_request.source_document_ref, v_actor_id
    );
  end loop;

  perform pg_catalog.set_config('payroll.attendance_correction_source', 'correction', true);
  perform pg_catalog.set_config('payroll.attendance_correction_request_id', v_request.id::text, true);
  perform pg_catalog.set_config('payroll.attendance_correction_supersedes_id', v_interpretation.id::text, true);

  v_run_summary := public.generate_payroll_attendance_interpretations(
    v_payroll_group_id,
    v_request.work_date,
    v_request.work_date,
    'correction:' || v_request.id::text
  );

  if coalesce((v_run_summary->>'interpretations_created')::integer, 0) < 1 then
    raise exception 'Attendance correction rebuild did not create a new interpretation.' using errcode = 'P0001';
  end if;

  select * into v_new_interpretation
  from public.payroll_attendance_interpretations i
  where i.employee_id = v_request.employee_id
    and i.work_date = v_request.work_date
    and i.record_status in ('draft', 'needs_review', 'resolved', 'approved')
  order by i.interpretation_version desc
  limit 1;
  if not found then
    raise exception 'The new attendance interpretation could not be located after rebuild.' using errcode = 'P0001';
  end if;

  update public.payroll_attendance_correction_requests
     set status = 'applied',
         applied_interpretation_id = v_new_interpretation.id,
         applied_at = pg_catalog.clock_timestamp()
   where id = v_request.id
   returning * into v_request;

  insert into public.payroll_attendance_correction_request_actions (
    request_id, employee_id, work_date, action_code,
    previous_status, new_status, note, actor_user_id
  ) values (
    v_request.id, v_request.employee_id, v_request.work_date, 'apply',
    'approved', 'applied', 'New interpretation ' || v_new_interpretation.id::text || ' created from approved correction.', v_actor_id
  ) returning id into v_apply_action_id;

  return pg_catalog.jsonb_build_object(
    'request', pg_catalog.to_jsonb(v_request),
    'approval_action_id', v_action_id,
    'apply_action_id', v_apply_action_id,
    'new_interpretation_id', v_new_interpretation.id,
    'new_interpretation_version', v_new_interpretation.interpretation_version,
    'raw_event_ids', pg_catalog.jsonb_build_object(
      'clock_in', v_clock_in_event_id,
      'clock_out', v_clock_out_event_id
    ),
    'run_summary', v_run_summary
  );
end;
$phase1j$;

alter table public.payroll_attendance_correction_requests enable row level security;
alter table public.payroll_attendance_correction_request_actions enable row level security;

drop policy if exists payroll_attendance_correction_requests_authorized_read
  on public.payroll_attendance_correction_requests;
create policy payroll_attendance_correction_requests_authorized_read
on public.payroll_attendance_correction_requests
for select to authenticated
using (
  private.payroll_time_data_access()
  or requested_by_user_id = public.current_hris_user_id()
  or employee_id = public.current_hris_user_id()
  or private.is_direct_reporting_manager(public.current_hris_user_id(), employee_id)
);

drop policy if exists payroll_attendance_correction_request_actions_authorized_read
  on public.payroll_attendance_correction_request_actions;
create policy payroll_attendance_correction_request_actions_authorized_read
on public.payroll_attendance_correction_request_actions
for select to authenticated
using (
  private.payroll_time_data_access()
  or actor_user_id = public.current_hris_user_id()
  or exists (
    select 1
    from public.payroll_attendance_correction_requests r
    where r.id = request_id
      and (
        r.requested_by_user_id = public.current_hris_user_id()
        or r.employee_id = public.current_hris_user_id()
        or private.is_direct_reporting_manager(public.current_hris_user_id(), r.employee_id)
      )
  )
);

revoke all on table
  public.payroll_attendance_correction_requests,
  public.payroll_attendance_correction_request_actions
from public, anon, authenticated;
grant select on table
  public.payroll_attendance_correction_requests,
  public.payroll_attendance_correction_request_actions
to authenticated;
grant all on table
  public.payroll_attendance_correction_requests,
  public.payroll_attendance_correction_request_actions
to service_role;

revoke all on function private.prevent_payroll_attendance_correction_request_action_mutation() from public, anon, authenticated;
revoke all on function private.guard_payroll_attendance_correction_request() from public, anon, authenticated;
revoke all on function private.mark_payroll_attendance_correction_source() from public, anon, authenticated;
revoke all on function public.submit_payroll_attendance_correction_request(uuid, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.review_payroll_attendance_correction_request(uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_payroll_attendance_correction_request(uuid, timestamptz, timestamptz, text, text) to authenticated, service_role;
grant execute on function public.review_payroll_attendance_correction_request(uuid, text, text) to authenticated, service_role;

comment on table public.payroll_attendance_correction_requests is
  'Maker-checker correction requests for missing clock-in, missing clock-out, and no-show attendance exceptions. Approval appends raw manual events and creates a new interpreted version.';
comment on table public.payroll_attendance_correction_request_actions is
  'Append-only action history for attendance correction requests.';

notify pgrst, 'reload schema';
