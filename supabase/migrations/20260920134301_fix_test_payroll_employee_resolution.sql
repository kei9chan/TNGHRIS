-- Keep saved schedule corrections visible to the payroll interpreter and provide
-- one audited, employee-scoped action for resolving the synthetic test issues.
create or replace function payroll_scenario_private.effective_source(p_seed text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 r payroll_scenario_private.runs;
 src jsonb;
 c payroll_scenario_private.corrections;
 v jsonb;
 arr jsonb;
 ev jsonb;
 shift_row jsonb;
begin
 select * into strict r
 from payroll_scenario_private.runs
 where seed_run_id=p_seed and is_test;

 src:=r.snapshot->'source';
 for c in
  select *
  from payroll_scenario_private.corrections
  where seed_run_id=p_seed
    and status in ('Saved','Approved','Ready after correction','Needs attention')
  order by work_date,employee_id
 loop
  v:=c.corrected_value;

  select value into shift_row
  from jsonb_array_elements(src->'shifts')
  where value->>'employeeId'=c.employee_id::text
    and value->>'date'=c.work_date::text
  limit 1;

  select coalesce(jsonb_agg(value),'[]'::jsonb) into arr
  from jsonb_array_elements(src->'events')
  where not (
   value->>'employeeId'=c.employee_id::text
   and ((value->>'timestamp')::timestamptz at time zone 'Asia/Manila')::date=c.work_date
  );

  foreach ev in array array[
   jsonb_build_object('type','CLOCK_IN','time',v->>'clockIn'),
   jsonb_build_object('type','START_BREAK','time',v->>'breakStart'),
   jsonb_build_object('type','END_BREAK','time',v->>'breakEnd'),
   jsonb_build_object('type','CLOCK_OUT','time',v->>'clockOut')
  ] loop
   if nullif(ev->>'time','') is not null then
    arr:=arr||jsonb_build_array(jsonb_build_object(
     'id','correction:'||p_seed||':'||c.employee_id||':'||c.work_date||':'||(ev->>'type'),
     'employeeId',c.employee_id,
     'timestamp',c.work_date||'T'||(ev->>'time')||':00+08:00',
     'type',ev->>'type',
     'source','Saved isolated test correction',
     'isTest',true
    ));
   end if;
  end loop;
  src:=jsonb_set(src,'{events}',arr);

  if v->>'resolutionMode'='standard_day' then
   select coalesce(jsonb_agg(value),'[]'::jsonb) into arr
   from jsonb_array_elements(coalesce(src->'leave','[]'::jsonb))
   where not (
    value->>'employeeId'=c.employee_id::text
    and c.work_date between (value->>'startDate')::date and (value->>'endDate')::date
   );
   src:=jsonb_set(src,'{leave}',arr);

   select coalesce(jsonb_agg(value),'[]'::jsonb) into arr
   from jsonb_array_elements(coalesce(src->'ot','[]'::jsonb))
   where not (
    value->>'employeeId'=c.employee_id::text
    and value->>'date'=c.work_date::text
   );
   src:=jsonb_set(src,'{ot}',arr);
  end if;

  if nullif(v->>'scheduleKind','') is not null then
   select coalesce(jsonb_agg(value),'[]'::jsonb) into arr
   from jsonb_array_elements(src->'shifts')
   where not (
    value->>'employeeId'=c.employee_id::text
    and value->>'date'=c.work_date::text
   );

   shift_row:=coalesce(shift_row,'{}'::jsonb)||jsonb_build_object(
    'id','correction:'||p_seed||':'||c.employee_id||':'||c.work_date||':shift',
    'employeeId',c.employee_id,
    'date',c.work_date,
    'kind',v->>'scheduleKind',
    'name',case when v->>'scheduleKind'='rest' then 'Rest Day' else 'Corrected test schedule' end,
    'published',true,
    'publicationStatus','Published for test only',
    'start',coalesce(nullif(v->>'scheduleStart',''),'09:00'),
    'end',coalesce(nullif(v->>'scheduleEnd',''),'18:00'),
    'endDayOffset',0,
    'breakMinutes',60,
    'paidMinutes',480,
    'flexible',false,
    'templateId',case when v->>'scheduleKind'='rest' then 'test-rest' else 'test-nine-to-six' end
   );
   src:=jsonb_set(src,'{shifts}',arr||jsonb_build_array(shift_row));

   select coalesce(jsonb_agg(value),'[]'::jsonb) into arr
   from jsonb_array_elements(coalesce(src->'scheduleDays','[]'::jsonb))
   where not (
    value->>'employeeId'=c.employee_id::text
    and value->>'date'=c.work_date::text
   );
   arr:=arr||jsonb_build_array(jsonb_build_object(
    'employeeId',c.employee_id,
    'date',c.work_date,
    'status','published'
   ));
   src:=jsonb_set(src,'{scheduleDays}',arr);
  end if;
 end loop;
 return src;
end $$;
revoke all on function payroll_scenario_private.effective_source(text) from public,anon,authenticated;

create or replace function public.resolve_test_payroll_employee_issues(
 p_scope uuid,
 p_from date,
 p_to date,
 p_employee uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 r payroll_scenario_private.runs;
 row_item jsonb;
 previous payroll_scenario_private.corrections;
 saved payroll_scenario_private.corrections;
 original jsonb;
 corrected jsonb;
 result jsonb;
 corrected_dates jsonb:='[]'::jsonb;
 corrected_count integer:=0;
 remaining integer:=0;
begin
 if auth.uid() is null then
  raise exception 'Authentication required' using errcode='42501';
 end if;
 if not coalesce(
  private.payroll_gross_permission(p_scope,'prepare')
  or private.payroll_gross_permission(p_scope,'rules')
  or private.payroll_has_access('manage_access',p_scope),
  false
 ) then
  raise exception 'Scoped payroll correction access required' using errcode='42501';
 end if;

 select * into strict r
 from payroll_scenario_private.runs
 where scope_id=p_scope and date_from=p_from and date_to=p_to and is_test
 for update;

 if not exists(
  select 1 from jsonb_array_elements(r.snapshot->'employees') employee
  where (employee->>'id')::uuid=p_employee
 ) then
  raise exception 'Employee is not included in this test run';
 end if;
 if not coalesce(private.payroll_package_permission(p_employee,p_scope,'view'),false) then
  raise exception 'Employee compensation access required' using errcode='42501';
 end if;

 for row_item in
  select value
  from jsonb_array_elements(
   coalesce(r.snapshot#>'{demo,timeResult,rows}',r.snapshot#>'{timeResult,rows}','[]'::jsonb)
  )
  where value->>'employeeId'=p_employee::text
    and not coalesce((value->>'ready')::boolean,false)
 loop
  original:=payroll_scenario_private.correction_snapshot(
   r.seed_run_id,p_employee,(row_item->>'date')::date
  );
  corrected:=jsonb_build_object(
   'resolutionMode','standard_day',
   'scheduleKind','work',
   'scheduleStart','09:00',
   'scheduleEnd','18:00',
   'clockIn','09:00',
   'breakStart','12:00',
   'breakEnd','13:00',
   'clockOut','18:00'
  );

  select * into previous
  from payroll_scenario_private.corrections
  where seed_run_id=r.seed_run_id
    and employee_id=p_employee
    and work_date=(row_item->>'date')::date;

  insert into payroll_scenario_private.corrections(
   seed_run_id,employee_id,work_date,issue_type,original_value,corrected_value,
   reason,status,created_by,updated_by
  ) values(
   r.seed_run_id,p_employee,(row_item->>'date')::date,'Resolve all attendance issues',
   original,corrected,
   'Applied the standard test workday to clear this employee''s unresolved attendance fixtures. Original schedule, punches, leave and overtime remain in the audit snapshot.',
   'Saved',auth.uid(),auth.uid()
  )
  on conflict(seed_run_id,employee_id,work_date) do update set
   issue_type=excluded.issue_type,
   corrected_value=excluded.corrected_value,
   reason=excluded.reason,
   status='Saved',
   updated_by=auth.uid(),
   updated_at=clock_timestamp(),
   approved_by=null,
   approved_at=null,
   recalculated_at=null,
   failure_message=null
  returning * into saved;

  insert into payroll_scenario_private.correction_audit(
   seed_run_id,employee_id,work_date,actor_id,action,previous_value,new_value,reason
  ) values(
   r.seed_run_id,p_employee,(row_item->>'date')::date,auth.uid(),
   'RESOLVE_ALL_EMPLOYEE_ISSUES',to_jsonb(previous),to_jsonb(saved),saved.reason
  );

  corrected_count:=corrected_count+1;
  corrected_dates:=corrected_dates||jsonb_build_array(row_item->>'date');
 end loop;

 result:=payroll_scenario_private.calculate_mock_run(r.seed_run_id);
 select count(*)::integer into remaining
 from jsonb_array_elements(coalesce(result#>'{timeResult,rows}','[]'::jsonb)) employee_day
 where employee_day->>'employeeId'=p_employee::text
   and not coalesce((employee_day->>'ready')::boolean,false);

 return jsonb_build_object(
  'employeeId',p_employee,
  'corrected',corrected_count,
  'correctedDates',corrected_dates,
  'remaining',remaining,
  'ready',remaining=0
 );
end $$;
revoke all on function public.resolve_test_payroll_employee_issues(uuid,date,date,uuid) from public,anon;
grant execute on function public.resolve_test_payroll_employee_issues(uuid,date,date,uuid) to authenticated;

notify pgrst,'reload schema';
