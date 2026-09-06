-- Route manager-originated on-call requests to the existing BOD/GM pool.
-- Preserve shared roles, scope helpers, RLS and the existing one-of-pool rule.
set local lock_timeout='5s';set local statement_timeout='45s';
create function private.manpower_starts_at_bod_gm(p_requester uuid,p_bu uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.hris_users h where h.id=p_requester and lower(h.status)='active' and h.business_unit_id=p_bu
 and (private.workflow_user_has_role(h.id,'Business Unit Manager')
 or (private.workflow_user_has_role(h.id,'Manager') and
 exists(select 1 from public.hris_users supervisor where supervisor.id::text=h.reports_to
 and (private.workflow_user_has_role(supervisor.id,'GeneralManager') or private.workflow_user_has_role(supervisor.id,'Board of Director'))))))
$$;
revoke all on function private.manpower_starts_at_bod_gm(uuid,uuid) from public,anon,authenticated;

create function private.route_manpower_manager_request(p_request uuid,p_repair boolean) returns void
language plpgsql security definer set search_path='' as $$
declare r public.manpower_requests;pool_count integer;
begin
 select * into strict r from public.manpower_requests where id=p_request for update;
 if r.status<>'Pending' or r.approval_stage<>'BUSINESS_UNIT_MANAGER' or not private.manpower_starts_at_bod_gm(r.requester_id,r.business_unit_id) then return;end if;
 if exists(select 1 from public.manpower_request_approval_assignments where request_id=r.id and status in ('Approved','Rejected')) then return;end if;
 update public.manpower_request_approval_assignments set status='Cancelled',comments='BU-manager stage not required for this requester; routed to BOD / GM.',updated_at=now() where request_id=r.id and status='Pending' and approval_stage='BUSINESS_UNIT_MANAGER';
 insert into public.manpower_request_approval_assignments(request_id,approval_stage,approver_user_id,approver_role,status)
 select r.id,'BOD_GM',h.id,case when private.workflow_user_has_role(h.id,'Board of Director') then 'Board of Director' else 'General Manager' end,'Pending'
 from public.hris_users h where lower(h.status)='active' and h.auth_user_id is not null and h.id<>r.requester_id
 and (private.workflow_user_has_role(h.id,'Board of Director') or private.workflow_user_has_role(h.id,'GeneralManager'))
 on conflict(request_id,approval_stage,approver_user_id) do nothing;
 select count(*) into pool_count from public.manpower_request_approval_assignments where request_id=r.id and approval_stage='BOD_GM' and status='Pending';
 perform set_config('app.manpower_workflow_mutation','on',true);
 update public.manpower_requests set approval_stage='BOD_GM',approval_issue=case when pool_count=0 then 'Approver Configuration Required' else null end,
 approval_history=coalesce(approval_history,'[]')||jsonb_build_array(jsonb_build_object('stage','BUSINESS_UNIT_MANAGER','action',case when p_repair then 'Routing corrected' else 'Submitted — manager stage not required' end,
 'approverName','System routing','approverRole','Workflow','timestamp',now(),'previousStatus',case when p_repair then 'Pending' else null end,'newStatus','Pending','previousStage',case when p_repair then 'BUSINESS_UNIT_MANAGER' else null end,'newStage','BOD_GM','assignedApproverRole','BOD / GM approval pool','assignedApproverCount',pool_count,'comments','Requester is the BU manager or an existing Manager reporting directly to GM/BOD. No approval was recorded.')) where id=r.id;
 insert into public.notifications(user_id,type,title,message,link,is_read,related_entity_id,dedupe_key)
 select a.approver_user_id::text,'MANPOWER_REQUEST_SUBMITTED','On-Call Request Awaiting BOD / GM Approval',format('On-call request for %s is awaiting one BOD or General Manager approval.',r.business_unit_name),'/approvals?type=manpower&item='||r.id::text,false,r.id::text,format('manpower:%s:BOD_GM:%s',r.id,a.approver_user_id)
 from public.manpower_request_approval_assignments a where a.request_id=r.id and a.approval_stage='BOD_GM' and a.status='Pending' on conflict(user_id,dedupe_key) do nothing;
end $$;
revoke all on function private.route_manpower_manager_request(uuid,boolean) from public,anon,authenticated;

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
  if private.manpower_starts_at_bod_gm(new.requester_id,new.business_unit_id) then
    perform private.route_manpower_manager_request(new.id,false);
    return new;
  end if;
  select manager.id
    into business_unit_manager_id
  from public.hris_users manager
  where manager.business_unit_id = new.business_unit_id
    and manager.id <> new.requester_id
    and manager.auth_user_id is not null
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

  if actor_id=request_row.requester_id then
    raise exception 'Requesters cannot approve their own on-call request.' using errcode='42501';
  end if;
  if (request_row.approval_stage='BOD_GM' and not (private.workflow_user_has_role(actor_id,'Board of Director') or private.workflow_user_has_role(actor_id,'GeneralManager')))
     or (request_row.approval_stage='BUSINESS_UNIT_MANAGER' and not private.workflow_user_has_role(actor_id,'Business Unit Manager')) then
    raise exception 'Your current role cannot approve this stage.' using errcode='42501';
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
      and approver.id <> request_row.requester_id
      and approver.auth_user_id is not null
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


-- Repair only still-pending, undecided requests that meet the new trusted rule.
do $$ declare r record;begin
 for r in select id from public.manpower_requests m where m.status='Pending' and m.approval_stage='BUSINESS_UNIT_MANAGER' and private.manpower_starts_at_bod_gm(m.requester_id,m.business_unit_id) loop
  perform private.route_manpower_manager_request(r.id,true);
 end loop;
end $$;
