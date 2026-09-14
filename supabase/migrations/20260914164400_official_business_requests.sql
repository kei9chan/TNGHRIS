set local lock_timeout='2s';
set local statement_timeout='25s';
create table public.official_business_requests(
 id uuid primary key, reference text not null unique default ('OB-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(gen_random_uuid()::text,1,8))),
 employee_id uuid not null references public.hris_users(id), business_unit_id uuid, head_id uuid,
 status text not null default 'Draft' check(status in('Draft','Pending Approval','Approved','Rejected','Cancelled','Completed','For Review')),
 approval_step text not null default 'none' check(approval_step in('none','head','hr')), revision integer not null default 1,
 work_date date, starts_at timestamptz, ends_at timestamptz, destination text, latitude double precision,longitude double precision,radius_metres integer default 100,
 purpose text,client_event text,travel_minutes integer not null default 0,override_schedule boolean not null default false,
 supporting_required boolean not null default false,documents jsonb not null default '[]',
 head_approved_at timestamptz,head_approved_by uuid,approved_at timestamptz,hr_approved_by uuid,
 original_schedule jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),last_reason text,
 check(travel_minutes between 0 and 1440),check(radius_metres between 50 and 2000),check(jsonb_typeof(documents)='array' and jsonb_array_length(documents)<=10)
);
create index official_business_employee_day on public.official_business_requests(employee_id,work_date,status);
create index official_business_head_queue on public.official_business_requests(head_id,status,approval_step);
create table public.official_business_audit(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.official_business_requests(id),
 actor_id uuid not null,action text not null,reason text,occurred_at timestamptz not null default now(),before_record jsonb,after_record jsonb
);
create index official_business_audit_request on public.official_business_audit(request_id,occurred_at);
create table public.official_business_punch_audits(
 id uuid primary key,ob_id uuid not null references public.official_business_requests(id),employee_id uuid not null,
 action text not null,attempted_at timestamptz not null default clock_timestamp(),recorded boolean not null,event_id uuid,
 latitude double precision,longitude double precision,accuracy double precision,distance_metres double precision,
 selfie_path text,reason text,approval_snapshot jsonb not null,request_revision integer not null
);
create index official_business_punch_request on public.official_business_punch_audits(ob_id,attempted_at);
alter table public.official_business_requests enable row level security;
alter table public.official_business_audit enable row level security;
alter table public.official_business_punch_audits enable row level security;
revoke all on public.official_business_requests,public.official_business_audit,public.official_business_punch_audits from public,anon,authenticated;
grant select on public.official_business_requests,public.official_business_audit,public.official_business_punch_audits to authenticated;

create function private.ob_hr(p_employee uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.current_hris_user_id() is not null
 and (public.has_active_role('HR Manager') or public.has_active_role('HR Staff')) and public.can_access_hris_user(p_employee)
$$;
create function private.ob_can_read(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.official_business_requests r where r.id=p_id and
 (r.employee_id=public.current_hris_user_id() or (r.status<>'Draft' and (r.head_id=public.current_hris_user_id()
 or private.ob_hr(r.employee_id) or (public.has_active_role('Board of Director') and public.can_access_hris_user(r.employee_id))))))
$$;
revoke all on function private.ob_hr(uuid),private.ob_can_read(uuid) from public,anon;
grant execute on function private.ob_hr(uuid),private.ob_can_read(uuid) to authenticated;
create function public.ob_can_read(p_id uuid) returns boolean language sql stable security invoker set search_path='' begin atomic select private.ob_can_read(p_id);end;
revoke all on function public.ob_can_read(uuid) from public,anon;grant execute on function public.ob_can_read(uuid) to authenticated;
create policy ob_request_read on public.official_business_requests for select to authenticated using(private.ob_can_read(id));
create policy ob_audit_read on public.official_business_audit for select to authenticated using(private.ob_can_read(request_id));
create policy ob_punch_read on public.official_business_punch_audits for select to authenticated using(private.ob_can_read(ob_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('official-business','official-business',false,5242880,array['application/pdf','image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy ob_document_read on storage.objects for select to authenticated using(bucket_id='official-business' and public.ob_can_read(nullif((storage.foldername(name))[2],'')::uuid));
create policy ob_document_upload on storage.objects for insert to authenticated with check(bucket_id='official-business'
 and (storage.foldername(name))[1]=public.current_hris_user_id()::text and exists(select 1 from public.official_business_requests r
 where r.id::text=(storage.foldername(name))[2] and r.employee_id=public.current_hris_user_id()
 and ((r.status='Draft' and (storage.foldername(name))[3]='documents') or (r.approved_at is not null and (storage.foldername(name))[3]='selfies'))));

create function private.ob_notify(p_user uuid,p_id uuid,p_event text,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_user is null then return;end if;
 insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key)
 values(p_user::text,'info','Official Business: '||p_event,'Open the request to review its approved location, schedule and approval history.',
 '/official-business?request='||p_id,p_id::text,'ob:'||p_id||':'||p_revision||':'||p_event||':'||p_user) on conflict do nothing;
end $$;
revoke all on function private.ob_notify(uuid,uuid,text,integer) from public,anon,authenticated;
create function private.ob_validate(r public.official_business_requests) returns void language plpgsql stable security definer set search_path='' as $$
declare doc jsonb;
begin
 if r.work_date is null or r.starts_at is null or r.ends_at is null or r.ends_at<=r.starts_at or r.ends_at>=r.starts_at+interval '24 hours'
 or (r.starts_at at time zone 'Asia/Manila')::date<>r.work_date then raise exception 'Choose one OB work date and a valid time window shorter than 24 hours.';end if;
 if r.override_schedule and r.ends_at-r.starts_at<=interval '60 minutes' then raise exception 'A replacement work shift must exceed the existing 60-minute unpaid lunch. For a short meeting, keep the regular schedule.';end if;
 if nullif(trim(r.destination),'') is null or nullif(trim(r.purpose),'') is null or r.latitude is null or r.longitude is null
 or r.latitude not between -90 and 90 or r.longitude not between -180 and 180 or r.radius_metres not between 50 and 2000 then raise exception 'Enter the destination, purpose and valid approved-location coordinates and radius.';end if;
 if r.supporting_required and jsonb_array_length(r.documents)=0 then raise exception 'Supporting documents are required for this request.';end if;
 for doc in select value from jsonb_array_elements(r.documents) loop
 if not exists(select 1 from storage.objects o where o.bucket_id='official-business' and o.name=doc->>'path'
 and o.name like r.employee_id::text||'/'||r.id::text||'/documents/%') then raise exception 'A supporting document is unavailable. Upload it to this request.';end if;
 end loop;
 if r.head_id is null or r.head_id=r.employee_id or not exists(select 1 from public.hris_users where id=r.head_id and lower(status)='active') then raise exception 'An active Immediate Head must be assigned in the employee profile before submission.';end if;
 if exists(select 1 from public.official_business_requests x where x.employee_id=r.employee_id and x.work_date=r.work_date and x.id<>r.id and x.status in('Pending Approval','Approved','For Review','Completed')) then raise exception 'Another active OB request exists for this work date. HR must amend or cancel it first.';end if;
 if private.is_schedule_suspended(r.employee_id,r.work_date) then raise exception 'OB cannot override an active suspension.';end if;
end $$;
revoke all on function private.ob_validate(public.official_business_requests) from public,anon,authenticated;

create function private.ob_command(p_id uuid,p_action text,p_revision integer,p_data jsonb,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();r public.official_business_requests;old_record jsonb;is_hr boolean;h record;
begin
 if auth.uid() is null or private.payroll_actor_id() is null or actor is null then raise exception 'Active HRIS sign-in required' using errcode='42501';end if;
 if p_id is null or p_action not in('save','submit','approve','reject','amend','cancel','close') then raise exception 'Invalid OB action';end if;
 select * into r from public.official_business_requests where id=p_id;
 if r.id is null then
 if p_action<>'save' or p_revision<>0 then raise exception 'Request unavailable. Refresh before retrying.' using errcode='40001';end if;
 perform pg_advisory_xact_lock(hashtextextended('attendance-clock:'||actor::text,0));
 insert into public.official_business_requests(id,employee_id,business_unit_id) select p_id,actor,business_unit_id from public.hris_users where id=actor returning * into r;
 else
 perform pg_advisory_xact_lock(hashtextextended('attendance-clock:'||r.employee_id::text,0));
 select * into r from public.official_business_requests where id=p_id for update;
 if r.revision<>p_revision then raise exception 'Request changed. Refresh before retrying.' using errcode='40001';end if;
 end if;
 old_record:=to_jsonb(r);is_hr:=private.ob_hr(r.employee_id) and actor<>r.employee_id;
 if p_action in('save','amend') then
 if p_action='save' and not(r.employee_id=actor and r.status='Draft') then raise exception 'Only your own draft can be edited' using errcode='42501';end if;
 if p_action='amend' and (not is_hr or r.status in('Completed','Cancelled')) then raise exception 'Scoped HR access is required to amend an open request' using errcode='42501';end if;
 if p_action='amend' and nullif(trim(p_reason),'') is null then raise exception 'An amendment reason is required';end if;
 r.work_date:=nullif(p_data->>'work_date','')::date;r.starts_at:=nullif(p_data->>'starts_at','')::timestamptz;r.ends_at:=nullif(p_data->>'ends_at','')::timestamptz;
 r.destination:=left(p_data->>'destination',500);r.latitude:=nullif(p_data->>'latitude','')::double precision;r.longitude:=nullif(p_data->>'longitude','')::double precision;
 r.radius_metres:=coalesce(nullif(p_data->>'radius_metres','')::integer,100);r.purpose:=left(p_data->>'purpose',4000);r.client_event:=left(p_data->>'client_event',500);
 r.travel_minutes:=coalesce((p_data->>'travel_minutes')::integer,0);r.override_schedule:=coalesce((p_data->>'override_schedule')::boolean,false);
 r.supporting_required:=coalesce((p_data->>'supporting_required')::boolean,false);r.documents:=coalesce(p_data->'documents','[]');
 if p_action='amend' then
 r.head_id:=private.resolve_direct_manager_id(r.employee_id);perform private.ob_validate(r);r.status:='Pending Approval';r.approval_step:='head';
 r.approved_at:=null;r.hr_approved_by:=null;r.head_approved_at:=null;r.head_approved_by:=null;
 end if;
 elsif p_action='submit' then
 if r.employee_id<>actor or r.status<>'Draft' then raise exception 'Only your draft can be submitted' using errcode='42501';end if;
 r.head_id:=private.resolve_direct_manager_id(actor);perform private.ob_validate(r);
 if r.ends_at<=now() then raise exception 'Use an attendance correction for a past OB window; OB authorization is not retroactive.';end if;
 r.original_schedule:=private.attendance_schedule(actor,r.work_date);r.status:='Pending Approval';r.approval_step:='head';
 elsif p_action in('approve','reject') then
 if r.status<>'Pending Approval' or actor=r.employee_id or not((r.approval_step='head' and actor=r.head_id) or (r.approval_step='hr' and is_hr and actor is distinct from r.head_approved_by)) then raise exception 'Only the assigned next approver may decide this request' using errcode='42501';end if;
 if p_action='reject' then
 if nullif(trim(p_reason),'') is null then raise exception 'A rejection reason is required';end if;r.status:='Rejected';r.approval_step:='none';
 else
 perform private.ob_validate(r);if r.ends_at<=now() then raise exception 'This OB window has ended. Use attendance review instead.';end if;
 if r.approval_step='head' then r.head_approved_at:=now();r.head_approved_by:=actor;r.approval_step:='hr';
 else r.approved_at:=now();r.hr_approved_by:=actor;r.status:='Approved';r.approval_step:='none';end if;
 end if;
 elsif p_action in('cancel','close') then
 if not is_hr then raise exception 'Scoped HR access is required' using errcode='42501';end if;
 if nullif(trim(p_reason),'') is null then raise exception 'A reason is required';end if;
 if r.status in('Cancelled','Completed') then raise exception 'This request is already final';end if;
 if p_action='close' and (r.status not in('Approved','For Review') or r.ends_at>now()) then raise exception 'Only an ended, approved OB request can be completed';end if;
 r.status:=case when p_action='close' then 'Completed' else 'Cancelled' end;r.approval_step:='none';
 end if;
 r.revision:=r.revision+1;r.updated_at:=now();r.last_reason:=nullif(trim(p_reason),'');
 update public.official_business_requests set(work_date,starts_at,ends_at,destination,latitude,longitude,radius_metres,purpose,client_event,travel_minutes,override_schedule,supporting_required,documents,head_id,status,approval_step,head_approved_at,head_approved_by,approved_at,hr_approved_by,original_schedule,revision,updated_at,last_reason)
 =(r.work_date,r.starts_at,r.ends_at,r.destination,r.latitude,r.longitude,r.radius_metres,r.purpose,r.client_event,r.travel_minutes,r.override_schedule,r.supporting_required,r.documents,r.head_id,r.status,r.approval_step,r.head_approved_at,r.head_approved_by,r.approved_at,r.hr_approved_by,r.original_schedule,r.revision,r.updated_at,r.last_reason) where id=r.id;
 insert into public.official_business_audit(request_id,actor_id,action,reason,before_record,after_record) values(r.id,actor,p_action,r.last_reason,old_record,to_jsonb(r));
 insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details) values(actor::text,auth.jwt()->>'email',upper(p_action),'OfficialBusiness',r.id::text,jsonb_build_object('revision',r.revision,'status',r.status,'reason',r.last_reason)::text);
 if p_action<>'save' then perform private.ob_notify(r.employee_id,r.id,r.status,r.revision);end if;
 if r.status='Pending Approval' and r.approval_step='head' then perform private.ob_notify(r.head_id,r.id,'Immediate Head approval needed',r.revision);end if;
 if r.status='Pending Approval' and r.approval_step='hr' then
 for h in select distinct u.id from public.hris_users u join public.user_roles ur on ur.user_id=u.id and ur.is_active
 where lower(u.status)='active' and ur.role_id in('HR Manager','HR Staff') and u.id not in(r.employee_id,r.head_approved_by)
 and (ur.scope_type='GLOBAL' or (ur.scope_type='SPECIFIC' and r.business_unit_id=any(ur.allowed_business_unit_ids)) or (ur.scope_type in('HOME_ONLY','DEPARTMENT','DIRECT_REPORTS') and u.business_unit_id=r.business_unit_id)) loop
 perform private.ob_notify(h.id,r.id,'HR approval needed',r.revision);end loop;end if;
 return r.id;
end $$;
revoke all on function private.ob_command(uuid,text,integer,jsonb,text) from public,anon;grant execute on function private.ob_command(uuid,text,integer,jsonb,text) to authenticated;
create function public.act_on_official_business(p_id uuid,p_action text,p_revision integer,p_data jsonb default '{}',p_reason text default '') returns uuid language sql security invoker set search_path='' begin atomic select private.ob_command(p_id,p_action,p_revision,p_data,p_reason);end;
revoke all on function public.act_on_official_business(uuid,text,integer,jsonb,text) from public,anon;grant execute on function public.act_on_official_business(uuid,text,integer,jsonb,text) to authenticated;

create function private.ob_list(p_queue text,p_status text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();result jsonb;
begin
 if auth.uid() is null or private.payroll_actor_id() is null then raise exception 'Active HRIS sign-in required' using errcode='42501';end if;
 select coalesce(jsonb_agg(payload order by created_at desc),'[]') into result from (
 select r.created_at,to_jsonb(r)||jsonb_build_object('employeeName',u.full_name,'headName',h.full_name,
 'canHead',r.status='Pending Approval' and r.approval_step='head' and r.head_id=actor and r.employee_id<>actor,
 'canHr',private.ob_hr(r.employee_id) and r.employee_id<>actor,'canHrApprove',private.ob_hr(r.employee_id) and r.employee_id<>actor and actor is distinct from r.head_approved_by and r.status='Pending Approval' and r.approval_step='hr',
 'history',case when p_id is not null then (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'reason',a.reason,'actor',v.full_name,'at',a.occurred_at,'status',a.after_record->>'status','revision',a.after_record->'revision') order by a.occurred_at),'[]') from public.official_business_audit a left join public.hris_users v on v.id=a.actor_id where a.request_id=r.id) else '[]'::jsonb end,
 'punches',case when p_id is not null then (select coalesce(jsonb_agg(to_jsonb(a) order by a.attempted_at),'[]') from public.official_business_punch_audits a where a.ob_id=r.id) else '[]'::jsonb end) payload
 from public.official_business_requests r join public.hris_users u on u.id=r.employee_id left join public.hris_users h on h.id=r.head_id
 where private.ob_can_read(r.id) and (p_id is null or r.id=p_id) and (nullif(p_status,'') is null or r.status=p_status)
 and (p_queue<>'own' or r.employee_id=actor) and (p_queue<>'approvals' or (r.status='Pending Approval' and ((r.approval_step='head' and r.head_id=actor and r.employee_id<>actor) or (r.approval_step='hr' and private.ob_hr(r.employee_id) and r.employee_id<>actor and actor is distinct from r.head_approved_by))))
 order by r.created_at desc limit 200) q;
 return jsonb_build_object('rows',result,'limit',200,'headAssigned',private.resolve_direct_manager_id(actor) is not null);
end $$;
revoke all on function private.ob_list(text,text,uuid) from public,anon;grant execute on function private.ob_list(text,text,uuid) to authenticated;
create function public.get_official_business(p_queue text default 'own',p_status text default '',p_id uuid default null) returns jsonb language sql stable security invoker set search_path='' begin atomic select private.ob_list(p_queue,p_status,p_id);end;
revoke all on function public.get_official_business(text,text,uuid) from public,anon;grant execute on function public.get_official_business(text,text,uuid) to authenticated;

-- An approved OB schedule can stand alone without changing a published week.
alter table public.attendance_clock_sessions alter column publication_id drop not null;
-- Attendance exceptions are separate from published schedules and paid entitlements.
create function private.ob_for_day(p_employee uuid,p_date date) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(r) from public.official_business_requests r where employee_id=p_employee and work_date=p_date
 and approved_at is not null and status in('Approved','For Review','Completed') order by approved_at desc limit 1
$$;
revoke all on function private.ob_for_day(uuid,date) from public,anon,authenticated;
alter function private.attendance_schedule(uuid,date) rename to attendance_schedule_before_ob;
create function private.attendance_schedule(p_employee uuid,p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb:=private.attendance_schedule_before_ob(p_employee,p_date);ob jsonb:=private.ob_for_day(p_employee,p_date);s timestamptz;e timestamptz;
begin
 if ob is null or private.is_schedule_suspended(p_employee,p_date) then return base;end if;
 if not (ob->>'override_schedule')::boolean then return base||jsonb_build_object('officialBusiness',jsonb_build_object('id',ob->>'id','reference',ob->>'reference','revision',ob->'revision'),'statusLabel','Official Business');end if;
 s:=(ob->>'starts_at')::timestamptz;e:=(ob->>'ends_at')::timestamptz;
 return base||jsonb_build_object('published',true,'date',p_date,'officialBusiness',jsonb_build_object('id',ob->>'id','reference',ob->>'reference','revision',ob->'revision'),'originalSchedule',base,'statusLabel','Official Business',
 'entries',jsonb_build_array(jsonb_build_object('id',ob->>'id','templateId',null,'name','Official Business','kind','work','statusTag','official_business',
 'start',to_char(s at time zone 'Asia/Manila','HH24:MI:SS'),'end',to_char(e at time zone 'Asia/Manila','HH24:MI:SS'),
 'endDayOffset',(e at time zone 'Asia/Manila')::date-p_date,'flexible',false,'paidMinutes',null,'breakMinutes',60)));
end $$;
revoke all on function private.attendance_schedule(uuid,date) from public,anon,authenticated;
alter function private.attendance_day(uuid,date) rename to attendance_day_before_ob;
create function private.attendance_day(p_employee uuid,p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb:=private.attendance_day_before_ob(p_employee,p_date);ob jsonb:=private.ob_for_day(p_employee,p_date);sch jsonb;
begin
 if private.is_schedule_suspended(p_employee,p_date) then return base;end if;
 if ob is null and base#>>'{schedule,officialBusiness,id}' is not null then select to_jsonb(r) into ob from public.official_business_requests r where id=(base#>>'{schedule,officialBusiness,id}')::uuid;end if;
 if ob is null then return base;end if;
 sch:=private.attendance_schedule(p_employee,p_date);
 return base||jsonb_build_object('officialBusiness',jsonb_build_object('id',ob->>'id','reference',ob->>'reference','destination',ob->>'destination','starts_at',ob->>'starts_at','ends_at',ob->>'ends_at','status',ob->>'status','radius_metres',ob->'radius_metres'),
 'statusLabel','Official Business','statusTag','official_business','schedule',case when ob->>'status' in('Approved','For Review','Completed') then sch else base->'schedule' end);
end $$;
revoke all on function private.attendance_day(uuid,date) from public,anon,authenticated;

alter function public.record_my_attendance_verified(text,uuid,integer,date,jsonb) set schema private;
alter function private.record_my_attendance_verified(text,uuid,integer,date,jsonb) rename to record_attendance_without_ob;
revoke all on function private.record_attendance_without_ob(text,uuid,integer,date,jsonb),private.record_attendance_core(text,uuid,integer,date) from public,anon,authenticated;
create function private.ob_record_clock(p_action text,p_request_id uuid,p_expected_revision integer,p_work_date date,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare emp uuid:=public.current_hris_user_id();r public.official_business_requests;prior public.official_business_punch_audits;
 ctx jsonb;ob_id uuid;lat double precision;lon double precision;acc double precision;dist double precision;stamp timestamptz:=clock_timestamp();reason text;ev uuid;result jsonb;selfie text;captured timestamptz;
begin
 if auth.uid() is null or private.payroll_actor_id() is null or emp is null then raise exception 'Active HRIS sign-in required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('attendance-clock:'||emp::text,0));
 if p_request_id is null or p_action not in('CLOCK_IN','START_BREAK','END_BREAK','CLOCK_OUT') then raise exception 'Choose a valid clock action';end if;
 select * into prior from public.official_business_punch_audits where id=p_request_id;
 if prior.id is not null then
 if prior.employee_id<>emp or prior.action<>p_action then raise exception 'Request identity does not match' using errcode='42501';end if;
 return public.get_my_attendance()||jsonb_build_object('recorded',prior.recorded,'error',prior.reason);end if;
 if exists(select 1 from public.attendance_clock_events where employee_id=emp and request_id=p_request_id and action=p_action) then return public.get_my_attendance();end if;
 ctx:=public.get_my_attendance();
 if p_expected_revision is distinct from (ctx->>'revision')::integer or p_work_date is distinct from (ctx->>'workDate')::date then raise exception 'Attendance changed. Refresh before clocking.' using errcode='40001';end if;
 ob_id:=coalesce(nullif(p_evidence->>'obId','')::uuid,(ctx#>>'{officialBusiness,id}')::uuid);
 if ob_id is null then return private.record_attendance_without_ob(p_action,p_request_id,p_expected_revision,p_work_date,p_evidence);end if;
 select * into r from public.official_business_requests where id=ob_id and employee_id=emp for share;
 if r.id is null then raise exception 'OB request unavailable for this employee' using errcode='42501';end if;
 if p_evidence->>'method' is distinct from 'ob' then raise exception 'This date has an OB request. Use the OB clock with a fresh GPS reading and selfie.';end if;
 lat:=nullif(p_evidence->>'latitude','')::double precision;lon:=nullif(p_evidence->>'longitude','')::double precision;acc:=nullif(p_evidence->>'accuracy','')::double precision;
 captured:=nullif(p_evidence->>'capturedAt','')::timestamptz;selfie:=p_evidence->>'selfiePath';
 if lat is null or lon is null or acc is null or lat not between -90 and 90 or lon not between -180 and 180 or acc not between 0 and 100
 or captured is null or captured<stamp-interval '2 minutes' or captured>stamp+interval '30 seconds' then raise exception 'Capture a fresh GPS location accurate within 100 metres.';end if;
 if selfie is null or not exists(select 1 from storage.objects o where o.bucket_id='official-business' and o.name=selfie and o.name like emp::text||'/'||r.id::text||'/selfies/%' and o.created_at>=stamp-interval '5 minutes' and o.metadata->>'mimetype' in('image/jpeg','image/png','image/webp')) then raise exception 'Take and upload a fresh selfie for this OB punch.';end if;
 dist:=6371000*2*asin(sqrt(least(1.0,power(sin(radians(lat-r.latitude)/2),2)+cos(radians(lat))*cos(radians(r.latitude))*power(sin(radians(lon-r.longitude)/2),2))));
 if r.approved_at is null or r.status not in('Approved','For Review') then reason:='OB is not currently approved; no location or schedule exception was applied.';
 elsif private.is_schedule_suspended(emp,p_work_date) then reason:='An active suspension prevents this OB attendance override.';
 elsif r.work_date<>p_work_date or stamp<greatest(r.starts_at,r.approved_at) or stamp>r.ends_at then reason:='Punch is outside the approved OB date/time. HR review is required.';
 elsif dist+acc>r.radius_metres then reason:='Punch is outside the approved OB location or its GPS uncertainty crosses the boundary. HR review is required.';end if;
 if reason is null then
 result:=private.record_attendance_core(p_action,p_request_id,p_expected_revision,p_work_date);
 select id into strict ev from public.attendance_clock_events where employee_id=emp and request_id=p_request_id;
 -- Existing evidence method remains GPS; OB is an explicitly approved exception in its detail.
 insert into public.attendance_channel_evidence(event_id,method,detail) values(ev,'gps',jsonb_build_object('officialBusinessId',r.id,'reference',r.reference,'latitude',lat,'longitude',lon,'accuracy',acc,'selfiePath',selfie,'distanceMetres',dist,'radiusMetres',r.radius_metres,'approvalRevision',r.revision));
 update public.time_events set notes='Official Business · '||r.reference||' · Schedule/location exception only; no premium pay or allowance authorized' where id=ev;
 else
 if r.status='Approved' then
 update public.official_business_requests set status='For Review',revision=revision+1,updated_at=now(),last_reason=reason where id=r.id;
 insert into public.official_business_audit(request_id,actor_id,action,reason,before_record,after_record) values(r.id,emp,'punch_for_review',reason,to_jsonb(r),to_jsonb(r)||jsonb_build_object('status','For Review','revision',r.revision+1));end if;
 end if;
 insert into public.official_business_punch_audits(id,ob_id,employee_id,action,recorded,event_id,latitude,longitude,accuracy,distance_metres,selfie_path,reason,approval_snapshot,request_revision)
 values(p_request_id,r.id,emp,p_action,reason is null,ev,lat,lon,acc,dist,selfie,reason,to_jsonb(r),r.revision);
 return public.get_my_attendance()||jsonb_build_object('recorded',reason is null,'error',reason);
end $$;
revoke all on function private.ob_record_clock(text,uuid,integer,date,jsonb) from public,anon;grant execute on function private.ob_record_clock(text,uuid,integer,date,jsonb) to authenticated;
create function public.record_my_attendance_verified(p_action text,p_request_id uuid,p_expected_revision integer,p_work_date date,p_evidence jsonb) returns jsonb language sql security invoker set search_path='' begin atomic select private.ob_record_clock(p_action,p_request_id,p_expected_revision,p_work_date,p_evidence);end;
revoke all on function public.record_my_attendance_verified(text,uuid,integer,date,jsonb) from public,anon;grant execute on function public.record_my_attendance_verified(text,uuid,integer,date,jsonb) to authenticated;

-- Feed approved OB schedules into new timekeeping snapshots without rewriting publications.
-- Preserve the original pay basis and require independent review for premium/extra time.
alter function private.payroll_time_sources(uuid,date,date) rename to payroll_time_sources_before_ob;
create function private.payroll_time_sources(p_scope uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare src jsonb:=private.payroll_time_sources_before_ob(p_scope,p_from,p_to);obs jsonb:='[]';r public.official_business_requests;sch jsonb;shifts jsonb:=src->'shifts';days jsonb:=src->'scheduleDays';old_shifts jsonb;old_minutes numeric;
begin
 for r in select x.* from public.official_business_requests x where x.work_date between p_from and p_to and x.approved_at is not null and x.status in('Approved','For Review','Completed')
 and x.employee_id::text in(select u->>'id' from jsonb_array_elements(src->'employees') u) loop
 select coalesce(jsonb_agg(x),'[]') into old_shifts from jsonb_array_elements(src->'shifts') x where x->>'employeeId'=r.employee_id::text and (x->>'date')::date=r.work_date;
 select coalesce(sum(case when x->>'kind'<>'work' then 0 when (x->>'flexible')::boolean then (x->>'paidMinutes')::numeric else greatest(0,extract(epoch from((x->>'end')::time-(x->>'start')::time))/60+coalesce((x->>'endDayOffset')::integer,0)*1440-60) end),0) into old_minutes from jsonb_array_elements(old_shifts) x;
 obs:=obs||jsonb_build_array(jsonb_build_object('id',r.id,'reference',r.reference,'employeeId',r.employee_id,'date',r.work_date,'status',r.status,'approvedAt',r.approved_at,'revision',r.revision,'overrideSchedule',r.override_schedule,'originalScheduledMinutes',old_minutes,
 'originalRestDay',exists(select 1 from jsonb_array_elements(old_shifts) x where x->>'kind'='rest'),
 'independentPayReview',exists(select 1 from public.payroll_time_compensation_reviews v where v.employee_id=r.employee_id and v.work_date=r.work_date),
 'hasRejectedPunches',exists(select 1 from public.official_business_punch_audits a where a.ob_id=r.id and not a.recorded)));
 if r.override_schedule and not private.is_schedule_suspended(r.employee_id,r.work_date) then
 sch:=private.attendance_schedule(r.employee_id,r.work_date);
 select coalesce(jsonb_agg(x),'[]') into shifts from jsonb_array_elements(shifts) x where not(x->>'employeeId'=r.employee_id::text and (x->>'date')::date=r.work_date);
 shifts:=shifts||(select jsonb_agg(x||jsonb_build_object('employeeId',r.employee_id,'date',r.work_date,'published',true,'publicationId',sch->'publicationId','officialBusinessId',r.id)) from jsonb_array_elements(sch->'entries') x);
 select coalesce(jsonb_agg(x),'[]') into days from jsonb_array_elements(days) x where not(x->>'employeeId'=r.employee_id::text and (x->>'date')::date=r.work_date);
 days:=days||jsonb_build_array(jsonb_build_object('employeeId',r.employee_id,'date',r.work_date,'status','published','officialBusinessId',r.id));
 end if;
 end loop;
 return src||jsonb_build_object('officialBusiness',obs,'originalShiftsBeforeOb',src->'shifts','shifts',shifts,'scheduleDays',days);
end $$;
revoke all on function private.payroll_time_sources(uuid,date,date) from public,anon,authenticated;
alter function private.interpret_payroll_time(jsonb,date,date) rename to interpret_payroll_time_before_ob;
create function private.interpret_payroll_time(p_source jsonb,p_from date,p_to date) returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb:=private.interpret_payroll_time_before_ob(p_source,p_from,p_to);r jsonb;ob jsonb;rows jsonb:='[]';issues jsonb;
begin
 for r in select value from jsonb_array_elements(result->'rows') loop
 select x into ob from jsonb_array_elements(coalesce(p_source->'officialBusiness','[]')) x where x->>'employeeId'=r->>'employeeId' and x->>'date'=r->>'date';
 if ob is not null then
 issues:=coalesce(r->'issues','[]');
 if ob->>'status'='For Review' then issues:=issues||jsonb_build_array('Official Business attendance exception requires HR review; unrecorded punches need the attendance correction process.');end if;
 if ((r->>'holiday')::boolean or (r->>'restDay')::boolean or (ob->>'originalRestDay')::boolean or (r->>'regularMinutes')::numeric>(ob->>'originalScheduledMinutes')::numeric)
 and (coalesce((r->>'actualMinutes')::numeric,0)>0 or r->>'requiresClock'='false') and not coalesce((ob->>'independentPayReview')::boolean,false) then
 issues:=issues||jsonb_build_array('OB authorizes schedule/location only. Separate payroll compensation or overtime approval is required for holiday, rest-day or extra paid time.');end if;
 r:=r||jsonb_build_object('officialBusiness',ob,'attendanceBasis','Official Business','restDay',coalesce((r->>'restDay')::boolean,false) or coalesce((ob->>'originalRestDay')::boolean,false),'issues',issues,'ready',jsonb_array_length(issues)=0);
 end if;rows:=rows||jsonb_build_array(r);
 end loop;
 return result||jsonb_build_object('rows',rows,'blockedDays',(select count(*) from jsonb_array_elements(rows) x where not(x->>'ready')::boolean));
end $$;
revoke all on function private.interpret_payroll_time(jsonb,date,date) from public,anon,authenticated;

-- Ensure the legacy web RPC resolves the OB guard, with no new public definer.
create or replace function public.record_my_attendance(p_action text,p_request_id uuid,p_expected_revision integer,p_work_date date) returns jsonb language sql security invoker set search_path='' begin atomic select public.record_my_attendance_verified(p_action,p_request_id,p_expected_revision,p_work_date,'{"method":"web"}'::jsonb);end;
revoke all on function private.attendance_schedule_before_ob(uuid,date),private.attendance_day_before_ob(uuid,date),private.payroll_time_sources_before_ob(uuid,date,date),private.interpret_payroll_time_before_ob(jsonb,date,date) from public,anon,authenticated;

-- A biometric file has no independently verified OB GPS/selfie. Keep it in the
-- existing HR correction workflow instead of silently accepting the exception.
do $ob_import_guard$
declare ddl text:=pg_get_functiondef('public.commit_attendance_import(uuid,text)'::regprocedure);
 anchor text:='if coalesce((private.attendance_exception(emp,';
begin
 if strpos(ddl,anchor)=0 then raise exception 'Attendance import changed; review OB integration before deployment';end if;
 ddl:=replace(ddl,anchor,'if private.ob_for_day(emp,(r->>''workDate'')::date) is not null then raise exception ''OB dates require GPS/selfie clocking or a separately audited HR attendance correction; biometric import cannot authorize the exception.'';end if; '||anchor);
 execute ddl;
end $ob_import_guard$;
