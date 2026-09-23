-- Additive intake for actual attendance. No historical datasets are promoted.
set local lock_timeout = '5s';
-- A confirmed HR import is an audited source, not a fabricated manager-approved manual correction.
-- Keep all existing source values and the existing manual-correction approval checks.
alter table public.time_events drop constraint if exists time_events_source_check;
alter table public.time_events add constraint time_events_source_check check(source in('MobileGPS','QRKiosk','WebPhoto','Manual','Biometrics','System','Import')) not valid;
alter table public.time_events validate constraint time_events_source_check;
create table if not exists private.payroll_actual_imports (
 id uuid primary key default gen_random_uuid(), scope_id uuid not null references public.payroll_access_scopes(id),
 date_from date not null,date_to date not null,filename text not null,rows jsonb not null,
 fingerprint text not null,accepted_rows integer not null default 0,duplicate_rows integer not null default 0,
 created_by uuid not null,created_at timestamptz not null default now(),
 unique(scope_id,date_from,date_to,fingerprint)
);
alter table private.payroll_actual_imports enable row level security;
revoke all on private.payroll_actual_imports from public,anon,authenticated;

create or replace function private.actual_attendance_access(p_scope uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.payroll_actor_id() is not null
 and private.historical_reconciliation_user(public.current_hris_user_id())
 and private.payroll_time_permission(p_scope,'view')
$$;

create or replace function public.get_actual_attendance_import_context(p_scope uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.actual_attendance_access(p_scope) then raise exception 'Attendance import requires authorized BOD, Admin or HR access to this business unit.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>31 then raise exception 'Choose a payroll cutoff of at most 32 days.';end if;
 return jsonb_build_object('employees',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'code',h.employee_id,'name',h.full_name,'businessUnit',s.name) order by h.full_name),'[]')
 from public.hris_users h join public.payroll_access_scopes s on s.business_unit_id=h.business_unit_id
 where s.id=p_scope and not coalesce(h.is_duplicate,false) and h.date_hired<=p_to and (h.end_date is null or h.end_date>=p_from)),
 'imports',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from (
 select b.id,b.filename,b.accepted_rows,b.duplicate_rows,b.created_at
 from private.payroll_actual_imports b where b.scope_id=p_scope and b.date_from=p_from and b.date_to=p_to
 order by b.created_at desc limit 25)x));
end $$;

-- Validate again at confirmation, under the same locks used by clock/schedule writers.
create or replace function public.import_actual_attendance(p_scope uuid,p_from date,p_to date,p_filename text,p_rows jsonb,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;e public.hris_users;ev jsonb;stamp timestamptz;previous_stamp timestamptz;
 d date;idx integer:=0;errors jsonb:='[]';warnings jsonb;results jsonb:='[]';events jsonb;old_events jsonb;
state text;row_error text;duplicates integer:=0;ready integer:=0;batch uuid;v_fingerprint text;bu uuid;bu_name text;seen text[]:='{}';key text;
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
 idx:=idx+1;row_error:=null;warnings:='[]';events:='[]';previous_stamp:=null;state:='not_started';
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
  if private.is_schedule_suspended(e.id,d) then raise exception 'An active suspension covers this date. Use the authorized attendance correction workflow.';end if;
  if private.ob_for_day(e.id,d) is not null then raise exception 'Official Business dates require verified punches or an independently audited HR correction. An import cannot authorize the exception.';end if;
  if coalesce((private.attendance_exception(e.id,d)->>'requires_clock')::boolean,true)=false then raise exception 'This employee is clock-exempt on this date. HR must review the attendance conflict before import.';end if;
  key:=e.id::text||':'||d::text;
  if key=any(seen) then raise exception 'Repeated employee/work date. Combine its events in one session before importing.';end if;seen:=array_append(seen,key);
  if exists(select 1 from public.payroll_schedule_freezes f where f.employee_id=e.id and d between f.date_from and f.date_to) then raise exception 'This date is locked by submitted payroll. Use the authorized correction workflow.';end if;
  if jsonb_typeof(r->'events') is distinct from 'array' or jsonb_array_length(r->'events') not between 1 and 50 then raise exception 'Enter at least one actual punch, with at most 50 events per work date.';end if;
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
  if state<>'completed' then warnings:=warnings||jsonb_build_array('Clock-out is missing. Review before calculating payroll.');end if;
  if exists(select 1 from jsonb_array_elements(results) prior
   where prior->>'id'=e.id::text and prior->>'error' is null
   and (prior->'events'->0->>'timestamp')::timestamptz<=(events->-1->>'timestamp')::timestamptz
   and (prior->'events'->-1->>'timestamp')::timestamptz>=(events->0->>'timestamp')::timestamptz)
   then raise exception 'Attendance sessions overlap another row in this file. Check overnight dates.';end if;
  select coalesce(jsonb_agg(jsonb_build_object('type',t.type,'timestamp',t.timestamp) order by t.timestamp),'[]') into old_events from public.time_events t
  where t.employee_id=e.id and t.timestamp>=(d::timestamp at time zone 'Asia/Manila') and t.timestamp<((d+2)::timestamp at time zone 'Asia/Manila');
  if exists(select 1 from jsonb_array_elements(events)x where not old_events @> jsonb_build_array(x)) then
   if exists(select 1 from public.time_events t where t.employee_id=e.id and (t.timestamp between (events->0->>'timestamp')::timestamptz and (events->-1->>'timestamp')::timestamptz or (t.timestamp at time zone 'Asia/Manila')::date=d))
    or exists(select 1 from public.attendance_clock_sessions s where s.employee_id=e.id and s.work_date=d) then raise exception 'Existing attendance conflicts with this row. Records will not be overwritten; use attendance correction.';end if;
   ready:=ready+1;
  else duplicates:=duplicates+1;end if;
 exception when others then row_error:=sqlerrm;errors:=errors||jsonb_build_array(jsonb_build_object('row',idx,'message',row_error));end;
 results:=results||jsonb_build_array(jsonb_build_object('row',idx,'employeeId',r->>'employeeId','employee',e.full_name,'workDate',r->>'workDate','error',row_error,'warnings',warnings,'events',events,'id',e.id,'duplicate',row_error is null and old_events @> events));
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
revoke all on function private.actual_attendance_access(uuid) from public,anon,authenticated;
revoke all on function public.get_actual_attendance_import_context(uuid,date,date),public.import_actual_attendance(uuid,date,date,text,jsonb,boolean) from public,anon;
grant execute on function public.get_actual_attendance_import_context(uuid,date,date),public.import_actual_attendance(uuid,date,date,text,jsonb,boolean) to authenticated;

create or replace function public.get_normal_payroll_periods(p_scope uuid,p_year integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.payroll_time_permission(p_scope,'view') then raise exception 'Scoped payroll access is required.' using errcode='42501';end if;
 if p_year is null or p_year not between 2000 and 2100 then raise exception 'Choose a year from 2000 to 2100.';end if;
 return (
  with candidates as (
   select (m.month_start+((c->>'releaseDay')::int-1))::date release_date,
    ((m.month_start+make_interval(months=>(c->>'startMonthOffset')::int))::date+((c->>'startDay')::int-1))::date date_from,
    ((m.month_start+make_interval(months=>(c->>'endMonthOffset')::int))::date+((c->>'endDay')::int-1))::date date_to,
    r.scope_id,r.effective_from,r.policy_ref,r.created_at
   from public.payroll_calendar_rules r
   cross join lateral jsonb_array_elements(r.calendar)c
   cross join lateral (select make_date(p_year,n,1) month_start from generate_series(1,12)n)m
   where r.scope_id is null or r.scope_id=p_scope
  ), resolved as (
   select distinct on (release_date) * from candidates a where date_from>=effective_from
   and not exists(select 1 from public.payroll_calendar_rules newer where newer.effective_from<=a.date_from
     and ((a.scope_id is null and newer.scope_id=p_scope) or (newer.scope_id is not distinct from a.scope_id and newer.effective_from>a.effective_from)))
   order by release_date,scope_id nulls last,effective_from desc,created_at desc
  ) select coalesce(jsonb_agg(jsonb_build_object('releaseDate',release_date,'from',date_from,'to',date_to,'policy',policy_ref,'override',scope_id is not null) order by release_date),'[]'::jsonb) from resolved
 );
end $$;
revoke all on function public.get_normal_payroll_periods(uuid,integer) from public,anon;
grant execute on function public.get_normal_payroll_periods(uuid,integer) to authenticated;
