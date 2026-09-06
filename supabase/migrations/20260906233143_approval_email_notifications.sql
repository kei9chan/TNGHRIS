-- Additive notification layer. Queue queries are extracted without changing their routing rules.
create function public.approval_email_actor_allowed(p_actor uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select p_actor is not null and (p_actor=public.current_hris_user_id() or auth.role()='service_role');
$$;
revoke all on function public.approval_email_actor_allowed(uuid) from public,anon;
grant execute on function public.approval_email_actor_allowed(uuid) to authenticated,service_role;
create function public.get_my_pending_job_requisition_approvals_for_actor(p_actor uuid)
 RETURNS TABLE(id uuid, req_code text, title text, business_unit_id uuid, department_id uuid, status text, created_at timestamp with time zone, current_step text, step_order integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select * from (with actor as (
    select p_actor as id
    where public.approval_email_actor_allowed(p_actor)
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
  order by requisition.created_at desc) scoped where public.approval_email_actor_allowed(p_actor);
$function$;
revoke all on function public.get_my_pending_job_requisition_approvals_for_actor(uuid) from public,anon;
grant execute on function public.get_my_pending_job_requisition_approvals_for_actor(uuid) to authenticated,service_role;

create function public.get_my_pending_manpower_approval_ids_for_actor(p_actor uuid)
 RETURNS TABLE(request_id uuid, approval_stage text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select * from (select assignment.request_id, assignment.approval_stage
  from public.manpower_request_approval_assignments assignment
  join public.manpower_requests request on request.id = assignment.request_id
  where assignment.approver_user_id = p_actor
    and assignment.status = 'Pending'
    and request.status = 'Pending'
    and request.approval_stage = assignment.approval_stage
  order by assignment.assigned_at asc) scoped where public.approval_email_actor_allowed(p_actor);
$function$;
revoke all on function public.get_my_pending_manpower_approval_ids_for_actor(uuid) from public,anon;
grant execute on function public.get_my_pending_manpower_approval_ids_for_actor(uuid) to authenticated,service_role;

create function public.get_my_asset_request_approval_queue_for_actor(p_actor uuid)
 RETURNS TABLE(request_id uuid, employee_id uuid, employee_name text, asset_description text, requested_at timestamp with time zone, business_unit_id uuid, department_id uuid, approval_stage text, current_step text, required_bod_approvals smallint, bod_approval_count smallint, approval_progress text, is_actionable boolean, viewer_action_status text, approval_issue text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select * from (with actor as (
    select viewer.id, private.is_asset_request_bod(viewer.id) as is_bod
    from public.hris_users viewer
    where viewer.id = p_actor
      and lower(btrim(coalesce(viewer.status, ''))) = 'active'
  )
  select request.id,
         request.employee_id,
         request.employee_name,
         request.asset_description,
         request.requested_at,
         employee.business_unit_id,
         employee.department_id,
         request.approval_stage,
         case
           when request.approval_stage = 'DIRECT_MANAGER' and request.manager_id = actor.id then 'Direct Manager Approval'
           when request.approval_stage = 'DIRECT_MANAGER' then 'Waiting for Direct Manager Approval'
           when request.approval_stage = 'BOD' and coalesce(viewer_assignment.status, '') = 'Approved' then 'Waiting for remaining BOD approval'
           else 'BOD Approval'
         end,
         request.required_bod_approvals,
         request.bod_approval_count,
         format('%s of %s BOD approvals', request.bod_approval_count, request.required_bod_approvals),
         case
           when request.approval_stage = 'DIRECT_MANAGER' then request.manager_id = actor.id and coalesce(viewer_assignment.status, 'Pending') = 'Pending'
           when request.approval_stage = 'BOD' then coalesce(viewer_assignment.status, '') = 'Pending'
           else false
         end,
         viewer_assignment.status,
         request.approval_issue
  from public.asset_requests request
  join public.hris_users employee on employee.id = request.employee_id
  cross join actor
  left join lateral (
    select assignment.status
    from public.asset_request_approval_assignments assignment
    where assignment.request_id = request.id
      and assignment.approval_stage = request.approval_stage
      and assignment.approver_user_id = actor.id
    order by assignment.assigned_at desc, assignment.id
    limit 1
  ) viewer_assignment on true
  where request.request_type::text = 'Request'
    and request.status::text = 'Pending'
    and request.approval_stage in ('DIRECT_MANAGER', 'BOD')
    and (
      (request.approval_stage = 'DIRECT_MANAGER' and request.manager_id = actor.id)
      or actor.is_bod
    )
  order by request.requested_at desc, request.id) scoped where public.approval_email_actor_allowed(p_actor);
$function$;
revoke all on function public.get_my_asset_request_approval_queue_for_actor(uuid) from public,anon;
grant execute on function public.get_my_asset_request_approval_queue_for_actor(uuid) to authenticated,service_role;

create function public.get_my_pending_time_approval_ids_for_actor(p_actor uuid)
 RETURNS TABLE(request_type text, request_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select * from (with actor as (
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
  select request_type, request_id from manager_queue) scoped where public.approval_email_actor_allowed(p_actor);
$function$;
revoke all on function public.get_my_pending_time_approval_ids_for_actor(uuid) from public,anon;
grant execute on function public.get_my_pending_time_approval_ids_for_actor(uuid) to authenticated,service_role;

create function public.get_my_pending_offer_approval_ids_for_actor(p_actor uuid)
 RETURNS TABLE(request_id uuid, offer_id uuid, approval_stage text, assigned_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select * from (select assignment.request_id, request.offer_id, assignment.approval_stage, assignment.assigned_at
  from public.job_offer_approval_assignments assignment
  join public.job_offer_approval_requests request on request.id = assignment.request_id
  where assignment.approver_user_id = p_actor
    and assignment.status = 'Pending'
    and request.status = 'Pending Approval'
    and request.approval_stage = assignment.approval_stage
  order by assignment.assigned_at asc) scoped where public.approval_email_actor_allowed(p_actor);
$function$;
revoke all on function public.get_my_pending_offer_approval_ids_for_actor(uuid) from public,anon;
grant execute on function public.get_my_pending_offer_approval_ids_for_actor(uuid) to authenticated,service_role;

create function public.get_my_pending_nte_approvals_for_actor(p_actor uuid)
 RETURNS TABLE(id uuid, incident_report_id uuid, recipient_employee_id uuid, recipient_name text, response_deadline timestamp with time zone, status text, created_at timestamp with time zone, updated_at timestamp with time zone, nte_number text, nte_code text, approval_id uuid, approval_role text, approval_assigned_at timestamp with time zone, case_number integer, category text, business_unit_id uuid, business_unit_name text, assigned_to_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select * from (select n.id, n.incident_report_id, n.recipient_employee_id,
         coalesce(n.recipient_name_snapshot, n.recipient_names[1]),
         n.response_deadline, n.status::text, n.created_at, n.updated_at,
         n.nte_number, n.nte_code, a.id, a.role_snapshot, a.assigned_at,
         ir.case_number, ir.category, ir.business_unit_id, ir.business_unit_name,
         ir.assigned_to_name
  from public.nte_approvals a
  join public.ntes n on n.id = a.nte_id
  join public.incident_reports ir on ir.id = n.incident_report_id
  where a.approver_user_id = p_actor
    and a.status = 'Pending'
    and n.status = 'PendingApproval'::public.nte_status
  order by a.assigned_at desc) scoped where public.approval_email_actor_allowed(p_actor);
$function$;
revoke all on function public.get_my_pending_nte_approvals_for_actor(uuid) from public,anon;
grant execute on function public.get_my_pending_nte_approvals_for_actor(uuid) to authenticated,service_role;
CREATE OR REPLACE FUNCTION public.get_my_pending_job_requisition_approvals()
 RETURNS TABLE(id uuid, req_code text, title text, business_unit_id uuid, department_id uuid, status text, created_at timestamp with time zone, current_step text, step_order integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select * from public.get_my_pending_job_requisition_approvals_for_actor(public.current_hris_user_id()); $function$;

CREATE OR REPLACE FUNCTION public.get_my_pending_manpower_approval_ids()
 RETURNS TABLE(request_id uuid, approval_stage text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select * from public.get_my_pending_manpower_approval_ids_for_actor(public.current_hris_user_id()); $function$;

CREATE OR REPLACE FUNCTION public.get_my_asset_request_approval_queue()
 RETURNS TABLE(request_id uuid, employee_id uuid, employee_name text, asset_description text, requested_at timestamp with time zone, business_unit_id uuid, department_id uuid, approval_stage text, current_step text, required_bod_approvals smallint, bod_approval_count smallint, approval_progress text, is_actionable boolean, viewer_action_status text, approval_issue text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select * from public.get_my_asset_request_approval_queue_for_actor(public.current_hris_user_id()); $function$;

CREATE OR REPLACE FUNCTION public.get_my_pending_time_approval_ids()
 RETURNS TABLE(request_type text, request_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select * from public.get_my_pending_time_approval_ids_for_actor(public.current_hris_user_id()); $function$;

CREATE OR REPLACE FUNCTION public.get_my_pending_offer_approval_ids()
 RETURNS TABLE(request_id uuid, offer_id uuid, approval_stage text, assigned_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$ select * from public.get_my_pending_offer_approval_ids_for_actor(public.current_hris_user_id()); $function$;

CREATE OR REPLACE FUNCTION public.get_my_pending_nte_approvals()
 RETURNS TABLE(id uuid, incident_report_id uuid, recipient_employee_id uuid, recipient_name text, response_deadline timestamp with time zone, status text, created_at timestamp with time zone, updated_at timestamp with time zone, nte_number text, nte_code text, approval_id uuid, approval_role text, approval_assigned_at timestamp with time zone, case_number integer, category text, business_unit_id uuid, business_unit_name text, assigned_to_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select * from public.get_my_pending_nte_approvals_for_actor(public.current_hris_user_id()); $function$;
create function public.get_actionable_approval_tasks_for_actor(p_actor uuid)
returns table(request_type text,request_id uuid,type_label text)
language sql stable security invoker set search_path='' as $$
 with tasks as (
 select q.request_type,q.request_id,initcap(q.request_type)||' Requests' as type_label
 from public.get_my_pending_time_approval_ids_for_actor(p_actor) q
 where (q.request_type='leave' and exists(select 1 from public.leave_requests r where r.id=q.request_id and r.status::text in ('Pending','PendingGM','PendingBOD')))
 or (q.request_type='wfh' and exists(select 1 from public.wfh_requests r where r.id=q.request_id and r.status::text in ('WFH_PENDING_DEPT_HEAD_APPROVAL','WFH_PENDING_GM_APPROVAL','WFH_PENDING_BOD_APPROVAL','WFH_FOR_TIMEKEEPING')))
 or (q.request_type='overtime' and exists(select 1 from public.ot_requests r where r.id=q.request_id and r.status::text in ('Submitted','PendingGM','PendingBOD')))
 union all select 'manpower',request_id,'Manpower Requests' from public.get_my_pending_manpower_approval_ids_for_actor(p_actor)
 union all select 'nte',id,'NTE Approvals' from public.get_my_pending_nte_approvals_for_actor(p_actor)
 union all select 'requisition',id,'Job Requisitions' from public.get_my_pending_job_requisition_approvals_for_actor(p_actor)
 union all select 'offer',request_id,'Offer Approvals' from public.get_my_pending_offer_approval_ids_for_actor(p_actor)
 union all select 'asset',request_id,'Asset Requests' from public.get_my_asset_request_approval_queue_for_actor(p_actor) where is_actionable
 union all select 'pan',p.id,'Personnel Actions' from public.pans p
 where p.status::text='Pending Approval' and exists(select 1 from jsonb_array_elements(coalesce(p.routing_steps,'[]')) s where s->>'userId'=p_actor::text and s->>'status'='Pending')
 union all select 'award',a.id,'Award Approvals' from public.employee_awards a
 where a.status::text in ('PendingApproval','Pending Approval') and exists(select 1 from jsonb_array_elements(coalesce(a.approver_steps,'[]')) s where s->>'userId'=p_actor::text and lower(s->>'status')='pending')
 ) select distinct t.request_type,t.request_id,t.type_label from tasks t
 where public.approval_email_actor_allowed(p_actor) and exists(select 1 from public.hris_users h where h.id=p_actor and lower(h.status)='active' and not coalesce(h.is_duplicate,false));
$$;
revoke all on function public.get_actionable_approval_tasks_for_actor(uuid) from public,anon;
grant execute on function public.get_actionable_approval_tasks_for_actor(uuid) to authenticated,service_role;
create function public.get_my_actionable_approval_tasks() returns table(request_type text,request_id uuid,type_label text)
language sql stable security invoker set search_path='' as $$select * from public.get_actionable_approval_tasks_for_actor(public.current_hris_user_id())$$;
revoke all on function public.get_my_actionable_approval_tasks() from public,anon;
grant execute on function public.get_my_actionable_approval_tasks() to authenticated;
create table public.approval_email_settings (
 singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 updated_by uuid references public.hris_users(id),updated_at timestamptz not null default clock_timestamp()
);
insert into public.approval_email_settings(singleton) values(true);
create table public.approval_email_runs (
 id uuid primary key default gen_random_uuid(),scheduled_date date not null,
 started_at timestamptz not null default clock_timestamp(),finished_at timestamptz,
 status text not null default 'running' check(status in('running','completed','partial','failed')),
 sent integer not null default 0,failed integer not null default 0,skipped integer not null default 0,
 error_summary text
);
create table public.approval_email_deliveries (
 id uuid primary key default gen_random_uuid(),notification_type text not null check(notification_type in('approval-digest','approval-test')),
 scheduled_date date not null,recipient_user_id uuid not null references public.hris_users(id),recipient_email text,
 pending_count integer not null default 0,status text not null check(status in('sending','sent','failed','skipped')),
 idempotency_key text not null unique,resend_message_id text,attempted_at timestamptz not null default clock_timestamp(),
 sent_at timestamptz,error_summary text,run_id uuid references public.approval_email_runs(id),
 lease_token uuid,lease_until timestamptz,payload jsonb,first_attempt_at timestamptz not null default clock_timestamp()
);
create unique index approval_email_daily_recipient on public.approval_email_deliveries(notification_type,scheduled_date,recipient_user_id) where notification_type='approval-digest';
create index approval_email_run_delivery on public.approval_email_deliveries(run_id);
create index approval_email_recent_runs on public.approval_email_runs(started_at desc);
create index approval_email_recipient on public.approval_email_deliveries(recipient_user_id,attempted_at desc);
alter table public.approval_email_settings enable row level security;
alter table public.approval_email_runs enable row level security;
alter table public.approval_email_deliveries enable row level security;
revoke all on public.approval_email_settings,public.approval_email_runs,public.approval_email_deliveries from public,anon,authenticated;
grant select,insert,update on public.approval_email_settings,public.approval_email_runs,public.approval_email_deliveries to service_role;

create function public.get_approval_email_admin() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare h public.hris_users;begin
 select * into h from public.hris_users where id=public.current_hris_user_id();
 if not coalesce(public.is_system_admin(),false) or lower(coalesce(h.status,''))<>'active' or coalesce(h.is_duplicate,false) then raise exception 'Active Admin access required' using errcode='42501';end if;
 return jsonb_build_object('id',h.id,'email',h.email,'name',h.full_name,'enabled',(select enabled from public.approval_email_settings),
 'lastSuccessfulRun',(select finished_at from public.approval_email_runs where status='completed' order by finished_at desc limit 1),
 'lastRun',(select to_jsonb(r) from public.approval_email_runs r order by started_at desc limit 1),
 'deliveries',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from (select notification_type,scheduled_date,recipient_user_id,recipient_email,pending_count,status,resend_message_id,attempted_at,sent_at,error_summary from public.approval_email_deliveries order by attempted_at desc limit 100) d));
end $$;
create function public.set_approval_email_enabled(p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$begin
 perform public.get_approval_email_admin();
 if p_enabled is null then raise exception 'Enabled value required';end if;
 update public.approval_email_settings set enabled=p_enabled,updated_by=public.current_hris_user_id(),updated_at=clock_timestamp();
end $$;
revoke all on function public.get_approval_email_admin(),public.set_approval_email_enabled(boolean) from public,anon;
grant execute on function public.get_approval_email_admin(),public.set_approval_email_enabled(boolean) to authenticated;

-- Privileged access exists only in the protected server worker; no JWT claims are changed.
create function public.get_approval_email_recipient(p_user_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.hris_users;groups jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server access required' using errcode='42501';end if;
 select * into h from public.hris_users where id=p_user_id;
 if h.id is null then return null;end if;
 if lower(coalesce(h.status,''))<>'active' or coalesce(h.is_duplicate,false) or h.auth_user_id is null then return jsonb_build_object('id',h.id,'skip','Inactive or unlinked account');end if;
 select coalesce(jsonb_agg(jsonb_build_object('type',request_type,'label',type_label,'count',n)),'[]') into groups
 from (select request_type,type_label,count(*) n from public.get_actionable_approval_tasks_for_actor(h.id) group by request_type,type_label) q;
 return jsonb_build_object('id',h.id,'email',h.email,'name',h.full_name,'groups',groups);
end $$;
revoke all on function public.get_approval_email_recipient(uuid) from public,anon,authenticated;
grant execute on function public.get_approval_email_recipient(uuid) to service_role;

create function public.claim_approval_email(p_key text,p_user uuid,p_date date,p_type text,p_email text,p_count integer,p_payload jsonb,p_run uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.approval_email_deliveries;token uuid:=gen_random_uuid();begin
 if p_date<>(clock_timestamp() at time zone 'Asia/Manila')::date then raise exception 'Only the current Manila date can be sent';end if;
 if p_type='approval-digest' and (extract(isodow from p_date)>5 or extract(hour from clock_timestamp() at time zone 'Asia/Manila')<8 or not (select enabled from public.approval_email_settings)) then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key,0));
 select * into d from public.approval_email_deliveries where idempotency_key=p_key for update;
 if d.payload is not null and d.recipient_email is distinct from p_email then return null;end if;
 if d.status='sent' or (d.status='sending' and d.lease_until>clock_timestamp()) then return null;end if;
 -- Keep retries inside Resend's 24-hour idempotency window, and preserve the original payload.
 if d.id is not null and d.first_attempt_at<clock_timestamp()-interval '23 hours' then return null;end if;
 if p_type='approval-test' and d.id is null and exists(select 1 from public.approval_email_deliveries where recipient_user_id=p_user and notification_type='approval-test' and attempted_at>clock_timestamp()-interval '1 minute') then raise exception 'Wait one minute before sending another test';end if;
 if d.id is null then
 insert into public.approval_email_deliveries(notification_type,scheduled_date,recipient_user_id,recipient_email,pending_count,status,idempotency_key,run_id,lease_token,lease_until,payload)
 values(p_type,p_date,p_user,p_email,p_count,'sending',p_key,p_run,token,clock_timestamp()+interval '2 minutes',p_payload) returning * into d;
 else
 update public.approval_email_deliveries set payload=coalesce(payload,p_payload),recipient_email=coalesce(recipient_email,p_email),pending_count=case when payload is null then p_count else pending_count end,status='sending',attempted_at=clock_timestamp(),run_id=p_run,lease_token=token,lease_until=clock_timestamp()+interval '2 minutes',error_summary=null where id=d.id returning * into d;
 end if;
 return jsonb_build_object('id',d.id,'token',token,'payload',d.payload,'key',d.idempotency_key);
end $$;
revoke all on function public.claim_approval_email(text,uuid,date,text,text,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.claim_approval_email(text,uuid,date,text,text,integer,jsonb,uuid) to service_role;

create function public.start_approval_email_run() returns uuid language plpgsql security definer set search_path='' as $$
declare d date:=(clock_timestamp() at time zone 'Asia/Manila')::date;r uuid;begin
 perform pg_advisory_xact_lock(hashtextextended('approval-email-run:'||d,0));
 if extract(isodow from d)>5 or extract(hour from clock_timestamp() at time zone 'Asia/Manila')<8 or not (select enabled from public.approval_email_settings) then return null;end if;
 if exists(select 1 from public.approval_email_runs where scheduled_date=d and status='running' and started_at>clock_timestamp()-interval '6 minutes') then return null;end if;
 update public.approval_email_runs set status='failed',finished_at=clock_timestamp(),error_summary='Interrupted run; retrying unsent recipients' where scheduled_date=d and status='running';
 insert into public.approval_email_runs(scheduled_date) values(d) returning id into r;return r;
end $$;
revoke all on function public.start_approval_email_run() from public,anon,authenticated;
grant execute on function public.start_approval_email_run() to service_role;
