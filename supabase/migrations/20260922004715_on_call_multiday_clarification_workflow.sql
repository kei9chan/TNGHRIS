-- Multi-day on-call requests, clarification-in-place, and approved daily records.
alter table public.manpower_requests
  add column if not exists date_mode text not null default 'single',
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists coverage_days jsonb not null default '[]'::jsonb,
  add column if not exists coverage_day_count integer not null default 1,
  add column if not exists total_staff_days numeric not null default 0,
  add column if not exists attachment_url text,
  add column if not exists clarification_status text not null default 'none',
  add column if not exists clarification_question text,
  add column if not exists revision integer not null default 1;

update public.manpower_requests request
set start_date = coalesce(request.start_date, request.date_needed),
    end_date = coalesce(request.end_date, request.date_needed),
    date_mode = coalesce(request.date_mode, 'single'),
    coverage_days = case when jsonb_array_length(coalesce(request.coverage_days, '[]'::jsonb)) > 0 then request.coverage_days else
      jsonb_build_array(jsonb_build_object(
        'date', request.date_needed,
        'coverageRequired', true,
        'forecastedPax', coalesce(request.forecasted_pax, 0),
        'operationalContext', request.general_note,
        'reason', request.general_note,
        'items', coalesce(request.items, '[]'::jsonb),
        'totalStaff', coalesce((select sum(coalesce(nullif(item->>'onCallNeeded','')::numeric, nullif(item->>'requestedCount','')::numeric, 0)) from jsonb_array_elements(coalesce(request.items,'[]'::jsonb)) item), 0),
        'totalCost', coalesce(request.grand_total, 0)
      )) end,
    coverage_day_count = greatest(coalesce(request.coverage_day_count, 1), 1),
    total_staff_days = case when coalesce(request.total_staff_days, 0) > 0 then request.total_staff_days else
      coalesce((select sum(coalesce(nullif(item->>'onCallNeeded','')::numeric, nullif(item->>'requestedCount','')::numeric, 0)) from jsonb_array_elements(coalesce(request.items,'[]'::jsonb)) item), 0) end
where request.start_date is null
   or request.end_date is null
   or jsonb_array_length(coalesce(request.coverage_days, '[]'::jsonb)) = 0;

alter table public.manpower_requests
  alter column start_date set not null,
  alter column end_date set not null;

alter table public.manpower_requests drop constraint if exists manpower_requests_date_mode_check;
alter table public.manpower_requests add constraint manpower_requests_date_mode_check check(date_mode in ('single','range'));
alter table public.manpower_requests drop constraint if exists manpower_requests_date_range_check;
alter table public.manpower_requests add constraint manpower_requests_date_range_check check(end_date >= start_date);
alter table public.manpower_requests drop constraint if exists manpower_requests_clarification_status_check;
alter table public.manpower_requests add constraint manpower_requests_clarification_status_check check(clarification_status in ('none','requested','responded'));
alter table public.manpower_requests drop constraint if exists manpower_requests_coverage_days_array_check;
alter table public.manpower_requests add constraint manpower_requests_coverage_days_array_check check(jsonb_typeof(coverage_days)='array');

create table if not exists private.manpower_request_revisions(
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.manpower_requests(id) on delete cascade,
  revision integer not null,
  action text not null,
  actor_id uuid references public.hris_users(id),
  approval_stage text,
  question text,
  response text,
  snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(request_id, revision, action)
);
alter table private.manpower_request_revisions enable row level security;
revoke all on private.manpower_request_revisions from public, anon, authenticated;

create table if not exists public.on_call_daily_records(
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.manpower_requests(id) on delete cascade,
  coverage_date date not null,
  business_unit_id uuid not null references public.business_units(id),
  department_id uuid not null references public.departments(id),
  department_name text not null,
  required_fte numeric not null check(required_fte >= 0),
  reporting_fte numeric not null check(reporting_fte >= 0),
  on_call_needed numeric not null check(on_call_needed >= 0),
  shift_time text not null,
  rate_per_day numeric(12,2) not null check(rate_per_day >= 0),
  forecasted_pax integer not null default 0 check(forecasted_pax >= 0),
  operational_reason text not null,
  total_cost numeric(14,2) not null check(total_cost >= 0),
  status text not null default 'Approved' check(status in ('Approved','Cancelled')),
  approved_at timestamptz not null,
  approved_by uuid references public.hris_users(id),
  created_at timestamptz not null default clock_timestamp(),
  unique(request_id, coverage_date, department_id)
);
create index if not exists on_call_daily_records_date_bu_idx on public.on_call_daily_records(coverage_date,business_unit_id);
alter table public.on_call_daily_records enable row level security;
drop policy if exists on_call_daily_records_read on public.on_call_daily_records;
create policy on_call_daily_records_read on public.on_call_daily_records for select to authenticated using(
  exists(select 1 from public.manpower_requests request where request.id=request_id and (
    request.requester_id=public.current_hris_user_id()
    or public.is_system_admin()
    or public.has_active_role('HR Manager')
    or public.has_active_role('HR Staff')
    or public.has_active_role('Board of Director')
    or public.has_active_role('GeneralManager')
    or public.can_access_hris_user(request.requester_id)
  ))
);
revoke insert,update,delete,truncate on public.on_call_daily_records from public,anon,authenticated;
grant select on public.on_call_daily_records to authenticated;

create or replace function private.normalize_manpower_coverage_days(p_days jsonb,p_business_unit_id uuid,p_exclude_request uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  raw_day jsonb; raw_item jsonb; normalized_days jsonb:='[]'::jsonb; normalized_items jsonb;
  coverage_date date; coverage_required boolean; required_fte numeric; reporting_fte numeric; needed numeric; rate numeric;
  department_id uuid; department_name text; shift_time text; reason text; day_staff numeric; day_cost numeric;
  first_date date; last_date date; expected_count integer; actual_count integer:=0; seen_dates date[]:=array[]::date[]; seen_departments uuid[];
begin
  if p_business_unit_id is null then raise exception 'Select a valid Business Unit.' using errcode='22023';end if;
  if p_days is null or jsonb_typeof(p_days)<>'array' or jsonb_array_length(p_days)=0 then raise exception 'At least one coverage date is required.' using errcode='22023';end if;
  for raw_day in select value from jsonb_array_elements(p_days) loop
    coverage_date:=nullif(raw_day->>'date','')::date;
    if coverage_date is null or coverage_date=any(seen_dates) then raise exception 'Every included calendar date must appear exactly once.' using errcode='23505';end if;
    seen_dates:=array_append(seen_dates,coverage_date);actual_count:=actual_count+1;
    first_date:=least(coalesce(first_date,coverage_date),coverage_date);last_date:=greatest(coalesce(last_date,coverage_date),coverage_date);
    coverage_required:=coalesce((raw_day->>'coverageRequired')::boolean,true);
    normalized_items:='[]'::jsonb;day_staff:=0;day_cost:=0;seen_departments:=array[]::uuid[];
    if coverage_required then
      if jsonb_typeof(raw_day->'items')<>'array' or jsonb_array_length(raw_day->'items')=0 then raise exception 'Every coverage date needs at least one department.' using errcode='23514';end if;
      for raw_item in select value from jsonb_array_elements(raw_day->'items') loop
        department_id:=nullif(coalesce(raw_item->>'departmentId',raw_item->>'department_id'),'')::uuid;
        if department_id is null or department_id=any(seen_departments) then raise exception 'Each department may appear only once per coverage date.' using errcode='23505';end if;
        select department.name into department_name from public.departments department where department.id=department_id and department.business_unit_id=p_business_unit_id;
        if department_name is null then raise exception 'A coverage department does not belong to the selected Business Unit.' using errcode='23514';end if;
        seen_departments:=array_append(seen_departments,department_id);
        required_fte:=nullif(raw_item->>'requiredFte','')::numeric;reporting_fte:=coalesce(nullif(raw_item->>'reportingFte','')::numeric,0);
        if required_fte is null or required_fte<0 or reporting_fte<0 then raise exception 'Every coverage date needs a valid staff requirement.' using errcode='23514';end if;
        needed:=greatest(required_fte-reporting_fte,0);rate:=nullif(coalesce(raw_item->>'ratePerDay',raw_item->>'costPerHead'),'')::numeric;
        if rate is null or rate<=0 then raise exception 'A positive daily rate is required.' using errcode='23514';end if;
        shift_time:=nullif(btrim(raw_item->>'shiftTime'),'');if shift_time is null then raise exception 'Shift coverage is required.' using errcode='23514';end if;
        reason:=nullif(btrim(coalesce(raw_item->>'reason',raw_item->>'justification',raw_day->>'reason')),'');
        if needed>0 and reason is null then raise exception 'Explain the operational reason for every date with on-call coverage.' using errcode='23514';end if;
        if exists(select 1 from public.manpower_requests request cross join lateral jsonb_array_elements(request.coverage_days) day cross join lateral jsonb_array_elements(day->'items') item
          where request.id is distinct from p_exclude_request and request.business_unit_id=p_business_unit_id and request.status in('Pending','Approved')
          and coalesce((day->>'coverageRequired')::boolean,true) and (day->>'date')::date=coverage_date
          and coalesce(item->>'departmentId',item->>'department_id')=department_id::text) then
          raise exception 'An approved or pending on-call request already overlaps this department and date.' using errcode='23P01';
        end if;
        normalized_items:=normalized_items||jsonb_build_array(raw_item||jsonb_build_object('departmentId',department_id,'departmentName',department_name,'requiredFte',required_fte,'reportingFte',reporting_fte,'onCallNeeded',needed,'currentFte',reporting_fte,'requestedCount',needed,'ratePerDay',rate,'costPerHead',rate,'totalItemCost',needed*rate,'shiftTime',shift_time,'reason',coalesce(reason,''),'justification',coalesce(reason,'')));
        day_staff:=day_staff+needed;day_cost:=day_cost+(needed*rate);
      end loop;
    end if;
    normalized_days:=normalized_days||jsonb_build_array(raw_day||jsonb_build_object('date',coverage_date,'coverageRequired',coverage_required,'forecastedPax',greatest(coalesce(nullif(raw_day->>'forecastedPax','')::integer,0),0),'items',normalized_items,'totalStaff',day_staff,'totalCost',day_cost));
  end loop;
  expected_count:=(last_date-first_date)+1;
  if actual_count<>expected_count then raise exception 'Every calendar date in the selected range must be included and explicitly marked Coverage required or No coverage needed.' using errcode='23514';end if;
  return normalized_days;
end $$;
revoke all on function private.normalize_manpower_coverage_days(jsonb,uuid,uuid) from public,anon,authenticated;

create or replace function public.create_manpower_request_v2(p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); actor_row public.hris_users; new_request_id uuid:=gen_random_uuid(); days jsonb; v_start_date date; v_end_date date; first_day jsonb; totals record;
begin
  if actor is null or not public.has_feature_permission('Manpower','create') or not public.has_workflow_permission('Manpower','submit') then raise exception 'You are not authorized to submit on-call requests.' using errcode='42501';end if;
  select * into strict actor_row from public.hris_users where id=actor and lower(status)='active';
  v_start_date:=nullif(p_request->>'startDate','')::date;v_end_date:=nullif(p_request->>'endDate','')::date;
  if v_start_date is null or v_end_date is null or v_end_date<v_start_date then raise exception 'The end date must be on or after the start date.' using errcode='22023';end if;
  days:=private.normalize_manpower_coverage_days(p_request->'coverageDays',(p_request->>'businessUnitId')::uuid,null);
  if jsonb_array_length(days)<>(v_end_date-v_start_date)+1 or (days->0->>'date')::date<>v_start_date or (days->(jsonb_array_length(days)-1)->>'date')::date<>v_end_date then raise exception 'The coverage dates must exactly match the selected inclusive date range.' using errcode='23514';end if;
  select count(*) filter(where coalesce((day->>'coverageRequired')::boolean,true)) as coverage_count,coalesce(sum((day->>'totalStaff')::numeric),0) as staff_days,coalesce(sum((day->>'totalCost')::numeric),0) as total_cost
    into totals from jsonb_array_elements(days) day;
  select day into first_day from jsonb_array_elements(days) day where coalesce((day->>'coverageRequired')::boolean,true) order by (day->>'date')::date limit 1;
  if first_day is null then raise exception 'Mark at least one date as Coverage required.' using errcode='23514';end if;
  insert into public.manpower_requests(id,business_unit_id,business_unit_name,requester_id,requester_name,date_needed,date_mode,start_date,end_date,coverage_days,coverage_day_count,total_staff_days,forecasted_pax,general_note,attachment_url,items,grand_total,status,department_id,clarification_status,revision)
  values(new_request_id,(p_request->>'businessUnitId')::uuid,p_request->>'businessUnitName',actor,actor_row.full_name,v_start_date,case when v_start_date=v_end_date then 'single' else 'range' end,v_start_date,v_end_date,days,totals.coverage_count,totals.staff_days,coalesce((days->0->>'forecastedPax')::integer,0),nullif(btrim(p_request->>'generalNote'),''),nullif(btrim(p_request->>'attachmentUrl'),''),first_day->'items',totals.total_cost,'Pending',nullif(first_day->'items'->0->>'departmentId','')::uuid,'none',1);
  insert into private.manpower_request_revisions(request_id,revision,action,actor_id,approval_stage,snapshot) select new_request_id,1,'Submitted',actor,stored.approval_stage,to_jsonb(stored) from public.manpower_requests stored where stored.id=new_request_id;
  return jsonb_build_object('requestId',new_request_id);
end $$;
revoke all on function public.create_manpower_request_v2(jsonb) from public,anon;
grant execute on function public.create_manpower_request_v2(jsonb) to authenticated;

create or replace function public.request_manpower_clarification(p_request_id uuid,p_question text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); request public.manpower_requests; actor_name text; question text:=nullif(btrim(p_question),'');
begin
  if question is null then raise exception 'Enter a specific clarification question.' using errcode='22023';end if;
  select * into strict request from public.manpower_requests where id=p_request_id for update;
  if request.status<>'Pending' or request.clarification_status='requested' then raise exception 'This request is not available for clarification.' using errcode='40901';end if;
  if request.requester_id=actor or not private.is_manpower_active_approver(actor,request.id) then raise exception 'Only the assigned reviewer can request clarification.' using errcode='42501';end if;
  select full_name into actor_name from public.hris_users where id=actor;
  insert into private.manpower_request_revisions(request_id,revision,action,actor_id,approval_stage,question,snapshot) values(request.id,request.revision,'Clarification requested',actor,request.approval_stage,question,to_jsonb(request));
  perform set_config('app.manpower_workflow_mutation','on',true);
  update public.manpower_requests set clarification_status='requested',clarification_question=question,approval_issue='Clarification requested',approval_history=coalesce(approval_history,'[]')||jsonb_build_array(jsonb_build_object('stage',request.approval_stage,'action','Clarification requested','approverName',actor_name,'approverRole',private.manpower_role_label(actor),'timestamp',clock_timestamp(),'comments',question,'revision',request.revision)) where id=request.id;
  insert into public.notifications(user_id,type,title,message,link,is_read,related_entity_id,dedupe_key) values(request.requester_id::text,'MANPOWER_CLARIFICATION_REQUESTED','On-Call Request Needs Clarification',question,'/payroll/manpower-planning?requestId='||request.id,false,request.id::text,format('manpower:%s:clarification:%s',request.id,request.revision)) on conflict(user_id,dedupe_key) do nothing;
end $$;
revoke all on function public.request_manpower_clarification(uuid,text) from public,anon;
grant execute on function public.request_manpower_clarification(uuid,text) to authenticated;

create or replace function public.respond_manpower_request_clarification(p_request_id uuid,p_response text,p_request jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); request public.manpower_requests; days jsonb; v_start_date date;v_end_date date;first_day jsonb;response text:=nullif(btrim(p_response),'');totals record;
begin
  if response is null then raise exception 'Answer the approver clarification question.' using errcode='22023';end if;
  select * into strict request from public.manpower_requests where id=p_request_id for update;
  if request.requester_id<>actor or request.status<>'Pending' or request.clarification_status<>'requested' then raise exception 'Only the requester can respond to the active clarification.' using errcode='42501';end if;
  v_start_date:=nullif(p_request->>'startDate','')::date;v_end_date:=nullif(p_request->>'endDate','')::date;
  if v_start_date is null or v_end_date is null or v_end_date<v_start_date then raise exception 'The end date must be on or after the start date.' using errcode='22023';end if;
  days:=private.normalize_manpower_coverage_days(p_request->'coverageDays',request.business_unit_id,request.id);
  if jsonb_array_length(days)<>(v_end_date-v_start_date)+1 then raise exception 'Every date in the inclusive range must remain visible.' using errcode='23514';end if;
  select count(*) filter(where coalesce((day->>'coverageRequired')::boolean,true)) as coverage_count,coalesce(sum((day->>'totalStaff')::numeric),0) as staff_days,coalesce(sum((day->>'totalCost')::numeric),0) as total_cost into totals from jsonb_array_elements(days) day;
  select day into first_day from jsonb_array_elements(days) day where coalesce((day->>'coverageRequired')::boolean,true) order by(day->>'date')::date limit 1;
  insert into private.manpower_request_revisions(request_id,revision,action,actor_id,approval_stage,question,response,snapshot) values(request.id,request.revision,'Requester response',actor,request.approval_stage,request.clarification_question,response,to_jsonb(request));
  perform set_config('app.manpower_workflow_mutation','on',true);
  update public.manpower_requests set date_needed=v_start_date,date_mode=case when v_start_date=v_end_date then 'single' else 'range' end,start_date=v_start_date,end_date=v_end_date,coverage_days=days,coverage_day_count=totals.coverage_count,total_staff_days=totals.staff_days,forecasted_pax=coalesce((days->0->>'forecastedPax')::integer,0),general_note=nullif(btrim(p_request->>'generalNote'),''),attachment_url=nullif(btrim(p_request->>'attachmentUrl'),''),items=first_day->'items',grand_total=totals.total_cost,department_id=nullif(first_day->'items'->0->>'departmentId','')::uuid,clarification_status='responded',clarification_question=null,approval_issue=null,revision=request.revision+1,approval_history=coalesce(approval_history,'[]')||jsonb_build_array(jsonb_build_object('stage',request.approval_stage,'action','Requester responded','approverName',request.requester_name,'approverRole','Requester','timestamp',clock_timestamp(),'comments',response,'revision',request.revision+1)) where id=request.id;
  insert into public.notifications(user_id,type,title,message,link,is_read,related_entity_id,dedupe_key) select assignment.approver_user_id::text,'MANPOWER_CLARIFICATION_RESPONSE','On-Call Clarification Received',format('%s responded to your clarification request.',request.requester_name),'/approvals?type=manpower&item='||request.id,false,request.id::text,format('manpower:%s:clarification-response:%s:%s',request.id,request.revision+1,assignment.approver_user_id) from public.manpower_request_approval_assignments assignment where assignment.request_id=request.id and assignment.approval_stage=request.approval_stage and assignment.status='Pending' on conflict(user_id,dedupe_key) do nothing;
end $$;
revoke all on function public.respond_manpower_request_clarification(uuid,text,jsonb) from public,anon;
grant execute on function public.respond_manpower_request_clarification(uuid,text,jsonb) to authenticated;

create or replace function private.activate_manpower_daily_records() returns trigger
language plpgsql security definer set search_path='' as $$
declare day jsonb;item jsonb;
begin
  if new.status='Approved' and old.status is distinct from 'Approved' then
    for day in select value from jsonb_array_elements(new.coverage_days) loop
      if coalesce((day->>'coverageRequired')::boolean,true) then
        for item in select value from jsonb_array_elements(day->'items') loop
          insert into public.on_call_daily_records(request_id,coverage_date,business_unit_id,department_id,department_name,required_fte,reporting_fte,on_call_needed,shift_time,rate_per_day,forecasted_pax,operational_reason,total_cost,approved_at,approved_by)
          values(new.id,(day->>'date')::date,new.business_unit_id,(item->>'departmentId')::uuid,coalesce(item->>'departmentName','Department'),(item->>'requiredFte')::numeric,(item->>'reportingFte')::numeric,(item->>'onCallNeeded')::numeric,item->>'shiftTime',(item->>'ratePerDay')::numeric,coalesce((day->>'forecastedPax')::integer,0),coalesce(nullif(item->>'reason',''),nullif(day->>'reason',''),'Operational coverage'),(item->>'totalItemCost')::numeric,new.approved_at,new.approved_by)
          on conflict(request_id,coverage_date,department_id) do nothing;
        end loop;
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function private.activate_manpower_daily_records() from public,anon,authenticated;
drop trigger if exists activate_manpower_daily_records on public.manpower_requests;
create trigger activate_manpower_daily_records after update of status on public.manpower_requests for each row execute function private.activate_manpower_daily_records();

create or replace function public.get_my_pending_manpower_approval_ids()
returns table(request_id uuid,approval_stage text) language sql stable security definer set search_path='' as $$
 select assignment.request_id,assignment.approval_stage from public.manpower_request_approval_assignments assignment join public.manpower_requests request on request.id=assignment.request_id
 where assignment.approver_user_id=public.current_hris_user_id() and assignment.status='Pending' and request.status='Pending' and request.approval_stage=assignment.approval_stage and request.clarification_status<>'requested' order by assignment.assigned_at
$$;
revoke all on function public.get_my_pending_manpower_approval_ids() from public,anon;
grant execute on function public.get_my_pending_manpower_approval_ids() to authenticated;

notify pgrst,'reload schema';
