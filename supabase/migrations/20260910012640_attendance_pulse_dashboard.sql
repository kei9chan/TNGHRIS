-- Staffing summaries are a separate, sanitized read model. Existing request RLS,
-- approval authority, schedules and payroll calculations are unchanged.
set local lock_timeout='5s';
create schema attendance_pulse;
revoke all on schema attendance_pulse from public,anon,authenticated;
create table attendance_pulse.settings(
 id boolean primary key default true check(id), attention_ratio numeric not null default 2 check(attention_ratio between 1.1 and 20),
 attention_count integer not null default 3 check(attention_count between 2 and 1000), overlap_count integer not null default 3 check(overlap_count between 2 and 100),
 attention_percent numeric not null default 10 check(attention_percent between 1 and 100),critical_percent numeric not null default 30 check(critical_percent between 1 and 100),
 critical_minimum integer not null default 2 check(critical_minimum between 2 and 100),urgent_minutes integer not null default 60 check(urgent_minutes between 0 and 1440),
 company_count integer not null default 8 check(company_count between 2 and 10000),summary_hour integer not null default 9 check(summary_hour between 0 and 23),
 tracking_from date not null default (now() at time zone 'Asia/Manila')::date,changed_by uuid,changed_at timestamptz not null default clock_timestamp(),check(critical_percent>=attention_percent));
insert into attendance_pulse.settings(id) values(true);
create table attendance_pulse.windows(id uuid primary key default gen_random_uuid(),business_unit_id uuid not null references public.business_units(id),department text,start_time time not null,end_time time not null,label text not null check(length(label) between 3 and 100),minimum_reports integer not null default 2 check(minimum_reports between 2 and 100),unique(business_unit_id,department,start_time,end_time));
create table attendance_pulse.audit(id uuid primary key default gen_random_uuid(),actor uuid,action text not null,work_date date,employee_id uuid,request_id uuid,previous jsonb,new_value jsonb,reason text,created_at timestamptz not null default clock_timestamp());
create trigger immutable before update or delete on attendance_pulse.audit for each row execute function private.payroll_audit_immutable();
create table attendance_pulse.alert_state(recipient uuid not null,work_date date not null,fingerprint text not null default '',transitions integer not null default 0,primary key(recipient,work_date));
create table attendance_pulse.deliveries(id uuid primary key default gen_random_uuid(),recipient uuid not null references public.hris_users(id),work_date date not null,event text not null,event_key text not null unique,payload jsonb not null,status text not null default 'queued',attempts integer not null default 0,next_attempt timestamptz not null default clock_timestamp(),lease_token uuid,lease_until timestamptz,provider_id text,error text,created_at timestamptz not null default clock_timestamp());
create index pulse_delivery_queue on attendance_pulse.deliveries(next_attempt) where status in('queued','retry','sending');
do $$declare t text;begin foreach t in array array['settings','windows','audit','alert_state','deliveries'] loop execute format('alter table attendance_pulse.%I enable row level security',t);execute format('revoke all on attendance_pulse.%I from public,anon,authenticated',t);end loop;end $$;
alter table attendance_issues.requests add column report_source text not null default 'HRIS' check(report_source in('HRIS','GC Reported')),add column submitted_by uuid,add column audience_snapshot jsonb;
create index attendance_issue_pulse_date on attendance_issues.requests(work_date,kind,employee_id);
create function attendance_pulse.capture_source() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' then
 new.submitted_by:=public.current_hris_user_id();
 select jsonb_build_object('businessUnitId',h.business_unit_id,'businessUnit',h.business_unit,'department',h.department,'position',h.position,'employeeName',h.full_name,'employeeCode',h.employee_id,'managerId',new.manager_id,'capturedAt',clock_timestamp()) into new.audience_snapshot from public.hris_users h where h.id=new.employee_id;
 elsif new.report_source is distinct from old.report_source or new.submitted_by is distinct from old.submitted_by or new.audience_snapshot is distinct from old.audience_snapshot then raise exception 'Report source and submission snapshot are immutable' using errcode='42501';end if;
 return new;end $$;
create trigger pulse_source before insert or update on attendance_issues.requests for each row execute function attendance_pulse.capture_source();
create function attendance_pulse.profile(p_actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with r as(select e.role_id from private.effective_role_ids(p_actor) e join public.roles r on r.id=e.role_id and r.is_active),u as(select * from public.hris_users where id=p_actor and lower(status)='active' and auth_user_id is not null)
 select jsonb_build_object('active',exists(select 1 from u),'hr',exists(select 1 from r where role_id in('HR Staff','HR Manager','Admin')),
 'bod',exists(select 1 from r where role_id='Board of Director'),'global',exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id and r.is_active where ur.user_id=p_actor and ur.is_active and ur.scope_type='GLOBAL'),
 'buManager',exists(select 1 from r where role_id='Business Unit Manager'),'homeBu',(select business_unit_id from u),
 'allowedBuIds',coalesce((select jsonb_agg(distinct bu) from public.user_roles ur join public.roles r on r.id=ur.role_id and r.is_active cross join lateral unnest(ur.allowed_business_unit_ids) bu where ur.user_id=p_actor and ur.is_active),'[]'))
$$;
create function attendance_pulse.visible(p_actor uuid,p_employee uuid,p_bu uuid,p_profile jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((p_profile->>'active')::boolean,false) and (
 (p_profile->>'hr')::boolean or ((p_profile->>'bod')::boolean and (p_profile->>'global')::boolean)
 or (p_employee<>p_actor and private.punch_direct_manager(p_employee)=p_actor)
 or (((p_profile->>'buManager')::boolean or (p_profile->>'bod')::boolean) and (p_bu::text=p_profile->>'homeBu' or p_profile->'allowedBuIds' ? p_bu::text)))
$$;
create function attendance_pulse.can_enter(p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select (p->>'active')::boolean and ((p->>'hr')::boolean or (p->>'bod')::boolean or (p->>'buManager')::boolean or exists(select 1 from public.hris_users h where lower(h.status)='active' and h.id<>p_actor and private.punch_direct_manager(h.id)=p_actor)) from (select attendance_pulse.profile(p_actor) p) x
$$;
create function attendance_pulse.hr() returns boolean language sql stable security definer set search_path='' as $$select private.payroll_actor_id() is not null and (attendance_pulse.profile(public.current_hris_user_id())->>'hr')::boolean and private.attendance_admin()$$;
-- Half-open intervals handle overnight work without treating adjacent shifts as overlapping.
create function attendance_pulse.intervals(p_schedule jsonb,p_date date) returns table(starts timestamptz,ends timestamptz) language sql immutable set search_path='' as $$
 select (p_date+(x->>'start')::time) at time zone 'Asia/Manila',
 ((p_date+case when coalesce((x->>'endDayOffset')::integer,0)>0 or (x->>'end')::time<=(x->>'start')::time then 1 else 0 end)+(x->>'end')::time) at time zone 'Asia/Manila'
 from jsonb_array_elements(coalesce(p_schedule->'entries','[]')) x where x->>'kind'='work' and x->>'start' ~ '^\d{2}:\d{2}' and x->>'end' ~ '^\d{2}:\d{2}'
$$;
create function attendance_pulse.read(p_actor uuid,p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p jsonb:=attendance_pulse.profile(p_actor);cfg attendance_pulse.settings;rows0 jsonb;trend jsonb;units jsonb:='[]';concerns jsonb:='[]';b record;cnt integer;approved integer;pending integer;attention integer;usual numeric;baseline_days integer;bu_count integer;scheduled integer;affected_scheduled integer;overlap integer;critical_overlap integer;urgent integer;bu_usual numeric;pct numeric;severity text:='normal';bu_severity text;why jsonb;windows_count integer;begin
 select * into cfg from attendance_pulse.settings;
 if not attendance_pulse.can_enter(p_actor) then return jsonb_build_object('allowed',false);end if;
 if p_date is null or p_date<(now() at time zone 'Asia/Manila')::date-366 or p_date>(now() at time zone 'Asia/Manila')::date+31 then raise exception 'Choose a date within the last year or next month';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'employeeId',r.employee_id,'employeeName',coalesce(r.audience_snapshot->>'employeeName',h.full_name),'employeeCode',coalesce(r.audience_snapshot->>'employeeCode',h.employee_id),
 'businessUnitId',coalesce(r.audience_snapshot->>'businessUnitId',h.business_unit_id::text),'businessUnit',coalesce(r.audience_snapshot->>'businessUnit',h.business_unit,'Unassigned'),'department',coalesce(r.audience_snapshot->>'department',h.department),
 'date',r.work_date,'kind',r.kind,'status',r.status,'source',r.report_source,'schedule',jsonb_build_object('published',r.schedule->'published','publicationId',r.schedule->'publicationId','entries',(select coalesce(jsonb_agg(jsonb_build_object('kind',se->>'kind','start',se->>'start','end',se->>'end','endDayOffset',se->'endDayOffset','name',case when se->>'kind'='work' then 'Scheduled shift' else 'No scheduled work' end)),'[]') from jsonb_array_elements(coalesce(r.schedule->'entries','[]')) se)),'submittedAt',r.submitted_at,'dueAt',r.due_at,'managerId',private.punch_direct_manager(r.employee_id),
 'needsAttention',r.status in('details','hr_review','rejected') or (r.status='pending' and r.due_at<now()),
 'canReadDetails',p_actor=public.current_hris_user_id() and attendance_issues.can_read(r.id),'canReview',p_actor=public.current_hris_user_id() and r.status in('pending','hr_review') and attendance_issues.can_review(r.id),'snapshotAvailable',r.audience_snapshot is not null) order by r.submitted_at desc),'[]') into rows0
 from attendance_issues.requests r join public.hris_users h on h.id=r.employee_id
 where r.work_date=p_date and attendance_pulse.visible(p_actor,r.employee_id,coalesce((r.audience_snapshot->>'businessUnitId')::uuid,h.business_unit_id),p);
 -- One employee per day, even when withdrawn/rejected and replacement reports coexist.
 with days as(select p_date-i d from generate_series(0,28) i),daily as(
 select d,(select count(distinct r.employee_id) from attendance_issues.requests r join public.hris_users h on h.id=r.employee_id where r.work_date=d and r.kind='absence' and r.status not in('withdrawn','cancelled') and attendance_pulse.visible(p_actor,r.employee_id,coalesce((r.audience_snapshot->>'businessUnitId')::uuid,h.business_unit_id),p)) n from days)
 select jsonb_agg(jsonb_build_object('date',d,'count',n,'tracked',d>=cfg.tracking_from) order by d),avg(n) filter(where d<p_date and d>=cfg.tracking_from and extract(isodow from d)=extract(isodow from p_date)),count(*) filter(where d<p_date and d>=cfg.tracking_from and extract(isodow from d)=extract(isodow from p_date)) into trend,usual,baseline_days from daily;
 with active as(select distinct on(x->>'employeeId') x from jsonb_array_elements(rows0) x where x->>'kind'='absence' and x->>'status' not in('withdrawn','cancelled') order by x->>'employeeId',case when x->>'status'='approved' then 0 else 1 end,x->>'submittedAt' desc)
 select count(*),count(*) filter(where x->>'status'='approved'),count(*) filter(where x->>'status'='pending'),count(*) filter(where (x->>'needsAttention')::boolean) into cnt,approved,pending,attention from active;
 for b in select distinct x->>'businessUnitId' id,x->>'businessUnit' name from jsonb_array_elements(rows0) x where x->>'kind'='absence' and x->>'status' not in('withdrawn','cancelled') loop
 bu_severity:='normal';why:='[]';
 select count(distinct x->>'employeeId') into bu_count from jsonb_array_elements(rows0) x where x->>'businessUnitId' is not distinct from b.id and x->>'kind'='absence' and x->>'status' not in('withdrawn','cancelled');
 with latest as(select distinct on(pub.employee_id) pub.* from public.payroll_schedule_publications pub join public.hris_users h on h.id=pub.employee_id where pub.effective_from<=p_date and pub.effective_to>=p_date and (not pub.approval_required or exists(select 1 from public.payroll_schedule_overrides po where po.publication_id=pub.id and po.decision='approve')) and lower(h.status)='active' and h.business_unit_id::text is not distinct from b.id and attendance_pulse.visible(p_actor,h.id,h.business_unit_id,p) order by pub.employee_id,pub.published_at desc,pub.version desc),working as(select l.employee_id from latest l where exists(select 1 from jsonb_array_elements(l.snapshot) s where s->>'date'=p_date::text and s->>'kind'='work'))
 select count(*),count(*) filter(where exists(select 1 from jsonb_array_elements(rows0) x where x->>'employeeId'=w.employee_id::text and x->>'kind'='absence' and x->>'status' not in('withdrawn','cancelled'))) into scheduled,affected_scheduled from working w;
 pct:=case when scheduled>0 then round(100.0*affected_scheduled/scheduled,1) end;
 with reports as(select x->>'employeeId' emp,x->>'department' dept,i.starts,i.ends from jsonb_array_elements(rows0) x cross join lateral attendance_pulse.intervals(x->'schedule',p_date) i where x->>'businessUnitId' is not distinct from b.id and x->>'kind'='absence' and x->>'status' not in('withdrawn','cancelled')),
 points as(select a.starts,count(distinct z.emp) n,count(distinct z.emp) filter(where a.dept is not null and a.dept<>'' and z.dept=a.dept) team_n from reports a join reports z on z.starts<=a.starts and z.ends>a.starts group by a.starts,a.dept)
 select coalesce(max(n),0),coalesce(max(team_n),0) into overlap,critical_overlap from points;
 select count(distinct x->>'employeeId') into windows_count from jsonb_array_elements(rows0) x cross join lateral attendance_pulse.intervals(x->'schedule',p_date) i
 where x->>'businessUnitId' is not distinct from b.id and x->>'kind'='absence' and x->>'status' not in('withdrawn','cancelled') and exists(select 1 from attendance_pulse.windows w where w.business_unit_id::text=b.id and (w.department is null or w.department=x->>'department') and i.starts<((p_date+case when w.end_time<=w.start_time then 1 else 0 end)+w.end_time) at time zone 'Asia/Manila' and i.ends>(p_date+w.start_time) at time zone 'Asia/Manila' and (select count(distinct y->>'employeeId') from jsonb_array_elements(rows0) y cross join lateral attendance_pulse.intervals(y->'schedule',p_date) j where y->>'businessUnitId'=b.id and y->>'kind'='absence' and y->>'status' not in('withdrawn','cancelled') and (w.department is null or w.department=y->>'department') and j.starts<((p_date+case when w.end_time<=w.start_time then 1 else 0 end)+w.end_time) at time zone 'Asia/Manila' and j.ends>(p_date+w.start_time) at time zone 'Asia/Manila')>=w.minimum_reports);
 select count(*) into urgent from jsonb_array_elements(rows0) x where x->>'businessUnitId' is not distinct from b.id and x->>'kind'='absence' and x->>'status'='pending' and (x->>'dueAt')::timestamptz<now() and exists(select 1 from attendance_pulse.intervals(x->'schedule',p_date) i where now()>=i.starts-make_interval(mins=>cfg.urgent_minutes) and now()<i.ends);
 if bu_count>=cfg.attention_count then why:=why||jsonb_build_array(jsonb_build_object('code','count','text',bu_count||' reports at '||b.name));end if;
 if overlap>=cfg.overlap_count then why:=why||jsonb_build_array(jsonb_build_object('code','overlap','text',overlap||' overlapping shifts at '||b.name));end if;
 if pct>=cfg.attention_percent then why:=why||jsonb_build_array(jsonb_build_object('code','coverage','text',pct||'% of scheduled employees reported at '||b.name));end if;
 if urgent>0 then why:=why||jsonb_build_array(jsonb_build_object('code','urgent','text',urgent||' overdue urgent manager reviews at '||b.name));end if;
 if windows_count>0 then why:=why||jsonb_build_array(jsonb_build_object('code','critical_window','text',windows_count||' reports affect configured critical coverage at '||b.name));end if;
 if jsonb_array_length(why)>0 then bu_severity:='attention';end if;
 if windows_count>0 or urgent>0 or (pct>=cfg.critical_percent and affected_scheduled>=cfg.critical_minimum) or critical_overlap>=cfg.overlap_count then bu_severity:='critical';end if;
 if bu_severity='critical' then severity:='critical';elsif bu_severity='attention' and severity='normal' then severity:='attention';end if;
 select avg(n) into bu_usual from (select (select count(distinct r.employee_id) from attendance_issues.requests r join public.hris_users h on h.id=r.employee_id where r.work_date=p_date-i*7 and r.kind='absence' and r.status not in('withdrawn','cancelled') and coalesce(r.audience_snapshot->>'businessUnitId',h.business_unit_id::text) is not distinct from b.id and attendance_pulse.visible(p_actor,r.employee_id,coalesce((r.audience_snapshot->>'businessUnitId')::uuid,h.business_unit_id),p)) n from generate_series(1,4) i where p_date-i*7>=cfg.tracking_from) q;
 units:=units||jsonb_build_array(jsonb_build_object('id',b.id,'name',b.name,'count',bu_count,'scheduled',scheduled,'affectedScheduled',affected_scheduled,'percent',pct,'overlap',overlap,'severity',bu_severity,'usual',round(bu_usual,1)));
 select concerns||coalesce(jsonb_agg(x||jsonb_build_object('businessUnitId',b.id,'severity',bu_severity)),'[]') into concerns from jsonb_array_elements(why) x;
 end loop;
 if baseline_days>=2 and usual>0 and cnt>=usual*cfg.attention_ratio then
 concerns:=concerns||jsonb_build_array(jsonb_build_object('code','baseline','text','Reports are above the comparable-workday threshold','severity','attention'));
 if severity='normal' then severity:='attention';end if;end if;
 return jsonb_build_object('allowed',true,'date',p_date,'generatedAt',clock_timestamp(),'scope',case when (p->>'hr')::boolean or ((p->>'bod')::boolean and (p->>'global')::boolean) then 'Company-wide' when (p->>'buManager')::boolean then 'Your business units and direct reports' else 'Your authorized teams' end,'canManage',p_actor=public.current_hris_user_id() and attendance_pulse.hr(),'reported',cnt,'approved',approved,'pending',pending,'attention',attention,'usual',case when baseline_days>=2 then round(usual,1) end,'baselineDays',baseline_days,'severity',severity,'units',units,'concerns',concerns,'trend',trend,'rows',rows0);
end $$;
create function public.get_attendance_pulse(p_date date default (now() at time zone 'Asia/Manila')::date) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if private.payroll_actor_id() is null then raise exception 'Active sign-in required' using errcode='42501';end if;
 return attendance_pulse.read(public.current_hris_user_id(),p_date);end $$;
create function public.log_gc_attendance_report(p_employee uuid,p_date date,p_explanation text,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();rid uuid;mgr uuid;mins integer;begin
 if not attendance_pulse.hr() or not public.can_access_hris_user(p_employee) then raise exception 'Authorized HR access to this employee required' using errcode='42501';end if;
 if not exists(select 1 from public.hris_users where id=p_employee and lower(status)='active') then raise exception 'Select an active employee';end if;
 if p_date is null or p_date<(now() at time zone 'Asia/Manila')::date-90 or p_date>(now() at time zone 'Asia/Manila')::date or p_key is null or length(trim(p_explanation)) not between 3 and 1000 then raise exception 'Choose a valid report date and short factual note';end if;
 perform pg_advisory_xact_lock(hashtextextended('attendance-issue:'||p_employee,0));
 select id into rid from attendance_issues.requests where employee_id=p_employee and request_key=p_key;
 if rid is not null then return rid;end if;
 if exists(select 1 from attendance_issues.requests where employee_id=p_employee and work_date=p_date and kind='absence' and status not in('withdrawn','cancelled')) then raise exception 'An attendance report already exists for this employee and date. Open the existing report.';end if;
 mgr:=private.punch_direct_manager(p_employee);select response_minutes into mins from attendance_issues.settings;
 insert into attendance_issues.requests(employee_id,manager_id,kind,work_date,category,explanation,confirmed,schedule,status,request_key,due_at,report_source)
 values(p_employee,mgr,'absence',p_date,'Other',trim(p_explanation),false,private.attendance_schedule(p_employee,p_date),case when mgr is null then 'hr_review' else 'pending' end,p_key,clock_timestamp()+make_interval(mins=>mins),'GC Reported') returning id into rid;
 insert into attendance_issues.audit(request_id,actor,action,new_value,reason) values(rid,actor,'GC report logged',(select to_jsonb(r) from attendance_issues.requests r where id=rid),'HR recorded employee GC report; approval still required');
 perform attendance_issues.notify(rid,p_employee,'GC report logged — awaiting approval',rid||':gc:employee');
 if mgr is null then perform attendance_issues.notify_hr(rid,'GC report requires HR fallback',rid||':gc:hr');else perform attendance_issues.notify(rid,mgr,'GC report pending your approval',rid||':gc:manager');end if;
 return rid;end $$;
create function public.get_attendance_pulse_settings() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not attendance_pulse.hr() then raise exception 'Authorized HR settings access required' using errcode='42501';end if;
 return jsonb_build_object('settings',(select to_jsonb(s) from attendance_pulse.settings s),'windows',(select coalesce(jsonb_agg(to_jsonb(w)),'[]') from attendance_pulse.windows w),
 'employees',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.full_name,'code',h.employee_id,'businessUnit',h.business_unit) order by h.full_name),'[]') from public.hris_users h where lower(h.status)='active' and public.can_access_hris_user(h.id)),
 'businessUnits',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name),'[]') from public.business_units b),
 'changedBy',(select h.full_name from attendance_pulse.settings s join public.hris_users h on h.id=s.changed_by));end $$;
create function public.save_attendance_pulse_settings(p_data jsonb,p_windows jsonb,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare prev jsonb;w jsonb;begin
 if not attendance_pulse.hr() then raise exception 'Authorized HR settings access required' using errcode='42501';end if;
 if length(trim(coalesce(p_reason,'')))<3 or jsonb_typeof(p_windows)<>'array' or jsonb_array_length(p_windows)>100 then raise exception 'Enter a reason and valid coverage windows';end if;
 select to_jsonb(s) into prev from attendance_pulse.settings s for update;
 update attendance_pulse.settings set attention_ratio=(p_data->>'attention_ratio')::numeric,attention_count=(p_data->>'attention_count')::integer,overlap_count=(p_data->>'overlap_count')::integer,attention_percent=(p_data->>'attention_percent')::numeric,critical_percent=(p_data->>'critical_percent')::numeric,critical_minimum=(p_data->>'critical_minimum')::integer,urgent_minutes=(p_data->>'urgent_minutes')::integer,company_count=(p_data->>'company_count')::integer,summary_hour=(p_data->>'summary_hour')::integer,changed_by=public.current_hris_user_id(),changed_at=clock_timestamp();
 prev:=jsonb_build_object('settings',prev,'windows',(select coalesce(jsonb_agg(to_jsonb(ww)),'[]') from attendance_pulse.windows ww));
 delete from attendance_pulse.windows;
 for w in select value from jsonb_array_elements(p_windows) loop insert into attendance_pulse.windows(business_unit_id,department,start_time,end_time,label,minimum_reports) values((w->>'business_unit_id')::uuid,nullif(trim(w->>'department'),''),(w->>'start_time')::time,(w->>'end_time')::time,trim(w->>'label'),(w->>'minimum_reports')::integer);end loop;
 insert into attendance_pulse.audit(actor,action,previous,new_value,reason) values(public.current_hris_user_id(),'settings changed',prev,jsonb_build_object('settings',p_data,'windows',p_windows),trim(p_reason));end $$;
create function public.attendance_pulse_followup(p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare r attendance_issues.requests;p jsonb:=attendance_pulse.profile(public.current_hris_user_id());key text;begin
 select * into r from attendance_issues.requests where id=p_id;
 if private.payroll_actor_id() is null or not attendance_pulse.can_enter(public.current_hris_user_id()) or r.id is null or not attendance_pulse.visible(public.current_hris_user_id(),r.employee_id,coalesce((r.audience_snapshot->>'businessUnitId')::uuid,(select business_unit_id from public.hris_users where id=r.employee_id)),p) then raise exception 'Scoped staffing follow-up access required' using errcode='42501';end if;
 if r.status not in('pending','details','hr_review') then raise exception 'This request no longer needs a reminder';end if;
 key:=r.id||':pulse-followup:'||p_action||':'||(now() at time zone 'Asia/Manila')::date;
 if p_action='manager' then perform attendance_issues.notify(r.id,private.punch_direct_manager(r.employee_id),'Staffing follow-up requested',key);
 elsif p_action='hr' then perform attendance_issues.notify_hr(r.id,'Staffing follow-up requested',key);else raise exception 'Choose manager or HR follow-up';end if;
 insert into attendance_pulse.audit(actor,action,request_id,employee_id,work_date,new_value) values(public.current_hris_user_id(),'follow-up requested',r.id,r.employee_id,r.work_date,jsonb_build_object('target',p_action));end $$;
-- Grant only individually authorized RPCs; private helpers remain inaccessible.
revoke all on all functions in schema attendance_pulse from public,anon,authenticated;
revoke all on function public.get_attendance_pulse(date),public.log_gc_attendance_report(uuid,date,text,uuid),public.get_attendance_pulse_settings(),public.save_attendance_pulse_settings(jsonb,jsonb,text),public.attendance_pulse_followup(uuid,text) from public,anon;
grant execute on function public.get_attendance_pulse(date),public.log_gc_attendance_report(uuid,date,text,uuid),public.get_attendance_pulse_settings(),public.save_attendance_pulse_settings(jsonb,jsonb,text),public.attendance_pulse_followup(uuid,text) to authenticated;

-- Controlled daily summaries and condition-transition alerts use the existing email worker.
create table attendance_pulse.runs(slot timestamptz primary key,created_at timestamptz not null default clock_timestamp());
alter table attendance_pulse.runs enable row level security;
revoke all on attendance_pulse.runs from public,anon,authenticated;
create function attendance_pulse.queue(p_recipient uuid,p_date date,p_event text,p_key text,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$declare did uuid;begin
 insert into attendance_pulse.deliveries(recipient,work_date,event,event_key,payload) values(p_recipient,p_date,p_event,p_key,p_data-'rows') on conflict(event_key) do nothing returning id into did;
 if did is null then return;end if;
 insert into public.notifications(user_id,type,title,message,link,dedupe_key) values(p_recipient::text,'info',p_event,(p_data->>'reported')||' employees reported unable to work. '||(p_data->>'pending')||' pending approval.','/payroll/attendance-pulse?date='||p_date,'attendance-pulse:'||p_key) on conflict do nothing;
 insert into attendance_pulse.audit(action,work_date,new_value) values('dashboard alert and email queued',p_date,jsonb_build_object('recipient',p_recipient,'delivery',did,'event',p_event,'summary',p_data-'rows'));end $$;
create function attendance_pulse.refresh_alerts() returns void language plpgsql security definer set search_path='' as $$
declare slot timestamptz:=date_bin('15 minutes',now(),'2020-01-01'::timestamptz);inserted integer;d date:=(now() at time zone 'Asia/Manila')::date;h record;p jsonb;data jsonb;finger text;old attendance_pulse.alert_state;cfg attendance_pulse.settings;begin
 insert into attendance_pulse.runs(slot) values(slot) on conflict do nothing;get diagnostics inserted=row_count;if inserted=0 then return;end if;
 select * into cfg from attendance_pulse.settings;
 for h in select distinct u.id from public.hris_users u join lateral private.effective_role_ids(u.id) e on true join public.roles r on r.id=e.role_id and r.is_active where lower(u.status)='active' and u.auth_user_id is not null and r.id in('HR Staff','HR Manager','Admin','Business Unit Manager','Board of Director') loop
 p:=attendance_pulse.profile(h.id);data:=attendance_pulse.read(h.id,d);
 if not coalesce((data->>'allowed')::boolean,false) then continue;end if;
 -- Board receives summaries only for company-wide/critical concerns, not each request.
 if (p->>'bod')::boolean and not (p->>'hr')::boolean and not (data->>'severity'='critical' or ((p->>'global')::boolean and (data->>'reported')::integer>=cfg.company_count)) then continue;end if;
 if extract(hour from now() at time zone 'Asia/Manila')>=cfg.summary_hour then perform attendance_pulse.queue(h.id,d,'Daily attendance pulse',h.id||':'||d||':daily',data);end if;
 select coalesce(string_agg(concat(x->>'businessUnitId',':',x->>'code',':',x->>'severity'),'|' order by x->>'businessUnitId',x->>'code'),'normal') into finger from jsonb_array_elements(data->'concerns') x;
 insert into attendance_pulse.alert_state(recipient,work_date) values(h.id,d) on conflict do nothing;
 select * into old from attendance_pulse.alert_state where recipient=h.id and work_date=d for update;
 if finger is distinct from old.fingerprint then
 update attendance_pulse.alert_state set fingerprint=finger,transitions=transitions+case when data->>'severity'<>'normal' then 1 else 0 end where recipient=h.id and work_date=d;
 insert into attendance_pulse.audit(action,work_date,previous,new_value) values('staffing condition changed',d,jsonb_build_object('fingerprint',old.fingerprint),jsonb_build_object('recipient',h.id,'fingerprint',finger,'severity',data->>'severity'));
 if data->>'severity'<>'normal' and old.transitions<3 then perform attendance_pulse.queue(h.id,d,case when data->>'severity'='critical' then 'Critical staffing concern' else 'Attendance needs attention' end,h.id||':'||d||':condition:'||old.transitions,data);end if;
 end if;
 end loop;
end $$;
-- Same secret-backed worker. No token is exposed to the browser or pulse readers.
create function attendance_pulse.wake_worker() returns void language plpgsql security definer set search_path='' as $$declare w attendance_issues.worker;begin
 if not exists(select 1 from attendance_pulse.deliveries where status in('queued','retry','sending') and next_attempt<=now() and (lease_until is null or lease_until<now())) then return;end if;
 select * into w from attendance_issues.worker;
 perform net.http_post(url:=w.endpoint,headers:=jsonb_build_object('Content-Type','application/json','X-Attendance-Worker',w.token::text),body:='{}',timeout_milliseconds:=1000);
end $$;
create function public.claim_attendance_pulse_email() returns jsonb language plpgsql security definer set search_path='' as $$
declare d attendance_pulse.deliveries;token uuid:=gen_random_uuid();data jsonb;email text;begin
 select * into d from attendance_pulse.deliveries where status in('queued','retry','sending') and next_attempt<=now() and (lease_until is null or lease_until<now()) and attempts<6 order by created_at for update skip locked limit 1;
 if d.id is null then return null;end if;
 if not attendance_pulse.can_enter(d.recipient) then update attendance_pulse.deliveries set status='skipped',error='Recipient no longer has staffing access' where id=d.id;insert into attendance_pulse.audit(action,work_date,new_value) values('email skipped',d.work_date,jsonb_build_object('delivery',d.id));return '{"skipped":true}';end if;
 -- Refresh scope at dispatch; queued data cannot outlive a permission change.
 data:=attendance_pulse.read(d.recipient,d.work_date)-'rows';select h.email into email from public.hris_users h where h.id=d.recipient;
 update attendance_pulse.deliveries set status='sending',attempts=attempts+1,lease_token=token,lease_until=now()+interval '5 minutes',payload=data where id=d.id;
 insert into attendance_pulse.audit(action,work_date,previous,new_value) values('email delivery claimed',d.work_date,jsonb_build_object('status',d.status),jsonb_build_object('delivery',d.id,'attempt',d.attempts+1));
 return jsonb_build_object('id',d.id,'token',token,'payload',data||jsonb_build_object('email',email,'event',d.event));end $$;
create function public.finish_attendance_pulse_email(p_id uuid,p_token uuid,p_provider text,p_error text) returns void language plpgsql security definer set search_path='' as $$declare d attendance_pulse.deliveries;begin
 select * into d from attendance_pulse.deliveries where id=p_id and lease_token=p_token and status='sending' for update;if d.id is null then return;end if;
 update attendance_pulse.deliveries set status=case when p_provider is not null then 'sent' when attempts>=6 then 'failed' else 'retry' end,provider_id=p_provider,error=left(p_error,500),lease_until=null,next_attempt=now()+make_interval(mins=>least(60,(2^attempts)::integer)) where id=p_id;
 insert into attendance_pulse.audit(action,work_date,previous,new_value) values('email delivery result',d.work_date,jsonb_build_object('status',d.status),jsonb_build_object('delivery',d.id,'provider',p_provider,'error',left(p_error,500),'attempt',d.attempts));end $$;
alter function attendance_issues.reminders() rename to reminders_before_pulse;
create function attendance_issues.reminders() returns void language plpgsql security definer set search_path='' as $$begin
 perform attendance_issues.reminders_before_pulse();
 -- Pulse failure must not prevent existing attendance reminders.
 begin perform attendance_pulse.refresh_alerts();perform attendance_pulse.wake_worker();exception when others then insert into attendance_pulse.audit(action,new_value) values('pulse reminder processing failed',jsonb_build_object('error',left(sqlerrm,500)));end;
end $$;
revoke all on all functions in schema attendance_pulse from public,anon,authenticated;
revoke all on function attendance_issues.reminders(),attendance_issues.reminders_before_pulse() from public,anon,authenticated;
revoke all on function public.claim_attendance_pulse_email(),public.finish_attendance_pulse_email(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_attendance_pulse_email(),public.finish_attendance_pulse_email(uuid,uuid,text,text) to service_role;
