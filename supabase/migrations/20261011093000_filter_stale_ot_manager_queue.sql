-- Do not show a manager-stage OT assignment after the request has moved to
-- BOD review. Approval authority and existing request records remain intact.
create or replace function public.get_my_pending_time_approval_ids_for_actor(p_actor uuid)
returns table(request_type text, request_id uuid)
language sql stable security definer set search_path = ''
as $$
with actor as (
  select manager.id, manager.auth_user_id, manager.employee_id, manager.full_name
  from public.hris_users manager
  where manager.id = p_actor
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
    and (
      assignment.request_type <> 'overtime'
      or exists (
        select 1
        from public.ot_requests request
        where request.id = assignment.request_id
          and (
            (coalesce(assignment.is_bod, false) and request.status::text = 'PendingBOD')
            or (not coalesce(assignment.is_bod, false) and request.status::text in ('Submitted', 'PendingGM'))
          )
      )
    )
), manager_queue as (
  select 'leave'::text as request_type, request.id as request_id
  from public.leave_requests request
  join reportees on reportees.id = request.employee_id
  where request.status::text in ('Pending', 'PendingGM')
  union all
  select 'wfh'::text, request.id
  from public.wfh_requests request
  join reportees on reportees.id = request.employee_id
  where request.status::text in ('WFH_PENDING_DEPT_HEAD_APPROVAL', 'WFH_PENDING_GM_APPROVAL')
  union all
  select 'overtime'::text, request.id
  from public.ot_requests request
  join reportees on reportees.id = request.employee_id
  where request.status::text in ('Submitted', 'PendingGM')
)
select request_type, request_id from assigned
union
select request_type, request_id from manager_queue;
$$;

create or replace function public.get_my_pending_time_approval_ids()
returns table(request_type text, request_id uuid)
language sql stable security definer set search_path = ''
as $$
  select * from public.get_my_pending_time_approval_ids_for_actor(public.current_hris_user_id());
$$;

revoke all on function public.get_my_pending_time_approval_ids_for_actor(uuid), public.get_my_pending_time_approval_ids() from public, anon;
grant execute on function public.get_my_pending_time_approval_ids_for_actor(uuid), public.get_my_pending_time_approval_ids() to authenticated;
notify pgrst, 'reload schema';
