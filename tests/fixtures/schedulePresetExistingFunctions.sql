-- Existing production workflow definitions exercised by the focused RLS fixture.
create or replace function public.get_schedule_builder_data(p_scope text, p_week date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.current_hris_user_id(); ids uuid[]; people jsonb;
begin
 if auth.uid() is null or private.payroll_actor_id() is null then
  raise exception 'Sign in with an active schedule-builder account.' using errcode='42501';
 end if;
 if p_scope not in ('direct','business_unit') or p_scope is null or p_week is null or extract(isodow from p_week) <> 1 then
  raise exception 'Select a valid scope and Monday week-start date.' using errcode='22023';
 end if;
 if not (private.payroll_schedule_can_edit(actor) or exists(select 1 from public.hris_users h where h.reports_to=actor::text and lower(h.status::text)='active' and h.id<>actor)) then
  raise exception 'Schedule builder access required.' using errcode='42501';
 end if;
 select array_agg(h.id),coalesce(jsonb_agg(jsonb_build_object(
  'id',h.id,'full_name',h.full_name,'role',h.role,'status',h.status,
  'business_unit',h.business_unit,'business_unit_id',h.business_unit_id,
  'department',h.department,'department_id',h.department_id,'position',h.position,
  'reports_to',h.reports_to,'can_edit',private.payroll_schedule_can_edit(h.id)
 ) order by h.full_name),'[]') into ids,people
 from public.hris_users h join public.hris_users a on a.id=actor
 where lower(h.status::text)='active' and
 ((p_scope='direct' and h.reports_to=actor::text and h.id<>actor)
 or (p_scope='business_unit' and a.business_unit_id is not null and h.business_unit_id=a.business_unit_id));
 return jsonb_build_object('people',people,
 'assignments',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'employee_id',s.employee_id,'shift_template_id',s.shift_template_id,'date',s.date,'assigned_area_id',s.assigned_area_id) order by s.date,s.id),'[]') from public.shift_assignments s where s.employee_id=any(ids) and s.date between p_week-7 and p_week+13),
 'statuses',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'employee_id',s.employee_id,'work_date',s.work_date,'tag',s.tag,'revision',s.revision)),'[]') from public.schedule_day_statuses s where s.employee_id=any(ids) and s.work_date between p_week-7 and p_week+13 and not exists(select 1 from public.schedule_day_statuses n where n.employee_id=s.employee_id and n.work_date=s.work_date and n.revision>s.revision)));
end $$;

create or replace function public.save_schedule_builder_shift(p_scope text,p_week date,p_employee uuid,p_date date,p_template uuid,p_expected_id uuid default null,p_expected_template uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare roster jsonb; person jsonb; current_row public.shift_assignments%rowtype; row_count integer;
begin
 if auth.uid() is null then raise exception 'Sign in before saving.' using errcode='42501'; end if;
 if p_date is null or p_date < p_week or p_date > p_week+6 then raise exception 'Shift date must belong to the selected week.' using errcode='22023'; end if;
 roster:=public.get_schedule_builder_data(p_scope,p_week);
 select value into person from jsonb_array_elements(roster->'people') where value->>'id'=p_employee::text and (value->>'can_edit')::boolean;
 if person is null then raise exception 'You cannot edit this employee in the selected scope.' using errcode='42501'; end if;
 if not exists(select 1 from public.shift_templates t where t.id=p_template and t.business_unit_id=(person->>'business_unit_id')::uuid) then raise exception 'Select a shift preset for this employee’s business unit.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_employee::text||':'||p_date::text,0));
 select count(*) into row_count from public.shift_assignments where employee_id=p_employee and date=p_date;
 if row_count>1 then raise exception 'Multiple saved shifts exist for this date. HR must resolve the conflicting drafts before saving.' using errcode='40001'; end if;
 select * into current_row from public.shift_assignments where employee_id=p_employee and date=p_date for update;
 -- A retry after a lost response is a no-op when the requested value is already saved.
 if current_row.id is not null and current_row.shift_template_id=p_template then return to_jsonb(current_row); end if;
 if current_row.id is distinct from p_expected_id or current_row.shift_template_id is distinct from p_expected_template then
  raise exception 'This shift changed in another session. Your selection is preserved; reload the saved schedule before applying it again.' using errcode='40001';
 end if;
 if current_row.id is null then
  insert into public.shift_assignments(employee_id,date,shift_template_id,business_unit_id,department_id,created_by)
  values(p_employee,p_date,p_template,(person->>'business_unit_id')::uuid,(person->>'department_id')::uuid,public.current_hris_user_id()) returning * into current_row;
 else
  update public.shift_assignments set shift_template_id=p_template,business_unit_id=(person->>'business_unit_id')::uuid where id=current_row.id returning * into current_row;
 end if;
 if current_row.id is null then raise exception 'Permission denied: no shift was saved.' using errcode='42501'; end if;
 return to_jsonb(current_row);
end $$;

create or replace function public.get_bod_schedule_workflow(p_week date default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();m uuid;w date:=coalesce(p_week,date_trunc('week',now() at time zone 'Asia/Manila')::date+7);own jsonb;templates jsonb:='[]';task jsonb;pending jsonb;begin
 if private.payroll_actor_id() is null or actor is null then raise exception 'Active account required' using errcode='42501';end if;
 if extract(isodow from w)<>1 then raise exception 'Choose a Monday';end if;
 m:=schedule_compliance.bod_manager(actor);
 if m is not null then
 select to_jsonb(s) into own from schedule_compliance.submissions s where employee_id=actor and week=w;
 select x into task from jsonb_array_elements(schedule_compliance.snapshot(m,w)->'employees') x where x->>'id'=actor::text;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'start',t.start_time,'end',t.end_time,'kind',t.schedule_kind) order by t.name),'[]') into templates
 from public.shift_templates t where t.business_unit_id=(select business_unit_id from public.hris_users where id=actor);
 end if;
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('employeeName',h.full_name,'schedule',(
 select jsonb_agg(x||jsonb_build_object('name',case when coalesce((x->>'restDay')::boolean,false) then 'Rest Day' else coalesce(t.name,(select string_agg(concat_ws(' ',a->>'name',a->>'start',a->>'end'),'; ') from jsonb_array_elements(private.payroll_schedule_draft(s.employee_id,s.week)) a where a->>'date'=x->>'date'),'Existing approved leave / exemption') end,'start',t.start_time,'end',t.end_time) order by x->>'date')
 from jsonb_array_elements(s.entries) x left join public.shift_templates t on t.id=(x->>'templateId')::uuid)) order by s.submitted_at),'[]') into pending
 from schedule_compliance.submissions s join public.hris_users h on h.id=s.employee_id
 where s.manager_id=actor and s.status='Pending' and schedule_compliance.bod_manager(s.employee_id)=actor;
 return jsonb_build_object('isBod',private.workflow_user_has_role(actor,'Board of Director'),'eligible',m is not null,'managerName',(select full_name from public.hris_users where id=m),'week',w,'task',task,'submission',own,'templates',templates,'pending',pending,
 'deadline',(select ((w-days_before)+deadline_time) at time zone 'Asia/Manila' from schedule_compliance.settings));
end $$;

create or replace function public.submit_my_bod_schedule(p_week date,p_entries jsonb,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();m uuid;bu uuid;x jsonb;t public.shift_templates;d date;r schedule_compliance.submissions;canonical jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-schedule-publication',0));
 m:=schedule_compliance.bod_manager(actor);
 if private.payroll_actor_id() is null or actor is null or m is null then raise exception 'Only active employees reporting directly to a BOD can submit their own schedule here' using errcode='42501';end if;
 if p_week is null or extract(isodow from p_week)<>1 or p_week<date_trunc('week',now() at time zone 'Asia/Manila')::date or p_week>date_trunc('week',now() at time zone 'Asia/Manila')::date+56 then raise exception 'Choose a current or upcoming Monday within eight weeks';end if;
 if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries)<>7 or length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'Provide all seven dates and a schedule note';end if;
 if (select count(distinct entry->>'date') from jsonb_array_elements(p_entries) entry)<>7 then raise exception 'Each day must appear once';end if;
 select business_unit_id into bu from public.hris_users where id=actor;
 if bu is null then raise exception 'Ask HR to complete your business-unit assignment';end if;
 if exists(select 1 from public.payroll_schedule_freezes where employee_id=actor and date_from<=p_week+6 and date_to>=p_week) then raise exception 'This week is frozen for payroll. Contact HR for the existing override workflow';end if;
 for x in select value from jsonb_array_elements(p_entries) loop
 d:=(x->>'date')::date;
 if d is null or d<p_week or d>p_week+6 then raise exception 'Dates must belong to the selected week';end if;
 if coalesce((x->>'restDay')::boolean,false) then
 if x->>'templateId' is not null then raise exception 'Choose either a shift or Rest Day';end if;
 if private.schedule_day_status(actor,d)->>'tag' in('suspended','absence','company_holiday','skeletal') then raise exception 'Keep existing HR statuses';end if;
 elsif x->>'templateId' is null then
 if not exists(select 1 from jsonb_array_elements(private.payroll_schedule_draft(actor,p_week)) a where (a->>'date')::date=d)
 and not exists(select 1 from jsonb_array_elements(private.approved_schedule_leave(actor,d)) a where (a->>'fullDay')::boolean)
 and coalesce((private.attendance_exception(actor,d)->>'requires_clock')::boolean,true) then raise exception 'Choose a shift or rest-day preset for every unscheduled date';end if;
 else
 select * into t from public.shift_templates where id=(x->>'templateId')::uuid and business_unit_id=bu;
 if t.id is null then raise exception 'Choose a preset from your business unit';end if;
 if private.schedule_day_status(actor,d)->>'tag' in('suspended','absence','company_holiday','skeletal') then raise exception 'Keep existing HR schedule statuses; contact HR to change them';end if;
 perform private.payroll_schedule_validate(jsonb_build_object('kind',t.schedule_kind,'start',t.start_time,'end',t.end_time,'flexible',t.is_flexible,'paidMinutes',t.paid_minutes,'endDayOffset',t.end_day_offset,'breakMinutes',t.break_minutes));
 end if;end loop;
 select jsonb_agg(jsonb_build_object('date',entry->>'date','templateId',entry->>'templateId','restDay',coalesce((entry->>'restDay')::boolean,false)) order by entry->>'date') into canonical from jsonb_array_elements(p_entries) entry;
 select * into r from schedule_compliance.submissions where employee_id=actor and week=p_week for update;
 if r.status in('Pending','Approved') and r.entries=canonical and r.manager_id=m and r.template_hash=schedule_compliance.template_hash(canonical) and r.draft_hash=md5(private.payroll_schedule_draft(actor,p_week)::text) then return r.id;end if;
 insert into schedule_compliance.submissions(employee_id,manager_id,week,entries,template_hash,draft_hash,status,reason)
 values(actor,m,p_week,canonical,schedule_compliance.template_hash(canonical),md5(private.payroll_schedule_draft(actor,p_week)::text),'Pending',trim(p_reason))
 on conflict(employee_id,week) do update set manager_id=excluded.manager_id,entries=excluded.entries,template_hash=excluded.template_hash,draft_hash=excluded.draft_hash,status='Pending',reason=excluded.reason,version=submissions.version+1,submitted_at=clock_timestamp(),reviewed_by=null,reviewed_at=null,review_reason=null returning * into r;
 return r.id;
end $$;

create or replace function public.preview_payroll_time(p_scope_id uuid,p_date_from date,p_date_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare review jsonb;begin
 if not private.payroll_time_permission(p_scope_id,'view') then raise exception 'A scoped timekeeping/payroll duty and existing Timekeeping access are required.' using errcode='42501';end if;
 review:=private.payroll_time_review(p_scope_id,p_date_from,p_date_to);
 return (review-'source')||jsonb_build_object('holidays',review#>'{source,holidays}','rules',review#>'{source,rules}','templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'start',t.start_time,'end',t.end_time) order by t.name) from public.shift_templates t join public.payroll_access_scopes s on (s.business_unit_id=t.business_unit_id or t.business_unit_id is null) where s.id=p_scope_id),'[]'),
 'packages',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'status',p.status,'createdAt',p.created_at,'submittedAt',p.submitted_at,'reason',p.reason,'previousId',p.previous_id,'current',p.source_hash=review->>'sourceHash','blockedDays',p.result->'blockedDays') order by p.version desc) from public.payroll_time_packages p where p.scope_id=p_scope_id and p.date_from=p_date_from and p.date_to=p_date_to),'[]'));
end $$;

create function public.copy_schedule_week_with_statuses(p_employees uuid[],p_week date) returns void language plpgsql security definer set search_path='' as $$
declare emp uuid;d date;s jsonb;tag text;begin
 if coalesce(cardinality(p_employees),0) not between 1 and 1000 or extract(isodow from p_week)<>1 then raise exception 'Choose employees and a Monday week start';end if;
 foreach emp in array p_employees loop if not private.payroll_schedule_can_edit(emp) then raise exception 'Existing schedule management access required' using errcode='42501';end if;end loop;
 perform pg_advisory_xact_lock(hashtextextended('payroll-schedule-publication',0));
 if not exists(select 1 from public.shift_assignments where employee_id=any(p_employees) and date between p_week-7 and p_week-1) and not exists(select 1 from public.schedule_day_statuses ds where ds.employee_id=any(p_employees) and ds.work_date between p_week-7 and p_week-1 and ds.tag='rest') then raise exception 'No schedule or rest days found in the previous week';end if;
 if exists(select 1 from public.shift_assignments a join public.shift_templates t on t.id=a.shift_template_id join public.hris_users h on h.id=a.employee_id where a.employee_id=any(p_employees) and a.date between p_week-7 and p_week-1 and t.business_unit_id is distinct from h.business_unit_id) then raise exception 'Previous week contains retired or unrelated BU presets. Review the BU presets first.';end if;
 delete from public.shift_assignments where employee_id=any(p_employees) and date between p_week and p_week+6;
 insert into public.shift_assignments(employee_id,shift_template_id,date,business_unit_id,department_id,assigned_area_id,created_by)
 select distinct on(a.employee_id,a.date,a.shift_template_id) a.employee_id,a.shift_template_id,a.date+7,h.business_unit_id,h.department_id,a.assigned_area_id,public.current_hris_user_id() from public.shift_assignments a join public.hris_users h on h.id=a.employee_id where a.employee_id=any(p_employees) and a.date between p_week-7 and p_week-1 order by a.employee_id,a.date,a.shift_template_id,a.id;
 foreach emp in array p_employees loop for d in select generate_series(p_week,p_week+6,'1 day')::date loop
 s:=private.schedule_day_status(emp,d-7);tag:=case when s->>'tag' in('rest','skeletal') then s->>'tag' else null end;
 if exists(select 1 from jsonb_array_elements(private.approved_schedule_leave(emp,d)) x where (x->>'fullDay')::boolean) then tag:=null;end if;
 if tag is not null or private.schedule_day_status(emp,d)->>'tag' is not null then perform public.set_schedule_day_status(emp,d,tag,'Copied reviewed weekly pattern; leave remains linked to its own approved dates');end if;
 end loop;end loop;end $$;
