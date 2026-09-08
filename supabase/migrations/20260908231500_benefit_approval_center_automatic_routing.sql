-- Put benefit requests in the shared Approval Center and enforce the fixed
-- HR Manager -> any BOD / General Manager workflow in the database.

create index if not exists benefit_requests_status_submission_idx
  on public.benefit_requests (status, submission_date desc);

drop policy if exists benefit_req_employee_own on public.benefit_requests;

create policy benefit_req_employee_select_own
  on public.benefit_requests
  for select
  to authenticated
  using (employee_id = (select public.current_hris_id()));

create policy benefit_req_employee_insert_own
  on public.benefit_requests
  for insert
  to authenticated
  with check (
    employee_id = (select public.current_hris_id())
    and status::text = 'Pending HR Review'
    and hr_endorsed_by is null
    and hr_endorsed_at is null
    and bod_approved_by is null
    and bod_approved_at is null
    and fulfilled_by is null
    and fulfilled_at is null
    and rejection_reason is null
  );

drop policy if exists benefit_req_bod_gm_queue_select on public.benefit_requests;
create policy benefit_req_bod_gm_queue_select
  on public.benefit_requests
  for select
  to authenticated
  using (
    (
      status::text = 'Pending Board Approval'
      or bod_approved_by = (select public.current_hris_user_id())
    )
    and (
      (select public.has_active_role('Board of Director'))
      or (select public.has_active_role('GeneralManager'))
    )
  );

create or replace function public.notify_benefit_hr_manager_on_submit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (
    user_id, type, title, message, link, is_read,
    related_entity_id, created_at, dedupe_key
  )
  select
    manager.id::text,
    'BENEFIT_REQUEST_SUBMITTED',
    'Benefit Approval Required',
    new.employee_name || ' submitted a benefit request for ' || new.benefit_type_name || '.',
    '/approvals?type=benefit&item=' || new.id::text,
    false,
    new.id::text,
    now(),
    'benefit:' || new.id::text || ':hr-manager'
  from public.hris_users manager
  where lower(coalesce(manager.status, 'active')) = 'active'
    and (
      manager.role = 'HR Manager'
      or exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = manager.id
          and ur.is_active
          and r.is_active
          and ur.role_id = 'HR Manager'
      )
    )
  on conflict (user_id, dedupe_key) do nothing;

  return new;
end
$$;

drop trigger if exists benefit_request_notify_hr_manager on public.benefit_requests;
create trigger benefit_request_notify_hr_manager
after insert on public.benefit_requests
for each row execute function public.notify_benefit_hr_manager_on_submit();

revoke all on function public.notify_benefit_hr_manager_on_submit() from public, anon, authenticated;

create or replace function public.get_my_pending_benefit_approvals()
returns table (
  id uuid,
  employee_id uuid,
  employee_name text,
  benefit_type_id uuid,
  benefit_type_name text,
  amount numeric,
  details text,
  date_needed date,
  status text,
  submission_date timestamptz,
  current_step text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    request.id,
    request.employee_id,
    request.employee_name,
    request.benefit_type_id,
    request.benefit_type_name,
    request.amount,
    request.details,
    request.date_needed,
    request.status::text,
    request.submission_date,
    case request.status::text
      when 'Pending HR Review' then 'HR Manager review'
      else 'BOD / General Manager approval'
    end
  from public.benefit_requests request
  where public.current_hris_user_id() is not null
    and (
      (
        request.status::text = 'Pending HR Review'
        and public.has_active_role('HR Manager')
      )
      or (
        request.status::text = 'Pending Board Approval'
        and (
          public.has_active_role('Board of Director')
          or public.has_active_role('GeneralManager')
        )
      )
    )
  order by request.submission_date asc, request.id
$$;

revoke all on function public.get_my_pending_benefit_approvals() from public, anon;
grant execute on function public.get_my_pending_benefit_approvals() to authenticated;

create or replace function public.review_benefit_request(
  p_request_id uuid,
  p_approved boolean,
  p_reason text default null
)
returns public.benefit_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  request_row public.benefit_requests%rowtype;
  result_row public.benefit_requests%rowtype;
  rejection_note text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if actor_id is null then
    raise exception 'An active HRIS account is required.' using errcode = '42501';
  end if;

  select * into request_row
  from public.benefit_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Benefit request was not found.' using errcode = 'P0002';
  end if;

  if request_row.status::text = 'Pending HR Review' then
    if not public.has_active_role('HR Manager') then
      raise exception 'Only an HR Manager can complete HR review.' using errcode = '42501';
    end if;

    if p_approved then
      update public.benefit_requests
      set status = 'Pending Board Approval'::public.benefit_request_status,
          hr_endorsed_by = actor_id,
          hr_endorsed_at = now(),
          rejection_reason = null,
          updated_at = now()
      where id = p_request_id
      returning * into result_row;

      insert into public.notifications (
        user_id, type, title, message, link, is_read,
        related_entity_id, created_at, dedupe_key
      )
      select
        approver.id::text,
        'AWARD_APPROVAL_REQUEST',
        'Benefit Approval Required',
        'HR Manager approved ' || request_row.employee_name || '''s request for ' || request_row.benefit_type_name || '. Any BOD or General Manager may complete the final approval.',
        '/approvals?type=benefit&item=' || request_row.id::text,
        false,
        request_row.id::text,
        now(),
        'benefit:' || request_row.id::text || ':bod-gm'
      from public.hris_users approver
      where lower(coalesce(approver.status, 'active')) = 'active'
        and (
          approver.role in ('Board of Director', 'GeneralManager')
          or exists (
            select 1
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id
            where ur.user_id = approver.id
              and ur.is_active
              and r.is_active
              and ur.role_id in ('Board of Director', 'GeneralManager')
          )
        )
      on conflict (user_id, dedupe_key) do nothing;
    else
      if rejection_note is null then
        raise exception 'A rejection reason is required.' using errcode = '22023';
      end if;

      update public.benefit_requests
      set status = 'Rejected'::public.benefit_request_status,
          hr_endorsed_by = actor_id,
          hr_endorsed_at = now(),
          rejection_reason = rejection_note,
          updated_at = now()
      where id = p_request_id
      returning * into result_row;
    end if;
  elsif request_row.status::text = 'Pending Board Approval' then
    if not (
      public.has_active_role('Board of Director')
      or public.has_active_role('GeneralManager')
    ) then
      raise exception 'Only a BOD or General Manager can complete final approval.' using errcode = '42501';
    end if;

    if p_approved then
      update public.benefit_requests
      set status = 'Approved'::public.benefit_request_status,
          bod_approved_by = actor_id,
          bod_approved_at = now(),
          rejection_reason = null,
          updated_at = now()
      where id = p_request_id
      returning * into result_row;

      insert into public.notifications (
        user_id, type, title, message, link, is_read,
        related_entity_id, created_at, dedupe_key
      )
      select
        hr_user.id::text,
        'AWARD_APPROVAL_REQUEST',
        'Benefit Ready for Fulfillment',
        request_row.employee_name || '''s ' || request_row.benefit_type_name || ' request received final approval and is ready for fulfillment.',
        '/employees/benefits?tab=fulfillment&requestId=' || request_row.id::text,
        false,
        request_row.id::text,
        now(),
        'benefit:' || request_row.id::text || ':fulfillment'
      from public.hris_users hr_user
      where lower(coalesce(hr_user.status, 'active')) = 'active'
        and hr_user.role in ('HR Manager', 'HR Staff')
      on conflict (user_id, dedupe_key) do nothing;
    else
      if rejection_note is null then
        raise exception 'A rejection reason is required.' using errcode = '22023';
      end if;

      update public.benefit_requests
      set status = 'Rejected'::public.benefit_request_status,
          bod_approved_by = actor_id,
          bod_approved_at = now(),
          rejection_reason = rejection_note,
          updated_at = now()
      where id = p_request_id
      returning * into result_row;
    end if;
  else
    raise exception 'This benefit request is no longer awaiting your action.' using errcode = '55000';
  end if;

  if not p_approved then
    insert into public.notifications (
      user_id, type, title, message, link, is_read,
      related_entity_id, created_at, dedupe_key
    ) values (
      request_row.employee_id::text,
      'TICKET_UPDATE_REQUESTER',
      'Benefit Request Rejected',
      'Your request for ' || request_row.benefit_type_name || ' was rejected. Reason: ' || rejection_note,
      '/employees/benefits?requestId=' || request_row.id::text,
      false,
      request_row.id::text,
      now(),
      'benefit:' || request_row.id::text || ':rejected'
    ) on conflict (user_id, dedupe_key) do nothing;
  elsif result_row.status::text = 'Approved' then
    insert into public.notifications (
      user_id, type, title, message, link, is_read,
      related_entity_id, created_at, dedupe_key
    ) values (
      request_row.employee_id::text,
      'AWARD_RECEIVED',
      'Benefit Approved',
      'Your request for ' || request_row.benefit_type_name || ' received final approval.',
      '/employees/benefits?requestId=' || request_row.id::text,
      false,
      request_row.id::text,
      now(),
      'benefit:' || request_row.id::text || ':approved'
    ) on conflict (user_id, dedupe_key) do nothing;
  end if;

  return result_row;
end
$$;

revoke all on function public.review_benefit_request(uuid, boolean, text) from public, anon;
grant execute on function public.review_benefit_request(uuid, boolean, text) to authenticated;

comment on function public.get_my_pending_benefit_approvals() is
  'Returns benefit requests actionable by the authenticated HR Manager or any BOD/General Manager at the current fixed stage.';
comment on function public.review_benefit_request(uuid, boolean, text) is
  'Atomically advances or rejects one benefit request under the HR Manager -> any BOD/General Manager workflow.';
