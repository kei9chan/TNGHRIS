CREATE OR REPLACE FUNCTION private.payroll_schedule_draft(p_employee uuid, p_week date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare base jsonb:=private.payroll_pre_status_draft(p_employee,p_week);outp jsonb:='[]';d date;s jsonb;entries jsonb;begin
 for d in select generate_series(p_week,p_week+6,'1 day')::date loop
 s:=private.schedule_day_status(p_employee,d);
 select coalesce(jsonb_agg(x order by x->>'id'),'[]') into entries from jsonb_array_elements(base) x where (x->>'date')::date=d;
 if s->>'tag' in('rest','company_holiday') then
 entries:=jsonb_build_array(jsonb_build_object('id',s->>'id','employeeId',p_employee,'businessUnitId',(select business_unit_id from public.hris_users where id=p_employee),'date',d,'kind',case when s->>'tag'='rest' then 'rest' else 'no_schedule' end,'name',case when s->>'tag'='rest' then 'Rest Day' else 'Company Holiday' end,'statusTag',s->>'tag','statusRevision',s->'revision','start','00:00:00','end','00:00:00','flexible',false,'breakMinutes',0,'graceMinutes',5));
 elsif s->>'tag' in('skeletal','absence') then select coalesce(jsonb_agg(x||jsonb_build_object('statusTag',s->>'tag','statusRevision',s->'revision') order by x->>'id'),'[]') into entries from jsonb_array_elements(entries) x;end if;
 outp:=outp||entries;end loop;return outp;end $function$
;

create or replace function private.schedule_publication_issues(p_employee uuid,p_week date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare draft jsonb;issues jsonb:='[]';line jsonb;d date;bu uuid;message text;tag jsonb;
begin
 if not private.payroll_schedule_can_edit(p_employee) then
 return jsonb_build_array(jsonb_build_object('message','You do not have permission to publish schedules for this scope.'));end if;
 select business_unit_id into bu from public.hris_users where id=p_employee;
 draft:=private.payroll_schedule_draft(p_employee,p_week);
 for d in select generate_series(p_week,p_week+6,'1 day')::date loop
 tag:=private.schedule_day_status(p_employee,d);
 if tag->>'tag'='absence' and not exists(select 1 from public.leave_requests where employee_id=p_employee and lower(status::text)='approved' and start_date<=d and end_date>=d) then
 issues:=issues||jsonb_build_array(jsonb_build_object('date',d,'message','Absence requires review'));end if;
 if not exists(select 1 from jsonb_array_elements(draft) x where (x->>'date')::date=d)
 and coalesce((private.attendance_exception(p_employee,d)->>'requires_clock')::boolean,true)
 and not exists(select 1 from public.leave_requests where employee_id=p_employee and lower(status::text)='approved' and start_date<=d and end_date>=d) then
 issues:=issues||jsonb_build_array(jsonb_build_object('date',d,'message','Missing saved schedule. Suggested shifts must be saved first.'));end if;
 if exists(select 1 from jsonb_array_elements(draft) with ordinality a(x,i)
 cross join jsonb_array_elements(draft) with ordinality b(y,j)
 where i<j and (x->>'date')::date=d and (y->>'date')::date=d
 and (x->>'kind'<>'work' or y->>'kind'<>'work'
 or coalesce((x->>'flexible')::boolean,false) or coalesce((y->>'flexible')::boolean,false)
 or ((x->>'start')::time < (y->>'end')::time and (y->>'start')::time < (x->>'end')::time)
 or coalesce((x->>'endDayOffset')::int,0)=1 or coalesce((y->>'endDayOffset')::int,0)=1)) then
 issues:=issues||jsonb_build_array(jsonb_build_object('date',d,'message','Conflicting assignments or multiple flexible/overnight shifts require review.'));end if;
 end loop;
 for line in select value from jsonb_array_elements(draft) loop
 if bu is null or line->>'businessUnitId' is distinct from bu::text then
 issues:=issues||jsonb_build_array(jsonb_build_object('date',line->>'date','message','Schedule business unit does not match the employee. Correct the assignment.'));end if;
 begin perform private.payroll_schedule_validate(line);
 exception when others then get stacked diagnostics message=message_text;
 issues:=issues||jsonb_build_array(jsonb_build_object('date',line->>'date','message',message));end;
 end loop;return issues;
end $$;
revoke all on function private.schedule_publication_issues(uuid,date) from public,anon,authenticated;
create or replace function public.review_payroll_schedule_week(p_employee_ids uuid[],p_week date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare emp uuid;row jsonb;issues jsonb;draft jsonb;outp jsonb:='[]';
begin
 if p_week is null or extract(isodow from p_week)<>1 or coalesce(cardinality(p_employee_ids),0) not between 1 and 300 then raise exception 'Select a Monday week and between 1 and 300 employees.';end if;
 for emp in select distinct unnest(p_employee_ids) order by 1 loop
 if not private.payroll_schedule_can_edit(emp) then raise exception 'You do not have permission to publish schedules for this scope.' using errcode='42501';end if;
 select value into row from jsonb_array_elements(public.get_payroll_schedule_week(array[emp],p_week));
 issues:=private.schedule_publication_issues(emp,p_week);
 draft:=private.payroll_schedule_draft(emp,p_week);
 outp:=outp||jsonb_build_array(row||jsonb_build_object('issues',issues,'ready',jsonb_array_length(issues)=0,
 'name',(select full_name from public.hris_users where id=emp),
 'businessUnit',(select business_unit from public.hris_users where id=emp),
 'saved',jsonb_array_length(draft),
 'restDays',(select count(*) from jsonb_array_elements(draft) x where x->>'kind'='rest'),
 'absences',(select count(*) from generate_series(p_week,p_week+6,'1 day') d where exists(select 1 from public.leave_requests l where l.employee_id=emp and lower(l.status::text)='approved' and l.start_date<=d::date and l.end_date>=d::date))));
 end loop;return outp;
end $$;
revoke all on function public.review_payroll_schedule_week(uuid[],date) from public,anon;
grant execute on function public.review_payroll_schedule_week(uuid[],date) to authenticated;

CREATE OR REPLACE FUNCTION public.publish_payroll_schedule_week(p_employee_ids uuid[], p_week date, p_reference text, p_expected jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp uuid;draft jsonb;line jsonb;prior public.payroll_schedule_publications;r public.payroll_schedule_publications;frozen boolean;outp jsonb:='[]';bu uuid;issues jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-schedule-publication',0));
 if p_week is null or extract(isodow from p_week)<>1 or coalesce(cardinality(p_employee_ids),0) not between 1 and 300 or length(trim(coalesce(p_reference,''))) not between 3 and 1000 then raise exception 'Select up to 300 employees, a Monday week start and the publication/override reason.';end if;
 for emp in select distinct unnest(p_employee_ids) order by 1 loop
 if not private.payroll_schedule_can_edit(emp) then raise exception 'You do not have permission to publish schedules for this scope.' using errcode='42501';end if;
 issues:=private.schedule_publication_issues(emp,p_week);if jsonb_array_length(issues)>0 then raise exception 'Schedules need attention: %',issues;end if;
 draft:=private.payroll_schedule_draft(emp,p_week);if p_expected->>emp::text is distinct from md5(draft::text) then raise exception 'Schedule changed since review. Refresh the week before publishing.' using errcode='40001';end if;select business_unit_id into bu from public.hris_users where id=emp;
 if bu is null then raise exception 'Employee business unit is missing.';end if;
 for line in select value from jsonb_array_elements(draft) loop
 if line->>'businessUnitId' is distinct from bu::text then raise exception 'Schedule business unit differs from employee business unit; reconcile it in the existing scheduler.';end if;
 perform private.payroll_schedule_validate(line);end loop;
 if exists(select 1 from jsonb_array_elements(draft) x group by x->>'date' having count(*)>1 and bool_or(x->>'kind'<>'work')) then raise exception 'Rest / No Schedule conflicts with another assignment on the same day.';end if;
 select * into prior from public.payroll_schedule_publications where employee_id=emp and effective_from=p_week order by version desc limit 1;
 if prior.id is not null and prior.source_hash=md5(draft::text) and not exists(select 1 from public.payroll_schedule_overrides where publication_id=prior.id and decision='reject') then outp:=outp||jsonb_build_array(to_jsonb(prior)-'snapshot');continue;end if;
 frozen:=exists(select 1 from public.payroll_schedule_freezes where employee_id=emp and date_from<=p_week+6 and date_to>=p_week);
 insert into public.payroll_schedule_publications(employee_id,business_unit_id,effective_from,effective_to,version,source_hash,snapshot,previous_id,approval_required,published_by,reference)
 values(emp,bu,p_week,p_week+6,coalesce(prior.version,0)+1,md5(draft::text),draft,prior.id,frozen,public.current_hris_user_id(),p_reference) returning * into r;
 outp:=outp||jsonb_build_array(to_jsonb(r)-'snapshot');end loop;return outp;
end $function$
;

