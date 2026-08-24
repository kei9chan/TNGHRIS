-- Mandatory BOD approval for awards and job requisitions.
-- Additive and backward-compatible: historical completed rows are untouched.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.award_templates
  add column if not exists sort_order integer not null default 0,
  add column if not exists template_status text not null default 'published',
  add column if not exists badge_key text,
  add column if not exists is_system boolean not null default false;

with ranked as (
  select id, row_number() over (
    partition by business_unit_id
    order by coalesce(updated_at, now()), title, id
  ) as position
  from public.award_templates
  where sort_order = 0
)
update public.award_templates template
set sort_order = ranked.position
from ranked
where template.id = ranked.id;

create index if not exists award_templates_studio_sort_idx
  on public.award_templates(template_status, is_active, sort_order, title);

create or replace function private.workflow_user_has_role(p_user_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hris_users user_row
    where user_row.id = p_user_id
      and lower(user_row.status::text) = 'active'
      and (
        user_row.role::text = p_role
        or exists (
          select 1 from public.user_roles assignment
          where assignment.user_id = user_row.id
            and assignment.role_id::text = p_role
            and assignment.is_active
        )
      )
  )
$$;

create or replace function private.workflow_user_role_snapshot(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.workflow_user_has_role(p_user_id, 'Board of Director') then 'Board of Director'
    when private.workflow_user_has_role(p_user_id, 'HR Manager') then 'HR Manager'
    when private.workflow_user_has_role(p_user_id, 'GeneralManager') then 'GeneralManager'
    when private.workflow_user_has_role(p_user_id, 'Business Unit Manager') then 'Business Unit Manager'
    when private.workflow_user_has_role(p_user_id, 'Manager') then 'Manager'
    else null
  end
$$;

revoke all on function private.workflow_user_has_role(uuid,text) from public, anon, authenticated;
revoke all on function private.workflow_user_role_snapshot(uuid) from public, anon, authenticated;

create or replace function public.submit_employee_award(
  p_employee_id uuid,
  p_award_template_id uuid,
  p_notes text,
  p_business_unit_id uuid,
  p_department_id uuid,
  p_approver_ids uuid[]
)
returns public.employee_awards
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  employee_name text;
  employee_business_unit_id uuid;
  employee_department_id uuid;
  template_title text;
  selected_approver_id uuid;
  approver_name text;
  role_snapshot text;
  steps jsonb := '[]'::jsonb;
  created_award public.employee_awards;
  step_order integer := 0;
  bod_count integer := 0;
begin
  if actor_id is null or not (
    public.is_hr_or_admin()
    or public.has_feature_permission('Evaluation', 'manage')
    or public.has_feature_permission('Evaluation', 'create')
  ) then
    raise exception 'You do not have permission to submit awards.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_approver_ids), 0) = 0 then
    raise exception 'At least one active Board of Director approver is required.';
  end if;
  if not exists (select 1 from public.hris_users where id = p_employee_id and lower(status::text) = 'active') then
    raise exception 'The selected employee is unavailable or inactive.';
  end if;
  if not exists (
    select 1 from public.award_templates
    where id = p_award_template_id and is_active and template_status = 'published'
  ) then
    raise exception 'The selected award template is unavailable or not published.';
  end if;

  select full_name, business_unit_id, department_id
    into employee_name, employee_business_unit_id, employee_department_id
  from public.hris_users where id = p_employee_id;
  if p_business_unit_id is not null and p_business_unit_id is distinct from employee_business_unit_id then
    raise exception 'The selected employee does not belong to that business unit.';
  end if;
  if p_department_id is not null and p_department_id is distinct from employee_department_id then
    raise exception 'The selected employee does not belong to that department.';
  end if;
  select title into template_title from public.award_templates where id = p_award_template_id;

  foreach selected_approver_id in array p_approver_ids loop
    if selected_approver_id is null or exists (
      select 1 from jsonb_array_elements(steps) step where step->>'userId' = selected_approver_id::text
    ) then continue; end if;
    role_snapshot := private.workflow_user_role_snapshot(selected_approver_id);
    if role_snapshot not in ('Board of Director','GeneralManager','Manager','Business Unit Manager') then
      raise exception 'Award approvers must be an active BOD, General Manager, Manager, or Business Unit Manager.';
    end if;
    select full_name into approver_name from public.hris_users where id = selected_approver_id;
    step_order := step_order + 1;
    if role_snapshot = 'Board of Director' then bod_count := bod_count + 1; end if;
    steps := steps || jsonb_build_array(jsonb_build_object(
      'userId', selected_approver_id,
      'userName', approver_name,
      'status', 'Pending',
      'order', step_order,
      'roleSnapshot', role_snapshot,
      'isBod', role_snapshot = 'Board of Director',
      'isRequired', true
    ));
  end loop;
  if bod_count = 0 then
    raise exception 'At least one active Board of Director approver is required.';
  end if;

  insert into public.employee_awards(
    employee_id, award_template_id, notes, business_unit_id, department_id,
    certificate_snapshot_url, created_by_user_id, status, submitted_at, level,
    approver_id, approver_steps
  ) values (
    p_employee_id, p_award_template_id, nullif(btrim(p_notes), ''), employee_business_unit_id, employee_department_id,
    null, actor_id, 'PendingApproval', now(), 'Bronze', (steps->0->>'userId')::uuid, steps
  ) returning * into created_award;

  for selected_approver_id in select (step->>'userId')::uuid from jsonb_array_elements(steps) step loop
    perform private.award_notify(
      selected_approver_id, 'AWARD_APPROVAL_REQUEST', 'Award Approval Needed',
      format('%s was nominated for "%s". Please review.', employee_name, template_title),
      created_award.id, 'award-approval:' || created_award.id::text || ':' || selected_approver_id::text
    );
  end loop;
  perform private.award_audit('CREATE', created_award.id, format(
    'Submitted %s for %s with immutable approval snapshot; %s approver(s), %s BOD.',
    template_title, employee_name, step_order, bod_count
  ));
  return created_award;
end;
$$;

create or replace function public.process_employee_award_approval(
  p_award_id uuid,
  p_approved boolean,
  p_rejection_reason text default null
)
returns public.employee_awards
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  award_row public.employee_awards;
  step jsonb;
  updated_steps jsonb := '[]'::jsonb;
  actor_has_pending_step boolean := false;
  remaining_count integer;
  approved_bod_count integer;
  next_approver uuid;
begin
  if actor_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select * into award_row from public.employee_awards where id = p_award_id for update;
  if not found then raise exception 'Award request not found.' using errcode = 'P0002'; end if;
  if award_row.status::text not in ('PendingApproval', 'Pending Approval', 'Pending') then
    raise exception 'This award request is no longer pending.';
  end if;

  for step in select value from jsonb_array_elements(coalesce(award_row.approver_steps, '[]'::jsonb)) loop
    if step->>'userId' = actor_id::text and lower(step->>'status') = 'pending' then
      actor_has_pending_step := true;
      step := jsonb_set(step, '{status}', to_jsonb((case when p_approved then 'Approved' else 'Rejected' end)::text), true);
      step := jsonb_set(step, '{timestamp}', to_jsonb(now()::text), true);
      if not p_approved then
        step := jsonb_set(step, '{rejectionReason}', to_jsonb(coalesce(nullif(btrim(p_rejection_reason), ''), 'No reason provided')), true);
      end if;
    end if;
    updated_steps := updated_steps || jsonb_build_array(step);
  end loop;
  if not actor_has_pending_step then
    raise exception 'This award is not assigned to you for approval.' using errcode = '42501';
  end if;

  if not p_approved then
    update public.employee_awards set approver_steps = updated_steps, status = 'Rejected',
      rejection_reason = coalesce(nullif(btrim(p_rejection_reason), ''), 'No reason provided'), decided_at = now()
    where id = p_award_id returning * into award_row;
    perform private.award_notify(award_row.created_by_user_id, 'AWARD_APPROVAL_REQUEST', 'Award Nomination Rejected', 'Your award nomination was rejected.', award_row.id, 'award-rejected:' || award_row.id::text);
    perform private.award_audit('REJECT', award_row.id, 'Rejected assigned award approval step.');
    return award_row;
  end if;

  select count(*) into remaining_count from jsonb_array_elements(updated_steps) item
  where coalesce((item->>'isRequired')::boolean, true) and lower(item->>'status') <> 'approved';
  select count(*) into approved_bod_count from jsonb_array_elements(updated_steps) item
  where (coalesce((item->>'isBod')::boolean, false) or item->>'roleSnapshot' = 'Board of Director')
    and lower(item->>'status') = 'approved';

  if remaining_count = 0 and approved_bod_count > 0 then
    update public.employee_awards set approver_steps = updated_steps, approver_id = actor_id,
      status = 'Approved', decided_at = now(), rejection_reason = null
    where id = p_award_id returning * into award_row;
    perform private.award_notify(award_row.created_by_user_id, 'AWARD_ISSUED', 'Award Nomination Approved', 'Your award nomination completed all required approvals, including BOD approval.', award_row.id, 'award-approved:' || award_row.id::text);
    perform private.award_audit('APPROVE', award_row.id, 'Completed required award approvals including BOD approval.');
  else
    select (item->>'userId')::uuid into next_approver from jsonb_array_elements(updated_steps) item
    where lower(item->>'status') = 'pending' order by coalesce((item->>'order')::integer, 999) limit 1;
    update public.employee_awards set approver_steps = updated_steps, approver_id = coalesce(next_approver, approver_id)
    where id = p_award_id returning * into award_row;
    perform private.award_audit('APPROVE', award_row.id, format('Recorded approval; %s required step(s) remain and BOD approval gate is %s.', remaining_count, case when approved_bod_count > 0 then 'satisfied' else 'pending' end));
  end if;
  return award_row;
end;
$$;

create or replace function public.enforce_employee_award_bod_gate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status::text in ('Approved','Issued') and old.status::text not in ('Approved','Issued') then
    if not exists (
      select 1 from jsonb_array_elements(coalesce(new.approver_steps, '[]'::jsonb)) step
      where (coalesce((step->>'isBod')::boolean, false) or step->>'roleSnapshot' = 'Board of Director')
        and lower(step->>'status') = 'approved'
    ) then
      raise exception 'At least one completed Board of Director approval is required before an award can be finalized.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists employee_awards_bod_gate on public.employee_awards;
create trigger employee_awards_bod_gate before update on public.employee_awards
for each row execute function public.enforce_employee_award_bod_gate();

revoke all on function public.submit_employee_award(uuid,uuid,text,uuid,uuid,uuid[]) from public, anon;
revoke all on function public.process_employee_award_approval(uuid,boolean,text) from public, anon;
grant execute on function public.submit_employee_award(uuid,uuid,text,uuid,uuid,uuid[]) to authenticated;
grant execute on function public.process_employee_award_approval(uuid,boolean,text) to authenticated;

-- Backfill only currently pending awards that lack a BOD snapshot. Completed history is untouched.
do $$
declare pending_award record; bod_id uuid; bod_name text;
begin
  select candidate.id, candidate.full_name into bod_id, bod_name
  from public.hris_users candidate
  where private.workflow_user_has_role(candidate.id, 'Board of Director')
  order by exists(
    select 1 from public.approver_configs config,
      jsonb_array_elements_text(coalesce(config.config_value->'user_ids','[]'::jsonb)) configured(user_id)
    where config.config_key='bod_approvers' and configured.user_id=candidate.id::text
  ) desc, candidate.full_name limit 1;
  if bod_id is null then return; end if;
  for pending_award in
    select id, approver_steps from public.employee_awards
    where status::text in ('PendingApproval','Pending Approval','Pending')
      and not exists (
        select 1 from jsonb_array_elements(coalesce(approver_steps,'[]'::jsonb)) step
        where coalesce((step->>'isBod')::boolean,false) or step->>'roleSnapshot'='Board of Director'
      )
  loop
    update public.employee_awards set approver_steps = coalesce(pending_award.approver_steps,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'userId',bod_id,'userName',bod_name,'status','Pending','order',jsonb_array_length(coalesce(pending_award.approver_steps,'[]'::jsonb))+1,
      'roleSnapshot','Board of Director','isBod',true,'isRequired',true
    )) where id = pending_award.id;
  end loop;
end $$;

create or replace function private.normalize_job_requisition_route(p_steps jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare step jsonb; result jsonb := '[]'::jsonb; approver_id uuid; approver_name text; snapshot text; sequence_number integer := 0; bod_count integer := 0;
begin
  for step in select value from jsonb_array_elements(coalesce(p_steps,'[]'::jsonb)) with ordinality route(value,ordinality) order by ordinality loop
    approver_id := nullif(step->>'userId','')::uuid;
    if approver_id is null or exists(select 1 from jsonb_array_elements(result) prior where prior->>'userId'=approver_id::text) then continue; end if;
    snapshot := private.workflow_user_role_snapshot(approver_id);
    if snapshot not in ('HR Manager','Board of Director') then
      raise exception 'Requisition approvers must be active HR Manager or Board of Director users.';
    end if;
    select full_name into approver_name from public.hris_users where id=approver_id;
    sequence_number := sequence_number + 1;
    if snapshot='Board of Director' then bod_count:=bod_count+1; end if;
    result := result || jsonb_build_array(jsonb_build_object(
      'id',coalesce(nullif(step->>'id',''),'req-step-'||approver_id::text), 'userId',approver_id, 'name',approver_name,
      'role',case when snapshot='Board of Director' then 'Board of Director' else 'HR' end,
      'roleSnapshot',snapshot, 'isBod',snapshot='Board of Director', 'isRequired',true,
      'status',case when sequence_number=1 then 'Pending' else 'Waiting' end, 'order',sequence_number
    ));
  end loop;
  if bod_count=0 then raise exception 'At least one active Board of Director approver is required.'; end if;
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
declare rpc_write boolean := coalesce(current_setting('app.job_requisition_rpc',true),'')='on';
begin
  if new.status::text in ('PendingApproval','Pending Approval')
    and (tg_op='INSERT' or old.status::text='Draft') then
    new.routing_steps := private.normalize_job_requisition_route(new.routing_steps);
  elsif tg_op='UPDATE' and old.status::text in ('PendingApproval','Pending Approval')
    and new.routing_steps is distinct from old.routing_steps and not rpc_write then
    raise exception 'Approval steps can only be changed through the assigned requisition approval action.' using errcode='42501';
  end if;

  if new.status::text='Approved' and (tg_op='INSERT' or old.status::text<>'Approved') then
    if not exists (
      select 1 from jsonb_array_elements(coalesce(new.routing_steps,'[]'::jsonb)) step
      where (coalesce((step->>'isBod')::boolean,false) or step->>'roleSnapshot'='Board of Director') and lower(step->>'status')='approved'
    ) then raise exception 'A completed Board of Director approval is required before this requisition can be Approved.'; end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(new.routing_steps,'[]'::jsonb)) step
      where coalesce((step->>'isRequired')::boolean,true) and lower(step->>'status')<>'approved'
    ) then raise exception 'All required requisition approval steps must be completed.'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists job_requisitions_bod_workflow on public.job_requisitions;
create trigger job_requisitions_bod_workflow before insert or update on public.job_requisitions
for each row execute function public.enforce_job_requisition_bod_workflow();

create or replace function public.notify_job_requisition_current_step()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare current_step jsonb;
begin
  if new.status::text in ('PendingApproval','Pending Approval')
    and (tg_op='INSERT' or old.status::text='Draft') then
    select value into current_step from jsonb_array_elements(coalesce(new.routing_steps,'[]'::jsonb)) route(value)
    where value->>'status'='Pending' order by coalesce((value->>'order')::integer,999) limit 1;
    if current_step is not null then
      insert into public.notifications(user_id,type,title,message,link,is_read,related_entity_id,dedupe_key)
      values(current_step->>'userId','JOB_REQUISITION_SUBMITTED','Job Requisition Approval Required',format('Requisition %s requires your approval.',new.req_code),'/recruitment/requisitions?item='||new.id,false,new.id::text,'job-requisition:'||new.id::text||':'||(current_step->>'userId'))
      on conflict(user_id,dedupe_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists job_requisitions_notify_current_step on public.job_requisitions;
create trigger job_requisitions_notify_current_step after insert or update on public.job_requisitions
for each row execute function public.notify_job_requisition_current_step();

create or replace function public.process_job_requisition_approval(p_requisition_id uuid,p_decision text,p_reason text default null)
returns public.job_requisitions
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid:=public.current_hris_user_id(); request_row public.job_requisitions; step jsonb; rebuilt jsonb:='[]'::jsonb; actor_found boolean:=false; remaining integer; approved_bod integer; next_index integer; next_user uuid;
begin
  if actor_id is null then raise exception 'Authentication is required.' using errcode='42501'; end if;
  if lower(p_decision) not in ('approve','reject') then raise exception 'Decision must be approve or reject.'; end if;
  select * into request_row from public.job_requisitions where id=p_requisition_id for update;
  if not found then raise exception 'Job requisition not found.' using errcode='P0002'; end if;
  if request_row.status::text not in ('PendingApproval','Pending Approval') then raise exception 'This requisition is not pending approval.'; end if;

  for step in select value from jsonb_array_elements(coalesce(request_row.routing_steps,'[]'::jsonb)) with ordinality route(value,ordinality) order by ordinality loop
    if step->>'userId'=actor_id::text and step->>'status'='Pending' and not actor_found then
      actor_found:=true;
      step:=step||jsonb_build_object('status',case when lower(p_decision)='approve' then 'Approved' else 'Rejected' end,'timestamp',now(),'notes',nullif(btrim(coalesce(p_reason,'')),''));
    end if;
    rebuilt:=rebuilt||jsonb_build_array(step);
  end loop;
  if not actor_found then raise exception 'This requisition is not assigned to you at the current approval step.' using errcode='42501'; end if;
  perform set_config('app.job_requisition_rpc','on',true);
  if lower(p_decision)='reject' then
    update public.job_requisitions set routing_steps=rebuilt,status='Rejected',updated_at=now() where id=p_requisition_id returning * into request_row;
  else
    select count(*) into remaining from jsonb_array_elements(rebuilt) item where coalesce((item->>'isRequired')::boolean,true) and lower(item->>'status')<>'approved';
    select count(*) into approved_bod from jsonb_array_elements(rebuilt) item where (coalesce((item->>'isBod')::boolean,false) or item->>'roleSnapshot'='Board of Director') and lower(item->>'status')='approved';
    if remaining=0 and approved_bod>0 then
      update public.job_requisitions set routing_steps=rebuilt,status='Approved',updated_at=now() where id=p_requisition_id returning * into request_row;
    else
      select ordinality::integer-1,(value->>'userId')::uuid into next_index,next_user from jsonb_array_elements(rebuilt) with ordinality route(value,ordinality) where value->>'status'='Waiting' order by ordinality limit 1;
      if next_index is not null then rebuilt:=jsonb_set(rebuilt,array[next_index::text,'status'],'"Pending"'::jsonb,true); end if;
      update public.job_requisitions set routing_steps=rebuilt,status='PendingApproval',updated_at=now() where id=p_requisition_id returning * into request_row;
    end if;
  end if;
  insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details)
  select actor_id::text,actor.email,upper(p_decision),'JobRequisition',p_requisition_id::text,format('%s assigned approval step. Status: %s',initcap(lower(p_decision)),request_row.status::text)
  from public.hris_users actor where actor.id=actor_id;
  if next_user is not null then
    insert into public.notifications(user_id,type,title,message,link,is_read,related_entity_id,dedupe_key)
    values(next_user::text,'JOB_REQUISITION_SUBMITTED','Job Requisition Approval Required',format('Requisition %s requires your approval.',request_row.req_code),'/recruitment/requisitions?item='||p_requisition_id,false,p_requisition_id::text,'job-requisition:'||p_requisition_id::text||':'||next_user::text)
    on conflict(user_id,dedupe_key) do nothing;
  end if;
  return request_row;
end;
$$;

revoke all on function public.process_job_requisition_approval(uuid,text,text) from public, anon;
grant execute on function public.process_job_requisition_approval(uuid,text,text) to authenticated;

-- Repair drafts/pending requisitions only; do not rewrite completed history.
do $$
declare request_row record; bod_id uuid; bod_name text; next_status text;
begin
  select candidate.id,candidate.full_name into bod_id,bod_name from public.hris_users candidate
  where private.workflow_user_has_role(candidate.id,'Board of Director')
  order by exists(
    select 1 from public.approver_configs config,
      jsonb_array_elements_text(coalesce(config.config_value->'user_ids','[]'::jsonb)) configured(user_id)
    where config.config_key='bod_approvers' and configured.user_id=candidate.id::text
  ) desc, candidate.full_name limit 1;
  if bod_id is null then return; end if;
  perform set_config('app.job_requisition_rpc','on',true);
  for request_row in select id,routing_steps from public.job_requisitions where status::text in ('Draft','PendingApproval','Pending Approval')
    and not exists(select 1 from jsonb_array_elements(coalesce(routing_steps,'[]'::jsonb)) step where coalesce((step->>'isBod')::boolean,false) or step->>'roleSnapshot'='Board of Director')
  loop
    next_status:=case when exists(
      select 1 from jsonb_array_elements(coalesce(request_row.routing_steps,'[]'::jsonb)) step
      where step->>'status'='Pending'
    ) then 'Waiting' else 'Pending' end;
    update public.job_requisitions set routing_steps=coalesce(request_row.routing_steps,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
      'id','req-step-'||request_row.id::text||'-bod','userId',bod_id,'name',bod_name,'role','Board of Director','roleSnapshot','Board of Director','isBod',true,'isRequired',true,
      'status',next_status,'order',jsonb_array_length(coalesce(request_row.routing_steps,'[]'::jsonb))+1
    )) where id=request_row.id;
  end loop;
end $$;
