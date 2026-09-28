-- A confirmed cutoff import selects the payroll-effective attendance for each
-- employee/work date. Raw clock evidence and prior import batches remain intact.
set local lock_timeout = '5s';
create table if not exists private.payroll_actual_days (
 scope_id uuid not null references public.payroll_access_scopes(id),
 employee_id uuid not null references public.hris_users(id),
 work_date date not null,
 batch_id uuid not null references private.payroll_actual_imports(id),
 source_row integer not null,
 day_status text not null,
 events jsonb not null,
 updated_at timestamptz not null default now(),
 primary key(scope_id,employee_id,work_date)
);
alter table private.payroll_actual_days enable row level security;
revoke all on private.payroll_actual_days from public,anon,authenticated;

-- Keep the current schedule, clock-session and OB sources intact. Replace only
-- payroll-effective punches for dates explicitly covered by a confirmed import.
do $migration$
declare ddl text;
begin
 ddl:=pg_get_functiondef('private.payroll_time_sources(uuid,date,date)'::regprocedure);
 execute replace(ddl,'FUNCTION private.payroll_time_sources(','FUNCTION private.payroll_time_sources_before_actual_import(');
end $migration$;

create or replace function private.payroll_time_sources(p_scope uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare src jsonb;filtered jsonb;added jsonb;days jsonb;
begin
 src:=private.payroll_time_sources_before_actual_import(p_scope,p_from,p_to);
 -- Existing sessions have their own work date. Other clock events belong to
 -- the local work date; the selected import explicitly carries overnight times.
 select coalesce(jsonb_agg(x order by x->>'timestamp',x->>'id'),'[]'::jsonb)
 into filtered from jsonb_array_elements(coalesce(src->'events','[]'::jsonb)) x
 where not exists(
   select 1 from private.payroll_actual_days a
   where a.scope_id=p_scope and a.employee_id::text=x->>'employeeId'
   and a.work_date=coalesce(
      (select s.work_date from public.attendance_clock_sessions s where s.id::text=x->>'clockSessionId'),
      ((x->>'timestamp')::timestamptz at time zone 'Asia/Manila')::date)
 );
 select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.batch_id::text||':'||a.source_row::text||':'||v.ordinality::text,
    'employeeId',a.employee_id,'timestamp',(v.value->>'timestamp')::timestamptz,
    'type',case v.value->>'type' when 'ClockIn' then 'CLOCK_IN'
      when 'ClockOut' then 'CLOCK_OUT' when 'BreakStart' then 'START_BREAK'
      when 'BreakEnd' then 'END_BREAK' end,
    'source','Import','importBatchId',a.batch_id,
    'importWorkDate',a.work_date
 ) order by (v.value->>'timestamp')::timestamptz,a.employee_id,v.ordinality),'[]'::jsonb)
 into added from private.payroll_actual_days a
 cross join lateral jsonb_array_elements(a.events) with ordinality v
 where a.scope_id=p_scope and a.work_date between p_from-1 and p_to+1;
 select coalesce(jsonb_agg(jsonb_build_object('employeeId',a.employee_id,'date',a.work_date,
    'status',a.day_status,'batchId',a.batch_id,'sourceRow',a.source_row)
    order by a.employee_id,a.work_date),'[]'::jsonb)
 into days from private.payroll_actual_days a
 where a.scope_id=p_scope and a.work_date between p_from and p_to;
 return src||jsonb_build_object('events',filtered||added,'actualAttendanceDays',days);
end $function$;
revoke all on function private.payroll_time_sources_before_actual_import(uuid,date,date),
 private.payroll_time_sources(uuid,date,date) from public,anon,authenticated;

-- Preserve all the existing validation and locks. Only replace the previous
-- conflict/duplicate decision and the commit step; fail migration if upstream
-- source has changed instead of silently patching the wrong function.
do $migration$
declare ddl text;first_marker text;last_marker text;start_at integer;end_at integer;
begin
 ddl:=pg_get_functiondef('public.import_actual_attendance(uuid,date,date,text,jsonb,boolean)'::regprocedure);
 first_marker:='  select coalesce(jsonb_agg(jsonb_build_object(''type'',t.type,''timestamp'',t.timestamp)';
 last_marker:=' exception when others then row_error:=sqlerrm;';
 start_at:=strpos(ddl,first_marker);
 end_at:=strpos(ddl,last_marker);
 if start_at=0 or end_at<=start_at or strpos(ddl,'for r in select value from jsonb_array_elements(results) where not (value->>''duplicate'')::boolean loop')=0 then
  raise exception 'Attendance importer changed; review final-source migration against the current importer.';
 end if;
 ddl:=left(ddl,start_at-1)||$replacement$
  -- A saved import is the selected payroll source. A new row supersedes it;
  -- a matching row is unchanged. Existing raw punches are kept for audit.
  select a.events,a.day_status into old_events,prior_status
    from private.payroll_actual_days a
    where a.scope_id=p_scope and a.employee_id=e.id and a.work_date=d;
  if prior_status=day_status and old_events=events then
    duplicates:=duplicates+1;
  else
    ready:=ready+1;
    if prior_status is not null or exists(
      select 1 from public.time_events t where t.employee_id=e.id
      and (t.timestamp at time zone 'Asia/Manila')::date=d
    ) or exists(
      select 1 from public.attendance_clock_sessions s where s.employee_id=e.id and s.work_date=d
    ) then
      warnings:=warnings||jsonb_build_array('This import will replace the payroll attendance for this date. Earlier clock records remain in the audit history.');
    end if;
  end if;
$replacement$||substr(ddl,end_at);
 -- Results must reflect the selected payroll row, including no-punch days.
 ddl:=replace(ddl,
   '((jsonb_array_length(events)=0 and prior_status is not null) or (jsonb_array_length(events)>0 and old_events @> events))',
   'coalesce(prior_status=day_status and old_events=events,false)');
 if strpos(ddl,'coalesce(prior_status=day_status and old_events=events,false)')=0 then
  raise exception 'Attendance result classification changed; review migration.';
 end if;
 -- A previously used workbook may be intentionally reimported after a later
 -- correction. The old batch stays immutable; the new batch gets a new ID.
 ddl:=replace(ddl,
   'if batch is not null then return jsonb_build_object(''alreadyImported'',true,''batchId'',batch,''ready'',0,''duplicates'',jsonb_array_length(p_rows),''rows'',''[]''::jsonb,''errors'',''[]''::jsonb);end if;',
   'if batch is not null then v_fingerprint:=md5(v_fingerprint||'':''||gen_random_uuid()::text); batch:=null;end if;');
 if strpos(ddl,'v_fingerprint:=md5(v_fingerprint||'':''||gen_random_uuid()::text)')=0 then
  raise exception 'Attendance batch idempotency changed; review migration.';
 end if;
 -- Persist the active day selection atomically with the audited batch.
 ddl:=replace(ddl,
   '  for r in select value from jsonb_array_elements(results) where not (value->>''duplicate'')::boolean loop',
   '  for r in select value from jsonb_array_elements(results) where not (value->>''duplicate'')::boolean loop'||chr(10)||
   '   insert into private.payroll_actual_days(scope_id,employee_id,work_date,batch_id,source_row,day_status,events)'||chr(10)||
   '   values(p_scope,(r->>''id'')::uuid,(r->>''workDate'')::date,batch,(r->>''row'')::integer,r->>''dayStatus'',r->''events'')'||chr(10)||
   '   on conflict(scope_id,employee_id,work_date) do update set batch_id=excluded.batch_id,source_row=excluded.source_row,day_status=excluded.day_status,events=excluded.events,updated_at=now();');
 execute ddl;
end $migration$;
revoke all on function public.import_actual_attendance(uuid,date,date,text,jsonb,boolean) from public,anon;
grant execute on function public.import_actual_attendance(uuid,date,date,text,jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
