set local lock_timeout='5s';
-- Additive profile photos: a private bucket and versioned references, not random portraits.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('employee-profile-photos','employee-profile-photos',false,2097152,array['image/jpeg','image/png','image/webp']);
create table public.employee_profile_photos(id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.hris_users(id),storage_path text not null unique,created_by uuid not null references public.hris_users(id) default public.current_hris_user_id(),created_at timestamptz not null default clock_timestamp());
alter table public.employee_profile_photos enable row level security;
grant select,insert on public.employee_profile_photos to authenticated;
create policy profile_photo_read on public.employee_profile_photos for select to authenticated using(public.can_access_hris_user(employee_id));
create policy profile_photo_add on public.employee_profile_photos for insert to authenticated with check(created_by=public.current_hris_user_id() and (employee_id=public.current_hris_user_id() or public.can_manage_employee_documents(employee_id)) and split_part(storage_path,'/',1)=employee_id::text and exists(select 1 from storage.objects o where o.bucket_id='employee-profile-photos' and o.name=storage_path));
create policy profile_photo_object_read on storage.objects for select to authenticated using(bucket_id='employee-profile-photos' and exists(select 1 from public.hris_users h where h.id::text=split_part(name,'/',1) and public.can_access_hris_user(h.id)));
create policy profile_photo_object_add on storage.objects for insert to authenticated with check(bucket_id='employee-profile-photos' and exists(select 1 from public.hris_users h where h.id::text=split_part(name,'/',1) and (h.id=public.current_hris_user_id() or public.can_manage_employee_documents(h.id))));

create table public.schedule_day_statuses(id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.hris_users(id),work_date date not null,revision integer not null,tag text check(tag in('rest','skeletal','company_holiday','absence')),reason text not null,created_by uuid not null references public.hris_users(id),created_at timestamptz not null default clock_timestamp(),unique(employee_id,work_date,revision));
alter table public.schedule_day_statuses enable row level security;revoke all on public.schedule_day_statuses from public,anon,authenticated;
create trigger immutable before update or delete on public.schedule_day_statuses for each row execute function private.payroll_audit_immutable();
create function private.schedule_day_status(p_employee uuid,p_date date) returns jsonb language sql stable security definer set search_path='' as $$select to_jsonb(s) from public.schedule_day_statuses s where employee_id=p_employee and work_date=p_date order by revision desc limit 1$$;
create function public.set_schedule_day_status(p_employee uuid,p_date date,p_tag text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare v integer;outid uuid;begin
 if not private.payroll_schedule_can_edit(p_employee) then raise exception 'Existing schedule management access required' using errcode='42501';end if;
 if p_date is null or length(trim(p_reason))<3 or p_tag is not null and p_tag not in('rest','skeletal','company_holiday','absence') then raise exception 'Choose a day status and reason';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-schedule-publication',0));
 if p_tag in('skeletal','absence') and not exists(select 1 from public.shift_assignments a join public.shift_templates t on t.id=a.shift_template_id where a.employee_id=p_employee and a.date=p_date and t.schedule_kind='work') then raise exception 'Assign the expected working shift first, then apply this status.';end if;
 if p_tag='company_holiday' and not exists(select 1 from public.holidays where date=p_date) then raise exception 'HR must register this Company Holiday in the existing holiday calendar first.';end if;
 select coalesce(max(revision),0)+1 into v from public.schedule_day_statuses where employee_id=p_employee and work_date=p_date;
 insert into public.schedule_day_statuses(employee_id,work_date,revision,tag,reason,created_by) values(p_employee,p_date,v,p_tag,trim(p_reason),public.current_hris_user_id()) returning id into outid;return outid;end $$;
create function public.get_schedule_day_statuses(p_employees uuid[],p_from date,p_to date) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.schedule_day_statuses s where employee_id=any(p_employees) and work_date between p_from and p_to and p_to-p_from between 0 and 62 and private.payroll_schedule_can_read(employee_id) and not exists(select 1 from public.schedule_day_statuses n where n.employee_id=s.employee_id and n.work_date=s.work_date and n.revision>s.revision)
$$;
-- Compose status revisions over the existing roster without deleting assignments.
alter function private.payroll_schedule_draft(uuid,date) rename to payroll_pre_status_draft;
create function private.payroll_schedule_draft(p_employee uuid,p_week date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb:=private.payroll_pre_status_draft(p_employee,p_week);outp jsonb:='[]';d date;s jsonb;entries jsonb;begin
 for d in select generate_series(p_week,p_week+6,'1 day')::date loop
 s:=private.schedule_day_status(p_employee,d);
 select coalesce(jsonb_agg(x order by x->>'id'),'[]') into entries from jsonb_array_elements(base) x where (x->>'date')::date=d;
 if s->>'tag' in('rest','company_holiday') then
 entries:=jsonb_build_array(jsonb_build_object('id',s->>'id','employeeId',p_employee,'date',d,'kind',case when s->>'tag'='rest' then 'rest' else 'no_schedule' end,'name',case when s->>'tag'='rest' then 'Rest Day' else 'Company Holiday' end,'statusTag',s->>'tag','statusRevision',s->'revision','start','00:00:00','end','00:00:00','flexible',false,'breakMinutes',0,'graceMinutes',5));
 elsif s->>'tag' in('skeletal','absence') then select coalesce(jsonb_agg(x||jsonb_build_object('statusTag',s->>'tag','statusRevision',s->'revision') order by x->>'id'),'[]') into entries from jsonb_array_elements(entries) x;end if;
 outp:=outp||entries;end loop;return outp;end $$;
-- Approved leave is an authoritative display/clock overlay. Payroll retains original hours and its existing leave source.
create table public.schedule_leave_audit(id uuid primary key default gen_random_uuid(),request_id uuid not null references public.leave_requests(id),snapshot jsonb not null,created_at timestamptz not null default clock_timestamp());
alter table public.schedule_leave_audit enable row level security;revoke all on public.schedule_leave_audit from public,anon,authenticated;
create trigger immutable before update or delete on public.schedule_leave_audit for each row execute function private.payroll_audit_immutable();
create function private.audit_schedule_leave() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.schedule_leave_audit(request_id,snapshot) values(new.id,to_jsonb(new));return new;end $$;
create trigger schedule_leave_audit after insert or update of status,start_date,end_date,start_time,end_time,leave_type_id on public.leave_requests for each row execute function private.audit_schedule_leave();
create function private.approved_schedule_leave(p_employee uuid,p_date date) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',t.name,'paid',t.paid,'startTime',l.start_time,'endTime',l.end_time,'fullDay',nullif(l.start_time,'') is null and nullif(l.end_time,'') is null)),'[]') from public.leave_requests l join public.leave_types t on t.id=l.leave_type_id where l.employee_id=p_employee and p_date between l.start_date and l.end_date and l.status='Approved' and not coalesce(l.approver_configuration_required,false)
$$;
alter function private.attendance_schedule(uuid,date) rename to attendance_pre_leave_schedule;
create function private.attendance_schedule(p_employee uuid,p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sch jsonb:=private.attendance_pre_leave_schedule(p_employee,p_date);ls jsonb:=private.approved_schedule_leave(p_employee,p_date);l jsonb;begin
 if exists(select 1 from jsonb_array_elements(ls) x where (x->>'fullDay')::boolean) then
 select x into l from jsonb_array_elements(ls) x where (x->>'fullDay')::boolean limit 1;
 sch:=sch||jsonb_build_object('originalEntries',sch->'entries','entries',jsonb_build_array(jsonb_build_object('id',l->>'id','name',case when (l->>'paid')::boolean then 'Paid Leave' else 'Unpaid Leave' end,'kind','no_schedule','statusTag',case when (l->>'paid')::boolean then 'paid_leave' else 'unpaid_leave' end,'start','00:00:00','end','00:00:00','flexible',false,'breakMinutes',0)));
 end if;return sch||jsonb_build_object('approvedLeave',ls);end $$;
-- Scope and configuration for automated review, off until HR/Admin explicitly enables a BU.
create table public.attendance_review_policies(id uuid primary key default gen_random_uuid(),business_unit_id uuid not null references public.business_units(id),revision integer not null,enabled boolean not null,effective_from date not null,late_minutes integer not null check(late_minutes between 0 and 240),late_count integer not null check(late_count between 1 and 60),window_days integer not null check(window_days between 1 and 90),auto_ir boolean not null,created_by uuid not null references public.hris_users(id),created_at timestamptz not null default clock_timestamp(),unique(business_unit_id,revision));
create table public.attendance_review_flags(id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.hris_users(id),business_unit_id uuid not null references public.business_units(id),work_date date not null,kind text not null check(kind in('absence','tardiness')),evidence jsonb not null,policy_id uuid not null references public.attendance_review_policies(id),status text not null default 'review' check(status in('review','resolved','dismissed')),incident_id uuid references public.incident_reports(id),created_at timestamptz not null default clock_timestamp(),unique(employee_id,work_date,kind));
create table public.attendance_review_audit(id uuid primary key default gen_random_uuid(),flag_id uuid not null references public.attendance_review_flags(id),action text not null,note text not null,actor_id uuid references public.hris_users(id),created_at timestamptz not null default clock_timestamp());
create function private.review_can_manage_bu(p_bu uuid) returns boolean language sql stable security definer set search_path='' as $$select private.attendance_admin() and exists(select 1 from public.hris_users h where h.business_unit_id=p_bu and public.can_access_hris_user(h.id))$$;
create function public.save_attendance_review_policy(p_bu uuid,p_enabled boolean,p_from date,p_minutes integer,p_count integer,p_window integer,p_auto_ir boolean) returns uuid language plpgsql security definer set search_path='' as $$declare outid uuid;begin
 if not private.review_can_manage_bu(p_bu) then raise exception 'Scoped HR/Admin access required' using errcode='42501';end if;
 if p_from<(statement_timestamp() at time zone 'Asia/Manila')::date then raise exception 'Choose today or a future effective date. Historical attendance must be reviewed separately.';end if;
 perform pg_advisory_xact_lock(hashtextextended('attendance-review-policy:'||p_bu,0));
 insert into public.attendance_review_policies(business_unit_id,revision,enabled,effective_from,late_minutes,late_count,window_days,auto_ir,created_by) values(p_bu,coalesce((select max(revision)+1 from public.attendance_review_policies where business_unit_id=p_bu),1),p_enabled,p_from,p_minutes,p_count,p_window,p_auto_ir,public.current_hris_user_id()) returning id into outid;return outid;end $$;
create function public.get_attendance_review() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if private.payroll_actor_id() is null then raise exception 'Active sign-in required' using errcode='42501';end if;
 return jsonb_build_object('canManage',private.attendance_admin(),'policies',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.attendance_review_policies p where private.review_can_manage_bu(p.business_unit_id) and not exists(select 1 from public.attendance_review_policies n where n.business_unit_id=p.business_unit_id and n.revision>p.revision)),
 'businessUnits',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name)),'[]') from public.business_units b where private.review_can_manage_bu(b.id)),
 'flags',(select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('employeeName',h.full_name,'canResolve',private.review_can_manage_bu(f.business_unit_id)) order by f.work_date desc),'[]') from public.attendance_review_flags f join public.hris_users h on h.id=f.employee_id where (private.review_can_manage_bu(f.business_unit_id) or private.punch_direct_manager(f.employee_id)=public.current_hris_user_id()) and f.work_date>=(statement_timestamp() at time zone 'Asia/Manila')::date-90));end $$;
create function public.resolve_attendance_review(p_id uuid,p_status text,p_note text) returns void language plpgsql security definer set search_path='' as $$declare f public.attendance_review_flags;begin select * into f from public.attendance_review_flags where id=p_id for update;
 if f.id is null or not private.review_can_manage_bu(f.business_unit_id) then raise exception 'Scoped HR/Admin access required' using errcode='42501';end if;
 if p_status not in('resolved','dismissed') or length(trim(p_note))<3 then raise exception 'Choose a resolution and enter the review note';end if;
 update public.attendance_review_flags set status=p_status where id=p_id;insert into public.attendance_review_audit(flag_id,action,note,actor_id) values(p_id,p_status,p_note,public.current_hris_user_id());end $$;
create function private.attendance_review_facts(p_emp uuid,p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sch jsonb:=private.attendance_pre_leave_schedule(p_emp,p_date);ss timestamptz;se timestamptz;ev jsonb;first_in timestamptz;sid uuid;begin
 if not coalesce((sch->>'published')::boolean,false) or jsonb_array_length(sch->'entries')=0 then return jsonb_build_object('eligible',false,'reason','Missing or unpublished schedule');end if;
 if exists(select 1 from jsonb_array_elements(sch->'entries') x where x->>'kind'<>'work' or coalesce((x->>'flexible')::boolean,false)) then return jsonb_build_object('eligible',false,'reason','Non-working or flexible schedule');end if;
 if not coalesce((private.attendance_exception(p_emp,p_date)->>'requires_clock')::boolean,true) then return jsonb_build_object('eligible',false,'reason','Clocking exemption');end if;
 if exists(select 1 from public.leave_requests where employee_id=p_emp and p_date between start_date and end_date and status not in('Rejected','Disapproved','Cancelled','Draft')) then return jsonb_build_object('eligible',false,'reason','Approved or unresolved leave');end if;
 if exists(select 1 from public.attendance_punch_requests where employee_id=p_emp and work_date=p_date and status in('pending','approved')) then return jsonb_build_object('eligible',false,'reason','Missed punch under review');end if;
 select min((p_date+(x->>'start')::time) at time zone 'Asia/Manila'),max(((p_date+coalesce((x->>'endDayOffset')::integer,0))+(x->>'end')::time) at time zone 'Asia/Manila') into ss,se from jsonb_array_elements(sch->'entries') x;
 if ss is null or se<=ss then return jsonb_build_object('eligible',false,'reason','Invalid shift boundaries');end if;
 select id into sid from public.attendance_clock_sessions where employee_id=p_emp and work_date=p_date;
 if sid is not null then ev:=private.attendance_session_events(sid);else select coalesce(jsonb_agg(jsonb_build_object('type',type,'timestamp',timestamp)),'[]') into ev from public.time_events where employee_id=p_emp and timestamp between ss-interval '4 hours' and se+interval '8 hours';end if;
 select min((x->>'timestamp')::timestamptz) into first_in from jsonb_array_elements(ev) x where x->>'type' in('CLOCK_IN','ClockIn','clock_in');
 return jsonb_build_object('eligible',true,'publicationId',sch->>'publicationId','version',sch->'version','shiftStart',ss,'shiftEnd',se,'firstIn',first_in,'hasPunch',jsonb_array_length(ev)>0,'lateMinutes',case when first_in is null then 0 else greatest(0,ceil(extract(epoch from(first_in-ss))/60)-5) end);
end $$;
create function private.scan_attendance_review() returns integer language plpgsql security definer set search_path='' as $$
declare p public.attendance_review_policies;h public.hris_users;d date;day0 date:=(statement_timestamp() at time zone 'Asia/Manila')::date;facts jsonb;kind text;cnt integer;fid uuid;ir uuid;mgr uuid;total integer:=0;begin
 if not pg_try_advisory_xact_lock(hashtextextended('attendance-review-scan',0)) then return 0;end if;
 for p in select x.* from public.attendance_review_policies x where x.enabled and x.effective_from<=day0 and not exists(select 1 from public.attendance_review_policies n where n.business_unit_id=x.business_unit_id and n.revision>x.revision) loop
 -- Keep the configured accountable reporter active; never impersonate their JWT.
 if not exists(select 1 from public.hris_users where id=p.created_by and lower(status)='active') then continue;end if;
 for h in select * from public.hris_users where business_unit_id=p.business_unit_id and lower(status)='active' and not coalesce(is_duplicate,false) loop
 for d in select generate_series(greatest(day0-2,p.effective_from),day0,'1 day')::date loop
 if h.date_hired>d or h.end_date<d then continue;end if;
 facts:=private.attendance_review_facts(h.id,d);if not (facts->>'eligible')::boolean then continue;end if;kind:=null;cnt:=0;
 if not(facts->>'hasPunch')::boolean and statement_timestamp()>=(facts->>'shiftEnd')::timestamptz then kind:='absence';
 elsif facts->>'firstIn' is not null and (facts->>'lateMinutes')::integer>0 then
 select count(*) into cnt from generate_series(greatest(d-p.window_days+1,p.effective_from),d,'1 day') dt cross join lateral (select private.attendance_review_facts(h.id,dt::date) f) q where (f->>'eligible')::boolean and (f->>'lateMinutes')::integer>0;
 if (facts->>'lateMinutes')::integer>p.late_minutes or cnt>p.late_count then kind:='tardiness';end if;end if;
 if kind is null then continue;end if;
 insert into public.attendance_review_flags(employee_id,business_unit_id,work_date,kind,evidence,policy_id) values(h.id,h.business_unit_id,d,kind,facts||jsonb_build_object('lateCount',cnt,'windowDays',p.window_days,'thresholdMinutes',p.late_minutes,'thresholdCount',p.late_count),p.id) on conflict(employee_id,work_date,kind) do nothing returning id into fid;
 if fid is null then continue;end if;total:=total+1;
 if p.auto_ir then
 insert into public.incident_reports(category,description,location,date_time,reported_by,involved_employee_ids,involved_employee_names,witness_ids,witness_names,status,pipeline_stage,nte_ids,chat_thread,business_unit_id,business_unit_name)
 values(case kind when 'absence' then 'Unexcused Absence — Attendance Review' else 'Habitual Tardiness — Attendance Review' end,
 format('Automatically detected attendance exception for HR review. This is not a finding or an NTE. Employee: %s. Work date: %s. Published shift: %s to %s (Asia/Manila). Schedule version: %s. First clock-in: %s. Minutes late after company grace: %s. Late days in configured window: %s. Source flag: %s. Verify missed punches, imports, leave and corrections before deciding.',h.full_name,d,((facts->>'shiftStart')::timestamptz at time zone 'Asia/Manila'),((facts->>'shiftEnd')::timestamptz at time zone 'Asia/Manila'),facts->>'version',facts->>'firstIn',facts->>'lateMinutes',cnt,fid),h.business_unit,(facts->>'shiftEnd')::timestamptz,p.created_by,array[h.id],array[h.full_name],array[]::uuid[],array[]::text[],'Submitted','ir-review',array[]::uuid[],'[]',h.business_unit_id,h.business_unit) returning id into ir;
 update public.attendance_review_flags set incident_id=ir where id=fid;end if;
 insert into public.attendance_review_audit(flag_id,action,note) values(fid,'detected','Detected from published schedule and recorded attendance; pending human review.');
 mgr:=private.punch_direct_manager(h.id);
 if mgr is not null then insert into public.notifications(user_id,title,message,link,type,is_read,dedupe_key) values(mgr::text,'Attendance needs review',h.full_name||' has an attendance exception for '||d::text||'. Review the recorded evidence.','/payroll/attendance-review','info',false,'attendance-review:'||fid) on conflict do nothing;end if;
 end loop;end loop;end loop;return total;end $$;
-- Dedicated additive records are RPC-only; all legacy RLS policies remain intact.
do $$declare t text;r record;begin
 foreach t in array array['attendance_review_policies','attendance_review_flags','attendance_review_audit'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;
 foreach t in array array['attendance_review_policies','attendance_review_audit','employee_profile_photos'] loop execute format('create trigger immutable before update or delete on public.%I for each row execute function private.payroll_audit_immutable()',t);end loop;
 for r in select p.oid::regprocedure f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in('schedule_day_status','payroll_pre_status_draft','payroll_schedule_draft','audit_schedule_leave','approved_schedule_leave','attendance_pre_leave_schedule','attendance_schedule','review_can_manage_bu','attendance_review_facts','scan_attendance_review') loop execute format('revoke all on function %s from public,anon,authenticated',r.f);end loop;
 for r in select p.oid::regprocedure f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('set_schedule_day_status','get_schedule_day_statuses','save_attendance_review_policy','get_attendance_review','resolve_attendance_review') loop execute format('revoke all on function %s from public,anon',r.f);execute format('grant execute on function %s to authenticated',r.f);end loop;
end $$;
create extension if not exists pg_cron;
select cron.schedule('attendance-review-every-15-minutes','*/15 * * * *','select private.scan_attendance_review()');
notify pgrst,'reload schema';
