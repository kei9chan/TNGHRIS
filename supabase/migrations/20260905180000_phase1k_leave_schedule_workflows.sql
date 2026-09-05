-- Phase 1K: leave audit events, change-of-shift, and peer shift swaps.
-- Additive only. Existing leave approval routing remains compatible; the new
-- schedule workflows supersede canonical payroll schedules instead of editing
-- them in place. Legacy shift tables and raw attendance remain untouched.

create table if not exists public.payroll_leave_request_events (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.leave_requests(id) on delete restrict,
  action_code text not null,
  actor_user_id uuid references public.hris_users(id) on delete set null,
  previous_status text,
  new_status text not null,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint payroll_leave_request_events_action_check check (
    action_code in ('submit', 'update', 'approve', 'reject', 'cancel', 'system_update')
  )
);

create index if not exists payroll_leave_request_events_request_idx
  on public.payroll_leave_request_events (leave_request_id, created_at desc);

create index if not exists payroll_leave_request_events_actor_idx
  on public.payroll_leave_request_events (actor_user_id, created_at desc);

create table if not exists public.payroll_schedule_change_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hris_users(id) on delete restrict,
  work_date date not null,
  current_schedule_id uuid not null,
  requested_shift_preset_id uuid not null references public.payroll_shift_presets(id) on delete restrict,
  direct_manager_id uuid references public.hris_users(id) on delete set null,
  approval_mode text not null default 'direct_manager',
  requested_by_user_id uuid not null references public.hris_users(id) on delete restrict,
  reason text not null,
  source_document_ref text,
  source_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'pending_manager',
  reviewed_by_user_id uuid references public.hris_users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  applied_schedule_id uuid,
  applied_at timestamptz,
  requires_reinterpretation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_schedule_change_requests_schedule_employee_fkey
    foreign key (current_schedule_id, employee_id)
    references public.payroll_employee_schedules(id, employee_id)
    on delete restrict,
  constraint payroll_schedule_change_requests_approval_mode_check check (
    approval_mode in ('direct_manager', 'payroll_exception')
  ),
  constraint payroll_schedule_change_requests_status_check check (
    status in ('pending_manager', 'approved', 'rejected', 'cancelled', 'applied')
  ),
  constraint payroll_schedule_change_requests_reason_check check (btrim(reason) <> ''),
  constraint payroll_schedule_change_requests_snapshot_check check (source_snapshot <> '{}'::jsonb),
  constraint payroll_schedule_change_requests_review_check check (
    (status = 'pending_manager' and reviewed_by_user_id is null and reviewed_at is null)
    or (status <> 'pending_manager' and reviewed_by_user_id is not null and reviewed_at is not null)
  ),
  constraint payroll_schedule_change_requests_apply_check check (
    (status = 'applied' and applied_schedule_id is not null and applied_at is not null)
    or (status <> 'applied' and applied_schedule_id is null and applied_at is null)
  )
);

create unique index if not exists payroll_schedule_change_requests_pending_uidx
  on public.payroll_schedule_change_requests (employee_id, work_date)
  where status = 'pending_manager';

create index if not exists payroll_schedule_change_requests_employee_date_idx
  on public.payroll_schedule_change_requests (employee_id, work_date, created_at desc);

create index if not exists payroll_schedule_change_requests_manager_idx
  on public.payroll_schedule_change_requests (direct_manager_id, status, created_at desc);

create table if not exists public.payroll_shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  swap_date date not null,
  requester_employee_id uuid not null references public.hris_users(id) on delete restrict,
  counterpart_employee_id uuid not null references public.hris_users(id) on delete restrict,
  requester_schedule_id uuid not null,
  counterpart_schedule_id uuid not null,
  direct_manager_id uuid references public.hris_users(id) on delete set null,
  approval_mode text not null default 'direct_manager',
  requested_by_user_id uuid not null references public.hris_users(id) on delete restrict,
  reason text not null,
  source_document_ref text,
  source_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'pending_counterparty',
  counterparty_status text not null default 'pending',
  counterparty_responded_by_user_id uuid references public.hris_users(id) on delete set null,
  counterparty_responded_at timestamptz,
  counterparty_note text,
  reviewed_by_user_id uuid references public.hris_users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  applied_requester_schedule_id uuid,
  applied_counterpart_schedule_id uuid,
  applied_at timestamptz,
  requires_reinterpretation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_shift_swap_requests_requester_schedule_fkey
    foreign key (requester_schedule_id, requester_employee_id)
    references public.payroll_employee_schedules(id, employee_id)
    on delete restrict,
  constraint payroll_shift_swap_requests_counterpart_schedule_fkey
    foreign key (counterpart_schedule_id, counterpart_employee_id)
    references public.payroll_employee_schedules(id, employee_id)
    on delete restrict,
  constraint payroll_shift_swap_requests_distinct_people_check check (
    requester_employee_id <> counterpart_employee_id
  ),
  constraint payroll_shift_swap_requests_distinct_schedules_check check (
    requester_schedule_id <> counterpart_schedule_id
  ),
  constraint payroll_shift_swap_requests_approval_mode_check check (
    approval_mode in ('direct_manager', 'payroll_exception')
  ),
  constraint payroll_shift_swap_requests_status_check check (
    status in ('pending_counterparty', 'pending_manager', 'approved', 'rejected', 'cancelled', 'applied')
  ),
  constraint payroll_shift_swap_requests_counterparty_status_check check (
    (status = 'pending_counterparty' and counterparty_status = 'pending')
    or (status in ('pending_manager', 'approved', 'applied') and counterparty_status = 'accepted')
    or (counterparty_status = 'declined' and status = 'rejected')
    or (status in ('rejected', 'cancelled') and counterparty_status in ('pending', 'accepted', 'declined'))
  ),
  constraint payroll_shift_swap_requests_reason_check check (btrim(reason) <> ''),
  constraint payroll_shift_swap_requests_snapshot_check check (source_snapshot <> '{}'::jsonb),
  constraint payroll_shift_swap_requests_counterparty_evidence_check check (
    (counterparty_status = 'pending' and counterparty_responded_by_user_id is null and counterparty_responded_at is null)
    or (counterparty_status in ('accepted', 'declined') and counterparty_responded_by_user_id is not null and counterparty_responded_at is not null)
  ),
  constraint payroll_shift_swap_requests_review_check check (
    (status in ('pending_counterparty', 'pending_manager') and reviewed_by_user_id is null and reviewed_at is null)
    or (status in ('approved', 'rejected', 'cancelled', 'applied') and reviewed_by_user_id is not null and reviewed_at is not null)
  ),
  constraint payroll_shift_swap_requests_apply_check check (
    (status = 'applied'
      and applied_requester_schedule_id is not null
      and applied_counterpart_schedule_id is not null
      and applied_at is not null)
    or (status <> 'applied'
      and applied_requester_schedule_id is null
      and applied_counterpart_schedule_id is null
      and applied_at is null)
  )
);

create unique index if not exists payroll_shift_swap_requests_requester_pending_uidx
  on public.payroll_shift_swap_requests (requester_schedule_id)
  where status in ('pending_counterparty', 'pending_manager', 'approved');

create unique index if not exists payroll_shift_swap_requests_counterpart_pending_uidx
  on public.payroll_shift_swap_requests (counterpart_schedule_id)
  where status in ('pending_counterparty', 'pending_manager', 'approved');

create index if not exists payroll_shift_swap_requests_date_idx
  on public.payroll_shift_swap_requests (swap_date, status, created_at desc);

create index if not exists payroll_shift_swap_requests_people_idx
  on public.payroll_shift_swap_requests (requester_employee_id, counterpart_employee_id, created_at desc);

create table if not exists public.payroll_schedule_workflow_actions (
  id uuid primary key default gen_random_uuid(),
  request_kind text not null,
  request_id uuid not null,
  action_code text not null,
  actor_user_id uuid references public.hris_users(id) on delete set null,
  from_status text,
  to_status text not null,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  constraint payroll_schedule_workflow_actions_kind_check check (
    request_kind in ('change_of_shift', 'shift_swap')
  ),
  constraint payroll_schedule_workflow_actions_action_check check (
    action_code in ('submit', 'counterparty_accept', 'counterparty_decline', 'approve', 'reject', 'cancel', 'apply')
  )
);

create index if not exists payroll_schedule_workflow_actions_request_idx
  on public.payroll_schedule_workflow_actions (request_kind, request_id, created_at);

create index if not exists payroll_schedule_workflow_actions_actor_idx
  on public.payroll_schedule_workflow_actions (actor_user_id, created_at desc);

create or replace function private.current_direct_manager_id(p_employee_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select manager.id
  from public.hris_users employee
  join public.hris_users manager
    on lower(manager.status) = 'active'
   and employee.reports_to in (
     manager.id::text,
     manager.auth_user_id::text,
     coalesce(manager.employee_id, ''),
     manager.full_name
   )
  where employee.id = p_employee_id
  order by manager.id
  limit 1;
$$;

create or replace function private.payroll_approved_leave_exists(
  p_employee_id uuid,
  p_work_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.leave_requests leave_request
    where leave_request.employee_id = p_employee_id
      and lower(leave_request.status) = 'approved'
      and p_work_date between leave_request.start_date and leave_request.end_date
  );
$$;

create or replace function private.payroll_schedule_interpretation_exists(
  p_employee_id uuid,
  p_work_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payroll_attendance_interpretations interpretation
    where interpretation.employee_id = p_employee_id
      and interpretation.work_date = p_work_date
      and interpretation.record_status <> 'void'
  );
$$;

create or replace function private.prevent_payroll_workflow_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Payroll workflow history is append-only.' using errcode = '55000';
end;
$$;

create or replace function private.record_payroll_leave_request_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  action_code_value text := 'update';
  before_value jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    action_code_value := 'submit';
  else
    before_value := jsonb_build_object(
      'employeeId', old.employee_id,
      'leaveTypeId', old.leave_type_id,
      'startDate', old.start_date,
      'endDate', old.end_date,
      'durationDays', old.duration_days,
      'status', old.status,
      'reason', old.reason
    );
    if new.status is distinct from old.status then
      action_code_value := case lower(new.status)
        when 'approved' then 'approve'
        when 'rejected' then 'reject'
        when 'cancelled' then 'cancel'
        else 'update'
      end;
    end if;
  end if;

  insert into public.payroll_leave_request_events (
    leave_request_id,
    action_code,
    actor_user_id,
    previous_status,
    new_status,
    before_snapshot,
    after_snapshot
  ) values (
    new.id,
    action_code_value,
    actor_id,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status,
    before_value,
    jsonb_build_object(
      'employeeId', new.employee_id,
      'leaveTypeId', new.leave_type_id,
      'startDate', new.start_date,
      'endDate', new.end_date,
      'durationDays', new.duration_days,
      'status', new.status,
      'reason', new.reason
    )
  );

  return new;
end;
$$;

create or replace function private.guard_payroll_schedule_change_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status <> 'pending_manager' then
    raise exception 'A change-of-shift request must begin in pending manager status.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    if not (
      (old.status = 'pending_manager' and new.status in ('approved', 'rejected', 'cancelled'))
      or (old.status = 'approved' and new.status = 'applied')
    ) then
      raise exception 'Invalid change-of-shift status transition: % -> %.', old.status, new.status using errcode = '22023';
    end if;

    if old.status <> 'pending_manager' and (
      new.employee_id is distinct from old.employee_id
      or new.work_date is distinct from old.work_date
      or new.current_schedule_id is distinct from old.current_schedule_id
      or new.requested_shift_preset_id is distinct from old.requested_shift_preset_id
      or new.direct_manager_id is distinct from old.direct_manager_id
      or new.approval_mode is distinct from old.approval_mode
      or new.requested_by_user_id is distinct from old.requested_by_user_id
      or new.reason is distinct from old.reason
      or new.source_document_ref is distinct from old.source_document_ref
      or new.source_snapshot is distinct from old.source_snapshot
    ) then
      raise exception 'A reviewed change-of-shift request is immutable.' using errcode = '55000';
    end if;
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function private.guard_payroll_shift_swap_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status <> 'pending_counterparty' then
    raise exception 'A shift-swap request must begin pending counterparty response.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    if not (
      (old.status = 'pending_counterparty' and new.status in ('pending_manager', 'rejected', 'cancelled'))
      or (old.status = 'pending_manager' and new.status in ('approved', 'rejected', 'cancelled'))
      or (old.status = 'approved' and new.status = 'applied')
    ) then
      raise exception 'Invalid shift-swap status transition: % -> %.', old.status, new.status using errcode = '22023';
    end if;

    if old.status <> 'pending_counterparty' and (
      new.swap_date is distinct from old.swap_date
      or new.requester_employee_id is distinct from old.requester_employee_id
      or new.counterpart_employee_id is distinct from old.counterpart_employee_id
      or new.requester_schedule_id is distinct from old.requester_schedule_id
      or new.counterpart_schedule_id is distinct from old.counterpart_schedule_id
      or new.direct_manager_id is distinct from old.direct_manager_id
      or new.approval_mode is distinct from old.approval_mode
      or new.requested_by_user_id is distinct from old.requested_by_user_id
      or new.reason is distinct from old.reason
      or new.source_document_ref is distinct from old.source_document_ref
      or new.source_snapshot is distinct from old.source_snapshot
    ) then
      raise exception 'A reviewed shift-swap request is immutable.' using errcode = '55000';
    end if;
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function private.guard_payroll_schedule_workflow_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.request_kind = 'change_of_shift'
     and not exists (select 1 from public.payroll_schedule_change_requests request where request.id = new.request_id) then
    raise exception 'The change-of-shift request history target does not exist.' using errcode = '23503';
  end if;
  if new.request_kind = 'shift_swap'
     and not exists (select 1 from public.payroll_shift_swap_requests request where request.id = new.request_id) then
    raise exception 'The shift-swap request history target does not exist.' using errcode = '23503';
  end if;
  return new;
end;
$$;

create or replace function private.append_payroll_schedule_workflow_action(
  p_request_kind text,
  p_request_id uuid,
  p_action_code text,
  p_actor_user_id uuid,
  p_from_status text,
  p_to_status text,
  p_before_snapshot jsonb,
  p_after_snapshot jsonb,
  p_note text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.payroll_schedule_workflow_actions (
    request_kind,
    request_id,
    action_code,
    actor_user_id,
    from_status,
    to_status,
    before_snapshot,
    after_snapshot,
    note
  ) values (
    p_request_kind,
    p_request_id,
    p_action_code,
    p_actor_user_id,
    p_from_status,
    p_to_status,
    coalesce(p_before_snapshot, '{}'::jsonb),
    coalesce(p_after_snapshot, '{}'::jsonb),
    nullif(pg_catalog.btrim(p_note), '')
  );
$$;

create or replace function public.get_payroll_schedule_workflow_context(
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  can_manage_all boolean;
begin
  if actor_id is null then
    raise exception 'An active HRIS user is required.' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'The schedule request date range is invalid.' using errcode = '22023';
  end if;
  if p_end_date - p_start_date > 92 then
    raise exception 'Schedule request lookups may cover at most 93 calendar days.' using errcode = '22023';
  end if;

  can_manage_all := private.payroll_configuration_access();

  return jsonb_build_object(
    'actorId', actor_id,
    'canManageAll', can_manage_all,
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', visible_employee.id,
        'name', visible_employee.full_name,
        'email', visible_employee.email,
        'role', visible_employee.role
      ) order by visible_employee.full_name)
      from (
        select distinct employee.id, employee.full_name, employee.email, employee.role
        from public.payroll_employee_schedules schedule
        join public.hris_users employee on employee.id = schedule.employee_id
        where schedule.shift_date between p_start_date and p_end_date
          and schedule.record_status in ('approved', 'active')
          and (
            can_manage_all
            or schedule.employee_id = actor_id
            or private.is_direct_reporting_manager(actor_id, schedule.employee_id)
          )
      ) visible_employee
    ), '[]'::jsonb),
    'schedules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', schedule.id,
        'employeeId', schedule.employee_id,
        'employeeName', employee.full_name,
        'workDate', schedule.shift_date,
        'workerAssignmentId', schedule.worker_assignment_id,
        'shiftPresetId', schedule.shift_preset_id,
        'presetCode', preset.preset_code,
        'presetName', preset.preset_name,
        'shiftKind', preset.shift_kind,
        'version', schedule.version,
        'status', schedule.record_status,
        'scheduleSource', schedule.schedule_source
      ) order by schedule.shift_date, employee.full_name, schedule.id)
      from public.payroll_employee_schedules schedule
      join public.hris_users employee on employee.id = schedule.employee_id
      join public.payroll_shift_presets preset on preset.id = schedule.shift_preset_id
      where schedule.shift_date between p_start_date and p_end_date
        and schedule.record_status in ('approved', 'active')
        and (
          can_manage_all
          or schedule.employee_id = actor_id
          or private.is_direct_reporting_manager(actor_id, schedule.employee_id)
        )
    ), '[]'::jsonb),
    'presets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', preset.id,
        'code', preset.preset_code,
        'name', preset.preset_name,
        'shiftKind', preset.shift_kind,
        'scheduledMinutes', preset.scheduled_minutes,
        'breakMinutes', preset.break_minutes,
        'payrollGroupId', preset.payroll_group_id,
        'businessUnitId', preset.business_unit_id,
        'siteId', preset.site_id
      ) order by preset.preset_name, preset.id)
      from public.payroll_shift_presets preset
      where preset.approval_status in ('approved', 'active')
        and preset.is_active
        and preset.effective_start_date <= p_end_date
        and (preset.effective_end_date is null or preset.effective_end_date > p_start_date)
        and (
          can_manage_all
          or exists (
            select 1
            from public.payroll_employee_schedules visible_schedule
            join public.payroll_worker_assignments visible_assignment
              on visible_assignment.id = visible_schedule.worker_assignment_id
             and visible_assignment.employee_id = visible_schedule.employee_id
            where visible_schedule.shift_date between p_start_date and p_end_date
              and visible_schedule.record_status in ('approved', 'active')
              and (
                visible_schedule.employee_id = actor_id
                or private.is_direct_reporting_manager(actor_id, visible_schedule.employee_id)
              )
              and (preset.payroll_group_id is null or preset.payroll_group_id = visible_assignment.payroll_group_id)
              and (preset.business_unit_id is null or preset.business_unit_id = visible_assignment.business_unit_id)
              and (preset.site_id is null or preset.site_id = visible_assignment.site_id)
          )
        )
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.submit_payroll_schedule_change_request(
  p_employee_id uuid,
  p_current_schedule_id uuid,
  p_requested_shift_preset_id uuid,
  p_reason text,
  p_source_document_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  current_schedule public.payroll_employee_schedules;
  requested_preset public.payroll_shift_presets;
  direct_manager_id_value uuid;
  request_id uuid;
  approval_mode_value text;
  source_snapshot_value jsonb;
begin
  if actor_id is null then
    raise exception 'An active HRIS user is required.' using errcode = '42501';
  end if;
  if p_employee_id is null or p_current_schedule_id is null or p_requested_shift_preset_id is null then
    raise exception 'Employee, current schedule, and requested shift are required.' using errcode = '22023';
  end if;
  if nullif(pg_catalog.btrim(p_reason), '') is null then
    raise exception 'A reason is required for a change-of-shift request.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.hris_users employee
    where employee.id = p_employee_id and lower(employee.status) = 'active'
  ) then
    raise exception 'The selected employee is not active.' using errcode = '22023';
  end if;
  if not (
    actor_id = p_employee_id
    or private.is_direct_reporting_manager(actor_id, p_employee_id)
    or private.payroll_time_data_access()
  ) then
    raise exception 'You may only submit a schedule change for yourself or your authorized team.' using errcode = '42501';
  end if;

  select * into current_schedule
  from public.payroll_employee_schedules schedule
  where schedule.id = p_current_schedule_id
    and schedule.employee_id = p_employee_id
    and schedule.record_status in ('approved', 'active')
  for update;
  if not found then
    raise exception 'The current schedule is not available or is no longer current.' using errcode = '40901';
  end if;

  select * into requested_preset
  from public.payroll_shift_presets preset
  where preset.id = p_requested_shift_preset_id
    and preset.approval_status in ('approved', 'active')
    and preset.is_active
    and preset.effective_start_date <= current_schedule.shift_date
    and (preset.effective_end_date is null or preset.effective_end_date > current_schedule.shift_date)
  for share;
  if not found then
    raise exception 'The requested shift preset is not active for this date.' using errcode = '22023';
  end if;
  if requested_preset.id = current_schedule.shift_preset_id then
    raise exception 'The requested shift is the same as the current shift.' using errcode = '22023';
  end if;
  if private.payroll_approved_leave_exists(p_employee_id, current_schedule.shift_date) then
    raise exception 'An approved leave already covers this date. Resolve the leave first.' using errcode = '22023';
  end if;

  if requested_preset.payroll_group_id is not null and not exists (
    select 1 from public.payroll_worker_assignments wa
    where wa.id = current_schedule.worker_assignment_id
      and wa.employee_id = p_employee_id
      and wa.payroll_group_id = requested_preset.payroll_group_id
  ) then
    raise exception 'The requested shift belongs to a different payroll group.' using errcode = '22023';
  end if;
  if requested_preset.business_unit_id is not null and not exists (
    select 1 from public.payroll_worker_assignments wa
    where wa.id = current_schedule.worker_assignment_id
      and wa.employee_id = p_employee_id
      and wa.business_unit_id = requested_preset.business_unit_id
  ) then
    raise exception 'The requested shift belongs to a different business unit.' using errcode = '22023';
  end if;
  if requested_preset.site_id is not null and not exists (
    select 1 from public.payroll_worker_assignments wa
    where wa.id = current_schedule.worker_assignment_id
      and wa.employee_id = p_employee_id
      and wa.site_id = requested_preset.site_id
  ) then
    raise exception 'The requested shift belongs to a different worksite.' using errcode = '22023';
  end if;

  direct_manager_id_value := private.current_direct_manager_id(p_employee_id);
  approval_mode_value := case when direct_manager_id_value is null then 'payroll_exception' else 'direct_manager' end;
  source_snapshot_value := jsonb_build_object(
    'employeeId', p_employee_id,
    'workDate', current_schedule.shift_date,
    'currentSchedule', jsonb_build_object(
      'id', current_schedule.id,
      'workerAssignmentId', current_schedule.worker_assignment_id,
      'shiftPresetId', current_schedule.shift_preset_id,
      'version', current_schedule.version,
      'status', current_schedule.record_status
    ),
    'requestedShiftPreset', jsonb_build_object(
      'id', requested_preset.id,
      'code', requested_preset.preset_code,
      'name', requested_preset.preset_name,
      'version', requested_preset.version
    )
  );

  insert into public.payroll_schedule_change_requests (
    employee_id, work_date, current_schedule_id, requested_shift_preset_id,
    direct_manager_id, approval_mode, requested_by_user_id, reason,
    source_document_ref, source_snapshot
  ) values (
    p_employee_id, current_schedule.shift_date, current_schedule.id, p_requested_shift_preset_id,
    direct_manager_id_value, approval_mode_value, actor_id, pg_catalog.btrim(p_reason),
    nullif(pg_catalog.btrim(p_source_document_ref), ''), source_snapshot_value
  ) returning id into request_id;

  perform private.append_payroll_schedule_workflow_action(
    'change_of_shift', request_id, 'submit', actor_id, null, 'pending_manager',
    '{}'::jsonb, source_snapshot_value, p_reason
  );

  return jsonb_build_object(
    'requestId', request_id,
    'status', 'pending_manager',
    'approvalMode', approval_mode_value,
    'directManagerId', direct_manager_id_value,
    'workDate', current_schedule.shift_date
  );
end;
$$;

create or replace function public.review_payroll_schedule_change_request(
  p_request_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  request_row public.payroll_schedule_change_requests;
  current_schedule public.payroll_employee_schedules;
  requested_preset public.payroll_shift_presets;
  new_schedule_id uuid;
  before_snapshot_value jsonb;
  after_snapshot_value jsonb;
  interpretation_exists boolean;
  note_value text := nullif(pg_catalog.btrim(p_note), '');
begin
  if actor_id is null then
    raise exception 'An active HRIS user is required.' using errcode = '42501';
  end if;
  if lower(p_action) not in ('approve', 'reject', 'cancel') then
    raise exception 'Unsupported schedule-change action.' using errcode = '22023';
  end if;

  select * into request_row
  from public.payroll_schedule_change_requests request
  where request.id = p_request_id
  for update;
  if not found then
    raise exception 'Change-of-shift request not found.' using errcode = 'P0002';
  end if;

  before_snapshot_value := jsonb_build_object(
    'requestId', request_row.id,
    'employeeId', request_row.employee_id,
    'workDate', request_row.work_date,
    'status', request_row.status,
    'currentScheduleId', request_row.current_schedule_id,
    'requestedShiftPresetId', request_row.requested_shift_preset_id
  );

  if lower(p_action) = 'cancel' then
    if actor_id <> request_row.requested_by_user_id then
      raise exception 'Only the requester may cancel this schedule-change request.' using errcode = '42501';
    end if;
    if request_row.status <> 'pending_manager' then
      raise exception 'Only a pending schedule-change request may be cancelled.' using errcode = '40901';
    end if;
    update public.payroll_schedule_change_requests
    set status = 'cancelled', reviewed_by_user_id = actor_id, reviewed_at = pg_catalog.now(), review_note = note_value
    where id = request_row.id;
    perform private.append_payroll_schedule_workflow_action(
      'change_of_shift', request_row.id, 'cancel', actor_id, request_row.status, 'cancelled',
      before_snapshot_value, before_snapshot_value || jsonb_build_object('status', 'cancelled'), note_value
    );
    return jsonb_build_object('requestId', request_row.id, 'status', 'cancelled');
  end if;

  if request_row.status <> 'pending_manager' then
    raise exception 'This schedule-change request has already been reviewed.' using errcode = '40901';
  end if;
  if request_row.direct_manager_id is not null then
    if not private.is_direct_reporting_manager(actor_id, request_row.employee_id) then
      raise exception 'Only the employee''s current direct manager may review this request.' using errcode = '42501';
    end if;
  elsif not private.payroll_time_data_access() then
    raise exception 'A payroll reviewer is required when no direct manager is configured.' using errcode = '42501';
  end if;

  if lower(p_action) = 'reject' then
    update public.payroll_schedule_change_requests
    set status = 'rejected', reviewed_by_user_id = actor_id, reviewed_at = pg_catalog.now(), review_note = note_value
    where id = request_row.id;
    perform private.append_payroll_schedule_workflow_action(
      'change_of_shift', request_row.id, 'reject', actor_id, request_row.status, 'rejected',
      before_snapshot_value, before_snapshot_value || jsonb_build_object('status', 'rejected'), note_value
    );
    return jsonb_build_object('requestId', request_row.id, 'status', 'rejected');
  end if;

  select * into current_schedule
  from public.payroll_employee_schedules schedule
  where schedule.id = request_row.current_schedule_id
    and schedule.employee_id = request_row.employee_id
  for update;
  if not found or current_schedule.record_status not in ('approved', 'active') then
    raise exception 'The original schedule has changed. Submit a new request.' using errcode = '40901';
  end if;
  if current_schedule.shift_date <> request_row.work_date
     or current_schedule.shift_preset_id = request_row.requested_shift_preset_id then
    raise exception 'The schedule request is stale or does not change the shift.' using errcode = '40901';
  end if;
  if private.payroll_approved_leave_exists(request_row.employee_id, request_row.work_date) then
    raise exception 'An approved leave now covers this date. Resolve the leave first.' using errcode = '22023';
  end if;

  select * into requested_preset
  from public.payroll_shift_presets preset
  where preset.id = request_row.requested_shift_preset_id
    and preset.approval_status in ('approved', 'active')
    and preset.is_active
    and preset.effective_start_date <= request_row.work_date
    and (preset.effective_end_date is null or preset.effective_end_date > request_row.work_date)
  for share;
  if not found then
    raise exception 'The requested shift preset is no longer active for this date.' using errcode = '22023';
  end if;

  interpretation_exists := private.payroll_schedule_interpretation_exists(request_row.employee_id, request_row.work_date);
  update public.payroll_employee_schedules
  set record_status = 'superseded', updated_at = pg_catalog.now()
  where id = current_schedule.id;

  insert into public.payroll_employee_schedules (
    employee_id, worker_assignment_id, shift_preset_id, shift_date,
    recurring_rule_id, schedule_source, is_override, override_reason,
    version, record_status, source_document_ref, source_url, source_version,
    change_reason, requested_by_user_id, requested_at, created_by_user_id
  ) values (
    request_row.employee_id, current_schedule.worker_assignment_id, requested_preset.id, current_schedule.shift_date,
    null, 'change_of_shift', true, format('Approved change-of-shift request %s', request_row.id),
    current_schedule.version + 1, 'draft',
    format('payroll-cos:%s;supersedes:%s', request_row.id, current_schedule.id),
    null, null, request_row.reason, request_row.requested_by_user_id, request_row.created_at, actor_id
  ) returning id into new_schedule_id;

  update public.payroll_employee_schedules
  set record_status = 'approved',
      approved_by_user_id = actor_id,
      approved_at = pg_catalog.now(),
      approval_note = coalesce(note_value, 'Approved through the schedule workflow'),
      updated_at = pg_catalog.now()
  where id = new_schedule_id;

  update public.payroll_schedule_change_requests
  set status = 'approved', reviewed_by_user_id = actor_id, reviewed_at = pg_catalog.now(), review_note = note_value
  where id = request_row.id;
  after_snapshot_value := before_snapshot_value || jsonb_build_object(
    'status', 'approved',
    'newScheduleId', new_schedule_id,
    'requiresReinterpretation', interpretation_exists
  );
  perform private.append_payroll_schedule_workflow_action(
    'change_of_shift', request_row.id, 'approve', actor_id, request_row.status, 'approved',
    before_snapshot_value, after_snapshot_value, note_value
  );

  update public.payroll_schedule_change_requests
  set status = 'applied',
      applied_schedule_id = new_schedule_id,
      applied_at = pg_catalog.now(),
      requires_reinterpretation = interpretation_exists
  where id = request_row.id;
  perform private.append_payroll_schedule_workflow_action(
    'change_of_shift', request_row.id, 'apply', actor_id, 'approved', 'applied',
    after_snapshot_value, after_snapshot_value || jsonb_build_object('status', 'applied'), note_value
  );

  return jsonb_build_object(
    'requestId', request_row.id,
    'status', 'applied',
    'appliedScheduleId', new_schedule_id,
    'requiresReinterpretation', interpretation_exists
  );
end;
$$;

create or replace function public.submit_payroll_shift_swap_request(
  p_requester_employee_id uuid,
  p_requester_schedule_id uuid,
  p_counterpart_employee_id uuid,
  p_counterpart_schedule_id uuid,
  p_reason text,
  p_source_document_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  requester_schedule public.payroll_employee_schedules;
  counterpart_schedule public.payroll_employee_schedules;
  requester_assignment public.payroll_worker_assignments;
  counterpart_assignment public.payroll_worker_assignments;
  requester_manager_id uuid;
  counterpart_manager_id uuid;
  direct_manager_id_value uuid;
  approval_mode_value text;
  source_snapshot_value jsonb;
  request_id uuid;
begin
  if actor_id is null then
    raise exception 'An active HRIS user is required.' using errcode = '42501';
  end if;
  if actor_id <> p_requester_employee_id then
    raise exception 'Only the requesting employee may submit a peer shift swap.' using errcode = '42501';
  end if;
  if p_requester_employee_id is null or p_counterpart_employee_id is null
     or p_requester_schedule_id is null or p_counterpart_schedule_id is null then
    raise exception 'Both employees and both current schedules are required.' using errcode = '22023';
  end if;
  if p_requester_employee_id = p_counterpart_employee_id then
    raise exception 'A shift swap requires two different employees.' using errcode = '22023';
  end if;
  if nullif(pg_catalog.btrim(p_reason), '') is null then
    raise exception 'A reason is required for a shift swap.' using errcode = '22023';
  end if;

  select * into requester_schedule
  from public.payroll_employee_schedules schedule
  where schedule.id = p_requester_schedule_id
    and schedule.employee_id = p_requester_employee_id
    and schedule.record_status in ('approved', 'active')
  for update;
  select * into counterpart_schedule
  from public.payroll_employee_schedules schedule
  where schedule.id = p_counterpart_schedule_id
    and schedule.employee_id = p_counterpart_employee_id
    and schedule.record_status in ('approved', 'active')
  for update;
  if requester_schedule.id is null or counterpart_schedule.id is null then
    raise exception 'One of the selected schedules is no longer current.' using errcode = '40901';
  end if;
  if requester_schedule.shift_date <> counterpart_schedule.shift_date then
    raise exception 'Both schedules must be on the same date.' using errcode = '22023';
  end if;
  if requester_schedule.shift_preset_id = counterpart_schedule.shift_preset_id then
    raise exception 'Both employees already have the same shift on this date.' using errcode = '22023';
  end if;

  select * into requester_assignment
  from public.payroll_worker_assignments assignment
  where assignment.id = requester_schedule.worker_assignment_id
    and assignment.employee_id = p_requester_employee_id;
  select * into counterpart_assignment
  from public.payroll_worker_assignments assignment
  where assignment.id = counterpart_schedule.worker_assignment_id
    and assignment.employee_id = p_counterpart_employee_id;
  if requester_assignment.id is null or counterpart_assignment.id is null
     or requester_assignment.payroll_group_id <> counterpart_assignment.payroll_group_id then
    raise exception 'Both employees must belong to the same payroll group for a swap.' using errcode = '22023';
  end if;
  if private.payroll_approved_leave_exists(p_requester_employee_id, requester_schedule.shift_date)
     or private.payroll_approved_leave_exists(p_counterpart_employee_id, counterpart_schedule.shift_date) then
    raise exception 'An approved leave already covers one of these schedules. Resolve the leave first.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.payroll_shift_swap_requests open_request
    where open_request.status in ('pending_counterparty', 'pending_manager', 'approved')
      and (
        open_request.requester_schedule_id in (requester_schedule.id, counterpart_schedule.id)
        or open_request.counterpart_schedule_id in (requester_schedule.id, counterpart_schedule.id)
      )
  ) then
    raise exception 'One of these schedules already has a pending swap.' using errcode = '40901';
  end if;

  requester_manager_id := private.current_direct_manager_id(p_requester_employee_id);
  counterpart_manager_id := private.current_direct_manager_id(p_counterpart_employee_id);
  if requester_manager_id is not null and counterpart_manager_id is not null
     and requester_manager_id <> counterpart_manager_id then
    raise exception 'Both employees must share the same direct manager for a single-manager swap approval.' using errcode = '22023';
  end if;
  direct_manager_id_value := coalesce(requester_manager_id, counterpart_manager_id);
  approval_mode_value := case when direct_manager_id_value is null then 'payroll_exception' else 'direct_manager' end;
  source_snapshot_value := jsonb_build_object(
    'swapDate', requester_schedule.shift_date,
    'requester', jsonb_build_object(
      'employeeId', p_requester_employee_id,
      'scheduleId', requester_schedule.id,
      'workerAssignmentId', requester_schedule.worker_assignment_id,
      'shiftPresetId', requester_schedule.shift_preset_id,
      'version', requester_schedule.version
    ),
    'counterpart', jsonb_build_object(
      'employeeId', p_counterpart_employee_id,
      'scheduleId', counterpart_schedule.id,
      'workerAssignmentId', counterpart_schedule.worker_assignment_id,
      'shiftPresetId', counterpart_schedule.shift_preset_id,
      'version', counterpart_schedule.version
    )
  );

  insert into public.payroll_shift_swap_requests (
    swap_date, requester_employee_id, counterpart_employee_id,
    requester_schedule_id, counterpart_schedule_id, direct_manager_id,
    approval_mode, requested_by_user_id, reason, source_document_ref, source_snapshot
  ) values (
    requester_schedule.shift_date, p_requester_employee_id, p_counterpart_employee_id,
    requester_schedule.id, counterpart_schedule.id, direct_manager_id_value,
    approval_mode_value, actor_id, pg_catalog.btrim(p_reason),
    nullif(pg_catalog.btrim(p_source_document_ref), ''), source_snapshot_value
  ) returning id into request_id;

  perform private.append_payroll_schedule_workflow_action(
    'shift_swap', request_id, 'submit', actor_id, null, 'pending_counterparty',
    '{}'::jsonb, source_snapshot_value, p_reason
  );

  return jsonb_build_object(
    'requestId', request_id,
    'status', 'pending_counterparty',
    'approvalMode', approval_mode_value,
    'directManagerId', direct_manager_id_value,
    'swapDate', requester_schedule.shift_date
  );
end;
$$;

create or replace function public.respond_payroll_shift_swap_request(
  p_request_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  request_row public.payroll_shift_swap_requests;
  before_snapshot_value jsonb;
  note_value text := nullif(pg_catalog.btrim(p_note), '');
begin
  if actor_id is null then
    raise exception 'An active HRIS user is required.' using errcode = '42501';
  end if;
  if lower(p_action) not in ('accept', 'decline') then
    raise exception 'Unsupported counterparty response.' using errcode = '22023';
  end if;
  select * into request_row
  from public.payroll_shift_swap_requests request
  where request.id = p_request_id
  for update;
  if not found then
    raise exception 'Shift-swap request not found.' using errcode = 'P0002';
  end if;
  if request_row.status <> 'pending_counterparty' or request_row.counterpart_employee_id <> actor_id then
    raise exception 'This swap is not awaiting your response.' using errcode = '42501';
  end if;

  before_snapshot_value := jsonb_build_object(
    'requestId', request_row.id,
    'status', request_row.status,
    'counterpartyStatus', request_row.counterparty_status
  );
  if lower(p_action) = 'accept' then
    update public.payroll_shift_swap_requests
    set status = 'pending_manager',
        counterparty_status = 'accepted',
        counterparty_responded_by_user_id = actor_id,
        counterparty_responded_at = pg_catalog.now(),
        counterparty_note = note_value
    where id = request_row.id;
    perform private.append_payroll_schedule_workflow_action(
      'shift_swap', request_row.id, 'counterparty_accept', actor_id,
      request_row.status, 'pending_manager', before_snapshot_value,
      before_snapshot_value || jsonb_build_object('status', 'pending_manager', 'counterpartyStatus', 'accepted'), note_value
    );
    return jsonb_build_object('requestId', request_row.id, 'status', 'pending_manager');
  end if;

  update public.payroll_shift_swap_requests
  set status = 'rejected',
      counterparty_status = 'declined',
      counterparty_responded_by_user_id = actor_id,
      counterparty_responded_at = pg_catalog.now(),
      counterparty_note = note_value,
      reviewed_by_user_id = actor_id,
      reviewed_at = pg_catalog.now(),
      review_note = note_value
  where id = request_row.id;
  perform private.append_payroll_schedule_workflow_action(
    'shift_swap', request_row.id, 'counterparty_decline', actor_id,
    request_row.status, 'rejected', before_snapshot_value,
    before_snapshot_value || jsonb_build_object('status', 'rejected', 'counterpartyStatus', 'declined'), note_value
  );
  return jsonb_build_object('requestId', request_row.id, 'status', 'rejected');
end;
$$;

create or replace function public.review_payroll_shift_swap_request(
  p_request_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  request_row public.payroll_shift_swap_requests;
  requester_schedule public.payroll_employee_schedules;
  counterpart_schedule public.payroll_employee_schedules;
  requester_new_schedule_id uuid;
  counterpart_new_schedule_id uuid;
  before_snapshot_value jsonb;
  after_snapshot_value jsonb;
  interpretation_exists boolean;
  note_value text := nullif(pg_catalog.btrim(p_note), '');
begin
  if actor_id is null then
    raise exception 'An active HRIS user is required.' using errcode = '42501';
  end if;
  if lower(p_action) not in ('approve', 'reject', 'cancel') then
    raise exception 'Unsupported shift-swap action.' using errcode = '22023';
  end if;
  select * into request_row
  from public.payroll_shift_swap_requests request
  where request.id = p_request_id
  for update;
  if not found then
    raise exception 'Shift-swap request not found.' using errcode = 'P0002';
  end if;

  before_snapshot_value := jsonb_build_object(
    'requestId', request_row.id,
    'swapDate', request_row.swap_date,
    'status', request_row.status,
    'counterpartyStatus', request_row.counterparty_status,
    'requesterScheduleId', request_row.requester_schedule_id,
    'counterpartScheduleId', request_row.counterpart_schedule_id
  );

  if lower(p_action) = 'cancel' then
    if actor_id <> request_row.requested_by_user_id then
      raise exception 'Only the requester may cancel this shift swap.' using errcode = '42501';
    end if;
    if request_row.status not in ('pending_counterparty', 'pending_manager') then
      raise exception 'Only an open shift swap may be cancelled.' using errcode = '40901';
    end if;
    update public.payroll_shift_swap_requests
    set status = 'cancelled', reviewed_by_user_id = actor_id, reviewed_at = pg_catalog.now(), review_note = note_value
    where id = request_row.id;
    perform private.append_payroll_schedule_workflow_action(
      'shift_swap', request_row.id, 'cancel', actor_id, request_row.status, 'cancelled',
      before_snapshot_value, before_snapshot_value || jsonb_build_object('status', 'cancelled'), note_value
    );
    return jsonb_build_object('requestId', request_row.id, 'status', 'cancelled');
  end if;

  if request_row.status <> 'pending_manager' or request_row.counterparty_status <> 'accepted' then
    raise exception 'This shift swap is not ready for manager review.' using errcode = '40901';
  end if;
  if request_row.direct_manager_id is not null then
    if not private.is_direct_reporting_manager(actor_id, request_row.requester_employee_id)
       or not private.is_direct_reporting_manager(actor_id, request_row.counterpart_employee_id) then
      raise exception 'Only the shared direct manager may review this shift swap.' using errcode = '42501';
    end if;
  elsif not private.payroll_time_data_access() then
    raise exception 'A payroll reviewer is required when no direct manager is configured.' using errcode = '42501';
  end if;

  if lower(p_action) = 'reject' then
    update public.payroll_shift_swap_requests
    set status = 'rejected', reviewed_by_user_id = actor_id, reviewed_at = pg_catalog.now(), review_note = note_value
    where id = request_row.id;
    perform private.append_payroll_schedule_workflow_action(
      'shift_swap', request_row.id, 'reject', actor_id, request_row.status, 'rejected',
      before_snapshot_value, before_snapshot_value || jsonb_build_object('status', 'rejected'), note_value
    );
    return jsonb_build_object('requestId', request_row.id, 'status', 'rejected');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(format('payroll-shift-swap:%s', request_row.id), 0)
  );
  select * into requester_schedule
  from public.payroll_employee_schedules schedule
  where schedule.id = request_row.requester_schedule_id
    and schedule.employee_id = request_row.requester_employee_id
  for update;
  select * into counterpart_schedule
  from public.payroll_employee_schedules schedule
  where schedule.id = request_row.counterpart_schedule_id
    and schedule.employee_id = request_row.counterpart_employee_id
  for update;
  if requester_schedule.id is null or counterpart_schedule.id is null
     or requester_schedule.record_status not in ('approved', 'active')
     or counterpart_schedule.record_status not in ('approved', 'active')
     or requester_schedule.shift_date <> request_row.swap_date
     or counterpart_schedule.shift_date <> request_row.swap_date then
    raise exception 'One of the schedules changed. Submit a new shift swap.' using errcode = '40901';
  end if;
  if private.payroll_approved_leave_exists(request_row.requester_employee_id, request_row.swap_date)
     or private.payroll_approved_leave_exists(request_row.counterpart_employee_id, request_row.swap_date) then
    raise exception 'An approved leave now covers one of these schedules. Resolve the leave first.' using errcode = '22023';
  end if;

  interpretation_exists := private.payroll_schedule_interpretation_exists(request_row.requester_employee_id, request_row.swap_date)
    or private.payroll_schedule_interpretation_exists(request_row.counterpart_employee_id, request_row.swap_date);

  update public.payroll_employee_schedules
  set record_status = 'superseded', updated_at = pg_catalog.now()
  where id in (requester_schedule.id, counterpart_schedule.id);

  insert into public.payroll_employee_schedules (
    employee_id, worker_assignment_id, shift_preset_id, shift_date,
    recurring_rule_id, schedule_source, is_override, override_reason,
    version, record_status, source_document_ref, change_reason,
    requested_by_user_id, requested_at, created_by_user_id
  ) values (
    requester_schedule.employee_id, requester_schedule.worker_assignment_id, counterpart_schedule.shift_preset_id, requester_schedule.shift_date,
    null, 'shift_swap', true, format('Approved shift-swap request %s', request_row.id),
    requester_schedule.version + 1, 'draft',
    format('payroll-swap:%s;supersedes:%s', request_row.id, requester_schedule.id), request_row.reason,
    request_row.requested_by_user_id, request_row.created_at, actor_id
  ) returning id into requester_new_schedule_id;

  insert into public.payroll_employee_schedules (
    employee_id, worker_assignment_id, shift_preset_id, shift_date,
    recurring_rule_id, schedule_source, is_override, override_reason,
    version, record_status, source_document_ref, change_reason,
    requested_by_user_id, requested_at, created_by_user_id
  ) values (
    counterpart_schedule.employee_id, counterpart_schedule.worker_assignment_id, requester_schedule.shift_preset_id, counterpart_schedule.shift_date,
    null, 'shift_swap', true, format('Approved shift-swap request %s', request_row.id),
    counterpart_schedule.version + 1, 'draft',
    format('payroll-swap:%s;supersedes:%s', request_row.id, counterpart_schedule.id), request_row.reason,
    request_row.requested_by_user_id, request_row.created_at, actor_id
  ) returning id into counterpart_new_schedule_id;

  update public.payroll_employee_schedules
  set record_status = 'approved', approved_by_user_id = actor_id, approved_at = pg_catalog.now(),
      approval_note = coalesce(note_value, 'Approved through the schedule workflow'), updated_at = pg_catalog.now()
  where id in (requester_new_schedule_id, counterpart_new_schedule_id);

  update public.payroll_shift_swap_requests
  set status = 'approved', reviewed_by_user_id = actor_id, reviewed_at = pg_catalog.now(), review_note = note_value
  where id = request_row.id;
  after_snapshot_value := before_snapshot_value || jsonb_build_object(
    'status', 'approved',
    'requesterNewScheduleId', requester_new_schedule_id,
    'counterpartNewScheduleId', counterpart_new_schedule_id,
    'requiresReinterpretation', interpretation_exists
  );
  perform private.append_payroll_schedule_workflow_action(
    'shift_swap', request_row.id, 'approve', actor_id, request_row.status, 'approved',
    before_snapshot_value, after_snapshot_value, note_value
  );

  update public.payroll_shift_swap_requests
  set status = 'applied',
      applied_requester_schedule_id = requester_new_schedule_id,
      applied_counterpart_schedule_id = counterpart_new_schedule_id,
      applied_at = pg_catalog.now(),
      requires_reinterpretation = interpretation_exists
  where id = request_row.id;
  perform private.append_payroll_schedule_workflow_action(
    'shift_swap', request_row.id, 'apply', actor_id, 'approved', 'applied',
    after_snapshot_value, after_snapshot_value || jsonb_build_object('status', 'applied'), note_value
  );

  return jsonb_build_object(
    'requestId', request_row.id,
    'status', 'applied',
    'requesterScheduleId', requester_new_schedule_id,
    'counterpartScheduleId', counterpart_new_schedule_id,
    'requiresReinterpretation', interpretation_exists
  );
end;
$$;

drop trigger if exists payroll_leave_request_events_append on public.leave_requests;
create trigger payroll_leave_request_events_append
after insert or update on public.leave_requests
for each row execute function private.record_payroll_leave_request_event();

drop trigger if exists payroll_leave_request_events_immutable on public.payroll_leave_request_events;
create trigger payroll_leave_request_events_immutable
before update or delete on public.payroll_leave_request_events
for each row execute function private.prevent_payroll_workflow_event_mutation();

drop trigger if exists payroll_schedule_change_requests_guard on public.payroll_schedule_change_requests;
create trigger payroll_schedule_change_requests_guard
before insert or update on public.payroll_schedule_change_requests
for each row execute function private.guard_payroll_schedule_change_request();

drop trigger if exists payroll_shift_swap_requests_guard on public.payroll_shift_swap_requests;
create trigger payroll_shift_swap_requests_guard
before insert or update on public.payroll_shift_swap_requests
for each row execute function private.guard_payroll_shift_swap_request();

drop trigger if exists payroll_schedule_workflow_actions_guard on public.payroll_schedule_workflow_actions;
create trigger payroll_schedule_workflow_actions_guard
before insert on public.payroll_schedule_workflow_actions
for each row execute function private.guard_payroll_schedule_workflow_action();

drop trigger if exists payroll_schedule_workflow_actions_immutable on public.payroll_schedule_workflow_actions;
create trigger payroll_schedule_workflow_actions_immutable
before update or delete on public.payroll_schedule_workflow_actions
for each row execute function private.prevent_payroll_workflow_event_mutation();

alter table public.payroll_leave_request_events enable row level security;
alter table public.payroll_schedule_change_requests enable row level security;
alter table public.payroll_shift_swap_requests enable row level security;
alter table public.payroll_schedule_workflow_actions enable row level security;

drop policy if exists payroll_leave_request_events_authorized_read on public.payroll_leave_request_events;
create policy payroll_leave_request_events_authorized_read
on public.payroll_leave_request_events
for select to authenticated
using (
  private.payroll_time_data_access()
  or exists (
    select 1
    from public.leave_requests leave_request
    where leave_request.id = payroll_leave_request_events.leave_request_id
      and (
        leave_request.employee_id = public.current_hris_user_id()
        or private.is_direct_reporting_manager(public.current_hris_user_id(), leave_request.employee_id)
      )
  )
);

drop policy if exists payroll_schedule_change_requests_authorized_read on public.payroll_schedule_change_requests;
create policy payroll_schedule_change_requests_authorized_read
on public.payroll_schedule_change_requests
for select to authenticated
using (
  private.payroll_time_data_access()
  or employee_id = public.current_hris_user_id()
  or requested_by_user_id = public.current_hris_user_id()
  or private.is_direct_reporting_manager(public.current_hris_user_id(), employee_id)
);

drop policy if exists payroll_shift_swap_requests_authorized_read on public.payroll_shift_swap_requests;
create policy payroll_shift_swap_requests_authorized_read
on public.payroll_shift_swap_requests
for select to authenticated
using (
  private.payroll_time_data_access()
  or requester_employee_id = public.current_hris_user_id()
  or counterpart_employee_id = public.current_hris_user_id()
  or requested_by_user_id = public.current_hris_user_id()
  or private.is_direct_reporting_manager(public.current_hris_user_id(), requester_employee_id)
  or private.is_direct_reporting_manager(public.current_hris_user_id(), counterpart_employee_id)
);

drop policy if exists payroll_schedule_workflow_actions_authorized_read on public.payroll_schedule_workflow_actions;
create policy payroll_schedule_workflow_actions_authorized_read
on public.payroll_schedule_workflow_actions
for select to authenticated
using (
  private.payroll_time_data_access()
  or (
    request_kind = 'change_of_shift'
    and exists (
      select 1 from public.payroll_schedule_change_requests request
      where request.id = payroll_schedule_workflow_actions.request_id
        and (
          request.employee_id = public.current_hris_user_id()
          or request.requested_by_user_id = public.current_hris_user_id()
          or private.is_direct_reporting_manager(public.current_hris_user_id(), request.employee_id)
        )
    )
  )
  or (
    request_kind = 'shift_swap'
    and exists (
      select 1 from public.payroll_shift_swap_requests request
      where request.id = payroll_schedule_workflow_actions.request_id
        and (
          request.requester_employee_id = public.current_hris_user_id()
          or request.counterpart_employee_id = public.current_hris_user_id()
          or request.requested_by_user_id = public.current_hris_user_id()
          or private.is_direct_reporting_manager(public.current_hris_user_id(), request.requester_employee_id)
          or private.is_direct_reporting_manager(public.current_hris_user_id(), request.counterpart_employee_id)
        )
    )
  )
);

revoke all on table
  public.payroll_leave_request_events,
  public.payroll_schedule_change_requests,
  public.payroll_shift_swap_requests,
  public.payroll_schedule_workflow_actions
from public, anon, authenticated;

grant select on table
  public.payroll_leave_request_events,
  public.payroll_schedule_change_requests,
  public.payroll_shift_swap_requests,
  public.payroll_schedule_workflow_actions
to authenticated;

grant all on table
  public.payroll_leave_request_events,
  public.payroll_schedule_change_requests,
  public.payroll_shift_swap_requests,
  public.payroll_schedule_workflow_actions
to service_role;

revoke all on function private.current_direct_manager_id(uuid) from public, anon, authenticated;
revoke all on function private.payroll_approved_leave_exists(uuid, date) from public, anon, authenticated;
revoke all on function private.payroll_schedule_interpretation_exists(uuid, date) from public, anon, authenticated;
revoke all on function private.prevent_payroll_workflow_event_mutation() from public, anon, authenticated;
revoke all on function private.record_payroll_leave_request_event() from public, anon, authenticated;
revoke all on function private.guard_payroll_schedule_change_request() from public, anon, authenticated;
revoke all on function private.guard_payroll_shift_swap_request() from public, anon, authenticated;
revoke all on function private.guard_payroll_schedule_workflow_action() from public, anon, authenticated;
revoke all on function private.append_payroll_schedule_workflow_action(text, uuid, text, uuid, text, text, jsonb, jsonb, text) from public, anon, authenticated;

revoke all on function public.get_payroll_schedule_workflow_context(date, date) from public, anon;
grant execute on function public.get_payroll_schedule_workflow_context(date, date) to authenticated, service_role;
revoke all on function public.submit_payroll_schedule_change_request(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.submit_payroll_schedule_change_request(uuid, uuid, uuid, text, text) to authenticated, service_role;
revoke all on function public.review_payroll_schedule_change_request(uuid, text, text) from public, anon;
grant execute on function public.review_payroll_schedule_change_request(uuid, text, text) to authenticated, service_role;
revoke all on function public.submit_payroll_shift_swap_request(uuid, uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.submit_payroll_shift_swap_request(uuid, uuid, uuid, uuid, text, text) to authenticated, service_role;
revoke all on function public.respond_payroll_shift_swap_request(uuid, text, text) from public, anon;
grant execute on function public.respond_payroll_shift_swap_request(uuid, text, text) to authenticated, service_role;
revoke all on function public.review_payroll_shift_swap_request(uuid, text, text) from public, anon;
grant execute on function public.review_payroll_shift_swap_request(uuid, text, text) to authenticated, service_role;

comment on table public.payroll_leave_request_events is
  'Append-only audit events for legacy leave request changes; leave approval routing remains in the existing conditional workflow.';
comment on table public.payroll_schedule_change_requests is
  'Approval requests for date-specific canonical payroll schedule changes. Approval supersedes the prior schedule version.';
comment on table public.payroll_shift_swap_requests is
  'Two-party shift swap requests. Counterparty acceptance precedes one-manager approval and atomic schedule supersession.';
comment on table public.payroll_schedule_workflow_actions is
  'Append-only audit history for change-of-shift and shift-swap workflow actions.';

notify pgrst, 'reload schema';
