-- Conditional Leave/WFH/OT routing with an explicitly configured escalation group.
-- Runtime routing never keys off a person's email. The one-time seed resolves
-- Regine's current account into configuration data, which Admin can later edit.

alter table public.leave_requests
  add column if not exists approval_route text,
  add column if not exists approval_reason text,
  add column if not exists approval_context jsonb not null default '{}'::jsonb,
  add column if not exists approval_routed_at timestamptz;

alter table public.wfh_requests
  add column if not exists approval_route text,
  add column if not exists approval_reason text,
  add column if not exists approval_context jsonb not null default '{}'::jsonb,
  add column if not exists approval_routed_at timestamptz;

alter table public.ot_requests
  add column if not exists approval_route text,
  add column if not exists approval_reason text,
  add column if not exists approval_context jsonb not null default '{}'::jsonb,
  add column if not exists approval_routed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leave_requests_approval_route_check'
      and conrelid = 'public.leave_requests'::regclass
  ) then
    alter table public.leave_requests add constraint leave_requests_approval_route_check
      check (approval_route is null or approval_route in ('MANAGER_ONLY','BOD_REQUIRED'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'wfh_requests_approval_route_check'
      and conrelid = 'public.wfh_requests'::regclass
  ) then
    alter table public.wfh_requests add constraint wfh_requests_approval_route_check
      check (approval_route is null or approval_route in ('MANAGER_ONLY','BOD_REQUIRED'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'ot_requests_approval_route_check'
      and conrelid = 'public.ot_requests'::regclass
  ) then
    alter table public.ot_requests add constraint ot_requests_approval_route_check
      check (approval_route is null or approval_route in ('MANAGER_ONLY','BOD_REQUIRED'));
  end if;
end;
$$;

create table if not exists public.time_request_approval_assignments (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('leave','wfh','overtime')),
  request_id uuid not null,
  approver_user_id uuid not null references public.hris_users(id),
  is_bod boolean not null default false,
  is_required boolean not null default true,
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected','Skipped')),
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_type, request_id, approver_user_id)
);

alter table public.time_request_approval_assignments enable row level security;
revoke all on table public.time_request_approval_assignments from anon, authenticated;
grant select on table public.time_request_approval_assignments to authenticated;

drop policy if exists time_request_assignments_authorized_read on public.time_request_approval_assignments;
create policy time_request_assignments_authorized_read
on public.time_request_approval_assignments for select to authenticated
using (
  approver_user_id = public.current_hris_user_id()
  or public.is_system_admin()
  or public.has_feature_permission('AuditLog','view')
);

create index if not exists time_request_assignments_approver_queue_idx
  on public.time_request_approval_assignments(approver_user_id,status,request_type,created_at desc);
create index if not exists time_request_assignments_request_idx
  on public.time_request_approval_assignments(request_type,request_id);

-- This config is deliberately separate from the general bod_approvers setting
-- used by NTE, PAN, awards, and other workflows.
insert into public.approver_configs(config_key,config_value,updated_at)
select 'conditional_time_approvals', jsonb_build_object(
  'user_ids', jsonb_build_array(u.id),
  'user_names', jsonb_build_array(u.full_name),
  'required_user_ids', jsonb_build_array(u.id),
  'required_bod_approvals', 1,
  'leave_days_per_remaining_month', 1,
  'wfh_days_per_month', 4,
  'weekly_total_hours', 50
), now()
from public.hris_users u
where lower(u.email)='regine@thenextperience.com'
  and lower(u.status)='active'
  and (
    u.role='Board of Director'
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id=u.id and ur.role_id='Board of Director' and ur.is_active
    )
  )
on conflict (config_key) do update set
  config_value=excluded.config_value,
  updated_at=excluded.updated_at;

create or replace function private.is_time_approval_bod(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1 from public.hris_users u
    where u.id=p_user_id and lower(u.status)='active'
      and (
        u.role='Board of Director'
        or exists (
          select 1 from public.user_roles ur
          where ur.user_id=u.id and ur.role_id='Board of Director' and ur.is_active
        )
      )
  )
$$;

create or replace function private.conditional_time_approval_config()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    (select config_value from public.approver_configs where config_key='conditional_time_approvals'),
    jsonb_build_object(
      'user_ids','[]'::jsonb,'user_names','[]'::jsonb,'required_user_ids','[]'::jsonb,
      'required_bod_approvals',1,'leave_days_per_remaining_month',1,
      'wfh_days_per_month',4,'weekly_total_hours',50
    )
  )
$$;

create or replace function private.is_direct_reporting_manager(p_actor_id uuid,p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.hris_users employee
    join public.hris_users manager on manager.id=p_actor_id
    where employee.id=p_employee_id
      and employee.reports_to in (
        manager.id::text,manager.auth_user_id::text,
        coalesce(manager.employee_id,''),manager.full_name
      )
  )
$$;

create or replace function private.time_request_context(p_request_type text,p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg jsonb := private.conditional_time_approval_config();
  result_value jsonb;
  request_row record;
  request_days numeric;
  months_remaining integer;
  yearly_leave_days numeric;
  monthly_wfh_days numeric;
  weekly_ot_hours numeric;
  scheduled_hours numeric;
  total_hours numeric;
  threshold numeric;
  requires_bod boolean;
begin
  if lower(p_request_type)='leave' then
    select * into request_row from public.leave_requests where id=p_request_id;
    if request_row.id is null then raise exception 'Leave request not found.'; end if;
    request_days := coalesce(request_row.duration_days,0);
    months_remaining := greatest(1,13-extract(month from request_row.start_date)::integer);
    select coalesce(sum(r.duration_days),0) into yearly_leave_days
    from public.leave_requests r
    where r.employee_id=request_row.employee_id
      and extract(year from r.start_date)=extract(year from request_row.start_date)
      and r.status not in ('Draft','Rejected','Cancelled','Canceled');
    threshold := months_remaining*coalesce((cfg->>'leave_days_per_remaining_month')::numeric,1);
    requires_bod := request_days>threshold or yearly_leave_days>threshold;
    result_value := jsonb_build_object(
      'requiresBod',requires_bod,'requestDays',request_days,
      'yearLeaveDays',yearly_leave_days,'monthsRemaining',months_remaining,
      'threshold',threshold,'reason',case when requires_bod
        then format('%s leave days exceed the %s-day allowance for %s months remaining.',yearly_leave_days,threshold,months_remaining)
        else format('%s leave days are within the %s-day allowance for %s months remaining.',yearly_leave_days,threshold,months_remaining) end
    );
  elsif lower(p_request_type)='wfh' then
    select * into request_row from public.wfh_requests where id=p_request_id;
    if request_row.id is null then raise exception 'WFH request not found.'; end if;
    select coalesce(sum((coalesce(r.end_date,r.date)-r.date)+1),0) into monthly_wfh_days
    from public.wfh_requests r
    where r.employee_id=request_row.employee_id
      and date_trunc('month',r.date)=date_trunc('month',request_row.date)
      and r.status not in ('WFH_REJECTED','WFH_PENDING_SUBMISSION');
    threshold := coalesce((cfg->>'wfh_days_per_month')::numeric,4);
    requires_bod := monthly_wfh_days>threshold;
    result_value := jsonb_build_object(
      'requiresBod',requires_bod,'monthWfhDays',monthly_wfh_days,
      'threshold',threshold,'month',to_char(request_row.date,'FMMonth YYYY'),
      'reason',case when requires_bod
        then format('%s WFH days exceed the %s-day monthly threshold.',monthly_wfh_days,threshold)
        else format('%s WFH days are within the %s-day monthly threshold.',monthly_wfh_days,threshold) end
    );
  elsif lower(p_request_type)='overtime' then
    select * into request_row from public.ot_requests where id=p_request_id;
    if request_row.id is null then raise exception 'Overtime request not found.'; end if;
    select coalesce(sum(coalesce(r.hours,
      case when r.end_time>=r.start_time
        then extract(epoch from (r.end_time-r.start_time))/3600
        else extract(epoch from ((r.end_time+interval '24 hours')-r.start_time))/3600 end
    )),0) into weekly_ot_hours
    from public.ot_requests r
    where r.employee_id=request_row.employee_id
      and date_trunc('week',r.date)=date_trunc('week',request_row.date)
      and r.status::text not in ('Draft','Rejected');
    select coalesce(sum(greatest(0,
      extract(epoch from (case when st.end_time>st.start_time
        then st.end_time-st.start_time
        else (st.end_time+interval '24 hours')-st.start_time end))/3600
      -coalesce(st.break_minutes,0)/60.0
    )),0) into scheduled_hours
    from public.shift_assignments sa
    join public.shift_templates st on st.id=sa.shift_template_id
    where sa.employee_id=request_row.employee_id
      and date_trunc('week',sa.date)=date_trunc('week',request_row.date);
    if scheduled_hours=0 then scheduled_hours:=40; end if;
    total_hours := scheduled_hours+weekly_ot_hours;
    threshold := coalesce((cfg->>'weekly_total_hours')::numeric,50);
    requires_bod := total_hours>threshold;
    result_value := jsonb_build_object(
      'requiresBod',requires_bod,'scheduledHours',scheduled_hours,
      'weekOtHours',weekly_ot_hours,'totalWeekHours',total_hours,
      'threshold',threshold,'weekStart',date_trunc('week',request_row.date)::date,
      'reason',case when requires_bod
        then format('%s total weekly hours exceed the %s-hour threshold.',total_hours,threshold)
        else format('%s total weekly hours are within the %s-hour threshold.',total_hours,threshold) end
    );
  else
    raise exception 'Unsupported request type %.',p_request_type using errcode='22023';
  end if;
  return result_value;
end;
$$;

create or replace function private.assign_time_request_approvers(
  p_request_type text,p_request_id uuid,p_notify boolean default true
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  cfg jsonb := private.conditional_time_approval_config();
  configured_id uuid;
  required_ids uuid[] := coalesce(array(
    select jsonb_array_elements_text(coalesce(cfg->'required_user_ids','[]'::jsonb))::uuid
  ),'{}'::uuid[]);
  active_bods integer;
  item_link text;
  item_title text;
begin
  select count(*) into active_bods
  from jsonb_array_elements_text(coalesce(cfg->'user_ids','[]'::jsonb)) selected(user_id)
  where private.is_time_approval_bod(selected.user_id::uuid);
  if active_bods<greatest(1,coalesce((cfg->>'required_bod_approvals')::integer,1)) then
    raise exception 'At least one active configured BOD approver is required.' using errcode='22023';
  end if;

  item_link := format('/approvals?type=%s&item=%s',lower(p_request_type),p_request_id);
  item_title := case lower(p_request_type)
    when 'leave' then 'Leave request pending escalated approval'
    when 'wfh' then 'WFH request pending escalated approval'
    else 'OT request pending escalated approval' end;

  update public.time_request_approval_assignments
  set status='Skipped',updated_at=now(),decision_note='Approver removed from current configuration'
  where request_type=lower(p_request_type) and request_id=p_request_id and status='Pending'
    and approver_user_id not in (
      select jsonb_array_elements_text(coalesce(cfg->'user_ids','[]'::jsonb))::uuid
    );

  for configured_id in
    select selected.user_id::uuid
    from jsonb_array_elements_text(coalesce(cfg->'user_ids','[]'::jsonb)) selected(user_id)
    join public.hris_users u on u.id=selected.user_id::uuid and lower(u.status)='active'
  loop
    insert into public.time_request_approval_assignments(
      request_type,request_id,approver_user_id,is_bod,is_required,status
    ) values (
      lower(p_request_type),p_request_id,configured_id,
      private.is_time_approval_bod(configured_id),configured_id=any(required_ids),'Pending'
    ) on conflict (request_type,request_id,approver_user_id) do update set
      is_bod=excluded.is_bod,is_required=excluded.is_required,
      status=case when public.time_request_approval_assignments.status in ('Approved','Rejected')
        then public.time_request_approval_assignments.status else 'Pending' end,
      updated_at=now();

    if p_notify then
      insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key)
      values (
        configured_id::text,'APPROVAL_REQUIRED',item_title,
        'A request exceeded its configured threshold and requires your review.',
        item_link,p_request_id::text,
        format('conditional-time:%s:%s:%s',lower(p_request_type),p_request_id,configured_id)
      ) on conflict (user_id,dedupe_key) do nothing;
    end if;
  end loop;
end;
$$;

create or replace function public.get_conditional_time_approval_config()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg jsonb:=private.conditional_time_approval_config();
  active_bod_count integer;
begin
  select count(*) into active_bod_count
  from jsonb_array_elements_text(coalesce(cfg->'user_ids','[]'::jsonb)) selected(user_id)
  where private.is_time_approval_bod(selected.user_id::uuid);
  return cfg||jsonb_build_object(
    'valid',active_bod_count>=greatest(1,coalesce((cfg->>'required_bod_approvals')::integer,1)),
    'invalid_reason',case when active_bod_count>=greatest(1,coalesce((cfg->>'required_bod_approvals')::integer,1))
      then null else 'At least one selected, required approver must be an active BOD.' end
  );
end;
$$;

create or replace function public.save_conditional_time_approval_config(p_config jsonb,p_change_note text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
#variable_conflict use_variable
declare
  actor_id uuid:=public.current_hris_user_id();
  selected_ids uuid[]:=coalesce(array(select jsonb_array_elements_text(coalesce(p_config->'user_ids','[]'::jsonb))::uuid),'{}'::uuid[]);
  required_ids uuid[]:=coalesce(array(select jsonb_array_elements_text(coalesce(p_config->'required_user_ids','[]'::jsonb))::uuid),'{}'::uuid[]);
  active_count integer;
  bod_count integer;
  previous_value jsonb;
  normalized jsonb;
begin
  if actor_id is null or not public.is_system_admin() then
    raise exception 'Only an active system Admin can change conditional approval routing.' using errcode='42501';
  end if;
  if nullif(trim(p_change_note),'') is null then
    raise exception 'A reason or change note is required.' using errcode='22023';
  end if;
  if coalesce(array_length(selected_ids,1),0)=0 then
    raise exception 'Select at least one escalated approver.' using errcode='22023';
  end if;
  if not required_ids<@selected_ids then
    raise exception 'Every required approver must also be selected.' using errcode='22023';
  end if;
  select count(*) into active_count from public.hris_users where id=any(selected_ids) and lower(status)='active';
  if active_count<>array_length(selected_ids,1) then
    raise exception 'All configured approvers must have active accounts.' using errcode='22023';
  end if;
  select count(*) into bod_count from unnest(required_ids) candidate(id) where private.is_time_approval_bod(candidate.id);
  if bod_count<greatest(1,coalesce((p_config->>'required_bod_approvals')::integer,1)) then
    raise exception 'At least one required active BOD approver is required.' using errcode='22023';
  end if;

  normalized:=jsonb_build_object(
    'user_ids',to_jsonb(selected_ids),
    'user_names',coalesce((select jsonb_agg(u.full_name order by u.full_name) from public.hris_users u where u.id=any(selected_ids)),'[]'::jsonb),
    'required_user_ids',to_jsonb(required_ids),
    'required_bod_approvals',greatest(1,coalesce((p_config->>'required_bod_approvals')::integer,1)),
    'leave_days_per_remaining_month',greatest(0.1,coalesce((p_config->>'leave_days_per_remaining_month')::numeric,1)),
    'wfh_days_per_month',greatest(0,coalesce((p_config->>'wfh_days_per_month')::integer,4)),
    'weekly_total_hours',greatest(1,coalesce((p_config->>'weekly_total_hours')::numeric,50))
  );
  select config_value into previous_value from public.approver_configs where config_key='conditional_time_approvals';
  insert into public.approver_configs(config_key,config_value,updated_at)
  values('conditional_time_approvals',normalized,now())
  on conflict(config_key) do update set config_value=excluded.config_value,updated_at=excluded.updated_at;
  insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details)
  select actor_id::text,u.email,'UPDATE','ConditionalApprovalConfig','conditional_time_approvals',
    format('Conditional approval config changed from %s to %s. Change note: %s',coalesce(previous_value,'{}'::jsonb),normalized,p_change_note)
  from public.hris_users u where u.id=actor_id;
  return normalized;
end;
$$;

create or replace function public.guard_conditional_time_approval_transition()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  request_type text:=lower(tg_argv[0]);
  actor_id uuid:=public.current_hris_user_id();
  context_value jsonb;
  is_final_approval boolean;
  is_bod_stage boolean;
begin
  if new.status::text is not distinct from old.status::text then return new; end if;
  context_value:=private.time_request_context(request_type,new.id);
  is_final_approval:=new.status::text in ('Approved','WFH_FOR_TIMEKEEPING');
  is_bod_stage:=old.status::text in ('PendingBOD','WFH_PENDING_BOD_APPROVAL');

  if coalesce((context_value->>'requiresBod')::boolean,false) and is_final_approval and not is_bod_stage then
    raise exception 'This request exceeds its configured threshold and must be routed to an assigned BOD approver.' using errcode='42501';
  end if;
  if is_bod_stage and not exists (
    select 1 from public.time_request_approval_assignments a
    where a.request_type=request_type and a.request_id=old.id and a.approver_user_id=actor_id
      and a.status in ('Approved','Rejected','Skipped') and a.updated_at>=now()-interval '10 minutes'
  ) then
    raise exception 'Only a currently assigned escalation approver may decide this request.' using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_conditional_leave_approval on public.leave_requests;
create trigger enforce_conditional_leave_approval before update of status on public.leave_requests
for each row execute function public.guard_conditional_time_approval_transition('leave');
drop trigger if exists enforce_conditional_wfh_approval on public.wfh_requests;
create trigger enforce_conditional_wfh_approval before update of status on public.wfh_requests
for each row execute function public.guard_conditional_time_approval_transition('wfh');
drop trigger if exists enforce_conditional_ot_approval on public.ot_requests;
create trigger enforce_conditional_ot_approval before update of status on public.ot_requests
for each row execute function public.guard_conditional_time_approval_transition('overtime');

create or replace function public.process_time_request_approval(
  p_request_type text,p_request_id uuid,p_decision text,p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid:=public.current_hris_user_id();
  actor_email text;
  employee_id uuid;
  current_status text;
  context_value jsonb;
  requires_bod boolean;
  is_manager_stage boolean;
  assignment public.time_request_approval_assignments;
  required_pending integer;
  bod_approved integer;
  final_status text;
begin
  if actor_id is null then raise exception 'Authentication is required.' using errcode='42501'; end if;
  if lower(p_decision) not in ('approve','reject','return') then
    raise exception 'Unsupported approval decision.' using errcode='22023';
  end if;
  select email into actor_email from public.hris_users where id=actor_id;

  if lower(p_request_type)='leave' then
    select r.employee_id,r.status into employee_id,current_status from public.leave_requests r where r.id=p_request_id for update;
    is_manager_stage:=current_status in ('Pending','PendingGM');
  elsif lower(p_request_type)='wfh' then
    select r.employee_id,r.status into employee_id,current_status from public.wfh_requests r where r.id=p_request_id for update;
    is_manager_stage:=current_status in ('WFH_PENDING_DEPT_HEAD_APPROVAL','WFH_PENDING_GM_APPROVAL');
  elsif lower(p_request_type)='overtime' then
    select r.employee_id,r.status::text into employee_id,current_status from public.ot_requests r where r.id=p_request_id for update;
    is_manager_stage:=current_status in ('Submitted','PendingGM');
  else
    raise exception 'Unsupported request type.' using errcode='22023';
  end if;
  if employee_id is null then raise exception 'Request not found.'; end if;

  if is_manager_stage then
    if not private.is_direct_reporting_manager(actor_id,employee_id) then
      raise exception 'Only the employee''s direct reporting manager may complete this step.' using errcode='42501';
    end if;
    if lower(p_decision)='return' then
      raise exception 'Return for clarification is not yet available for this legacy request type.' using errcode='22023';
    end if;
    if lower(p_decision)='reject' then
      final_status:=case lower(p_request_type) when 'wfh' then 'WFH_REJECTED' else 'Rejected' end;
    else
      context_value:=private.time_request_context(p_request_type,p_request_id);
      requires_bod:=coalesce((context_value->>'requiresBod')::boolean,false);
      if requires_bod then
        final_status:=case lower(p_request_type) when 'leave' then 'PendingBOD' when 'wfh' then 'WFH_PENDING_BOD_APPROVAL' else 'PendingBOD' end;
      else
        final_status:=case lower(p_request_type) when 'wfh' then 'WFH_FOR_TIMEKEEPING' else 'Approved' end;
      end if;
    end if;
  else
    select * into assignment from public.time_request_approval_assignments a
    where a.request_type=lower(p_request_type) and a.request_id=p_request_id
      and a.approver_user_id=actor_id and a.status='Pending' for update;
    if assignment.id is null then
      raise exception 'This request is not assigned to you.' using errcode='42501';
    end if;
    update public.time_request_approval_assignments
    set status=case lower(p_decision) when 'approve' then 'Approved' when 'reject' then 'Rejected' else 'Skipped' end,
        decision_note=p_note,decided_at=now(),updated_at=now()
    where id=assignment.id;
    if lower(p_decision)='reject' and assignment.is_required then
      final_status:=case lower(p_request_type) when 'wfh' then 'WFH_REJECTED' else 'Rejected' end;
    elsif lower(p_decision)='return' then
      final_status:=case lower(p_request_type) when 'leave' then 'Pending' when 'wfh' then 'WFH_PENDING_DEPT_HEAD_APPROVAL' else 'Submitted' end;
    else
      select count(*) into required_pending
      from public.time_request_approval_assignments a
      where a.request_type=lower(p_request_type) and a.request_id=p_request_id
        and a.is_required and a.status<>'Approved';
      select count(*) into bod_approved
      from public.time_request_approval_assignments a
      where a.request_type=lower(p_request_type) and a.request_id=p_request_id
        and a.is_bod and a.status='Approved';
      if required_pending=0 and bod_approved>=1 then
        final_status:=case lower(p_request_type) when 'wfh' then 'WFH_FOR_TIMEKEEPING' else 'Approved' end;
      else
        final_status:=current_status;
      end if;
    end if;
  end if;

  context_value:=coalesce(context_value,private.time_request_context(p_request_type,p_request_id));
  requires_bod:=coalesce((context_value->>'requiresBod')::boolean,false);

  if lower(p_request_type)='leave' then
    update public.leave_requests set status=final_status,
      approver_id=actor_id,approval_route=case when requires_bod then 'BOD_REQUIRED' else 'MANAGER_ONLY' end,
      approval_reason=context_value->>'reason',approval_context=context_value,approval_routed_at=now(),
      history_log=coalesce(history_log,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
        'action',initcap(lower(p_decision)),'by',actor_id,'date',now(),'note',coalesce(p_note,context_value->>'reason')
      )) where id=p_request_id;
  elsif lower(p_request_type)='wfh' then
    update public.wfh_requests set status=final_status,approved_by=actor_id,approved_at=now(),
      rejection_reason=case when lower(p_decision)='reject' then p_note else null end,
      approval_route=case when requires_bod then 'BOD_REQUIRED' else 'MANAGER_ONLY' end,
      approval_reason=context_value->>'reason',approval_context=context_value,approval_routed_at=now()
    where id=p_request_id;
  else
    update public.ot_requests set status=final_status::public.ot_status,approved_by=actor_id,approved_at=now(),updated_at=now(),
      manager_note=coalesce(p_note,manager_note),approval_route=case when requires_bod then 'BOD_REQUIRED' else 'MANAGER_ONLY' end,
      approval_reason=context_value->>'reason',approval_context=context_value,approval_routed_at=now(),
      history_log=coalesce(history_log,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
        'action',initcap(lower(p_decision)),'by',actor_id,'date',now(),'note',coalesce(p_note,context_value->>'reason')
      )) where id=p_request_id;
  end if;

  if is_manager_stage and lower(p_decision)='approve' and requires_bod then
    perform private.assign_time_request_approvers(p_request_type,p_request_id,true);
  end if;
  if final_status in ('Approved','WFH_FOR_TIMEKEEPING') then
    update public.time_request_approval_assignments set status='Skipped',updated_at=now(),
      decision_note=coalesce(decision_note,'Request completed')
    where request_type=lower(p_request_type) and request_id=p_request_id and status='Pending';
  end if;

  insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details)
  values(actor_id::text,actor_email,upper(p_decision),initcap(lower(p_request_type)),p_request_id::text,
    format('Conditional approval: %s -> %s. %s',current_status,final_status,context_value->>'reason'));
  return jsonb_build_object('requestType',lower(p_request_type),'requestId',p_request_id,
    'previousStatus',current_status,'status',final_status,'route',case when requires_bod then 'BOD_REQUIRED' else 'MANAGER_ONLY' end,
    'context',context_value,'notifyEscalation',is_manager_stage and lower(p_decision)='approve' and requires_bod);
end;
$$;

create or replace function public.get_time_approval_email_payload(p_request_type text,p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
#variable_conflict use_variable
declare
  actor_id uuid:=public.current_hris_user_id();
  employee_id uuid;
  employee_name text;
  request_dates text;
  status_value text;
  context_value jsonb;
  payload jsonb;
  recipients jsonb;
  is_manager_stage boolean;
begin
  if lower(p_request_type)='leave' then
    select r.employee_id,r.employee_name,format('%s to %s · %s day(s)',r.start_date,r.end_date,r.duration_days),r.status,r.approval_context
      into employee_id,employee_name,request_dates,status_value,context_value from public.leave_requests r where r.id=p_request_id;
  elsif lower(p_request_type)='wfh' then
    select r.employee_id,r.employee_name,format('%s to %s',r.date,coalesce(r.end_date,r.date)),r.status,r.approval_context
      into employee_id,employee_name,request_dates,status_value,context_value from public.wfh_requests r where r.id=p_request_id;
  elsif lower(p_request_type)='overtime' then
    select r.employee_id,r.employee_name,format('%s · %s to %s',r.date,r.start_time,r.end_time),r.status::text,r.approval_context
      into employee_id,employee_name,request_dates,status_value,context_value from public.ot_requests r where r.id=p_request_id;
  else
    raise exception 'Unsupported request type.' using errcode='22023';
  end if;
  if employee_id is null then raise exception 'Request not found.'; end if;
  if actor_id<>employee_id
    and not private.is_direct_reporting_manager(actor_id,employee_id)
    and not public.is_system_admin()
    and not exists (select 1 from public.time_request_approval_assignments a where a.request_type=lower(p_request_type) and a.request_id=p_request_id and a.approver_user_id=actor_id)
  then raise exception 'You are not authorized to prepare this approval email.' using errcode='42501'; end if;

  context_value:=case when context_value is null or context_value='{}'::jsonb
    then private.time_request_context(p_request_type,p_request_id) else context_value end;
  is_manager_stage:=status_value in ('Pending','PendingGM','WFH_PENDING_DEPT_HEAD_APPROVAL','WFH_PENDING_GM_APPROVAL','Submitted','PendingGM');
  if is_manager_stage then
    select coalesce(jsonb_agg(jsonb_build_object('id',manager.id,'name',manager.full_name,'email',manager.email)),'[]'::jsonb)
      into recipients
    from public.hris_users employee join public.hris_users manager
      on employee.reports_to in (manager.id::text,manager.auth_user_id::text,coalesce(manager.employee_id,''),manager.full_name)
    where employee.id=employee_id and lower(manager.status)='active';
  else
    select coalesce(jsonb_agg(jsonb_build_object('id',recipient.id,'name',recipient.full_name,'email',recipient.email)),'[]'::jsonb)
      into recipients
    from public.time_request_approval_assignments a join public.hris_users recipient on recipient.id=a.approver_user_id
    where a.request_type=lower(p_request_type) and a.request_id=p_request_id and a.status='Pending' and lower(recipient.status)='active';
  end if;

  select jsonb_build_object(
    'employeeName',employee_name,
    'requestLabel',case lower(p_request_type) when 'leave' then 'Leave request' when 'wfh' then 'WFH request' else 'Overtime request' end,
    'requestDates',request_dates,
    'businessUnit',coalesce(u.business_unit,'Not assigned'),
    'department',coalesce(u.department,'Not assigned'),
    'status',status_value,
    'context',coalesce(context_value,'{}'::jsonb),
    'link',format('/approvals?type=%s&item=%s',lower(p_request_type),p_request_id),
    'recipients',recipients
  ) into payload
  from public.hris_users u where u.id=employee_id;
  return payload;
end;
$$;

revoke all on function public.get_conditional_time_approval_config() from public,anon;
revoke all on function public.save_conditional_time_approval_config(jsonb,text) from public,anon;
revoke all on function public.process_time_request_approval(text,uuid,text,text) from public,anon;
revoke all on function public.get_time_approval_email_payload(text,uuid) from public,anon;
grant execute on function public.get_conditional_time_approval_config() to authenticated;
grant execute on function public.save_conditional_time_approval_config(jsonb,text) to authenticated;
grant execute on function public.process_time_request_approval(text,uuid,text,text) to authenticated;
grant execute on function public.get_time_approval_email_payload(text,uuid) to authenticated;

-- Backfill live pending work. Only requests above the configured thresholds
-- become Regine's escalated backlog. Requests already at BOD after a manager
-- approval but now below threshold are completed under the new manager-only rule.
do $$
declare
  item record;
  ctx jsonb;
  bod_required boolean;
  regine_id uuid;
  routed_count integer:=0;
  finalized_count integer:=0;
begin
  select id into regine_id from public.hris_users
  where lower(email)='regine@thenextperience.com' and lower(status)='active' limit 1;
  if regine_id is null or not private.is_time_approval_bod(regine_id) then
    raise exception 'Regine must be an active BOD before the approval backlog can be migrated.';
  end if;

  alter table public.leave_requests disable trigger guard_leave_status_transition;
  alter table public.leave_requests disable trigger enforce_conditional_leave_approval;
  alter table public.wfh_requests disable trigger guard_wfh_status_transition;
  alter table public.wfh_requests disable trigger enforce_conditional_wfh_approval;
  alter table public.ot_requests disable trigger guard_ot_status_transition;
  alter table public.ot_requests disable trigger enforce_conditional_ot_approval;

  for item in select id,status from public.leave_requests where status in ('Pending','PendingGM','PendingBOD') loop
    ctx:=private.time_request_context('leave',item.id); bod_required:=(ctx->>'requiresBod')::boolean;
    update public.leave_requests set approval_route=case when bod_required then 'BOD_REQUIRED' else 'MANAGER_ONLY' end,
      approval_reason=ctx->>'reason',approval_context=ctx,approval_routed_at=now() where id=item.id;
    if item.status='PendingBOD' then
      if bod_required then perform private.assign_time_request_approvers('leave',item.id,false); routed_count:=routed_count+1;
      else
        update public.leave_requests set status='Approved',history_log=coalesce(history_log,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
          'action','Approved','by','conditional-routing-migration','date',now(),'note','Finalized from legacy PendingBOD because the request is within the manager-only threshold.'
        )) where id=item.id;
        finalized_count:=finalized_count+1;
      end if;
    end if;
  end loop;

  for item in select id,status from public.wfh_requests where status in ('WFH_PENDING_DEPT_HEAD_APPROVAL','WFH_PENDING_GM_APPROVAL','WFH_PENDING_BOD_APPROVAL') loop
    ctx:=private.time_request_context('wfh',item.id); bod_required:=(ctx->>'requiresBod')::boolean;
    update public.wfh_requests set approval_route=case when bod_required then 'BOD_REQUIRED' else 'MANAGER_ONLY' end,
      approval_reason=ctx->>'reason',approval_context=ctx,approval_routed_at=now() where id=item.id;
    if item.status='WFH_PENDING_BOD_APPROVAL' then
      if bod_required then perform private.assign_time_request_approvers('wfh',item.id,false); routed_count:=routed_count+1;
      else
        update public.wfh_requests set status='WFH_FOR_TIMEKEEPING' where id=item.id;
        finalized_count:=finalized_count+1;
      end if;
    end if;
  end loop;

  for item in select id,status::text status from public.ot_requests where status::text in ('Submitted','PendingGM','PendingBOD') loop
    ctx:=private.time_request_context('overtime',item.id); bod_required:=(ctx->>'requiresBod')::boolean;
    update public.ot_requests set approval_route=case when bod_required then 'BOD_REQUIRED' else 'MANAGER_ONLY' end,
      approval_reason=ctx->>'reason',approval_context=ctx,approval_routed_at=now() where id=item.id;
    if item.status='PendingBOD' then
      if bod_required then perform private.assign_time_request_approvers('overtime',item.id,false); routed_count:=routed_count+1;
      else
        update public.ot_requests set status='Approved'::public.ot_status,updated_at=now(),
          history_log=coalesce(history_log,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
            'action','Approved','by','conditional-routing-migration','date',now(),'note','Finalized from legacy PendingBOD because weekly hours are within the manager-only threshold.'
          )) where id=item.id;
        finalized_count:=finalized_count+1;
      end if;
    end if;
  end loop;

  alter table public.leave_requests enable trigger guard_leave_status_transition;
  alter table public.leave_requests enable trigger enforce_conditional_leave_approval;
  alter table public.wfh_requests enable trigger guard_wfh_status_transition;
  alter table public.wfh_requests enable trigger enforce_conditional_wfh_approval;
  alter table public.ot_requests enable trigger guard_ot_status_transition;
  alter table public.ot_requests enable trigger enforce_conditional_ot_approval;

  insert into public.notifications(user_id,type,title,message,link,dedupe_key)
  values(regine_id::text,'APPROVAL_REQUIRED','Escalated approval backlog assigned',
    format('%s applicable Leave, WFH, and OT requests were assigned to your Approval Center. %s legacy requests within manager-only thresholds were finalized.',routed_count,finalized_count),
    '/approvals','conditional-time-backlog-20260824')
  on conflict(user_id,dedupe_key) do nothing;

  insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details)
  values(regine_id::text,'regine@thenextperience.com','MIGRATE','ConditionalApprovalBacklog','20260824',
    format('Assigned %s applicable escalated requests to Regine and finalized %s manager-only legacy requests. Kay and HR Manager are not assigned this backlog.',routed_count,finalized_count));
end;
$$;
