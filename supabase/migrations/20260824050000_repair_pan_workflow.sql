-- Backward-compatible PAN workflow repair.
-- Existing PAN rows and approval histories are preserved. New submissions use
-- workflow_version 2 and are processed atomically through the RPCs below.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.pans
  add column if not exists workflow_version integer not null default 1,
  add column if not exists approval_completed_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.hris_users(id) on delete set null,
  add column if not exists cancellation_reason text,
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by uuid references public.hris_users(id) on delete set null,
  add column if not exists applied_at timestamptz;

create index if not exists pans_creator_status_idx
  on public.pans(created_by_user_id, status, updated_at desc);
create index if not exists pans_employee_status_idx
  on public.pans(employee_id, status, updated_at desc);

create or replace function private.pan_user_is_bod(p_user_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hris_users u
    where u.id::text = p_user_id
      and lower(u.status::text) = 'active'
      and (
        u.role = 'Board of Director'
        or exists (
          select 1
          from public.user_roles ur
          where ur.user_id = u.id
            and ur.role_id = 'Board of Director'
            and ur.is_active
        )
      )
  )
$$;

create or replace function private.pan_actor_can_create()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_active_role('Admin')
      or public.has_active_role('HR Manager')
      or public.has_active_role('HR Staff')
      or public.has_feature_permission('PersonnelActionNotices', 'create')
      or public.has_workflow_permission('PersonnelActionNotices', 'submit')
$$;

create or replace function private.pan_notify(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_link text,
  p_pan_id uuid,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then return; end if;
  insert into public.notifications(user_id, type, title, message, link, is_read, related_entity_id, dedupe_key)
  values(p_user_id::text, p_type, p_title, p_message, p_link, false, p_pan_id::text, p_dedupe_key)
  on conflict(user_id, dedupe_key) do nothing;
end;
$$;

create or replace function private.pan_audit(
  p_action text,
  p_pan_id uuid,
  p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
begin
  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values(coalesce(actor_id::text, 'system'), actor_email, p_action, 'PAN', p_pan_id::text, p_details::text);
end;
$$;

revoke all on function private.pan_user_is_bod(text) from public, anon, authenticated;
revoke all on function private.pan_actor_can_create() from public, anon, authenticated;
revoke all on function private.pan_notify(uuid,text,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function private.pan_audit(text,uuid,jsonb) from public, anon, authenticated;

create or replace function public.submit_pan(p_pan_id uuid)
returns public.pans
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  pan_row public.pans;
  step_row jsonb;
  normalized_steps jsonb := '[]'::jsonb;
  step_number integer := 0;
  first_step jsonb;
  bod_count integer := 0;
begin
  if actor_id is null or not private.pan_actor_can_create() then
    raise exception 'Forbidden: PAN submission permission is required.' using errcode = '42501';
  end if;

  select * into pan_row from public.pans where id = p_pan_id for update;
  if pan_row.id is null then raise exception 'PAN record not found.'; end if;
  if pan_row.status::text not in ('Draft', 'Declined', 'Returned for Edits') then
    raise exception 'Only a draft, rejected, or returned PAN can be submitted.';
  end if;
  if pan_row.created_by_user_id is distinct from actor_id and not private.pan_actor_can_create() then
    raise exception 'You are not authorized to submit this PAN.' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(pan_row.routing_steps, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one approver before submitting the PAN.';
  end if;

  select count(*) into bod_count
  from jsonb_array_elements(coalesce(pan_row.routing_steps, '[]'::jsonb)) step
  where private.pan_user_is_bod(step->>'userId');
  if bod_count = 0 then
    raise exception 'Every PAN requires at least one active Board of Director approver.';
  end if;

  for step_row in
    select value from jsonb_array_elements(pan_row.routing_steps) with ordinality as route(value, ordinality)
    order by ordinality
  loop
    if nullif(step_row->>'userId', '') is null then
      raise exception 'Every PAN routing step must identify an approver.';
    end if;
    normalized_steps := normalized_steps || jsonb_build_array(
      (step_row - 'timestamp' - 'notes') || jsonb_build_object(
        'order', step_number,
        'status', case when step_number = 0 then 'Pending' else 'Waiting' end,
        'role', case when private.pan_user_is_bod(step_row->>'userId') then 'Board of Director' else coalesce(nullif(step_row->>'role',''), 'Approver') end
      )
    );
    step_number := step_number + 1;
  end loop;

  update public.pans
  set status = 'Pending Approval',
      workflow_version = 2,
      routing_steps = normalized_steps,
      rejection_reason = null,
      approval_completed_at = null,
      updated_at = now()
  where id = p_pan_id
  returning * into pan_row;

  first_step := normalized_steps->0;
  perform private.pan_notify(
    (first_step->>'userId')::uuid,
    'PAN_APPROVAL_REQUEST',
    'PAN Approval Required',
    format('PAN %s for %s is awaiting your approval.', p_pan_id, pan_row.employee_name),
    format('/approvals?type=pan&item=%s', p_pan_id),
    p_pan_id,
    format('pan:%s:approval:%s', p_pan_id, coalesce(first_step->>'id', '0'))
  );
  perform private.pan_audit('SUBMIT', p_pan_id, jsonb_build_object(
    'status', 'Pending Approval', 'workflowVersion', 2,
    'routingStepCount', jsonb_array_length(normalized_steps), 'requiredBodSteps', bod_count
  ));
  return pan_row;
end;
$$;

create or replace function public.approve_pan(p_pan_id uuid, p_comment text default null)
returns public.pans
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  pan_row public.pans;
  step_row jsonb;
  rebuilt jsonb := '[]'::jsonb;
  actor_step_found boolean := false;
  next_step_index integer;
  step_index integer := 0;
  next_step jsonb;
  all_approved boolean;
  bod_approved boolean;
begin
  if actor_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into pan_row from public.pans where id = p_pan_id for update;
  if pan_row.id is null then raise exception 'PAN record not found.'; end if;
  if pan_row.status::text <> 'Pending Approval' then raise exception 'This PAN is not pending approval.'; end if;

  for step_row in select value from jsonb_array_elements(pan_row.routing_steps) with ordinality route(value, ordinality) order by ordinality
  loop
    if step_row->>'userId' = actor_id::text and step_row->>'status' = 'Pending' and not actor_step_found then
      step_row := step_row || jsonb_build_object('status','Approved','timestamp',now(),'notes',nullif(trim(coalesce(p_comment,'')),''));
      actor_step_found := true;
    end if;
    rebuilt := rebuilt || jsonb_build_array(step_row);
  end loop;
  if not actor_step_found then
    raise exception 'You are not the current assigned approver for this PAN.' using errcode = '42501';
  end if;

  select min((ordinality - 1)::integer) into next_step_index
  from jsonb_array_elements(rebuilt) with ordinality route(value, ordinality)
  where value->>'status' = 'Waiting';
  if next_step_index is not null then
    rebuilt := jsonb_set(rebuilt, array[next_step_index::text, 'status'], '"Pending"'::jsonb, false);
    next_step := rebuilt->next_step_index;
  end if;

  select not exists(select 1 from jsonb_array_elements(rebuilt) step where step->>'status' <> 'Approved') into all_approved;
  select exists(select 1 from jsonb_array_elements(rebuilt) step where step->>'status' = 'Approved' and private.pan_user_is_bod(step->>'userId')) into bod_approved;

  if all_approved then
    if pan_row.workflow_version >= 2 and not bod_approved then
      raise exception 'A Board of Director approval is required before employee acknowledgement.';
    end if;
    update public.pans set routing_steps=rebuilt, status='Pending Employee', approval_completed_at=now(), updated_at=now()
    where id=p_pan_id returning * into pan_row;
    perform private.pan_notify(
      pan_row.employee_id, 'PAN_UPDATE', 'PAN for Acknowledgement',
      format('PAN %s is approved and ready for your acknowledgement and acceptance.', p_pan_id),
      format('/employees/pan?item=%s', p_pan_id), p_pan_id,
      format('pan:%s:employee-acknowledgement', p_pan_id)
    );
  else
    update public.pans set routing_steps=rebuilt, updated_at=now() where id=p_pan_id returning * into pan_row;
    if next_step is not null then
      perform private.pan_notify(
        (next_step->>'userId')::uuid, 'PAN_APPROVAL_REQUEST', 'PAN Approval Required',
        format('PAN %s for %s is awaiting your approval.', p_pan_id, pan_row.employee_name),
        format('/approvals?type=pan&item=%s', p_pan_id), p_pan_id,
        format('pan:%s:approval:%s', p_pan_id, coalesce(next_step->>'id', next_step_index::text))
      );
    end if;
  end if;
  perform private.pan_audit('APPROVE', p_pan_id, jsonb_build_object('comment',nullif(trim(coalesce(p_comment,'')),''),'status',pan_row.status::text));
  return pan_row;
end;
$$;

create or replace function public.reject_pan(p_pan_id uuid, p_reason text)
returns public.pans
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  pan_row public.pans;
  step_row jsonb;
  rebuilt jsonb := '[]'::jsonb;
  actor_step_found boolean := false;
begin
  if actor_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'A rejection reason is required.'; end if;
  select * into pan_row from public.pans where id=p_pan_id for update;
  if pan_row.id is null then raise exception 'PAN record not found.'; end if;
  if pan_row.status::text <> 'Pending Approval' then raise exception 'This PAN is not pending approval.'; end if;

  for step_row in select value from jsonb_array_elements(pan_row.routing_steps) with ordinality route(value, ordinality) order by ordinality
  loop
    if step_row->>'userId'=actor_id::text and step_row->>'status'='Pending' and not actor_step_found then
      step_row := step_row || jsonb_build_object('status','Declined','timestamp',now(),'notes',trim(p_reason));
      actor_step_found := true;
    end if;
    rebuilt := rebuilt || jsonb_build_array(step_row);
  end loop;
  if not actor_step_found then raise exception 'You are not the current assigned approver for this PAN.' using errcode='42501'; end if;

  update public.pans set routing_steps=rebuilt,status='Declined',rejection_reason=trim(p_reason),updated_at=now()
  where id=p_pan_id returning * into pan_row;
  perform private.pan_notify(
    pan_row.created_by_user_id, 'PAN_UPDATE', 'PAN Rejected',
    format('PAN %s for %s was rejected. Reason: %s',p_pan_id,pan_row.employee_name,trim(p_reason)),
    format('/employees/pan?item=%s',p_pan_id),p_pan_id,format('pan:%s:rejected',p_pan_id)
  );
  perform private.pan_audit('REJECT',p_pan_id,jsonb_build_object('reason',trim(p_reason),'status','Declined'));
  return pan_row;
end;
$$;

create or replace function public.cancel_pan(p_pan_id uuid, p_reason text)
returns public.pans
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  pan_row public.pans;
  step_row jsonb;
  rebuilt jsonb := '[]'::jsonb;
  target_id uuid;
  notify_employee boolean := false;
begin
  if actor_id is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'A cancellation reason is required.'; end if;
  select * into pan_row from public.pans where id=p_pan_id for update;
  if pan_row.id is null then raise exception 'PAN record not found.'; end if;
  if pan_row.status::text not in ('Draft','Pending Approval','Pending Employee') then
    raise exception 'Only an active PAN can be cancelled.';
  end if;
  if actor_id is distinct from pan_row.created_by_user_id
     and not (public.has_active_role('Admin') or public.has_active_role('HR Manager') or public.has_active_role('HR Staff')) then
    raise exception 'You are not authorized to cancel this PAN.' using errcode='42501';
  end if;
  notify_employee := pan_row.status::text = 'Pending Employee' or pan_row.approval_completed_at is not null;

  for step_row in select value from jsonb_array_elements(coalesce(pan_row.routing_steps,'[]'::jsonb)) with ordinality route(value, ordinality) order by ordinality
  loop
    if step_row->>'status' in ('Pending','Waiting') then step_row := step_row || jsonb_build_object('status','Cancelled','timestamp',now()); end if;
    rebuilt := rebuilt || jsonb_build_array(step_row);
  end loop;
  update public.pans
  set status='Cancelled',routing_steps=rebuilt,cancelled_at=now(),cancelled_by=actor_id,cancellation_reason=trim(p_reason),updated_at=now()
  where id=p_pan_id returning * into pan_row;

  for target_id in
    select distinct (step->>'userId')::uuid from jsonb_array_elements(rebuilt) step where nullif(step->>'userId','') is not null
    union
    select pan_row.employee_id where notify_employee
  loop
    if target_id is distinct from actor_id then
      perform private.pan_notify(
        target_id,'PAN_UPDATE','PAN Cancelled',
        format('PAN %s for %s was cancelled. Reason: %s',p_pan_id,pan_row.employee_name,trim(p_reason)),
        format('/employees/pan?item=%s',p_pan_id),p_pan_id,format('pan:%s:cancelled:%s',p_pan_id,target_id)
      );
    end if;
  end loop;
  perform private.pan_audit('CANCEL',p_pan_id,jsonb_build_object('reason',trim(p_reason),'status','Cancelled'));
  return pan_row;
end;
$$;

create or replace function public.accept_pan(p_pan_id uuid, p_signature_data_url text, p_signature_name text)
returns public.pans
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  pan_row public.pans;
  bod_approved boolean;
  all_approved boolean;
  to_data jsonb;
  action_data jsonb;
  next_position text;
  next_department text;
  next_employment_status text;
  next_business_unit text;
  next_business_unit_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_signature_name,'')),'') is null or nullif(trim(coalesce(p_signature_data_url,'')),'') is null then
    raise exception 'Your typed name and signature are required.';
  end if;
  select * into pan_row from public.pans where id=p_pan_id for update;
  if pan_row.id is null then raise exception 'PAN record not found.'; end if;
  if pan_row.employee_id is distinct from actor_id then raise exception 'Only the employee named in this PAN may accept it.' using errcode='42501'; end if;
  if pan_row.status::text <> 'Pending Employee' then raise exception 'This PAN is not awaiting employee acceptance.'; end if;

  select not exists(select 1 from jsonb_array_elements(pan_row.routing_steps) step where step->>'status' <> 'Approved') into all_approved;
  select exists(select 1 from jsonb_array_elements(pan_row.routing_steps) step where step->>'status'='Approved' and private.pan_user_is_bod(step->>'userId')) into bod_approved;
  if pan_row.workflow_version >= 2 and (not all_approved or not bod_approved) then
    raise exception 'Required approvals, including Board of Director approval, are incomplete.';
  end if;

  to_data := coalesce(pan_row.particulars->'to','{}'::jsonb);
  action_data := coalesce(pan_row.action_taken,'{}'::jsonb);
  next_position := nullif(trim(to_data->>'position'),'');
  next_department := nullif(trim(to_data->>'department'),'');
  next_employment_status := nullif(trim(to_data->>'employmentStatus'),'');
  next_business_unit := nullif(trim(to_data->>'businessUnit'),'');
  if coalesce(to_data->>'businessUnitId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    next_business_unit_id := (to_data->>'businessUnitId')::uuid;
  end if;

  if pan_row.workflow_version >= 2 then
    update public.hris_users
    set position = case
          when coalesce((action_data->>'promotion')::boolean,false) or coalesce((action_data->>'changeOfJobTitle')::boolean,false) or coalesce((action_data->>'transfer')::boolean,false)
            then case when lower(coalesce(next_position,'')) in ('same','not applicable') then position else coalesce(next_position,position) end
          else position end,
        department = case when coalesce((action_data->>'transfer')::boolean,false)
          then case when lower(coalesce(next_department,'')) in ('same','not applicable') then department else coalesce(next_department,department) end else department end,
        business_unit = case when coalesce((action_data->>'transfer')::boolean,false)
          then case when lower(coalesce(next_business_unit,'')) in ('same','not applicable') then business_unit else coalesce(next_business_unit,business_unit) end else business_unit end,
        business_unit_id = case when coalesce((action_data->>'transfer')::boolean,false) then coalesce(next_business_unit_id,business_unit_id) else business_unit_id end,
        employment_status = case when coalesce((action_data->>'changeOfStatus')::boolean,false)
          then case when lower(coalesce(next_employment_status,'')) in ('same','not applicable') then employment_status else coalesce(next_employment_status,employment_status) end else employment_status end,
        salary_basic = case when coalesce((action_data->>'salaryIncrease')::boolean,false) then coalesce(nullif(to_data#>>'{salary,basic}','')::numeric,salary_basic) else salary_basic end,
        salary_deminimis = case when coalesce((action_data->>'salaryIncrease')::boolean,false) then coalesce(nullif(to_data#>>'{salary,deminimis}','')::numeric,salary_deminimis) else salary_deminimis end,
        salary_reimbursable = case when coalesce((action_data->>'salaryIncrease')::boolean,false) then coalesce(nullif(to_data#>>'{salary,reimbursable}','')::numeric,salary_reimbursable) else salary_reimbursable end
    where id=pan_row.employee_id;
  end if;

  update public.pans
  set status='Completed',signed_at=now(),signature_data_url=p_signature_data_url,signature_name=trim(p_signature_name),
      accepted_at=now(),accepted_by=actor_id,applied_at=case when workflow_version>=2 then now() else applied_at end,updated_at=now()
  where id=p_pan_id returning * into pan_row;
  perform private.pan_notify(
    pan_row.created_by_user_id,'PAN_UPDATE','PAN Accepted',
    format('%s acknowledged and accepted PAN %s.',pan_row.employee_name,p_pan_id),
    format('/employees/pan?item=%s',p_pan_id),p_pan_id,format('pan:%s:accepted',p_pan_id)
  );
  perform private.pan_audit('ACCEPT',p_pan_id,jsonb_build_object('employeeId',actor_id,'status','Completed','employeeRecordApplied',pan_row.workflow_version>=2));
  return pan_row;
end;
$$;

revoke all on function public.submit_pan(uuid) from public, anon, authenticated;
revoke all on function public.approve_pan(uuid,text) from public, anon, authenticated;
revoke all on function public.reject_pan(uuid,text) from public, anon, authenticated;
revoke all on function public.cancel_pan(uuid,text) from public, anon, authenticated;
revoke all on function public.accept_pan(uuid,text,text) from public, anon, authenticated;
grant execute on function public.submit_pan(uuid) to authenticated;
grant execute on function public.approve_pan(uuid,text) to authenticated;
grant execute on function public.reject_pan(uuid,text) to authenticated;
grant execute on function public.cancel_pan(uuid,text) to authenticated;
grant execute on function public.accept_pan(uuid,text,text) to authenticated;

drop policy if exists pans_employee_read_own on public.pans;
drop policy if exists pans_hr_admin_all on public.pans;
drop policy if exists pans_authorized_read on public.pans;
drop policy if exists pans_assigned_approver_read on public.pans;
drop policy if exists pans_creator_insert on public.pans;
drop policy if exists pans_creator_edit_draft on public.pans;

create policy pans_authorized_read on public.pans
for select to authenticated using (
  employee_id = public.current_hris_user_id()
  or created_by_user_id = public.current_hris_user_id()
  or public.is_hr_or_admin()
  or public.has_active_role('Admin')
  or exists (
    select 1 from jsonb_array_elements(coalesce(routing_steps,'[]'::jsonb)) step
    where step->>'userId' = public.current_hris_user_id()::text
  )
);

create policy pans_creator_insert on public.pans
for insert to authenticated with check (
  created_by_user_id = public.current_hris_user_id()
  and (
    public.has_active_role('Admin') or public.has_active_role('HR Manager') or public.has_active_role('HR Staff')
    or public.has_feature_permission('PersonnelActionNotices','create')
    or public.has_workflow_permission('PersonnelActionNotices','submit')
  )
  and status::text = 'Draft'
);

create policy pans_creator_edit_draft on public.pans
for update to authenticated using (
  status::text in ('Draft','Declined','Returned for Edits')
  and (
    created_by_user_id = public.current_hris_user_id()
    or public.has_active_role('Admin') or public.has_active_role('HR Manager') or public.has_active_role('HR Staff')
  )
)
with check (
  status::text = 'Draft'
  and (
    created_by_user_id = public.current_hris_user_id()
    or public.has_active_role('Admin') or public.has_active_role('HR Manager') or public.has_active_role('HR Staff')
  )
);

-- Repair only historical PAN alerts that can be matched unambiguously to an
-- existing PAN and a legitimate route/employee recipient. No notification is
-- deleted and read state is preserved.
with candidates as (
  select n.id notification_id, p.id pan_id,
         case when lower(n.title) like '%approval%' then format('/approvals?type=pan&item=%s',p.id)
              else format('/employees/pan?item=%s',p.id) end canonical_link,
         row_number() over(partition by n.id order by least(
           abs(extract(epoch from (n.created_at-p.created_at))),
           abs(extract(epoch from (n.created_at-p.updated_at)))
         )) as candidate_rank,
         count(*) over(partition by n.id) as candidate_count
  from public.notifications n
  join public.pans p
    on n.message ilike '%' || p.employee_name || '%'
   and least(
     abs(extract(epoch from (n.created_at-p.created_at))),
     abs(extract(epoch from (n.created_at-p.updated_at)))
   ) <= 120
  where lower(n.title) like '%pan%'
    and n.related_entity_id is null
    and (
      p.employee_id::text = n.user_id
      or exists(select 1 from public.hris_users employee where employee.id=p.employee_id and employee.auth_user_id::text=n.user_id)
      or exists(select 1 from jsonb_array_elements(coalesce(p.routing_steps,'[]'::jsonb)) step where step->>'userId'=n.user_id)
      or exists(
        select 1
        from jsonb_array_elements(coalesce(p.routing_steps,'[]'::jsonb)) step
        join public.hris_users approver on approver.id::text=step->>'userId'
        where approver.auth_user_id::text=n.user_id
      )
    )
)
update public.notifications n
set related_entity_id=c.pan_id::text, link=c.canonical_link
from candidates c
where n.id=c.notification_id and c.candidate_rank=1 and c.candidate_count=1;
