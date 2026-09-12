set local lock_timeout='5s';
alter table public.schedule_day_statuses drop constraint schedule_day_statuses_tag_check;
alter table public.schedule_day_statuses add constraint schedule_day_statuses_tag_check check(tag in('rest','skeletal','company_holiday','absence','suspended'));

create function private.is_schedule_suspended(p_employee uuid,p_date date) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(private.schedule_day_status(p_employee,p_date)->>'tag'='suspended',false)
$$;
revoke all on function private.is_schedule_suspended(uuid,date) from public,anon,authenticated;

-- Extend the audited setter, retaining leave, BU, publication and reason guards.
do $$declare ddl text;begin
 ddl:=pg_get_functiondef('public.set_schedule_day_status(uuid,date,text,text)'::regprocedure);
 if position('''rest'',''skeletal'',''company_holiday'',''absence''' in ddl)=0 then raise exception 'Unexpected schedule status setter; review before migration';end if;
 ddl:=replace(ddl,'''rest'',''skeletal'',''company_holiday'',''absence''','''rest'',''skeletal'',''company_holiday'',''absence'',''suspended''');
 ddl:=replace(ddl,'perform pg_advisory_xact_lock(hashtextextended(''payroll-schedule-publication'',0));',E'perform pg_advisory_xact_lock(hashtextextended(''payroll-schedule-publication'',0));\n if (p_tag=''suspended'' or private.is_schedule_suspended(p_employee,p_date)) and not (public.has_active_role(''Admin'') or public.has_active_role(''HR Manager'') or public.has_active_role(''HR Staff'')) then raise exception ''Only authorized HR/Admin may change suspension statuses'' using errcode=''42501'';end if;');
 execute ddl;
end $$;

-- Attendance overlay only: payroll publications and original shift hours stay unchanged.
alter function private.attendance_schedule(uuid,date) rename to attendance_before_suspension_schedule;
create function private.attendance_schedule(p_employee uuid,p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sch jsonb:=private.attendance_before_suspension_schedule(p_employee,p_date);s jsonb;
begin
 if private.is_schedule_suspended(p_employee,p_date) then
 s:=private.schedule_day_status(p_employee,p_date);
 return sch||jsonb_build_object('originalEntries',sch->'entries','statusTag','suspended','entries',jsonb_build_array(jsonb_build_object(
 'id',s->>'id','name','Suspended','kind','no_schedule','statusTag','suspended','statusRevision',s->'revision','start','00:00:00','end','00:00:00','flexible',false,'breakMinutes',0)));
 end if;return sch;
end $$;
alter function private.attendance_day(uuid,date) rename to attendance_before_suspension_day;
create function private.attendance_day(p_employee uuid,p_date date) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.attendance_before_suspension_day(p_employee,p_date)||case when private.is_schedule_suspended(p_employee,p_date)
 then jsonb_build_object('requiresClock',false,'statusTag','suspended','statusLabel','Suspended') else '{}'::jsonb end
$$;
alter function private.attendance_review_facts(uuid,date) rename to attendance_before_suspension_facts;
create function private.attendance_review_facts(p_emp uuid,p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if private.is_schedule_suspended(p_emp,p_date) then return jsonb_build_object('eligible',false,'reason','Suspended','statusTag','suspended','lateMinutes',0);end if;
 return private.attendance_before_suspension_facts(p_emp,p_date);
end $$;
revoke all on function private.attendance_schedule(uuid,date),private.attendance_day(uuid,date),private.attendance_review_facts(uuid,date),private.attendance_before_suspension_schedule(uuid,date),private.attendance_before_suspension_day(uuid,date),private.attendance_before_suspension_facts(uuid,date) from public,anon,authenticated;

-- Existing Pulse calculations must exclude suspended dates, including previously
-- recorded absence reports, without erasing those reports or their audit history.
do $$declare ddl text;old text;begin
 ddl:=pg_get_functiondef('attendance_pulse.read_before_patterns(uuid,date)'::regprocedure);old:=ddl;
 ddl:=replace(ddl,'r.work_date=p_date','r.work_date=p_date and not private.is_schedule_suspended(r.employee_id,r.work_date)');
 ddl:=replace(ddl,'r.work_date=d','r.work_date=d and not private.is_schedule_suspended(r.employee_id,r.work_date)');
 ddl:=replace(ddl,'working as(select l.employee_id from latest l where','working as(select l.employee_id from latest l where not private.is_schedule_suspended(l.employee_id,p_date) and');
 if ddl=old then raise exception 'Unexpected Pulse definition; review suspension filters';end if;
 execute ddl;
end $$;

do $$declare ddl text;begin
 ddl:=pg_get_functiondef('attendance_pulse.patterns(uuid,date)'::regprocedure);
 ddl:=replace(ddl,'where r.work_date between','where not private.is_schedule_suspended(r.employee_id,r.work_date) and r.work_date between');execute ddl;
 ddl:=pg_get_functiondef('public.get_attendance_review()'::regprocedure);
 ddl:=replace(ddl,'and f.work_date>=','and not private.is_schedule_suspended(f.employee_id,f.work_date) and f.work_date>=');execute ddl;
 ddl:=pg_get_functiondef('schedule_compliance.snapshot(uuid,date)'::regprocedure);
 if position('needed:=needed+1;' in ddl)=0 then raise exception 'Unexpected schedule compliance definition';end if;
 ddl:=replace(ddl,'needed:=needed+1;',E'if private.is_schedule_suspended(e.id,d) then days:=days||jsonb_build_array(jsonb_build_object(''date'',d,''status'',''Suspended''));continue;end if;\n needed:=needed+1;');execute ddl;
end $$;

create function public.get_suspension_status_report(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if public.current_hris_user_id() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to-p_from not between 0 and 366 then raise exception 'Select up to one year';end if;
 return (select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('employeeName',h.full_name,'businessUnit',h.business_unit,'department',h.department,'createdByName',a.full_name) order by s.work_date,h.full_name),'[]')
 from public.schedule_day_statuses s join public.hris_users h on h.id=s.employee_id left join public.hris_users a on a.id=s.created_by
 where s.work_date between p_from and p_to and s.tag='suspended' and private.payroll_schedule_can_read(s.employee_id)
 and not exists(select 1 from public.schedule_day_statuses n where n.employee_id=s.employee_id and n.work_date=s.work_date and n.revision>s.revision));
end $$;
revoke all on function public.get_suspension_status_report(date,date) from public,anon;
grant execute on function public.get_suspension_status_report(date,date) to authenticated;

create function public.get_attendance_suspension_dates(p_days jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if public.current_hris_user_id() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if jsonb_typeof(p_days)<>'array' or jsonb_array_length(p_days)>6000 then raise exception 'Too many attendance dates';end if;
 return (select coalesce(jsonb_agg(distinct x),'[]') from jsonb_array_elements(p_days) x
 where private.payroll_schedule_can_read((x->>'employee')::uuid) and private.is_schedule_suspended((x->>'employee')::uuid,(x->>'date')::date));
end $$;
revoke all on function public.get_attendance_suspension_dates(jsonb) from public,anon;
grant execute on function public.get_attendance_suspension_dates(jsonb) to authenticated;
