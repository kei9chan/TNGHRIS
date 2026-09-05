-- Phase 1I: normalized attendance exception review and resolution.
-- Raw time events and attendance evidence remain immutable. Resolution actions
-- update only workflow fields and append an action-history record.

create table if not exists public.payroll_attendance_exception_actions (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid not null references public.payroll_attendance_exceptions(id) on delete restrict,
  employee_id uuid not null references public.hris_users(id) on delete restrict,
  work_date date not null,
  action_code text not null,
  previous_status text not null,
  new_status text not null,
  resolution_code text,
  resolution_note text,
  resolution_document_ref text,
  actor_user_id uuid not null references public.hris_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payroll_attendance_exception_actions_action_check check (
    action_code in ('acknowledge', 'resolve', 'reject', 'waive', 'reopen')
  ),
  constraint payroll_attendance_exception_actions_status_check check (
    previous_status in ('open', 'acknowledged', 'resolved', 'rejected', 'waived', 'reopened')
    and new_status in ('open', 'acknowledged', 'resolved', 'rejected', 'waived', 'reopened')
  ),
  constraint payroll_attendance_exception_actions_note_check check (
    action_code not in ('resolve', 'reject', 'waive')
    or nullif(btrim(resolution_note), '') is not null
  )
);

create index if not exists payroll_attendance_exception_actions_exception_idx
  on public.payroll_attendance_exception_actions (exception_id, created_at desc);
create index if not exists payroll_attendance_exception_actions_employee_date_idx
  on public.payroll_attendance_exception_actions (employee_id, work_date, created_at desc);

create or replace function private.prevent_payroll_attendance_exception_action_mutation()
returns trigger
language plpgsql
set search_path = ''
as $phase1i$
begin
  raise exception 'Attendance exception action history is append-only.' using errcode = '55000';
end;
$phase1i$;

drop trigger if exists payroll_attendance_exception_actions_mutation_guard
  on public.payroll_attendance_exception_actions;
create trigger payroll_attendance_exception_actions_mutation_guard
before update or delete on public.payroll_attendance_exception_actions
for each row execute function private.prevent_payroll_attendance_exception_action_mutation();

-- The existing exception guard allowed a waiver only as a terminal resolution,
-- but did not allow the required resolved -> waived maker-checker transition.
-- Preserve every existing evidence and immutability check while enabling that
-- explicit second-person approval transition.
create or replace function private.guard_payroll_attendance_exception()
returns trigger
language plpgsql
set search_path = ''
as $phase1i$
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
      or (old.status = 'resolved' and new.status in ('reopened', 'waived'))
      or (old.status in ('rejected', 'waived') and new.status = 'reopened')
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
$phase1i$;

drop trigger if exists payroll_attendance_exceptions_guard
  on public.payroll_attendance_exceptions;
create trigger payroll_attendance_exceptions_guard
before insert or update on public.payroll_attendance_exceptions
for each row execute function private.guard_payroll_attendance_exception();

create or replace function public.resolve_payroll_attendance_exception(
  p_exception_id uuid,
  p_action text,
  p_resolution_code text default null,
  p_resolution_note text default null,
  p_resolution_document_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $phase1i$
declare
  v_actor_id uuid;
  v_has_payroll_access boolean;
  v_is_direct_manager boolean;
  v_action text;
  v_resolution_code text;
  v_resolution_note text;
  v_resolution_document_ref text;
  v_previous_status text;
  v_action_id uuid;
  v_exception public.payroll_attendance_exceptions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'An authenticated user is required to resolve an attendance exception.' using errcode = '42501';
  end if;

  select u.id
    into v_actor_id
  from public.hris_users u
  where u.auth_user_id = auth.uid()
    and u.status = 'Active'
  limit 1;

  if v_actor_id is null then
    raise exception 'The authenticated user is not linked to an active HRIS user.' using errcode = '42501';
  end if;

  v_action := lower(nullif(pg_catalog.btrim(coalesce(p_action, '')), ''));
  if v_action not in ('acknowledge', 'resolve', 'reject', 'waive', 'reopen') then
    raise exception 'Unsupported attendance exception action.' using errcode = '22023';
  end if;

  v_resolution_code := nullif(pg_catalog.btrim(coalesce(p_resolution_code, '')), '');
  v_resolution_note := nullif(pg_catalog.btrim(coalesce(p_resolution_note, '')), '');
  v_resolution_document_ref := nullif(pg_catalog.btrim(coalesce(p_resolution_document_ref, '')), '');

  select *
    into v_exception
  from public.payroll_attendance_exceptions
  where id = p_exception_id
  for update;

  if not found then
    raise exception 'Attendance exception not found.' using errcode = 'P0002';
  end if;

  v_previous_status := v_exception.status;
  v_has_payroll_access := private.payroll_time_data_access();
  v_is_direct_manager := private.is_direct_reporting_manager(v_actor_id, v_exception.employee_id);

  if not v_has_payroll_access and not v_is_direct_manager then
    raise exception 'You are not authorized to manage this attendance exception.' using errcode = '42501';
  end if;

  if v_action = 'acknowledge' then
    if v_exception.status not in ('open', 'reopened') then
      raise exception 'Only open or reopened attendance exceptions can be acknowledged.' using errcode = '55000';
    end if;

    update public.payroll_attendance_exceptions
       set status = 'acknowledged',
           acknowledged_by_user_id = v_actor_id,
           acknowledged_at = pg_catalog.clock_timestamp()
     where id = p_exception_id
     returning * into v_exception;

  elsif v_action in ('resolve', 'reject') then
    if v_exception.status not in ('open', 'acknowledged', 'reopened') then
      raise exception 'Only open, acknowledged, or reopened attendance exceptions can be resolved.' using errcode = '55000';
    end if;
    if v_resolution_note is null then
      raise exception 'A resolution note is required.' using errcode = '22023';
    end if;
    if v_resolution_code is null then
      raise exception 'A resolution code is required.' using errcode = '22023';
    end if;

    update public.payroll_attendance_exceptions
       set status = case when v_action = 'resolve' then 'resolved' else 'rejected' end,
           resolved_by_user_id = v_actor_id,
           resolved_at = pg_catalog.clock_timestamp(),
           resolution_code = v_resolution_code,
           resolution_note = v_resolution_note,
           resolution_document_ref = v_resolution_document_ref,
           resolution_approved_by_user_id = null,
           resolution_approved_at = null
     where id = p_exception_id
     returning * into v_exception;

  elsif v_action = 'waive' then
    if not v_has_payroll_access then
      raise exception 'Only an authorized payroll reviewer can waive an attendance exception.' using errcode = '42501';
    end if;
    if v_exception.status <> 'resolved' then
      raise exception 'Only a resolved attendance exception can be waived.' using errcode = '55000';
    end if;
    if v_exception.resolved_by_user_id is null or v_exception.resolved_by_user_id = v_actor_id then
      raise exception 'Waiver approval must be performed by a different user from the resolver.' using errcode = '42501';
    end if;
    if v_exception.requested_by_user_id is not null and v_exception.requested_by_user_id = v_actor_id then
      raise exception 'The requester cannot approve the waiver.' using errcode = '42501';
    end if;

    v_resolution_note := coalesce(v_resolution_note, v_exception.resolution_note);
    if v_resolution_note is null then
      raise exception 'A waiver note is required.' using errcode = '22023';
    end if;

    update public.payroll_attendance_exceptions
       set status = 'waived',
           resolution_code = coalesce(v_resolution_code, v_exception.resolution_code, 'waived_after_review'),
           resolution_note = v_resolution_note,
           resolution_document_ref = coalesce(v_resolution_document_ref, v_exception.resolution_document_ref),
           resolution_approved_by_user_id = v_actor_id,
           resolution_approved_at = pg_catalog.clock_timestamp()
     where id = p_exception_id
     returning * into v_exception;

  elsif v_action = 'reopen' then
    if not v_has_payroll_access then
      raise exception 'Only an authorized payroll reviewer can reopen an attendance exception.' using errcode = '42501';
    end if;
    if v_exception.status not in ('resolved', 'rejected', 'waived') then
      raise exception 'Only resolved, rejected, or waived attendance exceptions can be reopened.' using errcode = '55000';
    end if;

    update public.payroll_attendance_exceptions
       set status = 'reopened',
           acknowledged_by_user_id = null,
           acknowledged_at = null,
           resolved_by_user_id = null,
           resolved_at = null,
           resolution_code = null,
           resolution_note = null,
           resolution_document_ref = null,
           resolution_approved_by_user_id = null,
           resolution_approved_at = null
     where id = p_exception_id
     returning * into v_exception;
  end if;

  insert into public.payroll_attendance_exception_actions (
    exception_id,
    employee_id,
    work_date,
    action_code,
    previous_status,
    new_status,
    resolution_code,
    resolution_note,
    resolution_document_ref,
    actor_user_id
  ) values (
    v_exception.id,
    v_exception.employee_id,
    v_exception.work_date,
    v_action,
    v_previous_status,
    v_exception.status,
    v_exception.resolution_code,
    v_exception.resolution_note,
    v_exception.resolution_document_ref,
    v_actor_id
  ) returning id into v_action_id;

  return jsonb_build_object(
    'action_id', v_action_id,
    'action', v_action,
    'previous_status', v_previous_status,
    'exception', to_jsonb(v_exception)
  );
end;
$phase1i$;

alter table public.payroll_attendance_exception_actions enable row level security;
drop policy if exists payroll_attendance_exception_actions_authorized_read
  on public.payroll_attendance_exception_actions;
create policy payroll_attendance_exception_actions_authorized_read
on public.payroll_attendance_exception_actions
for select to authenticated
using (private.payroll_time_data_access());

revoke all on table public.payroll_attendance_exception_actions from public, anon, authenticated;
grant select on table public.payroll_attendance_exception_actions to authenticated;
grant all on table public.payroll_attendance_exception_actions to service_role;

revoke all on function private.prevent_payroll_attendance_exception_action_mutation() from public, anon, authenticated;
revoke all on function private.guard_payroll_attendance_exception() from public, anon, authenticated;
revoke all on function public.resolve_payroll_attendance_exception(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.resolve_payroll_attendance_exception(uuid, text, text, text, text)
  to authenticated, service_role;

comment on table public.payroll_attendance_exception_actions is
  'Append-only workflow history for normalized attendance exception review and resolution.';
comment on function public.resolve_payroll_attendance_exception(uuid, text, text, text, text) is
  'Server-enforced attendance exception workflow. Raw attendance evidence is never changed; every action is appended to action history.';

select pg_catalog.pg_notification_queue_usage();
notify pgrst, 'reload schema';

