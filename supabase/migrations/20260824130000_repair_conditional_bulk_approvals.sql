-- Repair conditional Leave/WFH/OT bulk approvals.
--
-- 1. Avoid the PL/pgSQL variable/column ambiguity in the status guard.
-- 2. Route every bulk time-request decision through the same canonical RPC
--    used by individual approvals, including direct-manager and explicit
--    escalation-assignment authorization.

create or replace function public.guard_conditional_time_approval_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_type text := lower(tg_argv[0]);
  v_actor_id uuid := public.current_hris_user_id();
  v_context jsonb;
  v_is_final_approval boolean;
  v_is_bod_stage boolean;
begin
  if new.status::text is not distinct from old.status::text then
    return new;
  end if;

  v_context := private.time_request_context(v_request_type, new.id);
  v_is_final_approval := new.status::text in ('Approved', 'WFH_FOR_TIMEKEEPING');
  v_is_bod_stage := old.status::text in ('PendingBOD', 'WFH_PENDING_BOD_APPROVAL');

  if coalesce((v_context->>'requiresBod')::boolean, false)
     and v_is_final_approval
     and not v_is_bod_stage then
    raise exception 'This request exceeds its configured threshold and must be routed to an assigned BOD approver.'
      using errcode = '42501';
  end if;

  if v_is_bod_stage and not exists (
    select 1
    from public.time_request_approval_assignments a
    where a.request_type = v_request_type
      and a.request_id = old.id
      and a.approver_user_id = v_actor_id
      and a.status in ('Approved', 'Rejected', 'Skipped')
      and a.updated_at >= now() - interval '10 minutes'
  ) then
    raise exception 'Only a currently assigned escalation approver may decide this request.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_conditional_time_approval_transition()
  from public, anon, authenticated;

create or replace function public.bulk_approve_requests(
  p_request_type text,
  p_request_ids uuid[],
  p_idempotency_key uuid,
  p_confirm_policy boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := public.current_hris_user_id();
  v_workflow_key text;
  v_request_id uuid;
  v_employee_id uuid;
  v_employee_name text;
  v_current_status text;
  v_next_status text;
  v_decision jsonb;
  v_authorized boolean;
  v_success_ids uuid[] := '{}';
  v_skipped_ids uuid[] := '{}';
  v_skipped_items jsonb := '[]'::jsonb;
  v_failed_items jsonb := '[]'::jsonb;
  v_success_count integer := 0;
  v_skipped_count integer := 0;
  v_failed_count integer := 0;
  v_result jsonb;
  v_actor_email text;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not coalesce(p_confirm_policy, false) then
    raise exception 'Policy confirmation is required.' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'An idempotency key is required.' using errcode = '22023';
  end if;
  if coalesce(array_length(p_request_ids, 1), 0) = 0 then
    raise exception 'Select at least one eligible request.' using errcode = '22023';
  end if;

  v_workflow_key := case lower(p_request_type)
    when 'leave' then 'Leave'
    when 'wfh' then 'WFH'
    when 'overtime' then 'Overtime'
    when 'manpower' then 'Manpower'
    else null
  end;
  if v_workflow_key is null then
    raise exception 'Bulk approval is not supported for this request type.' using errcode = '22023';
  end if;
  if not public.has_workflow_permission(v_workflow_key, 'approve') then
    raise exception 'You do not have approval authority for this workflow.' using errcode = '42501';
  end if;

  select a.result into v_result
  from public.approval_bulk_actions a
  where a.idempotency_key = p_idempotency_key
    and a.actor_user_id = v_actor_id;
  if v_result is not null then
    return v_result;
  end if;

  select u.email into v_actor_email
  from public.hris_users u
  where u.id = v_actor_id;

  foreach v_request_id in array p_request_ids loop
    begin
      v_employee_id := null;
      v_employee_name := null;
      v_current_status := null;
      v_next_status := null;
      v_decision := null;
      v_authorized := false;

      if lower(p_request_type) = 'leave' then
        select r.employee_id, r.employee_name, r.status::text
          into v_employee_id, v_employee_name, v_current_status
        from public.leave_requests r
        where r.id = v_request_id;
      elsif lower(p_request_type) = 'wfh' then
        select r.employee_id, r.employee_name, r.status::text
          into v_employee_id, v_employee_name, v_current_status
        from public.wfh_requests r
        where r.id = v_request_id;
      elsif lower(p_request_type) = 'overtime' then
        select r.employee_id, r.employee_name, r.status::text
          into v_employee_id, v_employee_name, v_current_status
        from public.ot_requests r
        where r.id = v_request_id;
      end if;

      if lower(p_request_type) in ('leave', 'wfh', 'overtime') then
        if v_employee_id is null then
          v_skipped_count := v_skipped_count + 1;
          v_skipped_ids := array_append(v_skipped_ids, v_request_id);
          v_skipped_items := v_skipped_items || jsonb_build_array(jsonb_build_object(
            'id', v_request_id, 'reason', 'Request not found.'
          ));
          continue;
        end if;

        v_authorized := case lower(p_request_type)
          when 'leave' then
            (v_current_status in ('Pending', 'PendingGM')
              and private.is_direct_reporting_manager(v_actor_id, v_employee_id))
            or (v_current_status = 'PendingBOD' and exists (
              select 1 from public.time_request_approval_assignments a
              where a.request_type = 'leave' and a.request_id = v_request_id
                and a.approver_user_id = v_actor_id and a.status = 'Pending'
            ))
          when 'wfh' then
            (v_current_status in ('WFH_PENDING_DEPT_HEAD_APPROVAL', 'WFH_PENDING_GM_APPROVAL')
              and private.is_direct_reporting_manager(v_actor_id, v_employee_id))
            or (v_current_status = 'WFH_PENDING_BOD_APPROVAL' and exists (
              select 1 from public.time_request_approval_assignments a
              where a.request_type = 'wfh' and a.request_id = v_request_id
                and a.approver_user_id = v_actor_id and a.status = 'Pending'
            ))
          else
            (v_current_status in ('Submitted', 'PendingGM')
              and private.is_direct_reporting_manager(v_actor_id, v_employee_id))
            or (v_current_status = 'PendingBOD' and exists (
              select 1 from public.time_request_approval_assignments a
              where a.request_type = 'overtime' and a.request_id = v_request_id
                and a.approver_user_id = v_actor_id and a.status = 'Pending'
            ))
        end;

        if not v_authorized then
          v_skipped_count := v_skipped_count + 1;
          v_skipped_ids := array_append(v_skipped_ids, v_request_id);
          v_skipped_items := v_skipped_items || jsonb_build_array(jsonb_build_object(
            'id', v_request_id,
            'reason', case
              when v_current_status in ('PendingBOD', 'WFH_PENDING_BOD_APPROVAL')
                then 'Pending final approval by its assigned BOD approver.'
              when v_current_status in ('Pending', 'PendingGM', 'Submitted',
                                        'WFH_PENDING_DEPT_HEAD_APPROVAL', 'WFH_PENDING_GM_APPROVAL')
                then 'Pending approval by the employee''s direct reporting manager.'
              else 'Request is no longer pending approval.'
            end
          ));
          continue;
        end if;

        v_decision := public.process_time_request_approval(
          lower(p_request_type),
          v_request_id,
          'approve',
          'Approved via Approval Center bulk action'
        );
        v_next_status := v_decision->>'status';

      elsif lower(p_request_type) = 'manpower' then
        select r.requester_id, r.requester_name, r.status
          into v_employee_id, v_employee_name, v_current_status
        from public.manpower_requests r
        join public.hris_users u on u.id = r.requester_id
        where r.id = v_request_id
          and r.status = 'Pending'
          and lower(coalesce(u.status, 'active')) = 'active'
          and r.date_needed is not null
          and public.can_access_hris_user(r.requester_id)
        for update of r skip locked;

        if v_employee_id is not null then
          update public.manpower_requests r
          set status = 'Approved', approved_by = v_actor_id,
              approved_at = now(), rejection_reason = null
          where r.id = v_request_id and r.status = v_current_status;
          v_next_status := 'Approved';
        end if;
      end if;

      if v_employee_id is null or v_next_status is null then
        v_skipped_count := v_skipped_count + 1;
        v_skipped_ids := array_append(v_skipped_ids, v_request_id);
        v_skipped_items := v_skipped_items || jsonb_build_array(jsonb_build_object(
          'id', v_request_id, 'reason', 'Request was locked, invalid, or no longer eligible.'
        ));
      else
        v_success_count := v_success_count + 1;
        v_success_ids := array_append(v_success_ids, v_request_id);

        if lower(p_request_type) = 'manpower' then
          insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
          values(v_actor_id::text, v_actor_email, 'BULK_APPROVE', v_workflow_key,
            v_request_id::text, format('Approval Center: %s -> %s', v_current_status, v_next_status));
        end if;

        insert into public.notifications(user_id, type, title, message, link, related_entity_id)
        values(
          v_employee_id::text,
          'APPROVAL_UPDATE',
          'Request approval updated',
          format('Your %s request was approved at the current step and moved to %s.', v_workflow_key, v_next_status),
          case lower(p_request_type)
            when 'leave' then format('/payroll/leave?item=%s', v_request_id)
            when 'wfh' then format('/payroll/wfh-requests?item=%s', v_request_id)
            when 'overtime' then format('/payroll/overtime-requests?item=%s', v_request_id)
            else format('/payroll/manpower-planning?item=%s', v_request_id)
          end,
          v_request_id::text
        );
      end if;
    exception when others then
      v_failed_count := v_failed_count + 1;
      v_failed_items := v_failed_items || jsonb_build_array(jsonb_build_object(
        'id', v_request_id, 'error', sqlerrm
      ));
    end;
  end loop;

  v_result := jsonb_build_object(
    'requested', coalesce(array_length(p_request_ids, 1), 0),
    'succeeded', v_success_count,
    'skipped', v_skipped_count,
    'failed', v_failed_count,
    'successIds', to_jsonb(v_success_ids),
    'skippedIds', to_jsonb(v_skipped_ids),
    'skippedItems', v_skipped_items,
    'failures', v_failed_items
  );

  insert into public.approval_bulk_actions(
    idempotency_key, actor_user_id, request_type, requested_count,
    success_count, skipped_count, failed_count, result
  ) values (
    p_idempotency_key, v_actor_id, lower(p_request_type),
    coalesce(array_length(p_request_ids, 1), 0),
    v_success_count, v_skipped_count, v_failed_count, v_result
  );

  return v_result;
end;
$$;

revoke all on function public.bulk_approve_requests(text, uuid[], uuid, boolean)
  from public, anon;
grant execute on function public.bulk_approve_requests(text, uuid[], uuid, boolean)
  to authenticated;
