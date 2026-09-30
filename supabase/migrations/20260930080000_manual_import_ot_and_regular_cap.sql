-- In the manual attendance transition, only an explicit OT request can create
-- overtime pay. Raw punches remain immutable evidence. Ordinary paid minutes
-- are limited by both actual work and the published paid shift duration.
set local lock_timeout='5s';
set local statement_timeout='30s';

do $$declare ddl text;needle text;begin
 ddl:=pg_get_functiondef('private.attendance_pay_requests(uuid,jsonb,uuid)'::regprocedure);
 needle:=$old$qty:=(r->>'requestedOtHours')::numeric;beg:=(r->>'otStart')::timestamptz;fin:=(r->>'otEnd')::timestamptz;$old$;
 if strpos(ddl,needle)=0 then raise exception 'Attendance OT source changed; review offline validation.';end if;
 ddl:=replace(ddl,needle,needle||$new$
     if r->>'offlineManagerOtHours' is not null or r->>'offlineOtReference' is not null then
      if r->>'offlineManagerOtHours' is null or (r->>'offlineManagerOtHours')::numeric not between 0 and qty or round((r->>'offlineManagerOtHours')::numeric*60)<>(r->>'offlineManagerOtHours')::numeric*60 or nullif(btrim(r->>'offlineOtReference'),'') is null then
       raise exception 'Offline manager OT needs a quantity within applied OT and an approval reference; HRIS approval remains required.';
      end if;
     end if;
$new$);
 needle:=$old$'manager',(select full_name from public.hris_users where id=manager),'error',failure$old$;
 if strpos(ddl,needle)=0 then raise exception 'Attendance pay preview changed.';end if;
 ddl:=replace(ddl,needle,$new$'manager',(select full_name from public.hris_users where id=manager),'offlineManagerHours',r->'offlineManagerOtHours','offlineApprovalReference',r->>'offlineOtReference','error',failure$new$);
 execute ddl;
end $$;

alter function private.interpret_payroll_time(jsonb,date,date) rename to interpret_payroll_time_before_manual_import_cap;
create function private.interpret_payroll_time(p_source jsonb,p_from date,p_to date) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb;out_rows jsonb:='[]';r jsonb;issues jsonb;event_types text[];regular numeric;scheduled numeric;actual numeric;has_import boolean;has_ot boolean;begin
 result:=private.interpret_payroll_time_before_manual_import_cap(p_source,p_from,p_to);
 for r in select value from jsonb_array_elements(result->'rows') loop
  scheduled:=coalesce((r->>'scheduledMinutes')::numeric,0);
  actual:=coalesce((r->>'actualMinutes')::numeric,0);
  regular:=coalesce((r->>'regularMinutes')::numeric,0);
  has_import:=exists(select 1 from jsonb_array_elements(coalesce(p_source->'actualAttendanceDays','[]')) d where d->>'employeeId'=r->>'employeeId' and d->>'date'=r->>'date' and d->>'status'='Workday');
  has_ot:=exists(select 1 from jsonb_array_elements(coalesce(p_source->'ot','[]')) o where o->>'employeeId'=r->>'employeeId' and o->>'date'=r->>'date' and o->>'status' not in('Rejected','Cancelled','Canceled','Draft'));
  select array_agg(e->>'type') into event_types from jsonb_array_elements(coalesce(p_source->'events','[]')) e
   where e->>'employeeId'=r->>'employeeId' and e->>'importWorkDate'=r->>'date';
  if has_import and not has_ot and scheduled>0 and actual>0 and event_types @> array['CLOCK_IN','CLOCK_OUT'] and not coalesce((r->>'originalShiftReviewed')::boolean,false) then
   select coalesce(jsonb_agg(i),'[]') into issues from jsonb_array_elements(r->'issues') i where i#>>'{}' not in
    ('One unpaid movable lunch hour needs logs or direct-manager approved worked-lunch OT',
     'Worked and scheduled minutes need reconciliation',
     'Worked time outside the reviewed schedule / OT needs reconciliation');
   r:=r||jsonb_build_object('issues',issues,'ready',jsonb_array_length(issues)=0,
    'regularMinutes',least(regular,scheduled),'automaticRegularCap',true,
    'unrequestedOutsideTimeUnpaid',true,
    'breakTreatment',case when event_types @> array['START_BREAK','END_BREAK'] then 'Recorded break; no added OT for shortened or shifted break' else 'No verified break pair; normal unpaid break allowance from published shift; raw punches unchanged' end);
  end if;
  out_rows:=out_rows||jsonb_build_array(r);
 end loop;
 return result||jsonb_build_object('rows',out_rows,'blockedDays',(select count(*) from jsonb_array_elements(out_rows) x where not(x->>'ready')::boolean));
end $$;

-- Earlier reconciliation must skip only the excess interval when this explicit
-- manual-import cap is present. The final interval ledger clips paid regular
-- minutes to the capped quantity, preserving night/holiday categories.
do $$declare ddl text;needle text;begin
 ddl:=pg_get_functiondef('private.payroll_gross_intervals_before_manual_ot(jsonb,jsonb,jsonb)'::regprocedure);
 needle:=$old$elsif coalesce((r->>'originalShiftReviewed')::boolean,false) then continue;$old$;
 if strpos(ddl,needle)=0 then raise exception 'Gross interval reconciliation changed; review manual-import cap.';end if;
 ddl:=replace(ddl,needle,$new$elsif coalesce((r->>'originalShiftReviewed')::boolean,false) or coalesce((r->>'automaticRegularCap')::boolean,false) then continue;$new$);
 execute ddl;
 ddl:=pg_get_functiondef('private.payroll_gross_intervals(jsonb,jsonb,jsonb)'::regprocedure);
 needle:=$old$if not coalesce((r->>'originalShiftReviewed')::boolean,false) then return original;end if;$old$;
 if strpos(ddl,needle)=0 then raise exception 'Gross cap function changed.';end if;
 ddl:=replace(ddl,needle,$new$if not coalesce((r->>'originalShiftReviewed')::boolean,false) and not coalesce((r->>'automaticRegularCap')::boolean,false) then return original;end if;$new$);
 execute ddl;
end $$;
revoke all on function private.interpret_payroll_time(jsonb,date,date),private.interpret_payroll_time_before_manual_import_cap(jsonb,date,date) from public,anon,authenticated;
