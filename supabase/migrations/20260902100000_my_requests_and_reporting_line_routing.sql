-- Keep employee self-service visible and approval work assigned to the
-- current reporting line. Existing request rows and their histories remain.

-- The legacy migration references this helper. Define it here as well so the
-- current database can repair assignments even when the helper was not part
-- of the original baseline.
create or replace function private.resolve_reporting_manager_id(p_reference text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select manager.id
  from public.hris_users manager
  where nullif(btrim(p_reference), '') is not null
    and lower(coalesce(manager.status, '')) = 'active'
    and coalesce(manager.is_duplicate, false) = false
    and (
      p_reference = manager.id::text
      or p_reference = manager.auth_user_id::text
      or p_reference = nullif(manager.employee_id, '')
      or lower(p_reference) = lower(manager.full_name)
    )
  order by manager.id
  limit 1
$$;

create or replace function private.resolve_direct_manager_id(p_employee_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.resolve_reporting_manager_id(employee.reports_to)
  from public.hris_users employee
  where employee.id = p_employee_id
$$;

revoke all on function private.resolve_reporting_manager_id(text) from public, anon, authenticated;
revoke all on function private.resolve_direct_manager_id(uuid) from public, anon, authenticated;

-- Reconcile one active manager-stage request. Only assignment metadata and
-- notifications change; request status, history_log, and audit records stay.
create or replace function private.reconcile_time_request_assignment(
  p_request_type text,
  p_request_id uuid,
  p_previous_manager_id uuid default null,
  p_force_notify boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid;
  v_employee_name text;
  v_status text;
  v_saved_manager_id uuid;
  v_current_manager_id uuid;
  v_previous_manager_id uuid;
  v_manager_changed boolean;
  v_has_open_notification boolean;
  v_actor_id uuid := public.current_hris_user_id();
  v_actor_email text;
  v_title text;
  v_message text;
  v_link text;
  v_dedupe_key text;
begin
  if p_request_id is null then
    return;
  end if;

  case lower(p_request_type)
    when 'leave' then
      select request.employee_id, request.employee_name, request.status::text,
             request.direct_manager_id
        into v_employee_id, v_employee_name, v_status, v_saved_manager_id
      from public.leave_requests request
      where request.id = p_request_id;
    when 'wfh' then
      select request.employee_id, request.employee_name, request.status::text,
             request.direct_manager_id
        into v_employee_id, v_employee_name, v_status, v_saved_manager_id
      from public.wfh_requests request
      where request.id = p_request_id;
    when 'overtime' then
      select request.employee_id, request.employee_name, request.status::text,
             request.direct_manager_id
        into v_employee_id, v_employee_name, v_status, v_saved_manager_id
      from public.ot_requests request
      where request.id = p_request_id;
    else
      return;
  end case;

  if v_employee_id is null then
    return;
  end if;

  if lower(p_request_type) = 'leave' then
    if v_status not in ('Pending', 'PendingGM') then return; end if;
    v_title := 'Leave request reassigned for approval';
    v_message := format('%s''s leave request is pending your approval after a reporting-line change.', coalesce(v_employee_name, 'An employee'));
  elsif lower(p_request_type) = 'wfh' then
    if v_status not in ('WFH_PENDING_DEPT_HEAD_APPROVAL', 'WFH_PENDING_GM_APPROVAL') then return; end if;
    v_title := 'WFH request reassigned for approval';
    v_message := format('%s''s WFH request is pending your approval after a reporting-line change.', coalesce(v_employee_name, 'An employee'));
  else
    if v_status not in ('Submitted', 'PendingGM') then return; end if;
    v_title := 'OT request reassigned for approval';
    v_message := format('%s''s overtime request is pending your approval after a reporting-line change.', coalesce(v_employee_name, 'An employee'));
  end if;

  v_current_manager_id := private.resolve_direct_manager_id(v_employee_id);
  v_previous_manager_id := coalesce(v_saved_manager_id, p_previous_manager_id);
  v_manager_changed := v_previous_manager_id is distinct from v_current_manager_id;

  if v_manager_changed and v_previous_manager_id is not null then
    update public.notifications notification
       set is_read = true,
           link = '/approvals',
           message = case
             when coalesce(notification.message, '') like '%no longer assigned to you%'
               then notification.message
             else coalesce(notification.message, '') || ' This request is no longer assigned to you.'
           end
     where notification.related_entity_id = p_request_id::text
       and notification.is_read = false
       and (
         notification.user_id = v_previous_manager_id::text
         or exists (
           select 1
           from public.hris_users previous_manager
           where previous_manager.id = v_previous_manager_id
             and notification.user_id = previous_manager.auth_user_id::text
         )
       );

    update public.time_request_approval_assignments assignment
       set status = 'Skipped',
           decision_note = 'Direct reporting manager changed',
           decided_at = now(),
           updated_at = now()
     where assignment.request_type = lower(p_request_type)
       and assignment.request_id = p_request_id
       and assignment.approver_user_id = v_previous_manager_id
       and assignment.status = 'Pending';
  end if;

  if lower(p_request_type) = 'leave' then
    update public.leave_requests
       set direct_manager_id = v_current_manager_id,
           approver_configuration_required = v_current_manager_id is null,
           approval_configuration_note = case
             when v_current_manager_id is null then 'Approver Configuration Required'
             else null
           end
     where id = p_request_id;
  elsif lower(p_request_type) = 'wfh' then
    update public.wfh_requests
       set direct_manager_id = v_current_manager_id,
           approver_configuration_required = v_current_manager_id is null,
           approval_configuration_note = case
             when v_current_manager_id is null then 'Approver Configuration Required'
             else null
           end
     where id = p_request_id;
  else
    update public.ot_requests
       set direct_manager_id = v_current_manager_id,
           approver_configuration_required = v_current_manager_id is null,
           approval_configuration_note = case
             when v_current_manager_id is null then 'Approver Configuration Required'
             else null
           end
     where id = p_request_id;
  end if;

  if v_current_manager_id is not null then
    v_link := format('/approvals?type=%s&item=%s', lower(p_request_type), p_request_id);
    v_dedupe_key := format('time-request-current-assignment:%s:%s:%s', lower(p_request_type), p_request_id, v_current_manager_id);

    select exists (
      select 1
      from public.notifications notification
      where notification.user_id = v_current_manager_id::text
        and notification.related_entity_id = p_request_id::text
        and notification.dedupe_key = v_dedupe_key
        and notification.is_read = false
    ) into v_has_open_notification;

    if p_force_notify or v_manager_changed or not v_has_open_notification then
      insert into public.notifications(
        user_id, type, title, message, link, is_read, related_entity_id, dedupe_key
      ) values (
        v_current_manager_id::text,
        'APPROVAL_REQUIRED',
        v_title,
        v_message,
        v_link,
        false,
        p_request_id::text,
        v_dedupe_key
      )
      on conflict (user_id, dedupe_key) do update
        set type = excluded.type,
            title = excluded.title,
            message = excluded.message,
            link = excluded.link,
            is_read = false,
            related_entity_id = excluded.related_entity_id,
            created_at = now();
    end if;
  end if;

  if v_manager_changed then
    select employee.email into v_actor_email
    from public.hris_users employee
    where employee.id = v_actor_id;

    insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
    values (
      coalesce(v_actor_id::text, 'system'),
      coalesce(v_actor_email, 'system@thenextperience.com'),
      'REASSIGN',
      'TimeRequestRouting',
      p_request_id::text,
      format('Reporting line changed for %s request. Direct manager reassigned from %s to %s; request status and history were preserved.', lower(p_request_type), coalesce(v_previous_manager_id::text, 'none'), coalesce(v_current_manager_id::text, 'none'))
    );
  end if;
end;
$$;

revoke all on function private.reconcile_time_request_assignment(text, uuid, uuid, boolean) from public, anon, authenticated;

create or replace function private.reconcile_time_requests_after_reporting_line_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_manager_id uuid := private.resolve_reporting_manager_id(old.reports_to);
  request_row record;
begin
  if old.reports_to is not distinct from new.reports_to then
    return new;
  end if;

  for request_row in
    select 'leave'::text as request_type, request.id
    from public.leave_requests request
    where request.employee_id = new.id
      and request.status::text in ('Pending', 'PendingGM')
    union all
    select 'wfh'::text as request_type, request.id
    from public.wfh_requests request
    where request.employee_id = new.id
      and request.status::text in ('WFH_PENDING_DEPT_HEAD_APPROVAL', 'WFH_PENDING_GM_APPROVAL')
    union all
    select 'overtime'::text as request_type, request.id
    from public.ot_requests request
    where request.employee_id = new.id
      and request.status::text in ('Submitted', 'PendingGM')
  loop
    perform private.reconcile_time_request_assignment(
      request_row.request_type,
      request_row.id,
      v_previous_manager_id,
      true
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists reconcile_time_requests_after_reporting_line_change on public.hris_users;
create trigger reconcile_time_requests_after_reporting_line_change
after update of reports_to on public.hris_users
for each row execute function private.reconcile_time_requests_after_reporting_line_change();

revoke all on function private.reconcile_time_requests_after_reporting_line_change() from public, anon, authenticated;

-- Repair all existing active manager-stage records, including Kay Lacap's
-- existing WFH request, without touching statuses or request histories.
do $$
declare
  request_row record;
begin
  for request_row in
    select 'leave'::text as request_type, request.id
    from public.leave_requests request
    where request.status::text in ('Pending', 'PendingGM')
    union all
    select 'wfh'::text as request_type, request.id
    from public.wfh_requests request
    where request.status::text in ('WFH_PENDING_DEPT_HEAD_APPROVAL', 'WFH_PENDING_GM_APPROVAL')
    union all
    select 'overtime'::text as request_type, request.id
    from public.ot_requests request
    where request.status::text in ('Submitted', 'PendingGM')
  loop
    perform private.reconcile_time_request_assignment(request_row.request_type, request_row.id);
  end loop;
end;
$$;

-- A saved manager id must not keep an old manager authorized after a
-- reporting-line change. Current reporting relationship or explicit current
-- escalation assignment is the authorization source.
create or replace function private.is_active_time_request_approver(
  p_actor_id uuid,
  p_request_type text,
  p_request_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid;
  v_current_manager_id uuid;
  v_status text;
  v_manager_stage boolean := false;
begin
  if p_actor_id is null or p_request_id is null then return false; end if;

  case lower(p_request_type)
    when 'leave' then
      select request.employee_id, request.status::text
        into v_employee_id, v_status
      from public.leave_requests request
      where request.id = p_request_id;
      v_manager_stage := v_status in ('Pending', 'PendingGM');
    when 'wfh' then
      select request.employee_id, request.status::text
        into v_employee_id, v_status
      from public.wfh_requests request
      where request.id = p_request_id;
      v_manager_stage := v_status in ('WFH_PENDING_DEPT_HEAD_APPROVAL', 'WFH_PENDING_GM_APPROVAL');
    when 'overtime' then
      select request.employee_id, request.status::text
        into v_employee_id, v_status
      from public.ot_requests request
      where request.id = p_request_id;
      v_manager_stage := v_status in ('Submitted', 'PendingGM');
    else
      return false;
  end case;

  if v_employee_id is null then return false; end if;
  v_current_manager_id := private.resolve_direct_manager_id(v_employee_id);

  if v_manager_stage and (
    p_actor_id = v_current_manager_id
    or private.is_direct_reporting_manager(p_actor_id, v_employee_id)
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.time_request_approval_assignments assignment
    where assignment.request_type = lower(p_request_type)
      and assignment.request_id = p_request_id
      and assignment.approver_user_id = p_actor_id
      and assignment.status = 'Pending'
  );
end;
$$;

revoke all on function private.is_active_time_request_approver(uuid, text, uuid) from public, anon, authenticated;

-- One own-record, server-enforced feed for every dashboard. No employee id is
-- accepted from the client, so the RPC can only return the signed-in user's
-- requests even when the dashboard is opened by a manager or HR user.
create or replace function public.get_my_request_summaries()
returns table(
  id uuid,
  request_type text,
  submitted_at timestamptz,
  status text,
  detail_link text
)
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select public.current_hris_user_id() as id
  ), request_feed as (
    select request.id,
           request.employee_id as owner_id,
           'WFH'::text as request_type,
           coalesce(request.created_at::timestamptz, now()) as submitted_at,
           case
             when lower(coalesce(request.status::text, '')) like '%reject%' then 'Rejected'
             when lower(coalesce(request.status::text, '')) like '%return%' then 'Returned'
             when lower(coalesce(request.status::text, '')) like '%approved%'
               or lower(coalesce(request.status::text, '')) like '%timekeeping%' then 'Approved'
             else 'Pending'
           end::text as status,
           '/payroll/wfh-requests?requestId=' || request.id::text as detail_link
    from public.wfh_requests request
    where lower(coalesce(request.status::text, '')) not in ('draft', 'wfh_pending_submission')

    union all

    select request.id,
           request.employee_id as owner_id,
           'Leave'::text as request_type,
           coalesce(request.created_at::timestamptz, now()) as submitted_at,
           case
             when lower(coalesce(request.status::text, '')) like '%reject%' then 'Rejected'
             when lower(coalesce(request.status::text, '')) like '%return%' then 'Returned'
             when lower(coalesce(request.status::text, '')) like '%approved%' then 'Approved'
             else 'Pending'
           end::text as status,
           '/payroll/leave?requestId=' || request.id::text as detail_link
    from public.leave_requests request
    where lower(coalesce(request.status::text, '')) not in ('draft', 'cancelled', 'canceled')

    union all

    select request.id,
           request.employee_id as owner_id,
           'Overtime'::text as request_type,
           coalesce(request.submitted_at::timestamptz, request.created_at::timestamptz, now()) as submitted_at,
           case
             when lower(coalesce(request.status::text, '')) like '%reject%' then 'Rejected'
             when lower(coalesce(request.status::text, '')) like '%return%' then 'Returned'
             when lower(coalesce(request.status::text, '')) like '%approved%' then 'Approved'
             else 'Pending'
           end::text as status,
           '/payroll/overtime-requests?requestId=' || request.id::text as detail_link
    from public.ot_requests request
    where lower(coalesce(request.status::text, '')) not in ('draft', 'cancelled', 'canceled')

    union all

    select request.id,
           request.employee_id as owner_id,
           'COE'::text as request_type,
           coalesce(request.date_requested::timestamptz, request.created_at::timestamptz, now()) as submitted_at,
           case
             when lower(coalesce(request.status::text, '')) like '%reject%' then 'Rejected'
             when lower(coalesce(request.status::text, '')) like '%return%' then 'Returned'
             when lower(coalesce(request.status::text, '')) like '%approved%' then 'Approved'
             else 'Pending'
           end::text as status,
           '/employees/coe/requests?requestId=' || request.id::text as detail_link
    from public.coe_requests request

    union all

    select request.id,
           request.employee_id as owner_id,
           'Benefit'::text as request_type,
           coalesce(request.submission_date::timestamptz, now()) as submitted_at,
           case
             when lower(coalesce(request.status::text, '')) like '%reject%' then 'Rejected'
             when lower(coalesce(request.status::text, '')) like '%return%' then 'Returned'
             when lower(coalesce(request.status::text, '')) like '%approved%'
               or lower(coalesce(request.status::text, '')) like '%fulfilled%' then 'Approved'
             else 'Pending'
           end::text as status,
           '/employees/benefits?requestId=' || request.id::text as detail_link
    from public.benefit_requests request
    where lower(coalesce(request.status::text, '')) not in ('cancelled', 'canceled')

    union all

    select request.id,
           request.employee_id as owner_id,
           'Asset'::text as request_type,
           coalesce(request.requested_at::timestamptz, now()) as submitted_at,
           case
             when lower(coalesce(request.status::text, '')) like '%reject%' then 'Rejected'
             when lower(coalesce(request.status::text, '')) like '%return%' then 'Returned'
             when lower(coalesce(request.status::text, '')) like '%approved%'
               or lower(coalesce(request.status::text, '')) like '%fulfilled%' then 'Approved'
             else 'Pending'
           end::text as status,
           '/employees/asset-management/asset-requests?requestId=' || request.id::text as detail_link
    from public.asset_requests request

    union all

    select request.id,
           request.requester_id as owner_id,
           'Manpower'::text as request_type,
           coalesce(request.created_at::timestamptz, now()) as submitted_at,
           case
             when lower(coalesce(request.status::text, '')) like '%reject%' then 'Rejected'
             when lower(coalesce(request.status::text, '')) like '%return%' then 'Returned'
             when lower(coalesce(request.status::text, '')) like '%approved%' then 'Approved'
             else 'Pending'
           end::text as status,
           '/payroll/manpower-planning?requestId=' || request.id::text as detail_link
    from public.manpower_requests request
  )
  select request_feed.id,
         request_feed.request_type,
         request_feed.submitted_at,
         request_feed.status,
         request_feed.detail_link
  from request_feed
  join actor on actor.id = request_feed.owner_id
  where auth.uid() is not null
  order by request_feed.submitted_at desc nulls last
$$;

revoke all on function public.get_my_request_summaries() from public, anon;
grant execute on function public.get_my_request_summaries() to authenticated;

comment on function public.get_my_request_summaries() is
  'Returns submitted request summaries owned by the authenticated HRIS user only.';
