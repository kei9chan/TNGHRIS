-- Additive attendance reports. Original schedules and raw punches remain intact.
set local lock_timeout='5s';
create schema attendance_issues;
revoke all on schema attendance_issues from public,anon,authenticated;
create table attendance_issues.settings(id boolean primary key default true check(id),response_minutes integer not null default 120 check(response_minutes between 15 and 10080),fallback_ids uuid[] not null default '{}',changed_by uuid,changed_at timestamptz not null default clock_timestamp());
insert into attendance_issues.settings(id) values(true);
create table attendance_issues.requests(
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.hris_users(id),manager_id uuid references public.hris_users(id),
 kind text not null check(kind in('absence','early','late','punch')),work_date date not null,requested_time timestamptz,punch_type text check(punch_type in('CLOCK_IN','START_BREAK','END_BREAK','CLOCK_OUT')),
 category text not null,explanation text not null check(length(trim(explanation)) between 3 and 1000),attachment text,confirmed boolean not null default false,
 schedule jsonb not null,status text not null check(status in('pending','approved','rejected','withdrawn','cancelled','details','hr_review')),
 request_key uuid not null,revision integer not null default 1,submitted_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 due_at timestamptz not null,escalated_at timestamptz,reviewed_by uuid,reviewed_at timestamptz,unique(employee_id,request_key)
);
create unique index attendance_issue_active on attendance_issues.requests(employee_id,work_date,kind,coalesce(punch_type,'')) where status in('pending','approved','details','hr_review');
create index attendance_issue_pending on attendance_issues.requests(status,due_at) where status in('pending','hr_review');
create table attendance_issues.audit(id uuid primary key default gen_random_uuid(),request_id uuid references attendance_issues.requests(id),actor uuid,action text not null,previous jsonb,new_value jsonb,reason text,created_at timestamptz not null default clock_timestamp());
create index attendance_issue_audit_request on attendance_issues.audit(request_id,created_at);
create table attendance_issues.exceptions(id uuid primary key default gen_random_uuid(),request_id uuid not null references attendance_issues.requests(id),employee_id uuid not null,work_date date not null,kind text not null,requested_time timestamptz,schedule jsonb not null,session_id uuid,adjustment_id uuid,actor uuid not null,created_at timestamptz not null default clock_timestamp());
create table attendance_issues.deliveries(id uuid primary key default gen_random_uuid(),request_id uuid not null references attendance_issues.requests(id),recipient uuid not null references public.hris_users(id),event text not null,event_key text not null unique,status text not null default 'queued',attempts integer not null default 0,lease_token uuid,lease_until timestamptz,next_attempt timestamptz not null default clock_timestamp(),provider_id text,error text,created_at timestamptz not null default clock_timestamp());
do $$declare t text;begin foreach t in array array['settings','requests','audit','exceptions','deliveries'] loop execute format('alter table attendance_issues.%I enable row level security',t);execute format('revoke all on attendance_issues.%I from public,anon,authenticated',t);end loop;end $$;
create trigger immutable before update or delete on attendance_issues.audit for each row execute function private.payroll_audit_immutable();
create trigger immutable before update or delete on attendance_issues.exceptions for each row execute function private.payroll_audit_immutable();

create function attendance_issues.hr_recipient(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.hris_users h join lateral private.effective_role_ids(h.id) e on true join public.roles r on r.id=e.role_id where h.id=p_user and lower(h.status::text)='active' and h.auth_user_id is not null and r.is_active and r.dashboard_type<>'executive' and (r.dashboard_type='admin' or exists(select 1 from public.role_permissions rp where rp.role_id=r.id and rp.resource_id='AttendanceExceptions' and 'manage'=any(rp.permissions))))
$$;
create function attendance_issues.can_read(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and exists(select 1 from attendance_issues.requests r where r.id=p_id and (r.employee_id=public.current_hris_user_id() or private.punch_direct_manager(r.employee_id)=public.current_hris_user_id() or (public.is_hr_or_admin() and public.can_access_hris_user(r.employee_id))))
$$;
create function attendance_issues.can_review(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and exists(select 1 from attendance_issues.requests r where r.id=p_id and r.employee_id<>public.current_hris_user_id() and (private.punch_direct_manager(r.employee_id)=public.current_hris_user_id() or (private.attendance_admin() and public.can_access_hris_user(r.employee_id))))
$$;
create function attendance_issues.notify(p_id uuid,p_user uuid,p_event text,p_key text) returns void language plpgsql security definer set search_path='' as $$declare did uuid;begin
 if p_user is null then return;end if;
 insert into attendance_issues.deliveries(request_id,recipient,event,event_key) values(p_id,p_user,p_event,p_key) on conflict(event_key) do nothing returning id into did;
 if did is null then return;end if;
 insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key) values(p_user::text,'info','Attendance request: '||p_event,'Open the private attendance request to review the details.','/payroll/attendance-requests?review='||p_id,p_id::text,'attendance-issue:'||p_key) on conflict do nothing;
 insert into attendance_issues.audit(request_id,action,new_value) values(p_id,'notification queued',jsonb_build_object('recipient',p_user,'event',p_event,'deliveryId',did));
end $$;
create function attendance_issues.notify_hr(p_id uuid,p_event text,p_key text) returns void language plpgsql security definer set search_path='' as $$declare h uuid;cfg uuid[];begin
 select fallback_ids into cfg from attendance_issues.settings;
 for h in select id from public.hris_users where attendance_issues.hr_recipient(id) and (cardinality(cfg)=0 or id=any(cfg)) loop
 -- Evaluate scope using the recipient's existing authorization helpers, restoring caller JWT.
 declare saved text:=current_setting('request.jwt.claims',true); begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(select auth_user_id from public.hris_users where id=h),'role','authenticated')::text,true);
 if public.can_access_hris_user((select employee_id from attendance_issues.requests where id=p_id)) then perform attendance_issues.notify(p_id,h,p_event,p_key||':'||h);end if;
 perform set_config('request.jwt.claims',coalesce(saved,''),true);
 end;
 end loop;
end $$;

create function public.submit_attendance_issue(p_data jsonb,p_key uuid,p_id uuid default null,p_revision integer default null) returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=public.current_hris_user_id();r attendance_issues.requests;rid uuid;mgr uuid;dt date;tm timestamptz;kind text;path text;sch jsonb;mins integer;begin
 if actor is null or private.payroll_actor_id() is null then raise exception 'Active sign-in required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('attendance-issue:'||actor,0));
 if p_key is null then raise exception 'Request identifier required';end if;
 if p_id is null then select id into rid from attendance_issues.requests where employee_id=actor and request_key=p_key;if rid is not null then return rid;end if;
 else select * into r from attendance_issues.requests where id=p_id for update;if r.employee_id is distinct from actor or r.status<>'details' or r.revision is distinct from p_revision then raise exception 'Only your returned request can be updated. Refresh and retry.' using errcode='42501';end if;end if;
 kind:=p_data->>'kind';dt:=(p_data->>'date')::date;tm:=nullif(p_data->>'time','')::timestamptz;path:=nullif(p_data->>'attachment','');
 if kind is null or kind not in('absence','early','late','punch') or dt is null or dt<(statement_timestamp() at time zone 'Asia/Manila')::date-90 or dt>(statement_timestamp() at time zone 'Asia/Manila')::date+366 then raise exception 'Choose a valid request type and date';end if;
 if kind<>'absence' and (tm is null or tm<(dt::timestamp at time zone 'Asia/Manila') or tm>=((dt+2)::timestamp at time zone 'Asia/Manila')) then raise exception 'Enter a time within the work date or following overnight day';end if;
 if kind='punch' and (tm>clock_timestamp() or coalesce(p_data->>'punch','') not in('CLOCK_IN','START_BREAK','END_BREAK','CLOCK_OUT')) then raise exception 'Choose a punch type and an actual past time';end if;
 if kind='absence' and not coalesce((p_data->>'confirmed')::boolean,false) then raise exception 'Confirm you cannot report for the scheduled shift';end if;
 if length(trim(coalesce(p_data->>'explanation',''))) not between 3 and 1000 or coalesce(p_data->>'category','') not in('Sickness','Emergency','Personal matter','Transportation or travel issue','Other') then raise exception 'Choose a reason and enter a short explanation';end if;
 if path is not null and not exists(select 1 from storage.objects where bucket_id='attendance-issue-files' and name=path and (storage.foldername(name))[1]=auth.uid()::text) then raise exception 'Attachment upload must complete before submission' using errcode='42501';end if;
 mgr:=private.punch_direct_manager(actor);sch:=private.attendance_schedule(actor,dt);select response_minutes into mins from attendance_issues.settings;
 if p_id is null then
 insert into attendance_issues.requests(employee_id,manager_id,kind,work_date,requested_time,punch_type,category,explanation,attachment,confirmed,schedule,status,request_key,due_at)
 values(actor,mgr,kind,dt,case when kind='absence' then null else tm end,case when kind='punch' then p_data->>'punch' end,p_data->>'category',trim(p_data->>'explanation'),path,coalesce((p_data->>'confirmed')::boolean,false),sch,case when mgr is null then 'hr_review' else 'pending' end,p_key,clock_timestamp()+make_interval(mins=>mins)) returning id into rid;
 else rid:=p_id;update attendance_issues.requests set kind=kind,work_date=dt,requested_time=tm,punch_type=case when kind='punch' then p_data->>'punch' end,category=p_data->>'category',explanation=trim(p_data->>'explanation'),attachment=path,confirmed=coalesce((p_data->>'confirmed')::boolean,false),schedule=sch,manager_id=mgr,status=case when mgr is null then 'hr_review' else 'pending' end,revision=revision+1,updated_at=clock_timestamp(),due_at=clock_timestamp()+make_interval(mins=>mins),escalated_at=null where id=rid;end if;
 insert into attendance_issues.audit(request_id,actor,action,previous,new_value) values(rid,actor,case when p_id is null then 'submitted' else 'edited and resubmitted' end,to_jsonb(r),(select to_jsonb(x) from attendance_issues.requests x where id=rid));
 perform attendance_issues.notify(rid,actor,'Submitted for approval',rid||':submitted:'||coalesce(p_revision,0));
 if mgr is not null then perform attendance_issues.notify(rid,mgr,'Pending your approval',rid||':manager:'||coalesce(p_revision,0));else perform attendance_issues.notify_hr(rid,'Requires HR review — no active direct manager',rid||':fallback:'||coalesce(p_revision,0));end if;
 return rid;
end $$;

create function public.get_attendance_issues(p_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if private.payroll_actor_id() is null then raise exception 'Active sign-in required' using errcode='42501';end if;
 return jsonb_build_object('canManage',private.attendance_admin(),'rows',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('employeeName',h.full_name,'employeeCode',h.employee_id,'businessUnit',h.business_unit,'department',h.department,'approverName',(select full_name from public.hris_users where id=private.punch_direct_manager(r.employee_id)),'isOwn',r.employee_id=public.current_hris_user_id(),'canReview',r.status in('pending','hr_review') and attendance_issues.can_review(r.id),'audit',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'actor',a.actor,'reason',a.reason,'created_at',a.created_at) order by a.created_at),'[]') from attendance_issues.audit a where a.request_id=r.id),'exception',(select to_jsonb(x) from attendance_issues.exceptions x where x.request_id=r.id order by created_at desc limit 1)) order by r.submitted_at desc),'[]') from attendance_issues.requests r join public.hris_users h on h.id=r.employee_id where (p_id is null or r.id=p_id) and attendance_issues.can_read(r.id)));
end $$;

-- A approved punch creates a new evidence revision, never edits original events.
create function attendance_issues.apply_punch(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare r attendance_issues.requests;s public.attendance_clock_sessions;events jsonb;clean jsonb;ev jsonb;state text:='not_started';aid uuid:=gen_random_uuid();sch jsonb;begin
 select * into r from attendance_issues.requests where id=p_id;
 perform pg_advisory_xact_lock(hashtextextended('attendance-clock:'||r.employee_id,0));
 select * into s from public.attendance_clock_sessions where employee_id=r.employee_id and work_date=r.work_date for update;
 sch:=case when s.id is null then r.schedule else s.schedule_snapshot end;
 if s.id is null then
 if not coalesce((sch->>'published')::boolean,false) then raise exception 'HR must publish or verify the original schedule before applying this punch';end if;
 insert into public.attendance_clock_sessions(employee_id,work_date,publication_id,schedule_snapshot) values(r.employee_id,r.work_date,(sch->>'publicationId')::uuid,sch) returning * into s;
 end if;
 events:=private.attendance_session_events(s.id);
 -- Never guess which of several breaks was intended.
 if (select count(*) from jsonb_array_elements(events) x where x->>'type'=r.punch_type)>1 then raise exception 'Multiple matching punches require HR attendance review';end if;
 select coalesce(jsonb_agg(x),'[]') into clean from jsonb_array_elements(events) x where x->>'type'<>r.punch_type;
 clean:=clean||jsonb_build_array(jsonb_build_object('id',aid,'type',r.punch_type,'timestamp',r.requested_time));
 select jsonb_agg(x order by (x->>'timestamp')::timestamptz) into clean from jsonb_array_elements(clean) x;
 for ev in select value from jsonb_array_elements(clean) loop state:=private.attendance_next_state(state,ev->>'type');end loop;
 insert into public.attendance_clock_adjustments(id,session_id,revision,events,reason,created_by) values(aid,s.id,s.revision+1,clean,'Approved attendance request '||p_id||': '||r.explanation,public.current_hris_user_id());
 update public.attendance_clock_sessions set state=state,revision=s.revision+1 where id=s.id;
 return aid;
end $$;
create function public.review_attendance_issue(p_id uuid,p_action text,p_reason text,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare r attendance_issues.requests;actor uuid:=public.current_hris_user_id();next_status text;aid uuid;begin
 select * into r from attendance_issues.requests where id=p_id for update;
 if r.id is null or private.payroll_actor_id() is null then raise exception 'Request unavailable' using errcode='42501';end if;
 if r.revision is distinct from p_revision then raise exception 'Request changed. Refresh before reviewing.' using errcode='40001';end if;
 if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'Enter a reason for this action';end if;
 if p_action='withdraw' then
 if r.employee_id<>actor or r.status not in('pending','details','hr_review') then raise exception 'Only your pending request can be withdrawn' using errcode='42501';end if;next_status:='withdrawn';
 elsif p_action='cancel' then
 if not private.attendance_admin() or not public.can_access_hris_user(r.employee_id) or r.status<>'approved' or r.kind='punch' then raise exception 'Scoped HR review required. Applied punch corrections need a separate HR correction.' using errcode='42501';end if;next_status:='cancelled';
 else
 if not attendance_issues.can_review(p_id) or r.status not in('pending','hr_review') or p_action not in('approve','reject','details') then raise exception 'Current direct-manager or scoped HR approval required' using errcode='42501';end if;
 next_status:=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'details' end;
 end if;
 if next_status='approved' then
 perform pg_advisory_xact_lock(hashtextextended('attendance-issue-day:'||r.employee_id||':'||r.work_date,0));
 if r.kind='absence' and exists(select 1 from public.attendance_clock_sessions where employee_id=r.employee_id and work_date=r.work_date and state<>'not_started') then raise exception 'Attendance exists for this day. Ask for details or use early out; HR must review the conflict.';end if;
 if exists(select 1 from attendance_issues.requests x where x.employee_id=r.employee_id and x.work_date=r.work_date and x.status='approved' and x.id<>r.id and (x.kind='absence' or r.kind='absence')) then raise exception 'An approved attendance exception conflicts with this request';end if;
 if r.kind='punch' then aid:=attendance_issues.apply_punch(p_id);end if;
 insert into attendance_issues.exceptions(request_id,employee_id,work_date,kind,requested_time,schedule,session_id,adjustment_id,actor) values(r.id,r.employee_id,r.work_date,r.kind,r.requested_time,r.schedule,(select id from public.attendance_clock_sessions where employee_id=r.employee_id and work_date=r.work_date),aid,actor);
 insert into attendance_issues.audit(request_id,actor,action,new_value,reason) values(p_id,actor,case when aid is null then 'schedule exception created' else 'punch correction applied' end,jsonb_build_object('adjustmentId',aid,'schedule',r.schedule),p_reason);
 end if;
 update attendance_issues.requests set status=next_status,revision=revision+1,updated_at=clock_timestamp(),reviewed_by=actor,reviewed_at=clock_timestamp() where id=p_id;
 insert into attendance_issues.audit(request_id,actor,action,previous,new_value,reason) values(p_id,actor,p_action,to_jsonb(r),(select to_jsonb(x) from attendance_issues.requests x where id=p_id),p_reason);
 perform attendance_issues.notify(p_id,r.employee_id,case next_status when 'details' then 'Returned for more information' else initcap(next_status) end,p_id||':decision:'||(r.revision+1));
 if next_status in('withdrawn','cancelled') then perform attendance_issues.notify(p_id,private.punch_direct_manager(r.employee_id),initcap(next_status),p_id||':manager-decision:'||(r.revision+1));end if;
end $$;

-- Corrections can occur during the day: retain later raw clock events as well.
create or replace function private.attendance_session_events(p_session uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with latest as(select events,revision from public.attendance_clock_adjustments where session_id=p_session order by revision desc limit 1), all_events as(
 select value as ev from latest,jsonb_array_elements(events)
 union all select jsonb_build_object('id',e.id,'type',e.action,'timestamp',e.occurred_at) from public.attendance_clock_events e where e.session_id=p_session and e.revision>coalesce((select revision from latest),-1))
 select coalesce(jsonb_agg(ev order by (ev->>'timestamp')::timestamptz),'[]') from all_events
$$;
alter function private.attendance_day(uuid,date) rename to attendance_day_before_issues;
create function private.attendance_day(p_employee uuid,p_date date) returns jsonb language sql stable security definer set search_path='' as $$
 select private.attendance_day_before_issues(p_employee,p_date)||jsonb_build_object('attendanceIssues',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'status',r.status,'time',r.requested_time,'approvedAt',r.reviewed_at,'approvedBy',(select full_name from public.hris_users where id=r.reviewed_by))) from attendance_issues.requests r where r.employee_id=p_employee and r.work_date=p_date and r.status not in('withdrawn','cancelled')),'[]'))||case when exists(select 1 from attendance_issues.requests where employee_id=p_employee and work_date=p_date and kind='absence' and status='approved') then '{"requiresClock":false}'::jsonb else '{}'::jsonb end
$$;
alter function private.attendance_review_facts(uuid,date) rename to attendance_review_facts_before_issues;
create function private.attendance_review_facts(p_emp uuid,p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$declare f jsonb;arrival timestamptz;begin
 if exists(select 1 from attendance_issues.requests where employee_id=p_emp and work_date=p_date and status in('pending','details','hr_review') or employee_id=p_emp and work_date=p_date and kind='absence' and status='approved') then return jsonb_build_object('eligible',false,'reason','Attendance report approved or awaiting review');end if;
 f:=private.attendance_review_facts_before_issues(p_emp,p_date);
 select requested_time into arrival from attendance_issues.requests where employee_id=p_emp and work_date=p_date and kind='late' and status='approved';
 if arrival is not null then f:=f||jsonb_build_object('lateMinutes',case when f->>'firstIn' is null then 0 else greatest(0,ceil(extract(epoch from((f->>'firstIn')::timestamptz-arrival))/60)) end,'approvedArrival',arrival);end if;return f;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('attendance-issue-files','attendance-issue-files',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create function public.can_read_attendance_attachment(p_path text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from attendance_issues.requests r where r.attachment=p_path and attendance_issues.can_read(r.id))$$;
create policy attendance_issue_upload on storage.objects for insert to authenticated with check(bucket_id='attendance-issue-files' and (storage.foldername(name))[1]=auth.uid()::text and public.current_hris_user_id() is not null);
create policy attendance_issue_download on storage.objects for select to authenticated using(bucket_id='attendance-issue-files' and ((storage.foldername(name))[1]=auth.uid()::text or public.can_read_attendance_attachment(name)));

create function public.get_attendance_issue_settings() returns jsonb language plpgsql stable security definer set search_path='' as $$begin if not private.attendance_admin() then raise exception 'HR attendance administration required' using errcode='42501';end if;return jsonb_build_object('settings',(select to_jsonb(s) from attendance_issues.settings s),'recipients',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name)),'[]') from public.hris_users where attendance_issues.hr_recipient(id)),'deliveries',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from (select id,request_id,event,status,attempts,error,created_at from attendance_issues.deliveries where attendance_issues.can_read(request_id) order by created_at desc limit 100)d));end $$;
create function public.save_attendance_issue_settings(p_minutes integer,p_recipients uuid[],p_reason text) returns void language plpgsql security definer set search_path='' as $$declare old jsonb;begin
 if not private.attendance_admin() or public.current_data_scope()->>'type'<>'GLOBAL' then raise exception 'Global HR attendance administration required' using errcode='42501';end if;
 if length(trim(coalesce(p_reason,'')))<3 or p_recipients is null or exists(select 1 from unnest(p_recipients) u where not attendance_issues.hr_recipient(u)) then raise exception 'Choose authorized HR recipients and enter a reason';end if;
 select to_jsonb(s) into old from attendance_issues.settings s for update;
 update attendance_issues.settings set response_minutes=p_minutes,fallback_ids=p_recipients,changed_by=public.current_hris_user_id(),changed_at=clock_timestamp();
 insert into attendance_issues.audit(actor,action,previous,new_value,reason) values(public.current_hris_user_id(),'response settings changed',old,jsonb_build_object('minutes',p_minutes,'recipients',p_recipients),p_reason);
end $$;

do $$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='attendance_issues' or (n.nspname='public' and p.proname in('submit_attendance_issue','get_attendance_issues','review_attendance_issue','can_read_attendance_attachment','get_attendance_issue_settings','save_attendance_issue_settings')) loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);if f.signature::text like 'public.%' or f.signature::text not like 'attendance_issues.%' then execute format('grant execute on function %s to authenticated',f.signature);end if;end loop;end $$;
revoke all on function private.attendance_day(uuid,date),private.attendance_day_before_issues(uuid,date),private.attendance_review_facts(uuid,date),private.attendance_review_facts_before_issues(uuid,date) from public,anon,authenticated;
notify pgrst,'reload schema';

-- Private authenticated delivery worker, independent of the hosting cron tier.
create extension if not exists pg_net with schema extensions;
create table attendance_issues.worker(id boolean primary key default true check(id),token uuid not null default gen_random_uuid(),endpoint text not null);
alter table attendance_issues.worker enable row level security;
revoke all on attendance_issues.worker from public,anon,authenticated;
insert into attendance_issues.worker(id,endpoint) values(true,'https://hris.thenextperience.com/api/attendance-issues/deliver');
create function attendance_issues.wake_worker() returns void language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from attendance_issues.deliveries where status in('queued','failed','sending') and next_attempt<=clock_timestamp() and coalesce(lease_until,'-infinity')<clock_timestamp() and attempts<8) then
 perform net.http_post(url=>w.endpoint,headers=>jsonb_build_object('Content-Type','application/json','X-Attendance-Worker',w.token::text),body=>'{}'::jsonb,timeout_milliseconds=>1000) from attendance_issues.worker w;
 end if;
end $$;
create function attendance_issues.delivery_trigger() returns trigger language plpgsql security definer set search_path='' as $$begin perform attendance_issues.wake_worker();return null;end $$;
create trigger attendance_issue_delivery_wakeup after insert on attendance_issues.deliveries for each statement execute function attendance_issues.delivery_trigger();
create function public.validate_attendance_worker(p_token text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from attendance_issues.worker where token::text=p_token)$$;
create function attendance_issues.reminders() returns void language plpgsql security definer set search_path='' as $$declare r attendance_issues.requests;mgr uuid;start_at timestamptz;event text;begin
 if not pg_try_advisory_xact_lock(hashtextextended('attendance-issue-reminders',0)) then return;end if;
 for r in select * from attendance_issues.requests where status in('pending','hr_review') loop
 mgr:=private.punch_direct_manager(r.employee_id);
 if mgr is distinct from r.manager_id then
 update attendance_issues.requests set manager_id=mgr,status=case when mgr is null then 'hr_review' else 'pending' end where id=r.id;
 insert into attendance_issues.audit(request_id,action,previous,new_value) values(r.id,'routing refreshed',jsonb_build_object('manager',r.manager_id),jsonb_build_object('manager',mgr));
 if mgr is not null then perform attendance_issues.notify(r.id,mgr,'Pending your approval',r.id||':reroute:'||mgr);else perform attendance_issues.notify_hr(r.id,'Requires HR review — direct manager unavailable',r.id||':no-manager');end if;
 end if;
 select min((r.work_date+(x->>'start')::time) at time zone 'Asia/Manila') into start_at from jsonb_array_elements(r.schedule->'entries') x where x->>'kind'='work';
 event:=case when clock_timestamp()>=r.due_at then 'Overdue' when clock_timestamp()>=start_at then 'Shift has started' when clock_timestamp()>=start_at-interval '1 hour' then 'Shift starts soon' end;
 if event is not null and mgr is not null then perform attendance_issues.notify(r.id,mgr,event,r.id||':'||event||':'||r.revision);end if;
 if clock_timestamp()>=r.due_at then
 perform attendance_issues.notify_hr(r.id,'Overdue attendance request',r.id||':hr-overdue:'||(clock_timestamp() at time zone 'Asia/Manila')::date);
 if r.escalated_at is null then
 update attendance_issues.requests set escalated_at=clock_timestamp() where id=r.id;
 insert into attendance_issues.audit(request_id,action,new_value) values(r.id,'escalated to HR',jsonb_build_object('dueAt',r.due_at));
 perform attendance_issues.notify(r.id,r.employee_id,'Escalated to HR',r.id||':escalated:'||r.revision);
 end if;end if;
 end loop;perform attendance_issues.wake_worker();end $$;
select cron.schedule('attendance-issue-reminders','*/5 * * * *','select attendance_issues.reminders()');
create function public.claim_attendance_issue_email() returns jsonb language plpgsql security definer set search_path='' as $$
declare d attendance_issues.deliveries;r attendance_issues.requests;payload jsonb;tok uuid:=gen_random_uuid();saved text:=current_setting('request.jwt.claims',true);ok boolean;begin
 select * into d from attendance_issues.deliveries where status in('queued','failed','sending') and attempts<8 and next_attempt<=clock_timestamp() and coalesce(lease_until,'-infinity')<clock_timestamp() order by created_at for update skip locked limit 1;
 if d.id is null then return null;end if;
 select * into r from attendance_issues.requests where id=d.request_id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(select auth_user_id from public.hris_users where id=d.recipient),'role','authenticated')::text,true);
 ok:=attendance_issues.can_read(r.id);
 perform set_config('request.jwt.claims',coalesce(saved,''),true);
 if not ok or (d.event in('Pending your approval','Overdue','Shift has started','Shift starts soon') and r.status not in('pending','hr_review')) then
 update attendance_issues.deliveries set status='skipped',error='Recipient no longer authorized or request no longer pending' where id=d.id;
 insert into attendance_issues.audit(request_id,action,new_value) values(r.id,'email skipped',jsonb_build_object('delivery',d.id));return jsonb_build_object('skipped',true);end if;
 select jsonb_build_object('email',h.email,'employeeName',e.full_name,'kind',r.kind,'date',r.work_date,'schedule',r.schedule,'category',r.category,'explanation',r.explanation,'attachment',r.attachment is not null,'event',d.event,'status',r.status,'requestId',r.id,'requestedTime',r.requested_time) into payload from public.hris_users h cross join public.hris_users e where h.id=d.recipient and e.id=r.employee_id;
 update attendance_issues.deliveries set status='sending',attempts=attempts+1,lease_token=tok,lease_until=clock_timestamp()+interval '5 minutes' where id=d.id;
 return jsonb_build_object('id',d.id,'token',tok,'payload',payload);
end $$;
create function public.finish_attendance_issue_email(p_id uuid,p_token uuid,p_provider text,p_error text) returns void language plpgsql security definer set search_path='' as $$declare d attendance_issues.deliveries;begin
 update attendance_issues.deliveries set status=case when p_provider is null then 'failed' else 'sent' end,provider_id=p_provider,error=left(p_error,300),lease_until=null,next_attempt=clock_timestamp()+interval '5 minutes' where id=p_id and lease_token=p_token returning * into d;
 if d.id is null then raise exception 'Delivery lease changed';end if;
 insert into attendance_issues.audit(request_id,action,new_value) values(d.request_id,'email '||d.status,jsonb_build_object('delivery',d.id,'recipient',d.recipient,'attempt',d.attempts,'provider',p_provider,'error',left(p_error,300)));
end $$;
revoke all on function attendance_issues.wake_worker(),attendance_issues.delivery_trigger(),attendance_issues.reminders(),public.validate_attendance_worker(text),public.claim_attendance_issue_email(),public.finish_attendance_issue_email(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.validate_attendance_worker(text),public.claim_attendance_issue_email(),public.finish_attendance_issue_email(uuid,uuid,text,text) to service_role;
