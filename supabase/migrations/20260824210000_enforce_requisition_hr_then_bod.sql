-- Job requisitions use one strict, server-enforced sequence:
-- 1) an active HR Manager reviews first; 2) selected BOD approver(s) follow.

create or replace function public.get_job_requisition_approval_directory()
returns table (
  id uuid,
  full_name text,
  roles text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
begin
  if actor_id is null or not (
    public.is_hr_or_admin()
    or public.has_feature_permission('Requisitions', 'create')
    or public.has_feature_permission('Requisitions', 'manage')
  ) then
    raise exception 'You do not have permission to create job requisitions.' using errcode = '42501';
  end if;

  return query
  select
    candidate.id,
    candidate.full_name,
    array(
      select role_name
      from unnest(array['HR Manager', 'Board of Director']::text[]) role_name
      where private.workflow_user_has_role(candidate.id, role_name)
    )
  from public.hris_users candidate
  where lower(candidate.status::text) = 'active'
    and (
      private.workflow_user_has_role(candidate.id, 'HR Manager')
      or private.workflow_user_has_role(candidate.id, 'Board of Director')
    )
  order by candidate.full_name;
end;
$$;

revoke all on function public.get_job_requisition_approval_directory() from public, anon;
grant execute on function public.get_job_requisition_approval_directory() to authenticated;

comment on function public.get_job_requisition_approval_directory() is
  'Minimal authorized HR Manager/BOD directory used only to construct job-requisition approval routes.';

create or replace function private.normalize_job_requisition_route(p_steps jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  step jsonb;
  result jsonb := '[]'::jsonb;
  approver_id uuid;
  hr_manager_id uuid;
  hr_manager_name text;
  approver_name text;
  sequence_number integer := 1;
  bod_count integer := 0;
begin
  -- Validate every submitted identity and honor the first selected active HR
  -- Manager. The server resolves a default active HR Manager if the client did
  -- not include one, so RLS or a modified request cannot create a BOD-only route.
  for step in
    select value
    from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) with ordinality route(value, ordinality)
    order by ordinality
  loop
    begin
      approver_id := nullif(step->>'userId', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Every requisition approver must have a valid user ID.';
    end;

    if approver_id is null then
      continue;
    end if;
    if not (
      private.workflow_user_has_role(approver_id, 'HR Manager')
      or private.workflow_user_has_role(approver_id, 'Board of Director')
    ) then
      raise exception 'Requisition approvers must be active HR Manager or Board of Director users.';
    end if;
    if hr_manager_id is null and private.workflow_user_has_role(approver_id, 'HR Manager') then
      hr_manager_id := approver_id;
    end if;
  end loop;

  if hr_manager_id is null then
    select candidate.id
      into hr_manager_id
    from public.hris_users candidate
    where private.workflow_user_has_role(candidate.id, 'HR Manager')
    order by (candidate.role::text = 'HR Manager') desc, candidate.full_name, candidate.id
    limit 1;
  end if;

  if hr_manager_id is null then
    raise exception 'An active HR Manager is required as the first requisition approval step.';
  end if;

  select full_name into hr_manager_name from public.hris_users where id = hr_manager_id;
  result := jsonb_build_array(jsonb_build_object(
    'id', 'req-step-' || hr_manager_id::text || '-hr',
    'userId', hr_manager_id,
    'name', hr_manager_name,
    'role', 'HR',
    'roleSnapshot', 'HR Manager',
    'isBod', false,
    'isRequired', true,
    'status', 'Pending',
    'order', 1
  ));

  for step in
    select value
    from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) with ordinality route(value, ordinality)
    order by ordinality
  loop
    approver_id := nullif(step->>'userId', '')::uuid;
    if approver_id is null
      or approver_id = hr_manager_id
      or not private.workflow_user_has_role(approver_id, 'Board of Director')
      or exists (select 1 from jsonb_array_elements(result) prior where prior->>'userId' = approver_id::text)
    then
      continue;
    end if;

    select full_name into approver_name from public.hris_users where id = approver_id;
    sequence_number := sequence_number + 1;
    bod_count := bod_count + 1;
    result := result || jsonb_build_array(jsonb_build_object(
      'id', coalesce(nullif(step->>'id', ''), 'req-step-' || approver_id::text || '-bod'),
      'userId', approver_id,
      'name', approver_name,
      'role', 'Board of Director',
      'roleSnapshot', 'Board of Director',
      'isBod', true,
      'isRequired', true,
      'status', 'Waiting',
      'order', sequence_number
    ));
  end loop;

  if bod_count = 0 then
    raise exception 'At least one active Board of Director approver is required after HR Manager approval.';
  end if;

  return result;
end;
$$;

revoke all on function private.normalize_job_requisition_route(jsonb) from public, anon, authenticated;

create or replace function public.enforce_job_requisition_bod_workflow()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  rpc_write boolean := coalesce(current_setting('app.job_requisition_rpc', true), '') = 'on';
  approved_hr_order integer;
  approved_bod_order integer;
begin
  if new.status::text in ('PendingApproval', 'Pending Approval')
    and (tg_op = 'INSERT' or old.status::text = 'Draft') then
    new.routing_steps := private.normalize_job_requisition_route(new.routing_steps);
  elsif tg_op = 'UPDATE' and old.status::text in ('PendingApproval', 'Pending Approval')
    and new.routing_steps is distinct from old.routing_steps and not rpc_write then
    raise exception 'Approval steps can only be changed through the assigned requisition approval action.' using errcode = '42501';
  end if;

  if new.status::text = 'Approved' and (tg_op = 'INSERT' or old.status::text <> 'Approved') then
    select min(coalesce((step->>'order')::integer, 999)) into approved_hr_order
    from jsonb_array_elements(coalesce(new.routing_steps, '[]'::jsonb)) step
    where step->>'roleSnapshot' = 'HR Manager' and lower(step->>'status') = 'approved';

    select min(coalesce((step->>'order')::integer, 999)) into approved_bod_order
    from jsonb_array_elements(coalesce(new.routing_steps, '[]'::jsonb)) step
    where (coalesce((step->>'isBod')::boolean, false) or step->>'roleSnapshot' = 'Board of Director')
      and lower(step->>'status') = 'approved';

    if approved_hr_order is null then
      raise exception 'A completed HR Manager approval is required before BOD review.';
    end if;
    if approved_bod_order is null then
      raise exception 'A completed Board of Director approval is required before this requisition can be Approved.';
    end if;
    if approved_bod_order <= approved_hr_order then
      raise exception 'Board of Director approval must occur after HR Manager approval.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(new.routing_steps, '[]'::jsonb)) step
      where coalesce((step->>'isRequired')::boolean, true) and lower(step->>'status') <> 'approved'
    ) then
      raise exception 'All required requisition approval steps must be completed.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.notify_job_requisition_current_step()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_step jsonb;
  stage_message text;
begin
  if new.status::text in ('PendingApproval', 'Pending Approval')
    and (tg_op = 'INSERT' or old.status::text = 'Draft') then
    select value into current_step
    from jsonb_array_elements(coalesce(new.routing_steps, '[]'::jsonb)) route(value)
    where value->>'status' = 'Pending'
    order by coalesce((value->>'order')::integer, 999)
    limit 1;

    if current_step is not null then
      stage_message := case
        when current_step->>'roleSnapshot' = 'HR Manager'
          then format('Requisition %s requires your HR Manager review before it can be sent to BOD.', new.req_code)
        else format('Requisition %s requires your BOD approval after HR Manager review.', new.req_code)
      end;
      insert into public.notifications(user_id, type, title, message, link, is_read, related_entity_id, dedupe_key)
      values(
        current_step->>'userId', 'JOB_REQUISITION_SUBMITTED', 'Job Requisition Approval Required',
        stage_message, '/recruitment/requisitions?item=' || new.id, false, new.id::text,
        'job-requisition:' || new.id::text || ':' || (current_step->>'userId')
      )
      on conflict(user_id, dedupe_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;

-- Normalize only unstarted pending routes. Completed/rejected approval history
-- remains immutable. There are no such rows in production at migration time,
-- but this safely protects deployments with an unstarted pending requisition.
do $$
declare
  request_row record;
begin
  perform set_config('app.job_requisition_rpc', 'on', true);
  for request_row in
    select id, routing_steps
    from public.job_requisitions
    where status::text in ('PendingApproval', 'Pending Approval')
      and not exists (
        select 1 from jsonb_array_elements(coalesce(routing_steps, '[]'::jsonb)) step
        where lower(step->>'status') in ('approved', 'rejected')
      )
  loop
    update public.job_requisitions
    set routing_steps = private.normalize_job_requisition_route(request_row.routing_steps), updated_at = now()
    where id = request_row.id;
  end loop;
end $$;
