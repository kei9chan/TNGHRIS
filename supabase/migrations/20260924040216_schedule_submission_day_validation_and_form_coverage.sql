create or replace function private.schedule_day_can_keep_existing(p_actor uuid, p_date date, p_week date)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(
   select 1 from jsonb_array_elements(private.payroll_schedule_draft(p_actor,p_week)) a
   where (a->>'date')::date=p_date
 )
 or exists(
   select 1 from jsonb_array_elements(private.approved_schedule_leave(p_actor,p_date)) a
   where coalesce((a->>'fullDay')::boolean,false)
 )
 or not coalesce((private.attendance_exception(p_actor,p_date)->>'requires_clock')::boolean,true)
$$;
revoke all on function private.schedule_day_can_keep_existing(uuid,date,date) from public,anon,authenticated;
do $migration$
declare ddl text;
old_validation text := 'if not exists(select 1 from jsonb_array_elements(private.payroll_schedule_draft(actor,p_week)) a where (a->>''date'')::date=d)
 and not exists(select 1 from jsonb_array_elements(private.approved_schedule_leave(actor,d)) a where (a->>''fullDay'')::boolean)
 and coalesce((private.attendance_exception(actor,d)->>''requires_clock'')::boolean,true) then raise exception ''Choose a shift or rest-day preset for every unscheduled date'';end if;';
new_validation text := 'if not private.schedule_day_can_keep_existing(actor,d,p_week) then raise exception ''Choose a shift or Rest Day for %'', to_char(d,''Dy, Mon DD'') using errcode=''22023'';end if;';
old_workflow text := '''week'',w,''task'',task';
new_workflow text := '''week'',w,''keepableDates'',(select coalesce(jsonb_agg(day::date::text order by day),''[]''::jsonb) from generate_series(w,w+6,interval ''1 day'') day where m is not null and private.schedule_day_can_keep_existing(actor,day::date,w)),''task'',task';
begin
 ddl := pg_get_functiondef('public.submit_my_bod_schedule(date,jsonb,text)'::regprocedure);
 if position(old_validation in ddl)=0 then raise exception 'Schedule submit definition changed; migration not applied'; end if;
 execute replace(ddl,old_validation,new_validation);
 ddl := pg_get_functiondef('public.get_bod_schedule_workflow(date)'::regprocedure);
 if position(old_workflow in ddl)=0 then raise exception 'Schedule workflow definition changed; migration not applied'; end if;
 execute replace(ddl,old_workflow,new_workflow);
end $migration$;
notify pgrst, 'reload schema';