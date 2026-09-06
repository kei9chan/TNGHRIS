set local lock_timeout='5s';
-- Status assignment cannot replace an approved full-day leave decision.
do $$declare ddl text;begin ddl:=pg_get_functiondef('public.set_schedule_day_status(uuid,date,text,text)'::regprocedure);ddl:=replace(ddl,'perform pg_advisory_xact_lock',E'if p_tag is not null and exists(select 1 from jsonb_array_elements(private.approved_schedule_leave(p_employee,p_date)) x where (x->>''fullDay'')::boolean) then raise exception ''Approved leave covers this day. Change it through the existing leave workflow.'';end if;\n perform pg_advisory_xact_lock');execute ddl;end $$;
create function public.copy_schedule_week_with_statuses(p_employees uuid[],p_week date) returns void language plpgsql security definer set search_path='' as $$
declare emp uuid;d date;s jsonb;tag text;begin
 if coalesce(cardinality(p_employees),0) not between 1 and 1000 or extract(isodow from p_week)<>1 then raise exception 'Choose employees and a Monday week start';end if;
 foreach emp in array p_employees loop if not private.payroll_schedule_can_edit(emp) then raise exception 'Existing schedule management access required' using errcode='42501';end if;end loop;
 perform pg_advisory_xact_lock(hashtextextended('payroll-schedule-publication',0));
 if not exists(select 1 from public.shift_assignments where employee_id=any(p_employees) and date between p_week-7 and p_week-1) and not exists(select 1 from public.schedule_day_statuses where employee_id=any(p_employees) and work_date between p_week-7 and p_week-1 and tag='rest') then raise exception 'No schedule or rest days found in the previous week';end if;
 if exists(select 1 from public.shift_assignments a join public.shift_templates t on t.id=a.shift_template_id join public.hris_users h on h.id=a.employee_id where a.employee_id=any(p_employees) and a.date between p_week-7 and p_week-1 and t.business_unit_id is distinct from h.business_unit_id) then raise exception 'Previous week contains retired or unrelated BU presets. Review the BU presets first.';end if;
 delete from public.shift_assignments where employee_id=any(p_employees) and date between p_week and p_week+6;
 insert into public.shift_assignments(employee_id,shift_template_id,date,business_unit_id,department_id,assigned_area_id,created_by)
 select distinct on(a.employee_id,a.date,a.shift_template_id) a.employee_id,a.shift_template_id,a.date+7,h.business_unit_id,h.department_id,a.assigned_area_id,public.current_hris_user_id() from public.shift_assignments a join public.hris_users h on h.id=a.employee_id where a.employee_id=any(p_employees) and a.date between p_week-7 and p_week-1 order by a.employee_id,a.date,a.shift_template_id,a.id;
 foreach emp in array p_employees loop for d in select generate_series(p_week,p_week+6,'1 day')::date loop
 s:=private.schedule_day_status(emp,d-7);tag:=case when s->>'tag' in('rest','skeletal') then s->>'tag' else null end;
 if exists(select 1 from jsonb_array_elements(private.approved_schedule_leave(emp,d)) x where (x->>'fullDay')::boolean) then tag:=null;end if;
 if tag is not null or private.schedule_day_status(emp,d)->>'tag' is not null then perform public.set_schedule_day_status(emp,d,tag,'Copied reviewed weekly pattern; leave remains linked to its own approved dates');end if;
 end loop;end loop;end $$;
revoke all on function public.copy_schedule_week_with_statuses(uuid[],date) from public,anon;grant execute on function public.copy_schedule_week_with_statuses(uuid[],date) to authenticated;
-- Managers see attendance review flags only for people they can already schedule.
do $$declare ddl text;begin ddl:=pg_get_functiondef('public.get_attendance_review()'::regprocedure);ddl:=replace(ddl,'private.punch_direct_manager(f.employee_id)=public.current_hris_user_id()','private.punch_direct_manager(f.employee_id)=public.current_hris_user_id() or private.payroll_schedule_can_edit(f.employee_id)');execute ddl;end $$;
notify pgrst,'reload schema';

