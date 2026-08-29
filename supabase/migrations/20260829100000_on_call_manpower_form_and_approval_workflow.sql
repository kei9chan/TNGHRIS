-- On-call manpower request redesign and staged approval workflow.
-- This migration is additive and preserves existing request rows and legacy
-- item aliases. New workflow mutations are performed only by audited RPCs.

alter table public.manpower_requests
  add column if not exists approval_stage text not null default 'BUSINESS_UNIT_MANAGER',
  add column if not exists approval_issue text,
  add column if not exists approval_history jsonb not null default '[]'::jsonb;

-- Existing completed rows must not look like new manager-stage requests.
update public.manpower_requests
set approval_stage = case
  when status = 'Approved' then 'COMPLETED'
  when status = 'Rejected' then 'REJECTED'
  else 'BUSINESS_UNIT_MANAGER'
end
where approval_stage = 'BUSINESS_UNIT_MANAGER';

create table if not exists public.manpower_department_rates (
  department_id uuid primary key references public.departments(id) on delete cascade,
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  default_rate numeric(12,2) not null default 610 check (default_rate >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.hris_users(id)
);

alter table public.manpower_department_rates enable row level security;

drop policy if exists manpower_department_rates_read on public.manpower_department_rates;
create policy manpower_department_rates_read
  on public.manpower_department_rates
  for select to authenticated
  using (true);

revoke insert, update, delete, truncate on public.manpower_department_rates from anon, authenticated;
grant select on public.manpower_department_rates to authenticated;

-- Seed a useful daily default from active daily rates where available. Future
-- edits to this table are preserved because this insert is intentionally
-- conflict-safe.
insert into public.manpower_department_rates (department_id, business_unit_id, default_rate)
select
  department.id,
  department.business_unit_id,
  coalesce(
    round((percentile_cont(0.5) within group (order by employee.rate_amount)
      filter (where lower(coalesce(employee.rate_type, '')) = 'daily'
        and employee.rate_amount is not null
        and employee.rate_amount > 0))::numeric, 2),
    610
  )
from public.departments department
left join public.hris_users employee
  on employee.department_id = department.id
 and lower(employee.status) = 'active'
group by department.id, department.business_unit_id
on conflict (department_id) do nothing;

create table if not exists public.manpower_request_approval_assignments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.manpower_requests(id) on delete cascade,
  approval_stage text not null check (approval_stage in ('BUSINESS_UNIT_MANAGER', 'BOD_GM')),
  approver_user_id uuid not null references public.hris_users(id) on delete cascade,
  approver_role text not null,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  comments text,
  assigned_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (request_id, approval_stage, approver_user_id)
);

create index if not exists manpower_assignment_approver_status_idx
  on public.manpower_request_approval_assignments (approver_user_id, status, approval_stage);
create index if not exists manpower_assignment_request_stage_idx
  on public.manpower_request_approval_assignments (request_id, approval_stage, status);

alter table public.manpower_request_approval_assignments enable row level security;

create or replace function private.manpower_role_label(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case private.workflow_user_role_snapshot(p_user_id)
    when 'GeneralManager' then 'General Manager'
    else coalesce(private.workflow_user_role_snapshot(p_user_id), 'Requester')
  end
$$;

revoke all on function private.manpower_role_label(uuid) from public, anon, authenticated;

create or replace function private.is_manpower_request_owner(p_request_id uuid, p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_actor_id is not null
    and exists (
      select 1
      from public.manpower_requests request
      where request.id = p_request_id
        and request.requester_id = p_actor_id
    )
$$;

revoke all on function private.is_manpower_request_owner(uuid, uuid) from public, anon, authenticated;

create or replace function private.is_manpower_active_approver(p_actor_id uuid, p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_actor_id is not null
    and exists (
      select 1
      from public.manpower_request_approval_assignments assignment
      join public.manpower_requests request on request.id = assignment.request_id
      where assignment.request_id = p_request_id
        and assignment.approver_user_id = p_actor_id
        and assignment.status = 'Pending'
        and request.status = 'Pending'
        and request.approval_stage = assignment.approval_stage
    )
$$;

revoke all on function private.is_manpower_active_approver(uuid, uuid) from public, anon, authenticated;

drop policy if exists manpower_request_assignments_read on public.manpower_request_approval_assignments;
create policy manpower_request_assignments_read
  on public.manpower_request_approval_assignments
  for select to authenticated
  using (
    approver_user_id = public.current_hris_user_id()
    or private.is_manpower_request_owner(request_id, public.current_hris_user_id())
    or public.is_system_admin()
    or public.has_active_role('HR Manager')
  );

revoke insert, update, delete, truncate on public.manpower_request_approval_assignments from anon, authenticated;
grant select on public.manpower_request_approval_assignments to authenticated;

-- The request itself is visible to a requester, an active assigned approver,
-- or an explicitly authorized HR/Admin history scope. A BOD/GM assignment is
-- an approval grant even when that role's feature row only contains approve.
drop policy if exists manpower_authorized_view on public.manpower_requests;
create policy manpower_authorized_view
  on public.manpower_requests
  for select to authenticated
  using (
    (
      public.has_feature_permission('Manpower', 'view')
      and (
        requester_id = public.current_hris_user_id()
        or (
          status <> 'Pending'
          and public.can_access_hris_user(requester_id)
        )
        or (
          status = 'Pending'
          and (
            public.is_system_admin()
            or public.has_active_role('HR Manager')
            or public.has_active_role('HR Staff')
          )
          and public.can_access_hris_user(requester_id)
        )
      )
    )
    or (
      private.is_manpower_active_approver(public.current_hris_user_id(), id)
      and (
        public.has_feature_permission('Manpower', 'approve')
        or public.has_feature_permission('Manpower', 'review')
        or public.is_system_admin()
      )
    )
  );

drop policy if exists manpower_authorized_update on public.manpower_requests;
create policy manpower_authorized_update
  on public.manpower_requests
  for update to authenticated
  using (
    (
      private.is_manpower_active_approver(public.current_hris_user_id(), id)
      and (
        public.has_feature_permission('Manpower', 'approve')
        or public.has_feature_permission('Manpower', 'reject')
        or public.has_feature_permission('Manpower', 'review')
      )
    )
    or (
      (
        public.is_system_admin()
        or public.has_active_role('HR Manager')
        or public.has_active_role('HR Staff')
      )
      and public.can_access_hris_user(requester_id)
    )
  )
  with check (
    requester_id = public.current_hris_user_id()
    or private.is_manpower_active_approver(public.current_hris_user_id(), id)
    or (
      (
        public.is_system_admin()
        or public.has_active_role('HR Manager')
        or public.has_active_role('HR Staff')
      )
      and public.can_access_hris_user(requester_id)
    )
  );

create or replace function private.validate_manpower_request_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  department_value text;
  reason_value text;
  other_reason_value text;
  required_fte numeric;
  reporting_fte numeric;
  provided_needed numeric;
  calculated_needed numeric;
  seen_departments text[] := array[]::text[];
begin
  if new.items is null or jsonb_typeof(new.items) <> 'array' then
    raise exception 'On-call request items must be an array.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(new.items) loop
    -- Legacy rows do not contain the redesigned keys and remain readable.
    -- New rows are validated at the database boundary as well as in the UI.
    if not (item ? 'requiredFte' or item ? 'required_fte') then
      continue;
    end if;

    department_value := nullif(coalesce(item->>'departmentId', item->>'department_id'), '');
    if department_value is null then
      raise exception 'Every on-call row must have a department.' using errcode = '23514';
    end if;
    if department_value = any(seen_departments) then
      raise exception 'A department may appear only once in an on-call request.' using errcode = '23505';
    end if;
    seen_departments := array_append(seen_departments, department_value);

    if not exists (
      select 1
      from public.departments department
      where department.id = department_value::uuid
        and department.business_unit_id = new.business_unit_id
    ) then
      raise exception 'The selected department does not belong to the selected Business Unit.' using errcode = '23514';
    end if;

    required_fte := coalesce(
      nullif(item->>'requiredFte', '')::numeric,
      nullif(item->>'required_fte', '')::numeric,
      0
    );
    reporting_fte := coalesce(
      nullif(item->>'reportingFte', '')::numeric,
      nullif(item->>'reporting_fte', '')::numeric,
      nullif(item->>'currentFte', '')::numeric,
      0
    );
    provided_needed := coalesce(
      nullif(item->>'onCallNeeded', '')::numeric,
      nullif(item->>'on_call_needed', '')::numeric,
      nullif(item->>'requestedCount', '')::numeric,
      0
    );
    calculated_needed := greatest(required_fte - reporting_fte, 0);

    if required_fte < 0 or reporting_fte < 0 then
      raise exception 'FTE values cannot be negative.' using errcode = '23514';
    end if;
    if abs(provided_needed - calculated_needed) > 0.01 then
      raise exception 'On-call needed must equal Required FTE minus Reporting FTE.' using errcode = '23514';
    end if;
    if coalesce(nullif(item->>'ratePerDay', '')::numeric, nullif(item->>'costPerHead', '')::numeric, 0) < 0 then
      raise exception 'Rate per day cannot be negative.' using errcode = '23514';
    end if;

    reason_value := nullif(trim(coalesce(item->>'reason', item->>'justification')), '');
    other_reason_value := nullif(trim(coalesce(item->>'otherReason', item->>'other_reason')), '');
    if calculated_needed > 0 and reason_value is null then
      raise exception 'A reason is required when on-call coverage is needed.' using errcode = '23514';
    end if;
    if calculated_needed > 0 and reason_value = 'Other' and other_reason_value is null then
      raise exception 'Explain the other on-call reason.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function private.validate_manpower_request_items() from public, anon, authenticated;

drop trigger if exists validate_manpower_request_items on public.manpower_requests;
create trigger validate_manpower_request_items
  before insert or update of items on public.manpower_requests
  for each row execute function private.validate_manpower_request_items();

-- Direct table updates are no longer an approval path. The trusted workflow
-- functions set this transaction-local marker immediately before their own
-- audited updates.
create or replace function private.guard_manpower_workflow_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_jsonb(new) is distinct from to_jsonb(old)
     and current_setting('app.manpower_workflow_mutation', true) <> 'on' then
    raise exception 'On-call requests must be changed through the audited approval workflow.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_manpower_workflow_update() from public, anon, authenticated;

drop trigger if exists guard_manpower_workflow_update on public.manpower_requests;
create trigger guard_manpower_workflow_update
  before update on public.manpower_requests
  for each row execute function private.guard_manpower_workflow_update();

create or replace function public.initialize_manpower_request_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := coalesce(public.current_hris_user_id(), new.requester_id);
  business_unit_manager_id uuid;
  requester_role text := private.manpower_role_label(actor_id);
  assignment_message text;
  history_entry jsonb;
begin
  select manager.id
    into business_unit_manager_id
  from public.hris_users manager
  where manager.business_unit_id = new.business_unit_id
    and lower(manager.status) = 'active'
    and private.workflow_user_has_role(manager.id, 'Business Unit Manager')
  order by manager.full_name, manager.id
  limit 1;

  history_entry := jsonb_build_object(
    'stage', 'BUSINESS_UNIT_MANAGER',
    'action', 'Submitted / Assigned',
    'approverName', new.requester_name,
    'approverRole', requester_role,
    'assignedApproverId', business_unit_manager_id,
    'assignedApproverName', case when business_unit_manager_id is null then null else (select full_name from public.hris_users where id = business_unit_manager_id) end,
    'assignedApproverRole', case when business_unit_manager_id is null then null else 'Business Unit Manager' end,
    'timestamp', now(),
    'previousStatus', null,
    'newStatus', 'Pending',
    'previousStage', null,
    'newStage', 'BUSINESS_UNIT_MANAGER',
    'comments', case when business_unit_manager_id is null then 'Approver Configuration Required' else null end
  );

  perform set_config('app.manpower_workflow_mutation', 'on', true);
  update public.manpower_requests request
  set approval_stage = 'BUSINESS_UNIT_MANAGER',
      approval_issue = case when business_unit_manager_id is null then 'Approver Configuration Required' else null end,
      approval_history = coalesce(new.approval_history, '[]'::jsonb) || jsonb_build_array(history_entry)
  where request.id = new.id;

  insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
  select actor_id::text, actor.email, 'SUBMIT', 'ManpowerRequest', new.id::text,
    jsonb_build_object(
      'previousStatus', null,
      'newStatus', 'Pending',
      'previousStage', null,
      'newStage', 'BUSINESS_UNIT_MANAGER',
      'assignedApproverId', business_unit_manager_id,
      'assignedApproverRole', case when business_unit_manager_id is null then null else 'Business Unit Manager' end,
      'remarks', case when business_unit_manager_id is null then 'Approver Configuration Required' else 'Request submitted' end
    )::text
  from public.hris_users actor
  where actor.id = actor_id;

  if business_unit_manager_id is null then
    return new;
  end if;

  insert into public.manpower_request_approval_assignments (
    request_id, approval_stage, approver_user_id, approver_role, status
  ) values (
    new.id, 'BUSINESS_UNIT_MANAGER', business_unit_manager_id, 'Business Unit Manager', 'Pending'
  ) on conflict (request_id, approval_stage, approver_user_id) do nothing;

  assignment_message := format(
    'A new on-call manpower request for %s on %s was submitted by %s.',
    coalesce(new.business_unit_name, 'the selected Business Unit'),
    to_char(new.date_needed, 'Mon DD, YYYY'),
    new.requester_name
  );
  insert into public.notifications (
    user_id, type, title, message, link, is_read, related_entity_id, dedupe_key
  ) values (
    business_unit_manager_id::text,
    'MANPOWER_REQUEST_SUBMITTED',
    'New On-Call Request',
    assignment_message,
    '/approvals?type=manpower&item=' || new.id::text,
    false,
    new.id::text,
    format('manpower:%s:BUSINESS_UNIT_MANAGER:%s', new.id, business_unit_manager_id)
  ) on conflict (user_id, dedupe_key) do nothing;

  insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
  select actor_id::text, actor.email, 'ASSIGN', 'ManpowerRequest', new.id::text,
    jsonb_build_object(
      'approvalStage', 'BUSINESS_UNIT_MANAGER',
      'assignedApproverId', business_unit_manager_id,
      'assignedApproverName', manager.full_name,
      'assignedApproverRole', 'Business Unit Manager',
      'remarks', 'Initial Business Unit Manager approval assignment'
    )::text
  from public.hris_users actor
  cross join public.hris_users manager
  where actor.id = actor_id and manager.id = business_unit_manager_id;
  return new;
end;
$$;

revoke all on function public.initialize_manpower_request_workflow() from public, anon, authenticated;

drop trigger if exists initialize_manpower_request_workflow on public.manpower_requests;
create trigger initialize_manpower_request_workflow
  after insert on public.manpower_requests
  for each row execute function public.initialize_manpower_request_workflow();

create or replace function public.get_department_reporting_fte(
  p_business_unit_id uuid,
  p_department_id uuid,
  p_date date
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reporting_fte integer;
begin
  if public.current_hris_user_id() is null
     or not public.has_feature_permission('Manpower', 'create')
     or not public.has_workflow_permission('Manpower', 'submit') then
    raise exception 'You are not authorized to calculate reporting FTE.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.departments department
    where department.id = p_department_id
      and department.business_unit_id = p_business_unit_id
  ) then
    raise exception 'The department is not part of the selected Business Unit.' using errcode = '23514';
  end if;

  select count(distinct assignment.employee_id)::integer
    into reporting_fte
  from public.shift_assignments assignment
  join public.hris_users employee on employee.id = assignment.employee_id
  where assignment.date = p_date
    and assignment.business_unit_id = p_business_unit_id
    and assignment.department_id = p_department_id
    and lower(employee.status) = 'active';
  return coalesce(reporting_fte, 0);
end;
$$;

revoke all on function public.get_department_reporting_fte(uuid, uuid, date) from public, anon;
grant execute on function public.get_department_reporting_fte(uuid, uuid, date) to authenticated;

create or replace function public.get_my_pending_manpower_approval_ids()
returns table (request_id uuid, approval_stage text)
language sql
stable
security definer
set search_path = ''
as $$
  select assignment.request_id, assignment.approval_stage
  from public.manpower_request_approval_assignments assignment
  join public.manpower_requests request on request.id = assignment.request_id
  where assignment.approver_user_id = public.current_hris_user_id()
    and assignment.status = 'Pending'
    and request.status = 'Pending'
    and request.approval_stage = assignment.approval_stage
  order by assignment.assigned_at asc
$$;

revoke all on function public.get_my_pending_manpower_approval_ids() from public, anon;
grant execute on function public.get_my_pending_manpower_approval_ids() to authenticated;

create or replace function public.process_manpower_request_approval(
  p_request_id uuid,
  p_decision text,
  p_comments text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_name text;
  actor_role text;
  request_row public.manpower_requests%rowtype;
  assignment_row public.manpower_request_approval_assignments%rowtype;
  decision_value text := lower(trim(coalesce(p_decision, '')));
  comments_value text := nullif(trim(coalesce(p_comments, '')), '');
  pool_count integer := 0;
  history_entry jsonb;
  pool_message text;
begin
  if actor_id is null then
    raise exception 'Your active HRIS account could not be resolved.' using errcode = '42501';
  end if;
  if decision_value not in ('approve', 'reject') then
    raise exception 'Approval decision must be approve or reject.' using errcode = '22023';
  end if;
  if decision_value = 'reject' and comments_value is null then
    raise exception 'A comment is required when rejecting an on-call request.' using errcode = '22023';
  end if;

  select * into request_row
  from public.manpower_requests request
  where request.id = p_request_id
  for update;
  if not found then
    raise exception 'This on-call request is not available.' using errcode = 'P0002';
  end if;
  if request_row.status <> 'Pending' or request_row.approval_stage not in ('BUSINESS_UNIT_MANAGER', 'BOD_GM') then
    raise exception 'This on-call request has already been processed.' using errcode = '40901';
  end if;

  select * into assignment_row
  from public.manpower_request_approval_assignments assignment
  where assignment.request_id = request_row.id
    and assignment.approval_stage = request_row.approval_stage
    and assignment.approver_user_id = actor_id
    and assignment.status = 'Pending'
  for update;
  if not found then
    raise exception 'This on-call request is not assigned to you for approval.' using errcode = '42501';
  end if;

  select full_name into actor_name from public.hris_users where id = actor_id;
  actor_role := private.manpower_role_label(actor_id);
  perform set_config('app.manpower_workflow_mutation', 'on', true);

  update public.manpower_request_approval_assignments assignment
  set status = case when decision_value = 'approve' then 'Approved' else 'Rejected' end,
      comments = comments_value,
      decided_at = now(),
      updated_at = now()
  where assignment.id = assignment_row.id;

  if decision_value = 'reject' then
    history_entry := jsonb_build_object(
      'stage', request_row.approval_stage,
      'action', 'Rejected',
      'approverName', actor_name,
      'approverRole', actor_role,
      'timestamp', now(),
      'previousStatus', request_row.status,
      'newStatus', 'Rejected',
      'previousStage', request_row.approval_stage,
      'newStage', 'REJECTED',
      'comments', comments_value
    );
    update public.manpower_request_approval_assignments assignment
    set status = 'Cancelled',
        comments = coalesce(assignment.comments, 'Request rejected by another approver.'),
        updated_at = now()
    where assignment.request_id = request_row.id
      and assignment.status = 'Pending';
    update public.manpower_requests request
    set status = 'Rejected',
        approval_stage = 'REJECTED',
        approval_issue = null,
        approved_by = actor_id,
        approved_at = now(),
        rejection_reason = comments_value,
        approval_history = coalesce(request.approval_history, '[]'::jsonb) || jsonb_build_array(history_entry)
    where request.id = request_row.id;

    insert into public.notifications (user_id, type, title, message, link, is_read, related_entity_id, dedupe_key)
    values (
      request_row.requester_id::text,
      'MANPOWER_REQUEST_REJECTED',
      'On-Call Request Rejected',
      format('Your on-call request for %s on %s was rejected by %s: %s', request_row.business_unit_name, to_char(request_row.date_needed, 'Mon DD, YYYY'), actor_name, comments_value),
      '/payroll/manpower-planning?requestId=' || request_row.id::text,
      false,
      request_row.id::text,
      format('manpower:%s:REJECTED', request_row.id)
    ) on conflict (user_id, dedupe_key) do nothing;

    insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
    select actor_id::text, actor.email, 'REJECT', 'ManpowerRequest', request_row.id::text,
      jsonb_build_object(
        'approvalStage', request_row.approval_stage,
        'previousStatus', request_row.status,
        'newStatus', 'Rejected',
        'approverName', actor_name,
        'approverRole', actor_role,
        'comments', comments_value
      )::text
    from public.hris_users actor where actor.id = actor_id;
  elsif request_row.approval_stage = 'BUSINESS_UNIT_MANAGER' then
    insert into public.manpower_request_approval_assignments (
      request_id, approval_stage, approver_user_id, approver_role, status
    )
    select request_row.id,
      'BOD_GM',
      approver.id,
      case when private.workflow_user_has_role(approver.id, 'Board of Director') then 'Board of Director' else 'General Manager' end,
      'Pending'
    from public.hris_users approver
    where lower(approver.status) = 'active'
      and (
        private.workflow_user_has_role(approver.id, 'Board of Director')
        or private.workflow_user_has_role(approver.id, 'GeneralManager')
      )
    on conflict (request_id, approval_stage, approver_user_id) do nothing;
    get diagnostics pool_count = row_count;

    history_entry := jsonb_build_object(
      'stage', 'BUSINESS_UNIT_MANAGER',
      'action', 'Approved',
      'approverName', actor_name,
      'approverRole', actor_role,
      'timestamp', now(),
      'previousStatus', request_row.status,
      'newStatus', 'Pending',
      'previousStage', 'BUSINESS_UNIT_MANAGER',
      'newStage', 'BOD_GM',
      'comments', comments_value,
      'assignedApproverRole', 'BOD / GM approval pool',
      'assignedApproverCount', pool_count
    );
    update public.manpower_requests request
    set approval_stage = 'BOD_GM',
        approval_issue = case when pool_count = 0 then 'Approver Configuration Required' else null end,
        approval_history = coalesce(request.approval_history, '[]'::jsonb) || jsonb_build_array(history_entry)
    where request.id = request_row.id;

    if pool_count > 0 then
      pool_message := format('On-call request for %s is awaiting one BOD or General Manager approval.', request_row.business_unit_name);
      insert into public.notifications (user_id, type, title, message, link, is_read, related_entity_id, dedupe_key)
      select assignment.approver_user_id::text,
        'MANPOWER_REQUEST_SUBMITTED',
        'On-Call Request Awaiting BOD / GM Approval',
        pool_message,
        '/approvals?type=manpower&item=' || request_row.id::text,
        false,
        request_row.id::text,
        format('manpower:%s:BOD_GM:%s', request_row.id, assignment.approver_user_id)
      from public.manpower_request_approval_assignments assignment
      where assignment.request_id = request_row.id
        and assignment.approval_stage = 'BOD_GM'
        and assignment.status = 'Pending'
      on conflict (user_id, dedupe_key) do nothing;
    end if;

    insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
    select actor_id::text, actor.email, 'APPROVE', 'ManpowerRequest', request_row.id::text,
      jsonb_build_object(
        'approvalStage', 'BUSINESS_UNIT_MANAGER',
        'previousStatus', request_row.status,
        'newStatus', 'Pending',
        'nextStage', 'BOD_GM',
        'approverName', actor_name,
        'approverRole', actor_role,
        'comments', comments_value,
        'approvalPoolCount', pool_count
      )::text
    from public.hris_users actor where actor.id = actor_id;
  else
    -- A single approval from the BOD/GM pool completes the request. The row
    -- lock above plus the pending assignment predicate prevents double action.
    history_entry := jsonb_build_object(
      'stage', 'BOD_GM',
      'action', 'Approved',
      'approverName', actor_name,
      'approverRole', actor_role,
      'timestamp', now(),
      'previousStatus', request_row.status,
      'newStatus', 'Approved',
      'previousStage', 'BOD_GM',
      'newStage', 'COMPLETED',
      'comments', comments_value
    );
    update public.manpower_request_approval_assignments assignment
    set status = 'Cancelled',
        comments = 'Completed by another BOD / GM approver.',
        updated_at = now()
    where assignment.request_id = request_row.id
      and assignment.approval_stage = 'BOD_GM'
      and assignment.status = 'Pending';
    update public.manpower_requests request
    set status = 'Approved',
        approval_stage = 'COMPLETED',
        approval_issue = null,
        approved_by = actor_id,
        approved_at = now(),
        rejection_reason = null,
        approval_history = coalesce(request.approval_history, '[]'::jsonb) || jsonb_build_array(history_entry)
    where request.id = request_row.id;

    insert into public.notifications (user_id, type, title, message, link, is_read, related_entity_id, dedupe_key)
    values (
      request_row.requester_id::text,
      'MANPOWER_REQUEST_APPROVED',
      'On-Call Request Approved',
      format('Your on-call request for %s on %s was approved by %s.', request_row.business_unit_name, to_char(request_row.date_needed, 'Mon DD, YYYY'), actor_name),
      '/payroll/manpower-planning?requestId=' || request_row.id::text,
      false,
      request_row.id::text,
      format('manpower:%s:COMPLETED', request_row.id)
    ) on conflict (user_id, dedupe_key) do nothing;

    insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
    select actor_id::text, actor.email, 'APPROVE', 'ManpowerRequest', request_row.id::text,
      jsonb_build_object(
        'approvalStage', 'BOD_GM',
        'previousStatus', request_row.status,
        'newStatus', 'Approved',
        'newStage', 'COMPLETED',
        'approverName', actor_name,
        'approverRole', actor_role,
        'comments', comments_value,
        'singleApprovalPoolRule', true
      )::text
    from public.hris_users actor where actor.id = actor_id;
  end if;

  select * into request_row from public.manpower_requests request where request.id = p_request_id;
  return jsonb_build_object(
    'requestId', request_row.id,
    'status', request_row.status,
    'approvalStage', request_row.approval_stage,
    'approvalIssue', request_row.approval_issue,
    'approverName', actor_name,
    'approverRole', actor_role,
    'approvalHistory', request_row.approval_history
  );
end;
$$;

revoke all on function public.process_manpower_request_approval(uuid, text, text) from public, anon;
grant execute on function public.process_manpower_request_approval(uuid, text, text) to authenticated;
