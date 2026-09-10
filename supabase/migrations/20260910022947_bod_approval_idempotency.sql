-- Preserve configured assignment counts and leave accounting. No employee-specific access.
create table private.time_approval_decisions (
 request_type text not null, request_id uuid not null, stage text not null,
 approver_id uuid not null, decision text not null, decided_at timestamptz not null default clock_timestamp(),
 result jsonb not null, primary key(request_type,request_id,stage,approver_id)
);
revoke all on private.time_approval_decisions from public,anon,authenticated;
alter table private.time_approval_decisions enable row level security;
create function private.prevent_time_decision_mutation() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Approval decisions are immutable';end$$;
create trigger time_decisions_immutable before update or delete on private.time_approval_decisions for each row execute function private.prevent_time_decision_mutation();
create or replace function private.process_time_request_approval_core(
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

    if current_status not in ('PendingBOD','WFH_PENDING_BOD_APPROVAL') then raise exception 'This approval stage is no longer pending.' using errcode='22023'; end if;
    if assignment.is_bod and not public.has_active_role('Board of Director') then raise exception 'Active BOD approval authority is required.' using errcode='42501'; end if;
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


revoke all on function private.process_time_request_approval_core(text,uuid,text,text) from public,anon,authenticated;
create or replace function public.process_time_request_approval(p_request_type text,p_request_id uuid,p_decision text,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); v_stage text; result jsonb; previous private.time_approval_decisions;
begin
 if auth.uid() is null or not exists(select 1 from public.hris_users where id=actor and lower(status)='active') then raise exception 'Active authenticated account required' using errcode='42501';end if;
 case lower(p_request_type)
 when 'leave' then select status::text into v_stage from public.leave_requests where id=p_request_id for update;
 when 'wfh' then select status::text into v_stage from public.wfh_requests where id=p_request_id for update;
 when 'overtime' then select status::text into v_stage from public.ot_requests where id=p_request_id for update;
 else raise exception 'Unsupported request type' using errcode='22023';end case;
 if v_stage is null then raise exception 'Request unavailable' using errcode='42501';end if;
 select * into previous from private.time_approval_decisions d where d.request_type=lower(p_request_type) and d.request_id=p_request_id and d.approver_id=actor and (d.stage=v_stage or v_stage in ('Approved','WFH_FOR_TIMEKEEPING','Rejected','WFH_REJECTED')) order by decided_at desc limit 1;
 if previous.approver_id is not null then
 if previous.decision=lower(p_decision) then return previous.result||jsonb_build_object('alreadyDecided',true,'notifyEscalation',false,'message',case when previous.decision='approve' then 'Already approved by you' else 'Decision already recorded' end);end if;
 raise exception 'You have already recorded a decision for this request and approval stage.' using errcode='22023';end if;
 if lower(p_decision)='approve' and v_stage in ('PendingBOD','WFH_PENDING_BOD_APPROVAL','Approved','WFH_FOR_TIMEKEEPING') and exists(select 1 from public.time_request_approval_assignments where request_type=lower(p_request_type) and request_id=p_request_id and approver_user_id=actor and status='Approved') then
 return jsonb_build_object('alreadyDecided',true,'notifyEscalation',false,'message','Already approved by you','status',v_stage);end if;
 result:=private.process_time_request_approval_core(p_request_type,p_request_id,p_decision,p_note);
 insert into private.time_approval_decisions values(lower(p_request_type),p_request_id,v_stage,actor,lower(p_decision),clock_timestamp(),result);
 return result;
end$$;
revoke all on function public.process_time_request_approval(text,uuid,text,text) from public,anon;
grant execute on function public.process_time_request_approval(text,uuid,text,text) to authenticated;
create function public.get_time_approval_progress(p_request_type text,p_request_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); employee uuid; stage text; result jsonb;
begin
 case lower(p_request_type)
 when 'leave' then select employee_id,status::text into employee,stage from public.leave_requests where id=p_request_id;
 when 'wfh' then select employee_id,status::text into employee,stage from public.wfh_requests where id=p_request_id;
 when 'overtime' then select employee_id,status::text into employee,stage from public.ot_requests where id=p_request_id;
 else raise exception 'Unsupported request type';end case;
 if auth.uid() is null or not (public.can_view_time_request(p_request_type,p_request_id,employee,null,null) or exists(select 1 from private.time_approval_decisions where request_type=lower(p_request_type) and request_id=p_request_id and approver_id=actor)) then raise exception 'Request unavailable' using errcode='42501';end if;
 select jsonb_build_object('completed',count(distinct approver_user_id) filter(where is_bod and is_required and status='Approved'),'required',count(distinct approver_user_id) filter(where is_bod and is_required),'alreadyApproved',coalesce(bool_or(approver_user_id=actor and status='Approved'),false),'canAct',coalesce(bool_or(approver_user_id=actor and status='Pending'),false),'stage',stage) into result from public.time_request_approval_assignments where request_type=lower(p_request_type) and request_id=p_request_id;
 return result;
end$$;
revoke all on function public.get_time_approval_progress(text,uuid) from public,anon;
grant execute on function public.get_time_approval_progress(text,uuid) to authenticated;
-- The reported request is Offset Leave. Explain the real failure without allowing an offset balance bypass.
do $$declare s text;begin
 s:=pg_get_functiondef('private.confirmed_leave_request_accounting()'::regprocedure);
 s:=replace(s, 'raise exception ''Insufficient available leave credits; a routed BOD exception approval is required'';', 'if k=''offset'' then raise exception ''Insufficient earned offset credits. HR must review the leave type or offset balance before approval; BOD routing does not grant offset credits.'' using errcode=''P0001''; end if; raise exception ''Insufficient available leave credits; a routed BOD exception approval is required'';');
 execute s;
end$$;
notify pgrst,'reload schema';
