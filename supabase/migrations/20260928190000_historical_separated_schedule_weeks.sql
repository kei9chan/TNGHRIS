-- A separated employee remains schedulable for the dates they were employed.
-- The actor's ordinary BU/team editing and publishing permissions still apply.
set local lock_timeout = '5s';

create or replace function private.schedule_employee_in_date(p_employee uuid, p_date date)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.hris_users h
    where h.id = p_employee
      and not coalesce(h.is_duplicate,false)
      and p_date is not null
      and (h.date_hired is null or h.date_hired <= p_date)
      and (h.end_date is null or h.end_date >= p_date)
      and (lower(h.status::text) = 'active'
        or (lower(h.employment_status::text) = 'separated'
          and h.date_hired is not null and h.end_date is not null))
  )
$$;

create or replace function private.schedule_employee_in_week(p_employee uuid, p_week date)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from generate_series(p_week,p_week+6,'1 day') d
    where private.schedule_employee_in_date(p_employee,d::date)
  )
$$;
revoke all on function private.schedule_employee_in_date(uuid,date),
  private.schedule_employee_in_week(uuid,date) from public,anon,authenticated;

-- Keep the currently deployed Schedule Builder, import, status, and
-- publication code intact except for these guarded employment-date checks.
do $migration$
declare ddl text; original text; needle text;
begin
 ddl:=pg_get_functiondef('public.get_schedule_builder_data(text,date)'::regprocedure);
 original:=ddl;
 needle:='lower(h.status::text)=''active''';
 if (length(ddl)-length(replace(ddl,needle,'')))/length(needle) <> 3 then
   raise exception 'Review changed schedule roster before enabling historical employees.';
 end if;
 ddl:=replace(ddl,needle,'private.schedule_employee_in_week(h.id,p_week)');
 needle:='''role'',h.role,''status'',h.status,';
 if strpos(ddl,needle)=0 then raise exception 'Review changed roster fields.';end if;
 ddl:=replace(ddl,needle,needle||'''date_hired'',h.date_hired,''end_date'',h.end_date,');
 execute ddl;

 ddl:=pg_get_functiondef('public.save_schedule_builder_shift(text,date,uuid,date,uuid,uuid,uuid)'::regprocedure);
 needle:='roster:=public.get_schedule_builder_data(p_scope,p_week);';
 if strpos(ddl,needle)=0 then raise exception 'Review changed schedule save.';end if;
 ddl:=replace(ddl,needle,
   'if not private.schedule_employee_in_date(p_employee,p_date) then raise exception ''Schedules may only be assigned on employed dates.'' using errcode=''22023'';end if;'||chr(10)||needle);
 execute ddl;

 ddl:=pg_get_functiondef('public.set_schedule_day_status(uuid,date,text,text)'::regprocedure);
 needle:='perform pg_advisory_xact_lock(hashtextextended(''payroll-schedule-publication'',0));';
 if strpos(ddl,needle)=0 then raise exception 'Review changed schedule status.';end if;
 ddl:=replace(ddl,needle,
   'if not private.schedule_employee_in_date(p_employee,p_date) then raise exception ''Statuses may only be assigned on employed dates.'' using errcode=''22023'';end if;'||chr(10)||needle);
 execute ddl;

 ddl:=pg_get_functiondef('private.schedule_publication_issues(uuid,date)'::regprocedure);
 needle:='draft:=private.payroll_schedule_draft(p_employee,p_week);';
 if strpos(ddl,needle)=0 then raise exception 'Review changed schedule publication review.';end if;
 ddl:=replace(ddl,needle,
   'if not private.schedule_employee_in_week(p_employee,p_week) then return jsonb_build_array(jsonb_build_object(''message'',''No employed dates in this week.''));end if;'||chr(10)||needle);
 needle:='tag:=private.schedule_day_status(p_employee,d);';
 if strpos(ddl,needle)=0 then raise exception 'Review changed schedule day review.';end if;
 ddl:=replace(ddl,needle,
   'if not private.schedule_employee_in_date(p_employee,d) then continue;end if;'||chr(10)||needle);
 needle:='for line in select value from jsonb_array_elements(draft) loop';
 if strpos(ddl,needle)=0 then raise exception 'Review changed publication draft loop.';end if;
 ddl:=replace(ddl,needle,needle||chr(10)||
   'if not private.schedule_employee_in_date(p_employee,(line->>''date'')::date) then issues:=issues||jsonb_build_array(jsonb_build_object(''date'',line->>''date'',''message'',''Remove a shift outside employment dates before publishing.''));continue;end if;');
 execute ddl;

 ddl:=pg_get_functiondef('public.copy_schedule_week_with_statuses(uuid[],date)'::regprocedure);
 needle:='a.date between p_week-7 and p_week-1 order by a.employee_id,a.date,a.shift_template_id,a.id';
 if strpos(ddl,needle)=0 then raise exception 'Review changed weekly copy insert.';end if;
 ddl:=replace(ddl,needle,
   'a.date between p_week-7 and p_week-1 and private.schedule_employee_in_date(a.employee_id,a.date+7) order by a.employee_id,a.date,a.shift_template_id,a.id');
 needle:='s:=private.schedule_day_status(emp,d-7);';
 if strpos(ddl,needle)=0 then raise exception 'Review changed weekly status copy.';end if;
 ddl:=replace(ddl,needle,'if not private.schedule_employee_in_date(emp,d) then continue;end if;'||chr(10)||needle);
 execute ddl;
end $migration$;
notify pgrst,'reload schema';
