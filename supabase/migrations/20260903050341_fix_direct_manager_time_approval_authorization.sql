-- Direct-report routing is the authority for the first WFH/OT/Leave approval
-- stage. The canonical approval RPC already verifies that relationship (or an
-- exact escalation assignment), but the generic workflow trigger performed a
-- second role-only check and rejected valid managers whose primary role did
-- not carry workflow-wide approval rights.
--
-- Bind the trigger bypass to the exact request type, request ID, and actor.
-- This preserves the generic workflow guard for every direct table update and
-- keeps all decisions inside the audited canonical approval RPC.

create or replace function public.guard_workflow_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.guard_workflow_status_transition()
  from public, anon, authenticated;

comment on function public.guard_workflow_status_transition() is
  'Enforces workflow permissions except for an exact request/actor context established by the canonical time approval RPC after record-level authorization.';

create or replace function public.process_time_request_approval(
  p_request_type text,
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  employee_id uuid;
  current_status text;
  context_value jsonb;
  requires_bod boolean;
  is_manager_stage boolean;
  assignment public.time_request_approval_assignments;
  required_pending integer;
  bod_approved integer;
  final_status text;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if lower(p_decision) not in ('approve', 'reject', 'return') then
    raise exception 'Unsupported approval decision.' using errcode = '22023';
  end if;

  select email into actor_email
  from public.hris_users
  where id = actor_id;

  if lower(p_request_type) = 'leave' then
    select r.employee_id, r.status
      into employee_id, current_status
    from public.leave_requests r
    where r.id = p_request_id
    for update;
    is_manager_stage := current_status in ('Pending', 'PendingGM');
  elsif lower(p_request_type) = 'wfh' then
    select r.employee_id, r.status
      into employee_id, current_status
    from public.wfh_requests r
    where r.id = p_request_id
    for update;
    is_manager_stage := current_status in (
      'WFH_PENDING_DEPT_HEAD_APPROVAL',
      'WFH_PENDING_GM_APPROVAL'
    );
  elsif lower(p_request_type) = 'overtime' then
    select r.employee_id, r.status::text
      into employee_id, current_status
    from public.ot_requests r
    where r.id = p_request_id
    for update;
    is_manager_stage := current_status in ('Submitted', 'PendingGM');
  else
    raise exception 'Unsupported request type.' using errcode = '22023';
  end if;

  if employee_id is null then raise exception 'Request not found.'; end if;

  if is_manager_stage then
    if not private.is_direct_reporting_manager(actor_id, employee_id) then
      raise exception 'Only the employee''s direct reporting manager may complete this step.' using errcode = '42501';
    end if;
    if lower(p_decision) = 'return' then
      raise exception 'Return for clarification is not yet available for this legacy request type.' using errcode = '22023';
    end if;
    if lower(p_decision) = 'reject' then
      final_status := case lower(p_request_type)
        when 'wfh' then 'WFH_REJECTED'
        else 'Rejected'
      end;
    else
      context_value := private.time_request_context(p_request_type, p_request_id);
      requires_bod := coalesce((context_value->>'requiresBod')::boolean, false);
      if requires_bod then
        final_status := case lower(p_request_type)
          when 'leave' then 'PendingBOD'
          when 'wfh' then 'WFH_PENDING_BOD_APPROVAL'
          else 'PendingBOD'
        end;
      else
        final_status := case lower(p_request_type)
          when 'wfh' then 'WFH_FOR_TIMEKEEPING'
          else 'Approved'
        end;
      end if;
    end if;
  else
    select * into assignment
    from public.time_request_approval_assignments a
    where a.request_type = lower(p_request_type)
      and a.request_id = p_request_id
      and a.approver_user_id = actor_id
      and a.status = 'Pending'
    for update;

    if assignment.id is null then
      raise exception 'This request is not assigned to you.' using errcode = '42501';
    end if;

    update public.time_request_approval_assignments
    set status = case lower(p_decision)
          when 'approve' then 'Approved'
          when 'reject' then 'Rejected'
          else 'Skipped'
        end,
        decision_note = p_note,
        decided_at = now(),
        updated_at = now()
    where id = assignment.id;

    if lower(p_decision) = 'reject' and assignment.is_required then
      final_status := case lower(p_request_type)
        when 'wfh' then 'WFH_REJECTED'
        else 'Rejected'
      end;
    elsif lower(p_decision) = 'return' then
      final_status := case lower(p_request_type)
        when 'leave' then 'Pending'
        when 'wfh' then 'WFH_PENDING_DEPT_HEAD_APPROVAL'
        else 'Submitted'
      end;
    else
      select count(*) into required_pending
      from public.time_request_approval_assignments a
      where a.request_type = lower(p_request_type)
        and a.request_id = p_request_id
        and a.is_required
        and a.status <> 'Approved';

      select count(*) into bod_approved
      from public.time_request_approval_assignments a
      where a.request_type = lower(p_request_type)
        and a.request_id = p_request_id
        and a.is_bod
        and a.status = 'Approved';

      if required_pending = 0 and bod_approved >= 1 then
        final_status := case lower(p_request_type)
          when 'wfh' then 'WFH_FOR_TIMEKEEPING'
          else 'Approved'
        end;
      else
        final_status := current_status;
      end if;
    end if;
  end if;

  context_value := coalesce(
    context_value,
    private.time_request_context(p_request_type, p_request_id)
  );
  requires_bod := coalesce((context_value->>'requiresBod')::boolean, false);

  -- The trigger accepts this context only for this request, request type, and
  -- already-authorized actor. Clear it before returning to the caller.
  perform set_config(
    'app.time_request_approval_context',
    format('%s:%s:%s', lower(p_request_type), p_request_id, actor_id),
    true
  );

  if lower(p_request_type) = 'leave' then
    update public.leave_requests
    set status = final_status,
        approver_id = actor_id,
        approval_route = case when requires_bod then 'BOD_REQUIRED' else 'MANAGER_ONLY' end,
        approval_reason = context_value->>'reason',
        approval_context = context_value,
        approval_routed_at = now(),
        history_log = coalesce(history_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'action', initcap(lower(p_decision)),
          'by', actor_id,
          'date', now(),
          'note', coalesce(p_note, context_value->>'reason')
        ))
    where id = p_request_id;
  elsif lower(p_request_type) = 'wfh' then
    update public.wfh_requests
    set status = final_status,
        approved_by = actor_id,
        approved_at = now(),
        rejection_reason = case when lower(p_decision) = 'reject' then p_note else null end,
        approval_route = case when requires_bod then 'BOD_REQUIRED' else 'MANAGER_ONLY' end,
        approval_reason = context_value->>'reason',
        approval_context = context_value,
        approval_routed_at = now()
    where id = p_request_id;
  else
    update public.ot_requests
    set status = final_status::public.ot_status,
        approved_by = actor_id,
        approved_at = now(),
        updated_at = now(),
        manager_note = coalesce(p_note, manager_note),
        approval_route = case when requires_bod then 'BOD_REQUIRED' else 'MANAGER_ONLY' end,
        approval_reason = context_value->>'reason',
        approval_context = context_value,
        approval_routed_at = now(),
        history_log = coalesce(history_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'action', initcap(lower(p_decision)),
          'by', actor_id,
          'date', now(),
          'note', coalesce(p_note, context_value->>'reason')
        ))
    where id = p_request_id;
  end if;

  if is_manager_stage and lower(p_decision) = 'approve' and requires_bod then
    perform private.assign_time_request_approvers(p_request_type, p_request_id, true);
  end if;

  if final_status in ('Approved', 'WFH_FOR_TIMEKEEPING') then
    update public.time_request_approval_assignments
    set status = 'Skipped',
        updated_at = now(),
        decision_note = coalesce(decision_note, 'Request completed')
    where request_type = lower(p_request_type)
      and request_id = p_request_id
      and status = 'Pending';
  end if;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values(
    actor_id::text,
    actor_email,
    upper(p_decision),
    initcap(lower(p_request_type)),
    p_request_id::text,
    format(
      'Conditional approval: %s -> %s. %s',
      current_status,
      final_status,
      context_value->>'reason'
    )
  );

  perform set_config('app.time_request_approval_context', '', true);

  return jsonb_build_object(
    'requestType', lower(p_request_type),
    'requestId', p_request_id,
    'previousStatus', current_status,
    'status', final_status,
    'route', case when requires_bod then 'BOD_REQUIRED' else 'MANAGER_ONLY' end,
    'context', context_value,
    'notifyEscalation', is_manager_stage
      and lower(p_decision) = 'approve'
      and requires_bod
  );
exception when others then
  perform set_config('app.time_request_approval_context', '', true);
  raise;
end;
$$;

revoke all on function public.process_time_request_approval(text, uuid, text, text)
  from public, anon;
grant execute on function public.process_time_request_approval(text, uuid, text, text)
  to authenticated;

comment on function public.process_time_request_approval(text, uuid, text, text) is
  'Processes an exact direct-manager or assigned escalation decision, preserves conditional routing and audit history, and establishes a request-bound trigger context only after authorization.';
