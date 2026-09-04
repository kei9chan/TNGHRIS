-- Asset purchase requests follow one auditable route:
-- direct reporting manager, then the configured number of distinct BOD users.
-- Asset return records keep their existing workflow.

alter table public.asset_requests
  add column if not exists approval_stage text,
  add column if not exists required_bod_approvals smallint not null default 2,
  add column if not exists bod_approval_count smallint not null default 0,
  add column if not exists manager_approved_by uuid references public.hris_users(id) on delete restrict,
  add column if not exists manager_approved_at timestamptz,
  add column if not exists approval_issue text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'asset_requests_approval_stage_check'
      and conrelid = 'public.asset_requests'::regclass
  ) then
    alter table public.asset_requests
      add constraint asset_requests_approval_stage_check
      check (approval_stage is null or approval_stage in ('DIRECT_MANAGER', 'BOD', 'COMPLETED', 'REJECTED'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'asset_requests_required_bod_approvals_check'
      and conrelid = 'public.asset_requests'::regclass
  ) then
    alter table public.asset_requests
      add constraint asset_requests_required_bod_approvals_check
      check (required_bod_approvals in (1, 2));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'asset_requests_bod_approval_count_check'
      and conrelid = 'public.asset_requests'::regclass
  ) then
    alter table public.asset_requests
      add constraint asset_requests_bod_approval_count_check
      check (bod_approval_count between 0 and required_bod_approvals);
  end if;
end;
$$;

create table if not exists public.asset_request_approval_assignments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.asset_requests(id) on delete restrict,
  approval_stage text not null check (approval_stage in ('DIRECT_MANAGER', 'BOD')),
  approver_user_id uuid not null references public.hris_users(id) on delete restrict,
  approver_role text not null,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected', 'Closed')),
  assigned_at timestamptz not null default now(),
  acted_at timestamptz,
  comments text,
  unique (request_id, approval_stage, approver_user_id)
);

create index if not exists asset_request_approvals_user_pending_idx
  on public.asset_request_approval_assignments(approver_user_id, status, assigned_at desc)
  where status = 'Pending';

create index if not exists asset_request_approvals_request_stage_idx
  on public.asset_request_approval_assignments(request_id, approval_stage, status);

create table if not exists public.asset_request_approval_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.asset_requests(id) on delete restrict,
  assignment_id uuid references public.asset_request_approval_assignments(id) on delete restrict,
  actor_user_id uuid references public.hris_users(id) on delete restrict,
  actor_role text not null,
  approval_stage text not null,
  action text not null check (action in ('Submitted', 'Workflow Repaired', 'Approved', 'Rejected')),
  comments text,
  created_at timestamptz not null default now()
);

create index if not exists asset_request_approval_history_request_idx
  on public.asset_request_approval_history(request_id, created_at, id);

alter table public.asset_request_approval_assignments enable row level security;
alter table public.asset_request_approval_history enable row level security;
revoke all on public.asset_request_approval_assignments from public, anon, authenticated;
revoke all on public.asset_request_approval_history from public, anon, authenticated;

insert into public.approver_configs(config_key, config_value, updated_at)
values ('asset_request_approvals', jsonb_build_object('required_bod_approvals', 2), now())
on conflict (config_key) do nothing;

create or replace function private.is_asset_request_bod(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hris_users candidate
    where candidate.id = p_user_id
      and lower(btrim(coalesce(candidate.status, ''))) = 'active'
      and (
        lower(btrim(coalesce(candidate.role, ''))) in ('board of director', 'board of directors', 'bod')
        or exists (
          select 1
          from public.user_roles assignment
          join public.roles role_record on role_record.id = assignment.role_id and role_record.is_active
          where assignment.user_id = candidate.id
            and assignment.is_active
            and lower(btrim(assignment.role_id)) in ('board of director', 'board of directors', 'bod')
        )
      )
  )
$$;

create or replace function private.asset_request_required_bod_approvals()
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when config.config_value ->> 'required_bod_approvals' = '1' then 1::smallint
    when config.config_value ->> 'required_bod_approvals' = '2' then 2::smallint
    else 2::smallint
  end
  from (select 1) seed
  left join public.approver_configs config
    on config.config_key = 'asset_request_approvals'
$$;

revoke all on function private.is_asset_request_bod(uuid) from public, anon, authenticated;
revoke all on function private.asset_request_required_bod_approvals() from public, anon, authenticated;

-- Backfill existing purchase requests without changing their original status,
-- submission time, or legacy notes. Pending rows receive exactly one manager
-- assignment. The unique key makes this repair safe to rerun.
update public.asset_requests request
set approval_stage = case
      when request.status::text = 'Pending' then 'DIRECT_MANAGER'
      when request.status::text = 'Rejected' then 'REJECTED'
      else 'COMPLETED'
    end,
    required_bod_approvals = private.asset_request_required_bod_approvals(),
    bod_approval_count = 0,
    manager_id = coalesce(private.resolve_direct_manager_id(request.employee_id), request.manager_id),
    approval_issue = case
      when private.resolve_direct_manager_id(request.employee_id) is null then 'Direct reporting manager could not be resolved during workflow repair.'
      else null
    end
where request.request_type::text = 'Request'
  and request.approval_stage is null;

insert into public.asset_request_approval_assignments(
  request_id, approval_stage, approver_user_id, approver_role, status, assigned_at
)
select request.id, 'DIRECT_MANAGER', request.manager_id, 'Direct Reporting Manager', 'Pending', request.requested_at
from public.asset_requests request
where request.request_type::text = 'Request'
  and request.status::text = 'Pending'
  and request.approval_stage = 'DIRECT_MANAGER'
  and request.manager_id is not null
on conflict (request_id, approval_stage, approver_user_id) do nothing;

insert into public.asset_request_approval_history(
  request_id, assignment_id, actor_user_id, actor_role, approval_stage, action, comments, created_at
)
select request.id, assignment.id, null, 'System Migration', 'DIRECT_MANAGER', 'Workflow Repaired',
       'Existing pending request attached to its direct reporting manager without changing request history.', now()
from public.asset_requests request
join public.asset_request_approval_assignments assignment
  on assignment.request_id = request.id
 and assignment.approval_stage = 'DIRECT_MANAGER'
where request.request_type::text = 'Request'
  and request.status::text = 'Pending'
  and not exists (
    select 1 from public.asset_request_approval_history history
    where history.request_id = request.id and history.action = 'Workflow Repaired'
  );

do $$
declare
  repaired record;
  repaired_notification_id uuid;
begin
  for repaired in
    select request.id, request.manager_id, request.employee_name, request.asset_description
    from public.asset_requests request
    where request.request_type::text = 'Request'
      and request.status::text = 'Pending'
      and request.approval_stage = 'DIRECT_MANAGER'
      and request.manager_id is not null
  loop
    select notification.id into repaired_notification_id
    from public.notifications notification
    where notification.user_id = repaired.manager_id::text
      and notification.related_entity_id = repaired.id::text
      and notification.type = 'ASSET_REQUEST_SUBMITTED'
    order by notification.created_at
    limit 1;

    if repaired_notification_id is not null then
      update public.notifications
      set link = '/approvals?type=asset&item=' || repaired.id::text,
          dedupe_key = 'asset-request:' || repaired.id::text || ':DIRECT_MANAGER:' || repaired.manager_id::text,
          is_read = false
      where id = repaired_notification_id;
    else
      insert into public.notifications(
        user_id, type, title, message, link, related_entity_id, is_read, dedupe_key
      ) values (
        repaired.manager_id::text,
        'ASSET_REQUEST_SUBMITTED',
        'Asset Request Awaiting Manager Approval',
        format('%s requested %s.', repaired.employee_name, repaired.asset_description),
        '/approvals?type=asset&item=' || repaired.id::text,
        repaired.id::text,
        false,
        'asset-request:' || repaired.id::text || ':DIRECT_MANAGER:' || repaired.manager_id::text
      ) on conflict (user_id, dedupe_key) do nothing;
    end if;

    if not exists (
      select 1 from public.audit_logs audit
      where audit.entity = 'AssetRequest'
        and audit.entity_id = repaired.id::text
        and audit.action = 'WORKFLOW_REPAIR'
    ) then
      insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
      values (
        'system:migration', null, 'WORKFLOW_REPAIR', 'AssetRequest', repaired.id::text,
        jsonb_build_object(
          'approvalStage', 'DIRECT_MANAGER',
          'managerId', repaired.manager_id,
          'requiredBodApprovals', private.asset_request_required_bod_approvals(),
          'historyPreserved', true
        )::text
      );
    end if;
  end loop;
end;
$$;

create or replace function private.prepare_asset_request_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  resolved_manager_id uuid;
begin
  if new.request_type::text <> 'Request' then
    return new;
  end if;

  if actor_id is null then
    raise exception 'Sign in before submitting an asset request.' using errcode = '42501';
  end if;
  if new.employee_id <> actor_id and not public.is_system_admin() and not public.is_hr_or_admin() then
    raise exception 'Asset requests can only be submitted for your own account.' using errcode = '42501';
  end if;

  resolved_manager_id := private.resolve_direct_manager_id(new.employee_id);
  if resolved_manager_id is null then
    raise exception 'A direct reporting manager must be assigned before this asset request can be submitted.' using errcode = '23514';
  end if;
  if resolved_manager_id = new.employee_id then
    raise exception 'The requester cannot be their own direct reporting manager.' using errcode = '23514';
  end if;

  new.manager_id := resolved_manager_id;
  new.status := 'Pending'::public.asset_request_status;
  new.approval_stage := 'DIRECT_MANAGER';
  new.required_bod_approvals := private.asset_request_required_bod_approvals();
  new.bod_approval_count := 0;
  new.manager_approved_by := null;
  new.manager_approved_at := null;
  new.approved_at := null;
  new.rejected_at := null;
  new.rejection_reason := null;
  new.approval_issue := null;
  return new;
end;
$$;

create or replace function private.initialize_asset_request_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := coalesce(public.current_hris_user_id(), new.employee_id);
  actor_role text;
  manager_assignment_id uuid;
begin
  if new.request_type::text <> 'Request' then
    return new;
  end if;

  select coalesce(actor.role, 'Employee') into actor_role
  from public.hris_users actor where actor.id = actor_id;

  insert into public.asset_request_approval_assignments(
    request_id, approval_stage, approver_user_id, approver_role, status, assigned_at
  ) values (
    new.id, 'DIRECT_MANAGER', new.manager_id, 'Direct Reporting Manager', 'Pending', new.requested_at
  )
  on conflict (request_id, approval_stage, approver_user_id)
  do update set status = 'Pending'
  returning id into manager_assignment_id;

  insert into public.asset_request_approval_history(
    request_id, assignment_id, actor_user_id, actor_role, approval_stage, action, comments, created_at
  ) values (
    new.id, manager_assignment_id, actor_id, coalesce(actor_role, 'Employee'),
    'DIRECT_MANAGER', 'Submitted', 'Submitted for direct manager approval.', new.requested_at
  );

  insert into public.notifications(
    user_id, type, title, message, link, related_entity_id, is_read, dedupe_key
  ) values (
    new.manager_id::text,
    'ASSET_REQUEST_SUBMITTED',
    'Asset Request Awaiting Manager Approval',
    format('%s requested %s.', new.employee_name, new.asset_description),
    '/approvals?type=asset&item=' || new.id::text,
    new.id::text,
    false,
    'asset-request:' || new.id::text || ':DIRECT_MANAGER:' || new.manager_id::text
  ) on conflict (user_id, dedupe_key) do nothing;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  select actor_id::text, actor.email, 'SUBMIT', 'AssetRequest', new.id::text,
    jsonb_build_object(
      'approvalStage', 'DIRECT_MANAGER',
      'managerId', new.manager_id,
      'requiredBodApprovals', new.required_bod_approvals
    )::text
  from public.hris_users actor where actor.id = actor_id;

  return new;
end;
$$;

create or replace function private.guard_asset_request_workflow_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.request_type::text = 'Request' or new.request_type::text = 'Request')
     and coalesce(current_setting('app.asset_request_workflow_mutation', true), '') <> 'on' then
    raise exception 'Asset request approvals must be changed through the audited approval workflow.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.prepare_asset_request_workflow() from public, anon, authenticated;
revoke all on function private.initialize_asset_request_workflow() from public, anon, authenticated;
revoke all on function private.guard_asset_request_workflow_update() from public, anon, authenticated;

drop trigger if exists prepare_asset_request_workflow on public.asset_requests;
create trigger prepare_asset_request_workflow
  before insert on public.asset_requests
  for each row execute function private.prepare_asset_request_workflow();

drop trigger if exists initialize_asset_request_workflow on public.asset_requests;
create trigger initialize_asset_request_workflow
  after insert on public.asset_requests
  for each row execute function private.initialize_asset_request_workflow();

drop trigger if exists guard_asset_request_workflow_update on public.asset_requests;
create trigger guard_asset_request_workflow_update
  before update on public.asset_requests
  for each row execute function private.guard_asset_request_workflow_update();

create or replace function public.get_asset_request_approval_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'required_bod_approvals', private.asset_request_required_bod_approvals(),
    'active_bod_count', (
      select count(*)
      from public.hris_users candidate
      where private.is_asset_request_bod(candidate.id)
    )
  )
  where auth.uid() is not null
$$;

create or replace function public.save_asset_request_approval_config(p_required_bod_approvals integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  active_bod_count integer;
  previous_value jsonb;
  normalized jsonb;
begin
  if actor_id is null or not public.is_system_admin() then
    raise exception 'Only an active system Admin can change Asset Request approval settings.' using errcode = '42501';
  end if;
  if p_required_bod_approvals not in (1, 2) then
    raise exception 'Required BOD approvals must be 1 or 2.' using errcode = '22023';
  end if;

  select count(*) into active_bod_count
  from public.hris_users candidate
  where private.is_asset_request_bod(candidate.id);
  if active_bod_count < p_required_bod_approvals then
    raise exception 'At least % active BOD users are required for this setting.', p_required_bod_approvals using errcode = '23514';
  end if;

  select config_value into previous_value
  from public.approver_configs
  where config_key = 'asset_request_approvals'
  for update;

  normalized := jsonb_build_object('required_bod_approvals', p_required_bod_approvals);
  insert into public.approver_configs(config_key, config_value, updated_at)
  values ('asset_request_approvals', normalized, now())
  on conflict (config_key) do update
    set config_value = excluded.config_value,
        updated_at = excluded.updated_at;

  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text, actor_email, 'UPDATE', 'AssetRequestApprovalConfig', 'asset_request_approvals',
    jsonb_build_object('before', previous_value, 'after', normalized, 'inFlightRequestsChanged', false)::text
  );

  return public.get_asset_request_approval_config();
end;
$$;

create or replace function public.get_my_asset_request_approval_queue()
returns table(
  request_id uuid,
  employee_id uuid,
  employee_name text,
  asset_description text,
  requested_at timestamptz,
  business_unit_id uuid,
  department_id uuid,
  approval_stage text,
  current_step text,
  required_bod_approvals smallint,
  bod_approval_count smallint,
  approval_progress text,
  is_actionable boolean,
  viewer_action_status text,
  approval_issue text
)
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select viewer.id, private.is_asset_request_bod(viewer.id) as is_bod
    from public.hris_users viewer
    where viewer.id = public.current_hris_user_id()
      and lower(btrim(coalesce(viewer.status, ''))) = 'active'
  )
  select request.id,
         request.employee_id,
         request.employee_name,
         request.asset_description,
         request.requested_at,
         employee.business_unit_id,
         employee.department_id,
         request.approval_stage,
         case
           when request.approval_stage = 'DIRECT_MANAGER' and request.manager_id = actor.id then 'Direct Manager Approval'
           when request.approval_stage = 'DIRECT_MANAGER' then 'Waiting for Direct Manager Approval'
           when request.approval_stage = 'BOD' and coalesce(viewer_assignment.status, '') = 'Approved' then 'Waiting for remaining BOD approval'
           else 'BOD Approval'
         end,
         request.required_bod_approvals,
         request.bod_approval_count,
         format('%s of %s BOD approvals', request.bod_approval_count, request.required_bod_approvals),
         case
           when request.approval_stage = 'DIRECT_MANAGER' then request.manager_id = actor.id and coalesce(viewer_assignment.status, 'Pending') = 'Pending'
           when request.approval_stage = 'BOD' then coalesce(viewer_assignment.status, '') = 'Pending'
           else false
         end,
         viewer_assignment.status,
         request.approval_issue
  from public.asset_requests request
  join public.hris_users employee on employee.id = request.employee_id
  cross join actor
  left join lateral (
    select assignment.status
    from public.asset_request_approval_assignments assignment
    where assignment.request_id = request.id
      and assignment.approval_stage = request.approval_stage
      and assignment.approver_user_id = actor.id
    order by assignment.assigned_at desc, assignment.id
    limit 1
  ) viewer_assignment on true
  where request.request_type::text = 'Request'
    and request.status::text = 'Pending'
    and request.approval_stage in ('DIRECT_MANAGER', 'BOD')
    and (
      (request.approval_stage = 'DIRECT_MANAGER' and request.manager_id = actor.id)
      or actor.is_bod
    )
  order by request.requested_at desc, request.id
$$;

create or replace function public.get_asset_request_approval_detail(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_is_bod boolean;
  request_row public.asset_requests;
  employee_row public.hris_users;
  manager_row public.hris_users;
  viewer_assignment public.asset_request_approval_assignments;
  can_view boolean;
  can_act boolean;
begin
  select * into request_row from public.asset_requests where id = p_request_id;
  if request_row.id is null or request_row.request_type::text <> 'Request' then
    raise exception 'Asset request not found.' using errcode = 'P0002';
  end if;
  if actor_id is null then
    raise exception 'Sign in to view this asset request.' using errcode = '42501';
  end if;

  actor_is_bod := private.is_asset_request_bod(actor_id);
  can_view := actor_id = request_row.employee_id
    or (request_row.manager_id is not null and actor_id = request_row.manager_id)
    or actor_is_bod
    or public.is_hr_or_admin()
    or public.is_system_admin();
  if not can_view then
    raise exception 'You are not authorized to view this asset request.' using errcode = '42501';
  end if;

  select * into employee_row from public.hris_users where id = request_row.employee_id;
  select * into manager_row from public.hris_users where id = request_row.manager_id;
  select * into viewer_assignment
  from public.asset_request_approval_assignments assignment
  where assignment.request_id = request_row.id
    and assignment.approval_stage = request_row.approval_stage
    and assignment.approver_user_id = actor_id
  order by assignment.assigned_at desc, assignment.id
  limit 1;

  can_act := request_row.status::text = 'Pending'
    and request_row.approval_stage in ('DIRECT_MANAGER', 'BOD')
    and viewer_assignment.id is not null
    and viewer_assignment.status = 'Pending';

  return jsonb_build_object(
    'request', jsonb_build_object(
      'id', request_row.id,
      'employeeId', request_row.employee_id,
      'employeeName', request_row.employee_name,
      'assetDescription', request_row.asset_description,
      'justification', request_row.justification,
      'status', request_row.status::text,
      'requestedAt', request_row.requested_at,
      'approvalStage', request_row.approval_stage,
      'currentStep', case
        when request_row.approval_stage = 'DIRECT_MANAGER' and actor_id = request_row.manager_id then 'Direct Manager Approval'
        when request_row.approval_stage = 'DIRECT_MANAGER' then 'Waiting for Direct Manager Approval'
        when request_row.approval_stage = 'BOD' and viewer_assignment.status = 'Approved' then 'Waiting for remaining BOD approval'
        when request_row.approval_stage = 'BOD' then 'BOD Approval'
        when request_row.approval_stage = 'COMPLETED' then 'Completed'
        when request_row.approval_stage = 'REJECTED' then 'Rejected'
        else 'Not configured'
      end,
      'managerId', request_row.manager_id,
      'managerName', manager_row.full_name,
      'managerApprovedBy', request_row.manager_approved_by,
      'managerApprovedAt', request_row.manager_approved_at,
      'requiredBodApprovals', request_row.required_bod_approvals,
      'bodApprovalCount', request_row.bod_approval_count,
      'approvalProgress', format('%s of %s BOD approvals', request_row.bod_approval_count, request_row.required_bod_approvals),
      'approvalIssue', request_row.approval_issue,
      'rejectionReason', request_row.rejection_reason,
      'approvedAt', request_row.approved_at,
      'rejectedAt', request_row.rejected_at,
      'businessUnitId', employee_row.business_unit_id,
      'departmentId', employee_row.department_id
    ),
    'canAct', can_act,
    'viewerActionStatus', viewer_assignment.status,
    'viewerStage', viewer_assignment.approval_stage,
    'bodApprovals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'approverId', assignment.approver_user_id,
        'approverName', approver.full_name,
        'status', assignment.status,
        'actedAt', assignment.acted_at,
        'comments', assignment.comments
      ) order by assignment.assigned_at, approver.full_name)
      from public.asset_request_approval_assignments assignment
      join public.hris_users approver on approver.id = assignment.approver_user_id
      where assignment.request_id = request_row.id and assignment.approval_stage = 'BOD'
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', history.id,
        'actorId', history.actor_user_id,
        'actorName', actor.full_name,
        'actorRole', history.actor_role,
        'stage', history.approval_stage,
        'action', history.action,
        'comments', history.comments,
        'createdAt', history.created_at
      ) order by history.created_at, history.id)
      from public.asset_request_approval_history history
      left join public.hris_users actor on actor.id = history.actor_user_id
      where history.request_id = request_row.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.process_asset_request_approval(
  p_request_id uuid,
  p_action text,
  p_comments text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_row public.hris_users;
  request_row public.asset_requests;
  current_assignment public.asset_request_approval_assignments;
  normalized_action text := upper(btrim(coalesce(p_action, '')));
  approved_bod_count smallint;
  active_bod_count integer;
  completed boolean := false;
begin
  if actor_id is null then
    raise exception 'Sign in before processing an asset request.' using errcode = '42501';
  end if;
  select * into actor_row from public.hris_users where id = actor_id;
  if actor_row.id is null or lower(btrim(coalesce(actor_row.status, ''))) <> 'active' then
    raise exception 'Only an active HRIS user can process an asset request.' using errcode = '42501';
  end if;
  if normalized_action not in ('APPROVE', 'REJECT') then
    raise exception 'Action must be APPROVE or REJECT.' using errcode = '22023';
  end if;
  if normalized_action = 'REJECT' and nullif(btrim(coalesce(p_comments, '')), '') is null then
    raise exception 'A rejection reason is required.' using errcode = '22023';
  end if;

  select * into request_row
  from public.asset_requests
  where id = p_request_id
  for update;
  if request_row.id is null or request_row.request_type::text <> 'Request' then
    raise exception 'Asset request not found.' using errcode = 'P0002';
  end if;
  if request_row.status::text <> 'Pending' or request_row.approval_stage not in ('DIRECT_MANAGER', 'BOD') then
    raise exception 'This asset request is no longer awaiting approval.' using errcode = '22023';
  end if;

  select * into current_assignment
  from public.asset_request_approval_assignments assignment
  where assignment.request_id = request_row.id
    and assignment.approval_stage = request_row.approval_stage
    and assignment.approver_user_id = actor_id
  for update;

  if current_assignment.id is null then
    if request_row.approval_stage = 'BOD' and exists (
      select 1 from public.asset_request_approval_assignments assignment
      where assignment.request_id = request_row.id
        and assignment.approval_stage = 'BOD'
        and assignment.approver_user_id = actor_id
        and assignment.status = 'Approved'
    ) then
      raise exception 'You already approved this asset request.' using errcode = '22023';
    end if;
    raise exception 'This asset request is not assigned to you at the current stage.' using errcode = '42501';
  end if;
  if current_assignment.status = 'Approved' and request_row.approval_stage = 'BOD' then
    raise exception 'You already approved this asset request.' using errcode = '22023';
  end if;
  if current_assignment.status <> 'Pending' then
    raise exception 'This approval task has already been processed.' using errcode = '22023';
  end if;
  if request_row.approval_stage = 'DIRECT_MANAGER' and request_row.manager_id <> actor_id then
    raise exception 'Only the employee''s direct reporting manager can complete the first approval.' using errcode = '42501';
  end if;
  if request_row.approval_stage = 'BOD' and not private.is_asset_request_bod(actor_id) then
    raise exception 'Only an active Board of Director user can complete this approval.' using errcode = '42501';
  end if;

  if normalized_action = 'REJECT' then
    update public.asset_request_approval_assignments
    set status = 'Rejected', acted_at = now(), comments = btrim(p_comments)
    where id = current_assignment.id;

    update public.asset_request_approval_assignments
    set status = 'Closed', acted_at = now(), comments = 'Closed after rejection by another required approver.'
    where request_id = request_row.id and status = 'Pending' and id <> current_assignment.id;

    perform set_config('app.asset_request_workflow_mutation', 'on', true);
    update public.asset_requests
    set status = 'Rejected'::public.asset_request_status,
        approval_stage = 'REJECTED',
        manager_notes = case when request_row.approval_stage = 'DIRECT_MANAGER' then btrim(p_comments) else manager_notes end,
        rejection_reason = btrim(p_comments),
        rejected_at = now(),
        approval_issue = null,
        updated_at = now()
    where id = request_row.id;
    perform set_config('app.asset_request_workflow_mutation', '', true);

    insert into public.asset_request_approval_history(
      request_id, assignment_id, actor_user_id, actor_role, approval_stage, action, comments
    ) values (
      request_row.id, current_assignment.id, actor_id,
      case when request_row.approval_stage = 'DIRECT_MANAGER' then 'Direct Reporting Manager' else 'Board of Director' end,
      request_row.approval_stage, 'Rejected', btrim(p_comments)
    );

    update public.notifications
    set is_read = true
    where related_entity_id = request_row.id::text
      and dedupe_key like 'asset-request:' || request_row.id::text || ':%';

    insert into public.notifications(
      user_id, type, title, message, link, related_entity_id, is_read, dedupe_key
    ) values (
      request_row.employee_id::text,
      'ASSET_UPDATE',
      'Asset Request Rejected',
      format('Your asset request for %s was rejected: %s', request_row.asset_description, btrim(p_comments)),
      '/employees/asset-management/asset-requests?requestId=' || request_row.id::text,
      request_row.id::text,
      false,
      'asset-request:' || request_row.id::text || ':REJECTED'
    ) on conflict (user_id, dedupe_key) do update
      set message = excluded.message, link = excluded.link, is_read = false, created_at = now();
  elsif request_row.approval_stage = 'DIRECT_MANAGER' then
    select count(*) into active_bod_count
    from public.hris_users candidate
    where private.is_asset_request_bod(candidate.id);
    if active_bod_count < request_row.required_bod_approvals then
      raise exception 'This request needs % active BOD approvers, but only % are available.', request_row.required_bod_approvals, active_bod_count using errcode = '23514';
    end if;

    update public.asset_request_approval_assignments
    set status = 'Approved', acted_at = now(), comments = nullif(btrim(coalesce(p_comments, '')), '')
    where id = current_assignment.id;

    insert into public.asset_request_approval_assignments(
      request_id, approval_stage, approver_user_id, approver_role, status
    )
    select request_row.id, 'BOD', candidate.id, 'Board of Director', 'Pending'
    from public.hris_users candidate
    where private.is_asset_request_bod(candidate.id)
    on conflict (request_id, approval_stage, approver_user_id) do nothing;

    perform set_config('app.asset_request_workflow_mutation', 'on', true);
    update public.asset_requests
    set approval_stage = 'BOD',
        manager_approved_by = actor_id,
        manager_approved_at = now(),
        manager_notes = nullif(btrim(coalesce(p_comments, '')), ''),
        approval_issue = null,
        updated_at = now()
    where id = request_row.id;
    perform set_config('app.asset_request_workflow_mutation', '', true);

    insert into public.asset_request_approval_history(
      request_id, assignment_id, actor_user_id, actor_role, approval_stage, action, comments
    ) values (
      request_row.id, current_assignment.id, actor_id, 'Direct Reporting Manager',
      'DIRECT_MANAGER', 'Approved', nullif(btrim(coalesce(p_comments, '')), '')
    );

    update public.notifications
    set is_read = true
    where user_id = actor_id::text
      and dedupe_key = 'asset-request:' || request_row.id::text || ':DIRECT_MANAGER:' || actor_id::text;

    insert into public.notifications(
      user_id, type, title, message, link, related_entity_id, is_read, dedupe_key
    )
    select assignment.approver_user_id::text,
           'ASSET_REQUEST_SUBMITTED',
           'Asset Request Awaiting BOD Approval',
           format('%s requested %s. 0 of %s BOD approvals recorded.', request_row.employee_name, request_row.asset_description, request_row.required_bod_approvals),
           '/approvals?type=asset&item=' || request_row.id::text,
           request_row.id::text,
           false,
           'asset-request:' || request_row.id::text || ':BOD:' || assignment.approver_user_id::text
    from public.asset_request_approval_assignments assignment
    where assignment.request_id = request_row.id
      and assignment.approval_stage = 'BOD'
      and assignment.status = 'Pending'
    on conflict (user_id, dedupe_key) do update
      set message = excluded.message, link = excluded.link, is_read = false, created_at = now();
  else
    update public.asset_request_approval_assignments
    set status = 'Approved', acted_at = now(), comments = nullif(btrim(coalesce(p_comments, '')), '')
    where id = current_assignment.id;

    select count(distinct assignment.approver_user_id)::smallint into approved_bod_count
    from public.asset_request_approval_assignments assignment
    where assignment.request_id = request_row.id
      and assignment.approval_stage = 'BOD'
      and assignment.status = 'Approved';
    completed := approved_bod_count >= request_row.required_bod_approvals;

    if completed then
      update public.asset_request_approval_assignments
      set status = 'Closed', acted_at = now(), comments = 'Closed after the required BOD approvals were completed.'
      where request_id = request_row.id
        and approval_stage = 'BOD'
        and status = 'Pending';
    end if;

    perform set_config('app.asset_request_workflow_mutation', 'on', true);
    update public.asset_requests
    set bod_approval_count = approved_bod_count,
        status = case when completed then 'Approved'::public.asset_request_status else status end,
        approval_stage = case when completed then 'COMPLETED' else 'BOD' end,
        approved_at = case when completed then now() else approved_at end,
        approval_issue = null,
        updated_at = now()
    where id = request_row.id;
    perform set_config('app.asset_request_workflow_mutation', '', true);

    insert into public.asset_request_approval_history(
      request_id, assignment_id, actor_user_id, actor_role, approval_stage, action, comments
    ) values (
      request_row.id, current_assignment.id, actor_id, 'Board of Director',
      'BOD', 'Approved', nullif(btrim(coalesce(p_comments, '')), '')
    );

    update public.notifications
    set is_read = true
    where user_id = actor_id::text
      and dedupe_key = 'asset-request:' || request_row.id::text || ':BOD:' || actor_id::text;

    if completed then
      update public.notifications
      set is_read = true
      where related_entity_id = request_row.id::text
        and dedupe_key like 'asset-request:' || request_row.id::text || ':BOD:%';

      insert into public.notifications(
        user_id, type, title, message, link, related_entity_id, is_read, dedupe_key
      ) values (
        request_row.employee_id::text,
        'ASSET_UPDATE',
        'Asset Request Approved',
        format('Your asset request for %s completed all required approvals.', request_row.asset_description),
        '/employees/asset-management/asset-requests?requestId=' || request_row.id::text,
        request_row.id::text,
        false,
        'asset-request:' || request_row.id::text || ':APPROVED'
      ) on conflict (user_id, dedupe_key) do update
        set message = excluded.message, link = excluded.link, is_read = false, created_at = now();
    else
      update public.notifications notification
      set message = format('%s requested %s. %s of %s BOD approvals recorded.', request_row.employee_name, request_row.asset_description, approved_bod_count, request_row.required_bod_approvals),
          is_read = false,
          created_at = now()
      where notification.related_entity_id = request_row.id::text
        and notification.dedupe_key like 'asset-request:' || request_row.id::text || ':BOD:%'
        and notification.user_id <> actor_id::text;
    end if;
  end if;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text,
    actor_row.email,
    normalized_action,
    'AssetRequest',
    request_row.id::text,
    jsonb_build_object(
      'stage', request_row.approval_stage,
      'comments', nullif(btrim(coalesce(p_comments, '')), ''),
      'requiredBodApprovals', request_row.required_bod_approvals,
      'bodApprovalCount', coalesce(approved_bod_count, request_row.bod_approval_count),
      'completed', completed
    )::text
  );

  return public.get_asset_request_approval_detail(request_row.id);
end;
$$;

-- Keep the established request-summary RPC stable and add stage/progress in a
-- versioned wrapper so older browser sessions continue to work.
create or replace function public.get_my_request_summaries_v2()
returns table(
  id uuid,
  request_type text,
  submitted_at timestamptz,
  status text,
  detail_link text,
  current_stage text,
  progress_label text
)
language sql
stable
security definer
set search_path = ''
as $$
  select summary.id,
         summary.request_type,
         summary.submitted_at,
         summary.status,
         summary.detail_link,
         case
           when summary.request_type <> 'Asset' or request.request_type::text <> 'Request' then null
           when request.approval_stage = 'DIRECT_MANAGER' then 'Waiting for Direct Manager Approval'
           when request.approval_stage = 'BOD' then 'BOD Approval'
           when request.approval_stage = 'COMPLETED' then 'Completed'
           when request.approval_stage = 'REJECTED' then 'Rejected'
           else 'Not configured'
         end,
         case
           when summary.request_type = 'Asset' and request.request_type::text = 'Request'
             then format('%s of %s BOD approvals', request.bod_approval_count, request.required_bod_approvals)
           else null
         end
  from public.get_my_request_summaries() summary
  left join public.asset_requests request
    on summary.request_type = 'Asset' and request.id = summary.id
  order by summary.submitted_at desc nulls last
$$;

-- Replace broad legacy Asset Request policies. Purchase approvals are mutated
-- only by process_asset_request_approval; return records retain their current
-- employee/manager/HR handling.
drop policy if exists "admin_all_asset_requests" on public.asset_requests;
drop policy if exists asset_req_employee_own on public.asset_requests;
drop policy if exists asset_req_hr_admin_all on public.asset_requests;
drop policy if exists asset_req_manager_read_team on public.asset_requests;
drop policy if exists asset_requests_scoped_select on public.asset_requests;
drop policy if exists asset_requests_self_insert on public.asset_requests;
drop policy if exists asset_returns_scoped_update on public.asset_requests;

alter table public.asset_requests enable row level security;
revoke all on public.asset_requests from public, anon;
grant select, insert, update on public.asset_requests to authenticated;

create policy asset_requests_scoped_select
on public.asset_requests for select to authenticated
using (
  employee_id = (select public.current_hris_user_id())
  or manager_id = (select public.current_hris_user_id())
  or (select public.is_hr_or_admin())
  or (select public.is_system_admin())
);

create policy asset_requests_self_insert
on public.asset_requests for insert to authenticated
with check (
  (
    request_type::text = 'Request'
    and (
      employee_id = (select public.current_hris_user_id())
      or (select public.is_hr_or_admin())
      or (select public.is_system_admin())
    )
    and status::text = 'Pending'
  )
  or (
    request_type::text = 'Return'
    and (
      employee_id = (select public.current_hris_user_id())
      or (select public.is_hr_or_admin())
      or (select public.is_system_admin())
    )
  )
);

create policy asset_returns_scoped_update
on public.asset_requests for update to authenticated
using (
  request_type::text = 'Return'
  and (
    employee_id = (select public.current_hris_user_id())
    or manager_id = (select public.current_hris_user_id())
    or (select public.is_hr_or_admin())
    or (select public.is_system_admin())
  )
)
with check (
  request_type::text = 'Return'
  and (
    employee_id = (select public.current_hris_user_id())
    or manager_id = (select public.current_hris_user_id())
    or (select public.is_hr_or_admin())
    or (select public.is_system_admin())
  )
);

revoke all on function public.get_asset_request_approval_config() from public, anon;
revoke all on function public.save_asset_request_approval_config(integer) from public, anon;
revoke all on function public.get_my_asset_request_approval_queue() from public, anon;
revoke all on function public.get_asset_request_approval_detail(uuid) from public, anon;
revoke all on function public.process_asset_request_approval(uuid, text, text) from public, anon;
revoke all on function public.get_my_request_summaries_v2() from public, anon;

grant execute on function public.get_asset_request_approval_config() to authenticated;
grant execute on function public.save_asset_request_approval_config(integer) to authenticated;
grant execute on function public.get_my_asset_request_approval_queue() to authenticated;
grant execute on function public.get_asset_request_approval_detail(uuid) to authenticated;
grant execute on function public.process_asset_request_approval(uuid, text, text) to authenticated;
grant execute on function public.get_my_request_summaries_v2() to authenticated;

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'asset_requests'
     ) then
    alter publication supabase_realtime add table public.asset_requests;
  end if;
end;
$$;

comment on table public.asset_request_approval_assignments is
  'Normalized approver routing snapshot for Asset purchase requests. Actions are performed only through the audited workflow RPC.';
comment on table public.asset_request_approval_history is
  'Append-only Asset Request approval history. Ordinary authenticated users have no direct write privileges.';
comment on function public.process_asset_request_approval(uuid, text, text) is
  'Atomically enforces direct-manager approval followed by one or two distinct BOD approvals.';

notify pgrst, 'reload schema';

-- Rollback notes: drop the three Asset workflow triggers and six public RPCs;
-- restore the previous asset_requests RLS policies; then drop the new history
-- and assignment tables and the six added asset_requests columns. Preserve or
-- export history before rollback once production approvals have been recorded.
