-- Keep job requisition approval visibility tied to the authenticated HRIS identity.
-- Existing requisitions, routing snapshots, decisions, and workflow history are untouched.

create or replace function public.get_my_pending_job_requisition_approvals()
returns table (
  id uuid,
  req_code text,
  title text,
  business_unit_id uuid,
  department_id uuid,
  status text,
  created_at timestamptz,
  current_step text,
  step_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select public.current_hris_user_id() as id
    where auth.uid() is not null
  )
  select
    requisition.id,
    requisition.req_code,
    requisition.title,
    requisition.business_unit_id,
    requisition.department_id,
    requisition.status::text,
    requisition.created_at,
    coalesce(
      nullif(step.value ->> 'roleSnapshot', ''),
      nullif(step.value ->> 'role', ''),
      nullif(step.value ->> 'userName', ''),
      nullif(step.value ->> 'name', ''),
      'Approval step ' || step.ordinality::text
    ) as current_step,
    coalesce(
      nullif(step.value ->> 'order', '')::integer,
      step.ordinality::integer - 1
    ) as step_order
  from actor
  join public.job_requisitions requisition
    on requisition.status = 'PendingApproval'::public.job_requisition_status
  cross join lateral jsonb_array_elements(coalesce(requisition.routing_steps, '[]'::jsonb))
    with ordinality as step(value, ordinality)
  where actor.id is not null
    and coalesce(step.value ->> 'userId', step.value ->> 'user_id') = actor.id::text
    and lower(trim(coalesce(step.value ->> 'status', ''))) = 'pending'
  order by requisition.created_at desc
$$;

revoke all on function public.get_my_pending_job_requisition_approvals() from public, anon;
grant execute on function public.get_my_pending_job_requisition_approvals() to authenticated;

-- Repair only missing notifications for every currently active requisition step.
-- The stable dedupe key keeps this idempotent and preserves existing notification rows.
insert into public.notifications (
  user_id,
  type,
  title,
  message,
  link,
  is_read,
  related_entity_id,
  dedupe_key
)
select
  assignee.id::text,
  'JOB_REQUISITION_SUBMITTED',
  'Job Requisition Approval Required',
  format('Requisition %s requires your approval.', requisition.req_code),
  '/approvals?type=requisition&item=' || requisition.id::text,
  false,
  requisition.id::text,
  'job-requisition:' || requisition.id::text || ':' || assignee.id::text
from public.job_requisitions requisition
cross join lateral jsonb_array_elements(coalesce(requisition.routing_steps, '[]'::jsonb)) as step(value)
join public.hris_users assignee
  on assignee.id::text = coalesce(step.value ->> 'userId', step.value ->> 'user_id')
 and lower(assignee.status) = 'active'
 and not coalesce(assignee.is_duplicate, false)
where requisition.status = 'PendingApproval'::public.job_requisition_status
  and lower(trim(coalesce(step.value ->> 'status', ''))) = 'pending'
on conflict (user_id, dedupe_key) do nothing;

notify pgrst, 'reload schema';
