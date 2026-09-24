-- Import explicit day statuses against the saved roster and holiday calendar.
-- Pending absences and missing punches never authorize deductions.
create or replace function public.get_actual_attendance_import_context(p_scope uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.actual_attendance_access(p_scope) then raise exception 'Attendance import requires authorized BOD, Admin or HR access to this business unit.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>31 then raise exception 'Choose a payroll cutoff of at most 32 days.';end if;
 return jsonb_build_object('employees',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'code',h.employee_id,'name',h.full_name,'businessUnit',s.name) order by h.full_name),'[]')
 from public.hris_users h join public.payroll_access_scopes s on s.business_unit_id=h.business_unit_id
 where s.id=p_scope and not coalesce(h.is_duplicate,false) and h.date_hired<=p_to and (h.end_date is null or h.end_date>=p_from)),
 'dayStatuses',(select coalesce(jsonb_agg(jsonb_build_object('employeeId',days.employee_id,'workDate',days.work_date,'dayStatus',days.day_status)),'[]') from (
  select h.employee_id,dt::date work_date,case
   when private.schedule_day_status(h.id,dt::date)->>'tag'='suspended' then 'Suspended'
   when private.schedule_day_status(h.id,dt::date)->>'tag'='rest' then 'Rest day'
   when private.schedule_day_status(h.id,dt::date)->>'tag'='company_holiday' then 'Company holiday'
   when exists(select 1 from public.shift_assignments a join public.shift_templates t on t.id=a.shift_template_id where a.employee_id=h.id and a.date=dt::date and t.schedule_kind='rest') then 'Rest day'
   when exists(select 1 from public.shift_assignments a join public.shift_templates t on t.id=a.shift_template_id where a.employee_id=h.id and a.date=dt::date and t.schedule_kind='work') then 'Workday'
   when exists(select 1 from public.holidays hday where hday.date=dt::date and lower(hday.type) in('regular','regular holiday','legal','legal holiday','special non-working','special non-working day')) then 'Legal holiday'
   else null end day_status
  from public.hris_users h join public.payroll_access_scopes s on s.business_unit_id=h.business_unit_id
  cross join lateral generate_series(p_from,p_to,'1 day'::interval)dt
  where s.id=p_scope and not coalesce(h.is_duplicate,false) and h.date_hired<=dt::date and (h.end_date is null or h.end_date>=dt::date)
 )days where days.day_status is not null),
 'imports',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from (
 select b.id,b.filename,b.accepted_rows,b.duplicate_rows,b.created_at
 from private.payroll_actual_imports b where b.scope_id=p_scope and b.date_from=p_from and b.date_to=p_to
 order by b.created_at desc limit 25)x));
end $$;

create or replace function public.import_actual_attendance(p_scope uuid,p_from date,p_to date,p_filename text,p_rows jsonb,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;e public.hris_users;ev jsonb;stamp timestamptz;previous_stamp timestamptz;
 d date;idx integer:=0;source_row integer;errors jsonb:='[]';warnings jsonb;results jsonb:='[]';events jsonb;old_events jsonb;
state text;row_error text;day_status text;prior_status text;duplicates integer:=0;ready integer:=0;batch uuid;v_fingerprint text;bu uuid;bu_name text;seen text[]:='{}';key text;
begin
 if not private.actual_attendance_access(p_scope) then raise exception 'Attendance import requires authorized BOD, Admin or HR access to this business unit.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>31 then raise exception 'Choose a valid payroll cutoff.';end if;
 if p_filename is null or length(trim(p_filename)) not between 1 and 250 then raise exception 'Source filename is required.';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 2000 then raise exception 'Upload 1–2,000 attendance rows.';end if;
 select business_unit_id,name into bu,bu_name from public.payroll_access_scopes where id=p_scope;
 v_fingerprint:=md5(p_rows::text);
 if p_confirm then
 perform pg_advisory_xact_lock(hashtextextended('payroll-schedule-publication',0));
 -- Consistent employee lock order prevents deadlocks between concurrent batches.
 for e in select h.* from public.hris_users h where h.business_unit_id=bu and h.employee_id in(select x->>'employeeId' from jsonb_array_elements(p_rows)x) order by h.id loop
  perform pg_advisory_xact_lock(hashtextextended('attendance-clock:'||e.id::text,0));
 end loop;
 end if;
 select b.id into batch from private.payroll_actual_imports b where b.scope_id=p_scope and b.date_from=p_from and b.date_to=p_to and b.fingerprint=v_fingerprint;
 if batch is not null then return jsonb_build_object('alreadyImported',true,'batchId',batch,'ready',0,'duplicates',jsonb_array_length(p_rows),'rows','[]'::jsonb,'errors','[]'::jsonb);end if;
 for r in select value from jsonb_array_elements(p_rows) loop
 idx:=idx+1;source_row:=idx+1;if coalesce(r->>'sourceRow','') ~ '^[0-9]{1,6}$' then source_row:=(r->>'sourceRow')::int;end if;
 row_error:=null;day_status:=null;warnings:='[]';events:='[]';old_events:='[]';e:=null;previous_stamp:=null;state:='not_started';prior_status:=null;
 begin
  if r->>'businessUnit' is distinct from bu_name then raise exception 'Business unit does not match the selected business unit.';end if;
  if coalesce(r->>'employeeId','') ~* '^DEMO-' then raise exception 'Example IDs cannot be imported. Use an actual HRIS Employee ID.';end if;
  select * into e from public.hris_users h where h.employee_id=r->>'employeeId' and h.business_unit_id=bu and not coalesce(h.is_duplicate,false);
  if e.id is null then raise exception 'Employee ID was not found in this business unit. Select an HRIS employee.';end if;
  if (select count(*) from public.hris_users h where h.employee_id=r->>'employeeId' and h.business_unit_id=bu and not coalesce(h.is_duplicate,false))<>1 then raise exception 'Employee ID is ambiguous. HR must resolve the duplicate profile.';end if;
  if r->>'workDate' !~ '^\d{4}-\d{2}-\d{2}$' or r->>'workDate' is null then raise exception 'Use YYYY-MM-DD for Work date.';end if;
  d:=(r->>'workDate')::date;
  if d<p_from or d>p_to then raise exception 'Work date is outside the selected cutoff.';end if;
  if e.date_hired is null or e.date_hired>d or (e.end_date is not null and e.end_date<d) then raise exception 'Work date is outside the employee employment dates, or hire date is missing.';end if;
  day_status:=coalesce(nullif(r->>'dayStatus',''),'Workday');
  if day_status not in('Workday','Rest day','Legal holiday','Company holiday','Absent (review)','Missing punches (review)','Suspended') then raise exception 'Choose a supported Day status from the current attendance template.';end if;
  if private.is_schedule_suspended(e.id,d) and day_status<>'Suspended' then raise exception 'An active suspension covers this date. Select Suspended with no punches.';end if;
  if private.ob_for_day(e.id,d) is not null then raise exception 'Official Business dates require verified punches or an independently audited HR correction. An import cannot authorize the exception.';end if;
  key:=e.id::text||':'||d::text;
  if key=any(seen) then raise exception 'Repeated employee/work date. Combine its events in one session before importing.';end if;seen:=array_append(seen,key);
  if exists(select 1 from public.payroll_schedule_freezes f where f.employee_id=e.id and d between f.date_from and f.date_to) then raise exception 'This date is locked by submitted payroll. Use the authorized correction workflow.';end if;
  if jsonb_typeof(r->'events') is distinct from 'array' or jsonb_array_length(r->'events')>50 then raise exception 'Provide an events array with at most 50 actual punches per work date.';end if;
  if day_status='Workday' and jsonb_array_length(r->'events')=0 then raise exception 'Workday has no actual punches. Select the correct no-punch Day status or enter actual times.';end if;
  if day_status in('Company holiday','Absent (review)','Missing punches (review)','Suspended') and jsonb_array_length(r->'events')>0 then raise exception 'This Day status cannot contain punches. Use Workday for actual work and review the schedule.';end if;
  if day_status='Suspended' and not coalesce(private.is_schedule_suspended(e.id,d),false) then raise exception 'Suspension is not authorized for this date. Apply it through the existing HR schedule workflow first.';end if;
  if day_status='Rest day' and not (coalesce(private.schedule_day_status(e.id,d)->>'tag'='rest',false) or exists(select 1 from public.shift_assignments a join public.shift_templates t on t.id=a.shift_template_id where a.employee_id=e.id and a.date=d and t.schedule_kind='rest')) then raise exception 'Rest day is not on this employee''s schedule. Save it in Schedule Builder before importing.';end if;
  if day_status='Company holiday' and not (coalesce(private.schedule_day_status(e.id,d)->>'tag'='company_holiday',false) and exists(select 1 from public.holidays h where h.date=d)) then raise exception 'Company holiday must be registered in the holiday calendar and marked on the schedule first.';end if;
  if day_status='Legal holiday' and not exists(select 1 from public.holidays h where h.date=d and lower(h.type) in('regular','regular holiday','legal','legal holiday','special non-working','special non-working day')) then raise exception 'Legal holiday is not in the configured holiday calendar. HR must register the date first.';end if;
  if day_status in('Legal holiday','Company holiday') and jsonb_array_length(r->'events')=0 and exists(select 1 from public.shift_assignments a join public.shift_templates t on t.id=a.shift_template_id where a.employee_id=e.id and a.date=d and t.schedule_kind='work') then raise exception 'A work shift is scheduled on this holiday. Actual punches or an authorized schedule correction are required.';end if;
  if day_status in('Absent (review)','Missing punches (review)') then
   if not exists(select 1 from public.shift_assignments a join public.shift_templates t on t.id=a.shift_template_id where a.employee_id=e.id and a.date=d and t.schedule_kind='work') then raise exception 'No work shift is scheduled. Fix the schedule before reporting an absence or missing punches.';end if;
   warnings:=warnings||jsonb_build_array('Pending attendance review. No absence deduction or missing clock time is approved by this import.');
  end if;
  if jsonb_array_length(r->'events')>0 and coalesce((private.attendance_exception(e.id,d)->>'requires_clock')::boolean,true)=false then raise exception 'This employee is clock-exempt on this date. HR must review the attendance conflict before import.';end if;
  for ev in select value from jsonb_array_elements(r->'events') loop
   if ev->>'type' is null or ev->>'type' not in('ClockIn','ClockOut','BreakStart','BreakEnd') then raise exception 'Choose ClockIn, BreakStart, BreakEnd or ClockOut.';end if;
   if ev->>'timestamp' is null or ev->>'timestamp' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?\+08:00$' then raise exception 'Use an explicit date and time in Asia/Manila.';end if;
   stamp:=(ev->>'timestamp')::timestamptz;
   if stamp<(d::timestamp at time zone 'Asia/Manila') or stamp>=((d+2)::timestamp at time zone 'Asia/Manila') or stamp>now() then raise exception 'Punch must be actual, within the work date or following overnight day, and not in the future.';end if;
   if previous_stamp is not null and stamp<=previous_stamp then raise exception 'Punches must be chronological. Check the date for an overnight shift.';end if;
   if (ev->>'type'='ClockIn' and state not in('not_started','completed')) or (ev->>'type'='BreakStart' and state<>'working') or (ev->>'type'='BreakEnd' and state<>'break') or (ev->>'type'='ClockOut' and state<>'working') then
    warnings:=warnings||jsonb_build_array('Missing or inconsistent punches require attendance review. No times were fabricated.');
   end if;
   state:=case ev->>'type' when 'ClockIn' then 'working' when 'BreakStart' then 'break' when 'BreakEnd' then 'working' else 'completed' end;
   events:=events||jsonb_build_array(jsonb_build_object('type',ev->>'type','timestamp',stamp));previous_stamp:=stamp;
  end loop;
  if jsonb_array_length(events)>0 and state<>'completed' then warnings:=warnings||jsonb_build_array('Clock-out is missing. Review before calculating payroll.');end if;
  if jsonb_array_length(events)>0 and exists(select 1 from jsonb_array_elements(results) prior
   where prior->>'id'=e.id::text and prior->>'error' is null
   and (prior->'events'->0->>'timestamp')::timestamptz<=(events->-1->>'timestamp')::timestamptz
   and (prior->'events'->-1->>'timestamp')::timestamptz>=(events->0->>'timestamp')::timestamptz)
   then raise exception 'Attendance sessions overlap another row in this file. Check overnight dates.';end if;
  select coalesce(jsonb_agg(jsonb_build_object('type',t.type,'timestamp',t.timestamp) order by t.timestamp),'[]') into old_events from public.time_events t
  where t.employee_id=e.id and t.timestamp>=(d::timestamp at time zone 'Asia/Manila') and t.timestamp<((d+2)::timestamp at time zone 'Asia/Manila');
  if jsonb_array_length(events)=0 then
   if exists(select 1 from public.time_events t where t.employee_id=e.id and (t.timestamp at time zone 'Asia/Manila')::date=d and not exists(
     select 1 from private.payroll_actual_imports b cross join lateral jsonb_array_elements(b.rows)x cross join lateral jsonb_array_elements(x->'events')prev_event
     where b.scope_id=p_scope and x->>'employeeId'=e.employee_id and x->>'workDate'=(d-1)::text and prev_event->>'type'=t.type and (prev_event->>'timestamp')::timestamptz=t.timestamp
   )) or exists(select 1 from public.attendance_clock_sessions s where s.employee_id=e.id and s.work_date=d) then raise exception 'Existing punches conflict with this no-punch status. Review actual attendance before importing.';end if;
   select coalesce(nullif(x->>'dayStatus',''),'Workday') into prior_status from private.payroll_actual_imports b cross join lateral jsonb_array_elements(b.rows)x where b.scope_id=p_scope and b.date_from<=d and b.date_to>=d and x->>'employeeId'=e.employee_id and x->>'workDate'=d::text limit 1;
   if prior_status is not null and prior_status<>day_status then raise exception 'A different Day status was already imported for this employee and date. Use an audited correction.';end if;
   if prior_status is not null then duplicates:=duplicates+1;else ready:=ready+1;end if;
  elsif exists(select 1 from jsonb_array_elements(events)x where not old_events @> jsonb_build_array(x)) then
   if exists(select 1 from private.payroll_actual_imports b cross join lateral jsonb_array_elements(b.rows)x where b.scope_id=p_scope and b.date_from<=d and b.date_to>=d and x->>'employeeId'=e.employee_id and x->>'workDate'=d::text and coalesce(jsonb_array_length(x->'events'),0)=0) then raise exception 'A no-punch Day status was already imported for this date. Use an audited correction before adding punches.';end if;
   if exists(select 1 from public.time_events t where t.employee_id=e.id and (t.timestamp between (events->0->>'timestamp')::timestamptz and (events->-1->>'timestamp')::timestamptz or (t.timestamp at time zone 'Asia/Manila')::date=d))
    or exists(select 1 from public.attendance_clock_sessions s where s.employee_id=e.id and s.work_date=d) then raise exception 'Existing attendance conflicts with this row. Records will not be overwritten; use attendance correction.';end if;
   ready:=ready+1;
  else duplicates:=duplicates+1;end if;
 exception when others then row_error:=sqlerrm;errors:=errors||jsonb_build_array(jsonb_build_object('row',source_row,'message',row_error));end;
 results:=results||jsonb_build_array(jsonb_build_object('row',source_row,'employeeId',r->>'employeeId','employee',e.full_name,'workDate',r->>'workDate','dayStatus',day_status,'error',row_error,'warnings',warnings,'events',events,'id',e.id,'duplicate',row_error is null and ((jsonb_array_length(events)=0 and prior_status is not null) or (jsonb_array_length(events)>0 and old_events @> events))));
 end loop;
 if p_confirm then
  if jsonb_array_length(errors)>0 then raise exception 'Correct all rows before confirming: %',errors;end if;
  insert into private.payroll_actual_imports(scope_id,date_from,date_to,filename,rows,fingerprint,accepted_rows,duplicate_rows,created_by) values(p_scope,p_from,p_to,p_filename,p_rows,v_fingerprint,ready,duplicates,auth.uid()) returning id into batch;
  for r in select value from jsonb_array_elements(results) where not (value->>'duplicate')::boolean loop
   for ev in select value from jsonb_array_elements(r->'events') loop
    insert into public.time_events(employee_id,timestamp,type,source,timezone,created_by,notes)
    values((r->>'id')::uuid,(ev->>'timestamp')::timestamptz,ev->>'type','Import','Asia/Manila',public.current_hris_user_id(),'Confirmed attendance import '||batch::text||' row '||(r->>'row'));
   end loop;
  end loop;
 end if;
 return jsonb_build_object('batchId',batch,'ready',ready,'duplicates',duplicates,'errors',errors,'rows',results,'confirmed',p_confirm);
end $$;
notify pgrst,'reload schema';
