-- Keep approval authorization unchanged while replacing the per-row queue
-- resolver with set-based lookups for the signed-in approver.

create index if not exists hris_users_reports_to_idx
  on public.hris_users(reports_to)
  where reports_to is not null;

create index if not exists leave_requests_pending_manager_queue_idx
  on public.leave_requests(employee_id, id)
  where status in ('Pending', 'PendingGM');

create index if not exists wfh_requests_pending_manager_queue_idx
  on public.wfh_requests(employee_id, id)
  where status in ('WFH_PENDING_DEPT_HEAD_APPROVAL', 'WFH_PENDING_GM_APPROVAL');

create index if not exists ot_requests_pending_manager_queue_idx
  on public.ot_requests(employee_id, id)
  where status in ('Submitted', 'PendingGM');

create or replace function public.get_my_pending_time_approval_ids()
returns table(request_type text, request_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select manager.id, manager.auth_user_id, manager.employee_id, manager.full_name
    from public.hris_users manager
    where manager.id = public.current_hris_user_id()
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
  select request_type, request_id from manager_queue
$$;

revoke all on function public.get_my_pending_time_approval_ids() from public, anon;
grant execute on function public.get_my_pending_time_approval_ids() to authenticated;

comment on function public.get_my_pending_time_approval_ids() is
  'Returns only active time-request assignments and current direct-report manager-stage requests using set-based indexed lookups.';
