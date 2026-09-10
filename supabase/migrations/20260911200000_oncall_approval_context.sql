CREATE OR REPLACE FUNCTION public.process_manpower_request_approval(p_request_id uuid, p_decision text, p_comments text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if request_row.approval_stage='BOD_GM' then
    insert into public.manpower_request_approval_assignments(request_id,approval_stage,approver_user_id,approver_role,status)
    values(request_row.id,'BOD_GM',actor_id,private.manpower_role_label(actor_id),'Pending')
    on conflict(request_id,approval_stage,approver_user_id) do nothing;
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
  perform set_config('app.manpower_approval_context', format('%s:%s',p_request_id,actor_id), true);
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
$function$
;
CREATE OR REPLACE FUNCTION public.guard_workflow_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  workflow_key text := tg_argv[0];
  requested_action text;
  old_status text := lower(coalesce(old.status::text, ''));
  new_status text := lower(coalesce(new.status::text, ''));
  canonical_time_approval_context text := coalesce(
    current_setting('app.time_request_approval_context', true),
    ''
  );
  expected_time_approval_context text;
begin
  if new.status::text is not distinct from old.status::text then return new; end if;

  expected_time_approval_context := format(
    '%s:%s:%s',
    lower(workflow_key),
    new.id,
    public.current_hris_user_id()
  );

  if lower(workflow_key) in ('leave', 'wfh', 'overtime')
     and canonical_time_approval_context = expected_time_approval_context then
    return new;
  end if;

  if lower(workflow_key)='manpower'
    and current_setting('app.manpower_approval_context',true)=format('%s:%s',new.id,public.current_hris_user_id())
    and exists(select 1 from public.manpower_request_approval_assignments a
      where a.request_id=new.id and a.approver_user_id=public.current_hris_user_id()
      and a.approval_stage=old.approval_stage
      and lower(a.status)=new_status and a.decided_at is not null) then
    return new;
  end if;
  requested_action := case
    when old_status in ('draft', 'wfh_pending_submission')
      and new_status in (
        'submitted',
        'pending',
        'pendinggm',
        'wfh_pending_dept_head_approval',
        'wfh_pending_gm_approval'
      ) then 'submit'
    when new_status in ('approved', 'wfh_approved', 'wfh_for_timekeeping') then 'approve'
    when new_status in ('rejected', 'wfh_rejected') then 'reject'
    when new_status in ('cancelled', 'canceled') then 'cancel'
    when new_status in ('finalized', 'completed') then 'finalize'
    when new_status in ('pending', 'submitted', 'wfh_pending_submission') then 'submit'
    else 'review'
  end;

  if not public.has_workflow_permission(workflow_key, requested_action) then
    raise exception 'Workflow action % is not authorized for %.', requested_action, workflow_key using errcode = '42501';
  end if;
  return new;
end;
$function$
;
notify pgrst,'reload schema';
