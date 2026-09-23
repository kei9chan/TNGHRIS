-- A Board of Director is the final authority for every leave request that has
-- reached the BOD stage. Per-request assignment remains useful for notification
-- history, but it must never be a second authorization gate.

create or replace function public.can_view_time_request(
  p_request_type text,
  p_request_id uuid,
  p_employee_id uuid,
  p_direct_manager_id uuid,
  p_business_unit_id uuid
)
returns boolean
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.current_hris_user_id();
  v_resource text := case lower(p_request_type)
    when 'overtime' then 'OT'
    when 'wfh' then 'WFH'
    when 'leave' then 'Leave'
    else null
  end;
begin
  if v_actor is null or v_resource is null then return false; end if;
  if v_actor = p_employee_id then return true; end if;

  -- Every active BOD can see the final leave queue. This does not grant access
  -- to drafts or manager-stage requests and does not allow self-approval.
  if lower(p_request_type) = 'leave'
     and public.has_active_role('Board of Director')
     and v_actor <> p_employee_id
     and exists (
       select 1 from public.leave_requests request
       where request.id = p_request_id and request.status = 'PendingBOD'
     ) then
    return true;
  end if;

  if private.is_active_time_request_approver(v_actor, p_request_type, p_request_id) then return true; end if;
  return private.has_assigned_feature_permission(v_actor, v_resource, 'view')
    and public.can_access_hris_user(p_employee_id);
end;
$$;

create or replace function public.get_my_pending_time_approval_ids_for_actor(p_actor uuid)
returns table(request_type text, request_id uuid)
language sql
stable security definer
set search_path = ''
as $$
  select * from (
    with actor as (
      select manager.id, manager.auth_user_id, manager.employee_id, manager.full_name,
             private.workflow_user_has_role(manager.id, 'Board of Director') as is_bod
      from public.hris_users manager
      where manager.id = p_actor and lower(manager.status::text) = 'active'
    ), reportees as (
      select employee.id
      from public.hris_users employee
      cross join actor
      where employee.reports_to in (
        actor.id::text,
        actor.auth_user_id::text,
        coalesce(actor.employee_id, ''),
        actor.full_name
      )
    ), assigned as (
      select assignment.request_type, assignment.request_id
      from public.time_request_approval_assignments assignment
      join actor on actor.id = assignment.approver_user_id
      where assignment.status = 'Pending'
    ), bod_leave_queue as (
      select 'leave'::text as request_type, request.id as request_id
      from public.leave_requests request
      cross join actor
      where actor.is_bod
        and request.status = 'PendingBOD'
        and request.employee_id <> actor.id
        and request.duplicate_of is null
    ), manager_queue as (
      select 'leave'::text as request_type, request.id as request_id
      from public.leave_requests request
      join reportees on reportees.id = request.employee_id
      where request.status in ('Pending', 'PendingGM')
      union all
      select 'wfh'::text, request.id
      from public.wfh_requests request
      join reportees on reportees.id = request.employee_id
      where request.status in ('WFH_PENDING_DEPT_HEAD_APPROVAL', 'WFH_PENDING_GM_APPROVAL')
      union all
      select 'overtime'::text, request.id
      from public.ot_requests request
      join reportees on reportees.id = request.employee_id
      where request.status in ('Submitted', 'PendingGM')
    )
    select request_type, request_id from assigned
    union
    select request_type, request_id from bod_leave_queue
    union
    select request_type, request_id from manager_queue
  ) scoped
  where public.approval_email_actor_allowed(p_actor);
$$;
revoke all on function public.get_my_pending_time_approval_ids_for_actor(uuid) from public, anon;
grant execute on function public.get_my_pending_time_approval_ids_for_actor(uuid) to authenticated, service_role;

-- Preserve the general approval engine while making BOD leave authority derive
-- from the active role. An assignment row is materialized for audit only.
do $$
declare
  original_definition text;
  patched_definition text;
begin
  original_definition := pg_get_functiondef('private.process_time_request_approval_core(text,uuid,text,text)'::regprocedure);
  patched_definition := replace(
    original_definition,
    '    if current_status not in (''PendingBOD'',''WFH_PENDING_BOD_APPROVAL'') then raise exception ''This approval stage is no longer pending.'' using errcode=''22023''; end if;',
    $patch$
    if lower(p_request_type) = 'leave'
       and current_status = 'PendingBOD'
       and public.has_active_role('Board of Director')
       and assignment.id is null then
      insert into public.time_request_approval_assignments(
        request_type, request_id, approver_user_id, is_bod, is_required,
        status, decision_note, decided_at, updated_at
      ) values (
        'leave', p_request_id, actor_id, true, true,
        'Pending', null, null, clock_timestamp()
      )
      on conflict (request_type, request_id, approver_user_id) do update
      set is_bod = true,
          is_required = true,
          status = 'Pending',
          decision_note = null,
          decided_at = null,
          updated_at = clock_timestamp()
      returning * into assignment;
    end if;

    if current_status not in ('PendingBOD','WFH_PENDING_BOD_APPROVAL') then raise exception 'This approval stage is no longer pending.' using errcode='22023'; end if;$patch$
  );
  if patched_definition = original_definition then
    raise exception 'BOD leave assignment authorization patch did not match the approval core';
  end if;

  original_definition := patched_definition;
  patched_definition := replace(
    original_definition,
    '    if lower(p_decision) = ''reject'' and assignment.is_required then',
    $patch$
    if lower(p_request_type) = 'leave'
       and current_status = 'PendingBOD'
       and public.has_active_role('Board of Director') then
      final_status := case lower(p_decision)
        when 'approve' then 'Approved'
        when 'reject' then 'Rejected'
        else 'Pending'
      end;
    elsif lower(p_decision) = 'reject' and assignment.is_required then$patch$
  );
  if patched_definition = original_definition then
    raise exception 'BOD final authority patch did not match the approval core';
  end if;
  execute patched_definition;
end;
$$;

-- Older clients may still use the generic time-approval RPC. An active BOD
-- role is sufficient at the BOD leave stage; assignment is not authorization.
do $$
declare
  original_definition text;
  patched_definition text;
begin
  original_definition := pg_get_functiondef('public.process_time_request_approval(text,uuid,text,text)'::regprocedure);
  patched_definition := replace(
    original_definition,
    'and not (public.has_active_role(''Board of Director'') and exists(select 1 from public.time_request_approval_assignments where request_type=''leave'' and request_id=p_request_id and approver_user_id=actor and is_bod and status in(''Pending'',''Approved''))) then',
    'and not public.has_active_role(''Board of Director'') then'
  );
  if patched_definition = original_definition then
    raise exception 'Generic BOD exception authorization patch did not match';
  end if;
  execute patched_definition;
end;
$$;

create or replace function public.get_time_approval_progress(p_request_type text, p_request_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_hris_user_id();
  employee uuid;
  stage text;
  result jsonb;
  bod_leave_authority boolean := false;
begin
  case lower(p_request_type)
    when 'leave' then select employee_id, status::text into employee, stage from public.leave_requests where id = p_request_id;
    when 'wfh' then select employee_id, status::text into employee, stage from public.wfh_requests where id = p_request_id;
    when 'overtime' then select employee_id, status::text into employee, stage from public.ot_requests where id = p_request_id;
    else raise exception 'Unsupported request type';
  end case;

  bod_leave_authority := lower(p_request_type) = 'leave'
    and stage = 'PendingBOD'
    and public.has_active_role('Board of Director')
    and actor is distinct from employee;

  if auth.uid() is null or not (
    bod_leave_authority
    or public.can_view_time_request(p_request_type, p_request_id, employee, null, null)
    or exists (
      select 1 from private.time_approval_decisions
      where request_type = lower(p_request_type)
        and request_id = p_request_id
        and approver_id = actor
    )
  ) then
    raise exception 'Request unavailable' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'completed', case
      when lower(p_request_type) = 'leave' and stage = 'PendingBOD'
        then case when count(*) filter(where is_bod and status = 'Approved') > 0 then 1 else 0 end
      else count(distinct approver_user_id) filter(where is_bod and is_required and status = 'Approved')
    end,
    'required', case
      when lower(p_request_type) = 'leave' and stage = 'PendingBOD' then 1
      else count(distinct approver_user_id) filter(where is_bod and is_required)
    end,
    'alreadyApproved', coalesce(bool_or(approver_user_id = actor and status = 'Approved'), false),
    'canAct', bod_leave_authority or coalesce(bool_or(approver_user_id = actor and status = 'Pending'), false),
    'stage', stage
  ) into result
  from public.time_request_approval_assignments
  where request_type = lower(p_request_type) and request_id = p_request_id;

  if lower(p_request_type) = 'leave' then
    result := result
      || private.leave_credit_context(p_request_id)
      || jsonb_build_object(
        'creditOverrides', (
          select coalesce(jsonb_agg(to_jsonb(override_row) order by created_at), '[]')
          from private.leave_credit_overrides override_row
          where request_id = p_request_id
        )
      );
  end if;
  return result;
end;
$$;
revoke all on function public.get_time_approval_progress(text,uuid) from public, anon;
grant execute on function public.get_time_approval_progress(text,uuid) to authenticated;

-- Exception approvals use a dedicated atomic final-decision path. This avoids
-- the regular employee accrual gate while retaining the negative-balance audit.
create or replace function public.process_leave_exception_approval(
  p_request_id uuid,
  p_decision text,
  p_outcome text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_hris_user_id();
  request_row public.leave_requests;
  credits jsonb;
  result jsonb;
  prior private.time_approval_decisions;
  action_label text;
begin
  if auth.uid() is null
     or actor is null
     or not exists (
       select 1 from public.hris_users user_row
       where user_row.id = actor and lower(user_row.status::text) = 'active'
     )
     or not public.has_active_role('Board of Director') then
    raise exception 'An active Board of Director role is required.' using errcode = '42501';
  end if;

  select * into strict request_row
  from public.leave_requests
  where id = p_request_id
  for update;

  if request_row.employee_id = actor then
    raise exception 'A Board of Director cannot approve their own leave request.' using errcode = '42501';
  end if;

  select * into prior
  from private.time_approval_decisions decision_row
  where decision_row.request_type = 'leave'
    and decision_row.request_id = p_request_id
    and decision_row.stage = 'PendingBOD'
    and decision_row.approver_id = actor
  limit 1;
  if prior.approver_id is not null then
    if prior.decision = lower(p_decision) then
      return prior.result || jsonb_build_object(
        'alreadyDecided', true,
        'notifyEscalation', false,
        'message', case when prior.decision = 'approve' then 'Already approved by you' else 'Decision already recorded' end
      );
    end if;
    raise exception 'You have already recorded a decision for this request.' using errcode = '22023';
  end if;

  credits := private.leave_credit_context(request_row.id);
  if request_row.status <> 'PendingBOD'
     or not coalesce((credits->>'creditException')::boolean, false) then
    raise exception 'This request is not awaiting a BOD credit exception decision.' using errcode = '22023';
  end if;
  if lower(p_decision) not in ('approve', 'reject') then raise exception 'Choose approve or reject.'; end if;
  if lower(p_decision) = 'reject' and nullif(btrim(p_note), '') is null then raise exception 'A rejection reason is required.'; end if;
  if lower(p_decision) = 'approve' and p_outcome not in ('paid_exception', 'lwop') then raise exception 'Choose paid leave exception or Leave Without Pay.'; end if;

  insert into public.time_request_approval_assignments(
    request_type, request_id, approver_user_id, is_bod, is_required,
    status, decision_note, decided_at, updated_at
  ) values (
    'leave', request_row.id, actor, true, true,
    'Pending', null, null, clock_timestamp()
  )
  on conflict (request_type, request_id, approver_user_id) do update
  set is_bod = true,
      is_required = true,
      status = 'Pending',
      decision_note = null,
      decided_at = null,
      updated_at = clock_timestamp();

  update public.time_request_approval_assignments
  set status = case when lower(p_decision) = 'approve' then 'Approved' else 'Rejected' end,
      decision_note = nullif(btrim(p_note), ''),
      decided_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where request_type = 'leave'
    and request_id = request_row.id
    and approver_user_id = actor;

  perform set_config('app.time_request_approval_context', format('leave:%s:%s', request_row.id, actor), true);
  action_label := case
    when lower(p_decision) = 'reject' then 'BOD leave exception rejected'
    when p_outcome = 'paid_exception' then 'BOD paid leave exception approved'
    else 'BOD approved as Leave Without Pay'
  end;

  update public.leave_requests
  set status = case when lower(p_decision) = 'approve' then 'Approved' else 'Rejected' end,
      final_classification = case when lower(p_decision) = 'approve' then p_outcome else final_classification end,
      paid_days = case
        when lower(p_decision) = 'approve' and p_outcome = 'paid_exception' then duration_days
        when lower(p_decision) = 'approve' then 0
        else paid_days
      end,
      unpaid_days = case
        when lower(p_decision) = 'approve' and p_outcome = 'lwop' then duration_days
        when lower(p_decision) = 'approve' then 0
        else unpaid_days
      end,
      approver_id = actor,
      approval_route = 'BOD_REQUIRED',
      approval_routed_at = clock_timestamp(),
      history_log = coalesce(history_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'action', action_label,
        'userId', actor,
        'userName', (select full_name from public.hris_users where id = actor),
        'timestamp', clock_timestamp(),
        'details', jsonb_build_object(
          'creditShortfall', credits->'creditShortfall',
          'outcome', case when lower(p_decision) = 'approve' then p_outcome else 'rejected' end,
          'note', nullif(btrim(p_note), '')
        )
      ))
  where id = request_row.id;

  update public.time_request_approval_assignments
  set status = 'Skipped',
      decision_note = coalesce(decision_note, 'Final BOD decision recorded'),
      updated_at = clock_timestamp()
  where request_type = 'leave'
    and request_id = request_row.id
    and approver_user_id <> actor
    and status = 'Pending';

  if lower(p_decision) = 'approve' then
    insert into private.leave_exception_decisions(
      request_id, approver_id, outcome, credit_shortfall,
      available_credits, requested_days, note
    ) values (
      request_row.id, actor, p_outcome,
      (credits->>'creditShortfall')::numeric,
      (credits->>'availableCredits')::numeric,
      (credits->>'requestedCredits')::numeric,
      nullif(btrim(p_note), '')
    ) on conflict (request_id) do nothing;

    if p_outcome = 'paid_exception' then
      insert into private.leave_credit_overrides(request_id, approver_id, credit_snapshot, note)
      values(request_row.id, actor, credits, nullif(btrim(p_note), ''))
      on conflict do nothing;
    end if;
  end if;

  result := jsonb_build_object(
    'requestType', 'leave',
    'requestId', request_row.id,
    'previousStatus', request_row.status,
    'status', case when lower(p_decision) = 'approve' then 'Approved' else 'Rejected' end,
    'route', 'BOD_REQUIRED',
    'notifyEscalation', false,
    'exceptionOutcome', case when lower(p_decision) = 'approve' then p_outcome else null end,
    'creditShortfall', credits->'creditShortfall'
  );

  insert into private.time_approval_decisions(
    request_type, request_id, stage, approver_id, decision, decided_at, result
  ) values (
    'leave', request_row.id, 'PendingBOD', actor, lower(p_decision), clock_timestamp(), result
  );
  insert into public.audit_logs(user_id, action, entity, entity_id, details)
  values(
    actor::text,
    case when lower(p_decision) = 'approve' then 'BOD_LEAVE_EXCEPTION_APPROVED' else 'BOD_LEAVE_EXCEPTION_REJECTED' end,
    'Leave',
    request_row.id::text,
    (credits || jsonb_build_object(
      'role', 'Board of Director',
      'outcome', case when lower(p_decision) = 'approve' then p_outcome else 'rejected' end,
      'note', nullif(btrim(p_note), ''),
      'timestamp', clock_timestamp()
    ))::text
  );

  perform set_config('app.time_request_approval_context', '', true);
  return result;
exception when others then
  perform set_config('app.time_request_approval_context', '', true);
  raise;
end;
$$;
revoke all on function public.process_leave_exception_approval(uuid,text,text,text) from public, anon;
grant execute on function public.process_leave_exception_approval(uuid,text,text,text) to authenticated;

notify pgrst, 'reload schema';
