-- Approval Center: auditable, idempotent, scope-aware bulk approvals.
-- Additive only. Existing request tables and their workflow triggers remain the
-- source of truth for individual records.

create table if not exists public.approval_bulk_actions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  actor_user_id uuid not null references public.hris_users(id),
  request_type text not null check (request_type in ('leave','wfh','overtime','manpower')),
  requested_count integer not null default 0,
  success_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  exception_count integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.approval_bulk_actions enable row level security;

drop policy if exists approval_bulk_actions_authorized_read on public.approval_bulk_actions;
create policy approval_bulk_actions_authorized_read
on public.approval_bulk_actions for select to authenticated
using (
  actor_user_id = public.current_hris_user_id()
  or public.has_feature_permission('AuditLog','view')
);

create index if not exists approval_bulk_actions_created_at_idx
  on public.approval_bulk_actions(created_at desc);

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
  actor_id uuid := public.current_hris_user_id();
  workflow_key text;
  request_id uuid;
  employee_id uuid;
  employee_name text;
  current_status text;
  next_status text;
  success_ids uuid[] := '{}';
  skipped_ids uuid[] := '{}';
  failed_items jsonb := '[]'::jsonb;
  success_count integer := 0;
  skipped_count integer := 0;
  failed_count integer := 0;
  result_value jsonb;
  actor_email text;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode='42501';
  end if;
  if not coalesce(p_confirm_policy, false) then
    raise exception 'Policy confirmation is required.' using errcode='22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'An idempotency key is required.' using errcode='22023';
  end if;
  if coalesce(array_length(p_request_ids, 1), 0) = 0 then
    raise exception 'Select at least one eligible request.' using errcode='22023';
  end if;

  workflow_key := case lower(p_request_type)
    when 'leave' then 'Leave'
    when 'wfh' then 'WFH'
    when 'overtime' then 'Overtime'
    when 'manpower' then 'Manpower'
    else null
  end;
  if workflow_key is null then
    raise exception 'Bulk approval is not supported for this request type.' using errcode='22023';
  end if;
  if not public.has_workflow_permission(workflow_key, 'approve') then
    raise exception 'You do not have approval authority for this workflow.' using errcode='42501';
  end if;

  select result into result_value
  from public.approval_bulk_actions
  where idempotency_key = p_idempotency_key and actor_user_id = actor_id;
  if result_value is not null then return result_value; end if;

  select email into actor_email from public.hris_users where id = actor_id;

  foreach request_id in array p_request_ids loop
    begin
      employee_id := null; employee_name := null; current_status := null; next_status := null;

      if lower(p_request_type) = 'leave' then
        select r.employee_id, r.employee_name, r.status
          into employee_id, employee_name, current_status
        from public.leave_requests r
        join public.hris_users u on u.id = r.employee_id
        where r.id = request_id
          and r.status in ('Pending','PendingGM','PendingBOD')
          and lower(coalesce(u.status,'active')) = 'active'
          and r.start_date <= r.end_date
          and r.duration_days > 0 and r.duration_days <= 30
          and public.can_access_hris_user(r.employee_id)
        for update of r skip locked;
        if employee_id is not null then
          next_status := case when current_status = 'PendingGM' then 'PendingBOD' else 'Approved' end;
          update public.leave_requests
          set status = next_status,
              approver_id = actor_id,
              history_log = coalesce(history_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                'action','Approved','by',actor_id,'date',now(),'note','Approved via Approval Center bulk action'
              ))
          where id = request_id and status = current_status;
        end if;

      elsif lower(p_request_type) = 'wfh' then
        select r.employee_id, r.employee_name, r.status
          into employee_id, employee_name, current_status
        from public.wfh_requests r
        join public.hris_users u on u.id = r.employee_id
        where r.id = request_id
          and r.status in ('WFH_PENDING_DEPT_HEAD_APPROVAL','WFH_PENDING_GM_APPROVAL','WFH_PENDING_BOD_APPROVAL')
          and lower(coalesce(u.status,'active')) = 'active'
          and r.date <= coalesce(r.end_date, r.date)
          and coalesce(r.end_date, r.date) - r.date <= 31
          and not exists (
            select 1 from public.leave_requests l
            where l.employee_id = r.employee_id
              and l.status not in ('Rejected','Cancelled','Canceled','Draft')
              and daterange(l.start_date, l.end_date, '[]') && daterange(r.date, coalesce(r.end_date,r.date), '[]')
          )
          and public.can_access_hris_user(r.employee_id)
        for update of r skip locked;
        if employee_id is not null then
          next_status := case when current_status = 'WFH_PENDING_BOD_APPROVAL' then 'WFH_FOR_TIMEKEEPING' else 'WFH_PENDING_BOD_APPROVAL' end;
          update public.wfh_requests
          set status = next_status, approved_by = actor_id, approved_at = now(), rejection_reason = null
          where id = request_id and status = current_status;
        end if;

      elsif lower(p_request_type) = 'overtime' then
        select r.employee_id, r.employee_name, r.status::text
          into employee_id, employee_name, current_status
        from public.ot_requests r
        join public.hris_users u on u.id = r.employee_id
        where r.id = request_id
          and r.status::text in ('Submitted','PendingGM','PendingBOD')
          and lower(coalesce(u.status,'active')) = 'active'
          and nullif(trim(r.reason),'') is not null
          and public.can_access_hris_user(r.employee_id)
        for update of r skip locked;
        if employee_id is not null then
          next_status := case when current_status = 'PendingBOD' then 'Approved' else 'PendingBOD' end;
          update public.ot_requests
          set status = next_status::public.ot_status,
              approved_by = actor_id,
              approved_at = now(),
              updated_at = now(),
              history_log = coalesce(history_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                'action','Approved','by',actor_id,'date',now(),'note','Approved via Approval Center bulk action'
              ))
          where id = request_id and status::text = current_status;
        end if;

      elsif lower(p_request_type) = 'manpower' then
        select r.requester_id, r.requester_name, r.status
          into employee_id, employee_name, current_status
        from public.manpower_requests r
        join public.hris_users u on u.id = r.requester_id
        where r.id = request_id and r.status = 'Pending'
          and lower(coalesce(u.status,'active')) = 'active'
          and r.date_needed is not null
          and public.can_access_hris_user(r.requester_id)
        for update of r skip locked;
        if employee_id is not null then
          next_status := 'Approved';
          update public.manpower_requests
          set status = 'Approved', approved_by = actor_id, approved_at = now(), rejection_reason = null
          where id = request_id and status = current_status;
        end if;
      end if;

      if employee_id is null or next_status is null then
        skipped_count := skipped_count + 1;
        skipped_ids := array_append(skipped_ids, request_id);
      else
        success_count := success_count + 1;
        success_ids := array_append(success_ids, request_id);
        insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details)
        values(actor_id::text,actor_email,'BULK_APPROVE',workflow_key,request_id::text,
          format('Approval Center: %s -> %s',current_status,next_status));
        insert into public.notifications(user_id,type,title,message,link,related_entity_id)
        values(employee_id::text,'APPROVAL_UPDATE','Request approved',
          format('Your %s request was approved and moved to %s.',workflow_key,next_status),
          case lower(p_request_type) when 'leave' then '/payroll/leave' when 'wfh' then '/payroll/wfh-requests' when 'overtime' then '/payroll/overtime-requests' else '/payroll/manpower-planning' end,
          request_id::text);
      end if;
    exception when others then
      failed_count := failed_count + 1;
      failed_items := failed_items || jsonb_build_array(jsonb_build_object('id',request_id,'error',sqlerrm));
    end;
  end loop;

  result_value := jsonb_build_object(
    'requested',coalesce(array_length(p_request_ids,1),0),
    'succeeded',success_count,'skipped',skipped_count,'failed',failed_count,
    'successIds',to_jsonb(success_ids),'skippedIds',to_jsonb(skipped_ids),'failures',failed_items
  );
  insert into public.approval_bulk_actions(
    idempotency_key,actor_user_id,request_type,requested_count,success_count,skipped_count,failed_count,result
  ) values(
    p_idempotency_key,actor_id,lower(p_request_type),coalesce(array_length(p_request_ids,1),0),
    success_count,skipped_count,failed_count,result_value
  );
  return result_value;
end;
$$;

revoke all on function public.bulk_approve_requests(text,uuid[],uuid,boolean) from public, anon;
grant execute on function public.bulk_approve_requests(text,uuid[],uuid,boolean) to authenticated;
grant select on public.approval_bulk_actions to authenticated;

