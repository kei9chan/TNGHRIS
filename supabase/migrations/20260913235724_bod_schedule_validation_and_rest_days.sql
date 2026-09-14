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

create or replace function public.review_bod_schedule_submission(p_id uuid,p_version integer,p_approve boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();r schedule_compliance.submissions;x jsonb;bu uuid;dept uuid;draft jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-schedule-publication',0));
 select * into r from schedule_compliance.submissions where id=p_id for update;
 if private.payroll_actor_id() is null or actor is null or r.id is null or actor=r.employee_id or actor is distinct from schedule_compliance.bod_manager(r.employee_id) or r.manager_id<>actor then raise exception 'Only the assigned BOD may review this schedule' using errcode='42501';end if;
 if p_approve is null or p_version is distinct from r.version or length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'Refresh the submission and provide a decision reason';end if;
 if r.status=(case when p_approve then 'Approved' else 'Rejected' end) then return;end if;
 if r.status<>'Pending' then raise exception 'This submission has already been reviewed';end if;
 if p_approve then
 if exists(select 1 from public.payroll_schedule_freezes where employee_id=r.employee_id and date_from<=r.week+6 and date_to>=r.week) then raise exception 'Schedule is frozen for payroll; ask HR to use the override workflow';end if;
 if r.draft_hash<>md5(private.payroll_schedule_draft(r.employee_id,r.week)::text) or r.template_hash<>schedule_compliance.template_hash(r.entries) then raise exception 'Schedule or presets changed since submission. Ask the employee to review and resubmit';end if;
 select business_unit_id,department_id into bu,dept from public.hris_users where id=r.employee_id;
 for x in select value from jsonb_array_elements(r.entries) where value->>'templateId' is not null or coalesce((value->>'restDay')::boolean,false) loop
 if coalesce((x->>'restDay')::boolean,false) then
 perform public.set_schedule_day_status(r.employee_id,(x->>'date')::date,'rest','BOD approved employee schedule: '||r.id);
 continue;end if;
 if private.schedule_day_status(r.employee_id,(x->>'date')::date)->>'tag'='rest' then
 perform public.set_schedule_day_status(r.employee_id,(x->>'date')::date,null,'BOD approved employee work schedule: '||r.id);end if;
 if not exists(select 1 from public.shift_templates where id=(x->>'templateId')::uuid and business_unit_id=bu) then raise exception 'Business-unit assignment changed; employee must resubmit';end if;
 delete from public.shift_assignments where employee_id=r.employee_id and date=(x->>'date')::date;
 insert into public.shift_assignments(employee_id,shift_template_id,date,business_unit_id,department_id,created_by,notes)
 values(r.employee_id,(x->>'templateId')::uuid,(x->>'date')::date,bu,dept,actor,'Employee submission approved: '||r.id);
 end loop;
 draft:=private.payroll_schedule_draft(r.employee_id,r.week);
 perform public.publish_payroll_schedule_week(array[r.employee_id],r.week,'BOD approval: '||trim(p_reason),jsonb_build_object(r.employee_id::text,md5(draft::text)));
 end if;
 update schedule_compliance.submissions set status=case when p_approve then 'Approved' else 'Rejected' end,reviewed_by=actor,review_reason=trim(p_reason),reviewed_at=clock_timestamp(),draft_hash=case when p_approve then md5(draft::text) else draft_hash end where id=r.id;
end $$;

