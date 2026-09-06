-- Additive employee clock and HR attendance evidence. Existing schedule writers,
-- payroll policy rules and RLS policies remain unchanged.
set local lock_timeout='5s';
create table public.attendance_clock_sessions(
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.hris_users(id),work_date date not null,
 publication_id uuid not null references public.payroll_schedule_publications(id),schedule_snapshot jsonb not null,
 state text not null default 'not_started' check(state in('not_started','working','on_break','completed')),
 revision integer not null default 0,created_at timestamptz not null default clock_timestamp(),unique(employee_id,work_date)
);
create unique index attendance_one_open_session on public.attendance_clock_sessions(employee_id) where state in('working','on_break');
create table public.attendance_clock_events(
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.attendance_clock_sessions(id),
 employee_id uuid not null references public.hris_users(id),action text not null check(action in('CLOCK_IN','START_BREAK','END_BREAK','CLOCK_OUT')),
 occurred_at timestamptz not null,request_id uuid not null,revision integer not null,created_by uuid not null references public.hris_users(id),
 unique(employee_id,request_id),unique(session_id,revision)
);
create table public.attendance_clock_adjustments(
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.attendance_clock_sessions(id),revision integer not null,
 events jsonb not null,reason text not null check(length(trim(reason)) between 3 and 1000),created_by uuid not null references public.hris_users(id),
 created_at timestamptz not null default clock_timestamp(),unique(session_id,revision)
);
create table public.attendance_clock_exemptions(
 id uuid primary key default gen_random_uuid(),record_id uuid not null,revision integer not null,employee_id uuid not null references public.hris_users(id),
 exception_type text not null check(length(trim(exception_type)) between 3 and 100),requires_clock boolean not null default true,
 effective_from date not null,effective_to date,reason text not null check(length(trim(reason)) between 3 and 1000),
 created_by uuid not null references public.hris_users(id),created_at timestamptz not null default clock_timestamp(),
 unique(record_id,revision),check(effective_to is null or effective_to>=effective_from)
);
create index attendance_exemption_employee on public.attendance_clock_exemptions(employee_id,record_id,revision desc);
create index attendance_events_session on public.attendance_clock_events(session_id,revision);
do $$declare t text;begin
 foreach t in array array['attendance_clock_sessions','attendance_clock_events','attendance_clock_adjustments','attendance_clock_exemptions'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);
 if t<>'attendance_clock_sessions' then execute format('create trigger immutable before update or delete on public.%I for each row execute function private.payroll_audit_immutable()',t);end if;
 end loop;
end $$;
-- Resolve authority from existing active RBAC metadata and management permission.
-- Exemption eligibility is never inferred from a role, email or employee ID.
create function private.attendance_admin() returns boolean language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and public.is_hr_or_admin() and exists(
 select 1 from private.effective_role_ids(public.current_hris_user_id()) e join public.roles r on r.id=e.role_id
 where r.is_active and (r.dashboard_type='admin' or (r.dashboard_type<>'executive' and exists(select 1 from public.role_permissions rp where rp.role_id=r.id and rp.resource_id='AttendanceExceptions' and 'manage'=any(rp.permissions)))))
$$;
create function private.attendance_exception(p_employee uuid,p_date date) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(x) from public.attendance_clock_exemptions x where x.employee_id=p_employee and x.effective_from<=p_date and (x.effective_to is null or x.effective_to>=p_date)
 and not exists(select 1 from public.attendance_clock_exemptions n where n.record_id=x.record_id and n.revision>x.revision) order by x.created_at desc limit 1
$$;
create function private.attendance_schedule(p_employee uuid,p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.payroll_schedule_publications;entries jsonb;valid boolean;begin
 select * into p from public.payroll_schedule_publications x where employee_id=p_employee and p_date between effective_from and effective_to
 and (not approval_required or exists(select 1 from public.payroll_schedule_overrides o where o.publication_id=x.id and decision='approve')) order by version desc limit 1;
 select coalesce(jsonb_agg(x order by x->>'start'),'[]') into entries from jsonb_array_elements(coalesce(p.snapshot,'[]')) x where (x->>'date')::date=p_date;
 valid:=p.id is not null and jsonb_array_length(entries)>0 and (p.source_hash=md5(private.payroll_schedule_draft(p_employee,p.effective_from)::text)
 or exists(select 1 from public.payroll_schedule_freezes where employee_id=p_employee and p_date between date_from and date_to));
 return jsonb_build_object('publicationId',p.id,'version',p.version,'date',p_date,'entries',entries,'published',valid);
end $$;
create function private.attendance_session_events(p_session uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select a.events from public.attendance_clock_adjustments a where a.session_id=p_session order by revision desc limit 1),
 (select jsonb_agg(jsonb_build_object('id',e.id,'type',e.action,'timestamp',e.occurred_at) order by e.revision) from public.attendance_clock_events e where e.session_id=p_session),'[]')
$$;
create function private.attendance_day(p_employee uuid,p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.attendance_clock_sessions;sch jsonb;exc jsonb;events jsonb;ev jsonb;start_at timestamptz;end_at timestamptz;break_at timestamptz;break_seconds numeric:=0;at_time timestamptz:=statement_timestamp();elapsed numeric:=0;begin
 select * into s from public.attendance_clock_sessions where employee_id=p_employee and work_date=p_date;
 sch:=case when s.id is not null then s.schedule_snapshot else private.attendance_schedule(p_employee,p_date) end;
 exc:=private.attendance_exception(p_employee,p_date);events:=private.attendance_session_events(s.id);
 for ev in select value from jsonb_array_elements(events) loop
 case ev->>'type' when 'CLOCK_IN' then start_at:=(ev->>'timestamp')::timestamptz;
 when 'START_BREAK' then break_at:=(ev->>'timestamp')::timestamptz;
 when 'END_BREAK' then break_seconds:=break_seconds+extract(epoch from((ev->>'timestamp')::timestamptz-break_at));break_at:=null;
 when 'CLOCK_OUT' then end_at:=(ev->>'timestamp')::timestamptz;else null;end case;end loop;
 if start_at is not null then elapsed:=greatest(0,extract(epoch from(coalesce(end_at,at_time)-start_at))-break_seconds-case when break_at is not null then extract(epoch from(at_time-break_at)) else 0 end);end if;
 return jsonb_build_object('serverTime',at_time,'timezone','Asia/Manila','workDate',p_date,'sessionId',s.id,'revision',coalesce(s.revision,0),'state',coalesce(s.state,'not_started'),
 'schedule',sch,'requiresClock',coalesce((exc->>'requires_clock')::boolean,true),'exceptionId',exc->>'id','elapsedSeconds',floor(elapsed),'breakSeconds',floor(break_seconds+case when break_at is not null then extract(epoch from(at_time-break_at)) else 0 end),'events',events,
 'canManage',private.attendance_admin());
end $$;
create function public.get_my_attendance() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare emp uuid;d date;prior jsonb;today date:=(statement_timestamp() at time zone 'Asia/Manila')::date;begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS sign-in required.' using errcode='42501';end if;emp:=public.current_hris_user_id();
 select work_date into d from public.attendance_clock_sessions where employee_id=emp and state in('working','on_break') limit 1;
 if d is null and not exists(select 1 from public.attendance_clock_sessions where employee_id=emp and work_date=today) then
 prior:=private.attendance_schedule(emp,today-1);
 if (prior->>'published')::boolean and exists(select 1 from jsonb_array_elements(prior->'entries') x where x->>'kind'='work' and x->>'endDayOffset'='1' and statement_timestamp()<((today+(x->>'end')::time) at time zone 'Asia/Manila')) then d:=today-1;end if;end if;
 return private.attendance_day(emp,coalesce(d,today));end $$;
create function private.attendance_next_state(p_state text,p_action text) returns text language plpgsql immutable set search_path='' as $$begin
 if p_state='not_started' and p_action='CLOCK_IN' then return 'working';end if;
 if p_state='working' and p_action='START_BREAK' then return 'on_break';end if;
 if p_state='on_break' and p_action='END_BREAK' then return 'working';end if;
 if p_state='working' and p_action='CLOCK_OUT' then return 'completed';end if;
 raise exception 'Your attendance has changed. Refresh to see your next action.' using errcode='40001';end $$;
-- Direct browser writes are rejected without altering the existing row policies.
create function private.attendance_event_write_guard() returns trigger language plpgsql set search_path='' as $$begin
 if current_user in('authenticated','anon') then raise exception 'Use the secure clock or HR attendance correction workflow.' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;return new;end $$;
create trigger attendance_server_writes before insert or update or delete on public.time_events for each row execute function private.attendance_event_write_guard();
create function public.record_my_attendance(p_action text,p_request_id uuid,p_expected_revision integer,p_work_date date) returns jsonb language plpgsql security definer set search_path='' as $$
declare emp uuid;ctx jsonb;s public.attendance_clock_sessions;sch jsonb;line jsonb;next_state text;ev public.attendance_clock_events;begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS sign-in required.' using errcode='42501';end if;emp:=public.current_hris_user_id();
 perform pg_advisory_xact_lock(hashtextextended('attendance-clock:'||emp::text,0));
 if p_request_id is null or p_action not in('CLOCK_IN','START_BREAK','END_BREAK','CLOCK_OUT') then raise exception 'Choose a valid clock action.';end if;
 select * into ev from public.attendance_clock_events where employee_id=emp and request_id=p_request_id;
 if ev.id is not null then if ev.action<>p_action then raise exception 'This request already recorded a different action.';end if;return public.get_my_attendance();end if;
 ctx:=public.get_my_attendance();
 if p_expected_revision is distinct from (ctx->>'revision')::integer or p_work_date is distinct from (ctx->>'workDate')::date then raise exception 'Your attendance changed on another device. Refresh your day.' using errcode='40001';end if;
 if not(ctx->>'requiresClock')::boolean then raise exception 'Attendance is handled by your schedule.';end if;
 next_state:=private.attendance_next_state(ctx->>'state',p_action);
 if p_action='CLOCK_IN' then
 if not public.has_feature_permission('ClockInOut','create') and not private.attendance_admin() then raise exception 'Existing clock access is required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('payroll-schedule-publication',0));
 sch:=private.attendance_schedule(emp,p_work_date);
 if not(sch->>'published')::boolean then raise exception 'Your schedule is not published yet. Please check with your manager.';end if;
 for line in select value from jsonb_array_elements(sch->'entries') loop perform private.payroll_schedule_validate(line);if line->>'kind'<>'work' then raise exception 'No working shift is scheduled for this day.';end if;end loop;
 insert into public.attendance_clock_sessions(employee_id,work_date,publication_id,schedule_snapshot) values(emp,p_work_date,(sch->>'publicationId')::uuid,sch) returning * into s;
 else select * into s from public.attendance_clock_sessions where id=(ctx->>'sessionId')::uuid and employee_id=emp;end if;
 insert into public.attendance_clock_events(session_id,employee_id,action,occurred_at,request_id,revision,created_by)
 values(s.id,emp,p_action,clock_timestamp(),p_request_id,s.revision+1,emp) returning * into ev;
 insert into public.time_events(id,employee_id,timestamp,type,source,timezone,created_by,notes)
 values(ev.id,emp,ev.occurred_at,case p_action when 'CLOCK_IN' then 'ClockIn' when 'CLOCK_OUT' then 'ClockOut' when 'START_BREAK' then 'BreakStart' else 'BreakEnd' end,'System','Asia/Manila',emp,'Secure employee clock');
 update public.attendance_clock_sessions set state=next_state,revision=ev.revision where id=s.id;
 return private.attendance_day(emp,p_work_date);
end $$;

create function public.get_attendance_exception_admin() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.attendance_admin() then raise exception 'Existing HR/Admin attendance management access required.' using errcode='42501';end if;
 return jsonb_build_object('today',(statement_timestamp() at time zone 'Asia/Manila')::date,
 'employees',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name) order by full_name),'[]') from public.hris_users where public.can_access_hris_user(id) and not coalesce(is_duplicate,false)),
 'records',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('employeeName',h.full_name,'createdByName',a.full_name) order by x.created_at desc),'[]') from public.attendance_clock_exemptions x join public.hris_users h on h.id=x.employee_id join public.hris_users a on a.id=x.created_by where public.can_access_hris_user(x.employee_id)));
end $$;
create function public.save_attendance_exception(p_employee uuid,p_record_id uuid,p_expected_revision integer,p_type text,p_requires_clock boolean,p_from date,p_to date,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.attendance_clock_exemptions;record uuid;newid uuid;begin
 if not private.attendance_admin() or not public.can_access_hris_user(p_employee) then raise exception 'Existing scoped HR/Admin attendance access required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('attendance-clock:'||p_employee::text,0));
 if p_requires_clock is null or p_from is null or (p_to is not null and p_to<p_from) then raise exception 'Enter a valid effective date range.';end if;
 if p_record_id is not null then select * into prior from public.attendance_clock_exemptions where record_id=p_record_id order by revision desc limit 1;
 if prior.id is null or prior.employee_id<>p_employee or prior.revision is distinct from p_expected_revision then raise exception 'Exception changed; reload its current version.' using errcode='40001';end if;end if;
 record:=coalesce(p_record_id,gen_random_uuid());
 if exists(select 1 from public.attendance_clock_exemptions x where employee_id=p_employee and record_id<>record and not exists(select 1 from public.attendance_clock_exemptions n where n.record_id=x.record_id and n.revision>x.revision)
 and daterange(x.effective_from,x.effective_to,'[]') && daterange(p_from,p_to,'[]')) then raise exception 'This employee already has an exception covering these dates. Edit that record or choose non-overlapping dates.';end if;
 if not p_requires_clock and exists(select 1 from public.attendance_clock_sessions where employee_id=p_employee and state in('working','on_break') and work_date>=p_from and (p_to is null or work_date<=p_to)) then raise exception 'Finish or review the open clock session before making these dates exempt.';end if;
 insert into public.attendance_clock_exemptions(record_id,revision,employee_id,exception_type,requires_clock,effective_from,effective_to,reason,created_by)
 values(record,coalesce(prior.revision,0)+1,p_employee,p_type,p_requires_clock,p_from,p_to,p_reason,public.current_hris_user_id()) returning id into newid;return newid;
end $$;
create function public.get_hr_attendance_day(p_employee uuid,p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.attendance_admin() or not public.can_access_hris_user(p_employee) then raise exception 'Existing scoped HR/Admin attendance access required.' using errcode='42501';end if;
 return private.attendance_day(p_employee,p_date)||jsonb_build_object('originalEvents',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'type',e.action,'timestamp',e.occurred_at) order by e.revision),'[]') from public.attendance_clock_events e join public.attendance_clock_sessions s on s.id=e.session_id where s.employee_id=p_employee and s.work_date=p_date),'audit',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('createdByName',(select full_name from public.hris_users where id=a.created_by)) order by a.revision desc),'[]') from public.attendance_clock_adjustments a join public.attendance_clock_sessions s on s.id=a.session_id where s.employee_id=p_employee and s.work_date=p_date));end $$;
create function public.correct_attendance_day(p_employee uuid,p_date date,p_expected_revision integer,p_events jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.attendance_clock_sessions;sch jsonb;state text:='not_started';ev jsonb;prev timestamptz;ts timestamptz;clean jsonb:='[]';adjust uuid:=gen_random_uuid();i integer:=0;begin
 if not private.attendance_admin() or not public.can_access_hris_user(p_employee) then raise exception 'Existing scoped HR/Admin attendance access required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('attendance-clock:'||p_employee::text,0));
 select * into s from public.attendance_clock_sessions where employee_id=p_employee and work_date=p_date;
 if coalesce(s.revision,0) is distinct from p_expected_revision then raise exception 'Attendance changed; refresh before correcting.' using errcode='40001';end if;
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events) not between 2 and 30 then raise exception 'Provide the actual clock-in, any break pairs and clock-out.';end if;
 for ev in select value from jsonb_array_elements(p_events) loop
 ts:=(ev->>'timestamp')::timestamptz;
 if ts is null or ts>clock_timestamp() or ts < (p_date::timestamp at time zone 'Asia/Manila') or ts>=((p_date+2)::timestamp at time zone 'Asia/Manila') or (prev is not null and ts<=prev) then raise exception 'Use ordered actual times within the shift day or next day, without future times.';end if;
 state:=private.attendance_next_state(state,ev->>'type');i:=i+1;
 clean:=clean||jsonb_build_array(jsonb_build_object('id',adjust::text||':'||i,'type',ev->>'type','timestamp',ts));prev:=ts;end loop;
 if state<>'completed' then raise exception 'A correction must include the complete recorded day.';end if;
 if s.id is null then
 sch:=private.attendance_schedule(p_employee,p_date);if not(sch->>'published')::boolean then raise exception 'Publish and review the actual schedule before correcting attendance.';end if;
 insert into public.attendance_clock_sessions(employee_id,work_date,publication_id,schedule_snapshot) values(p_employee,p_date,(sch->>'publicationId')::uuid,sch) returning * into s;end if;
 insert into public.attendance_clock_adjustments(id,session_id,revision,events,reason,created_by) values(adjust,s.id,s.revision+1,clean,p_reason,public.current_hris_user_id());
 update public.attendance_clock_sessions set state='completed',revision=s.revision+1 where id=s.id;
 return private.attendance_day(p_employee,p_date);
end $$;
-- Preserve the current published-schedule source and add reviewed clock evidence.
do $$declare ddl text;begin ddl:=pg_get_functiondef('private.payroll_time_sources(uuid,date,date)'::regprocedure);
 execute replace(ddl,'FUNCTION private.payroll_time_sources(','FUNCTION private.payroll_pre_clock_sources(');end $$;
create or replace function private.payroll_time_sources(p_scope uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare src jsonb;s public.attendance_clock_sessions;events jsonb;requirements jsonb:='[]';u jsonb;d date;ex jsonb;begin
 src:=private.payroll_pre_clock_sources(p_scope,p_from,p_to);
 select coalesce(jsonb_agg(x||jsonb_build_object('type',case x->>'type' when 'ClockIn' then 'CLOCK_IN' when 'ClockOut' then 'CLOCK_OUT' when 'BreakStart' then 'START_BREAK' when 'BreakEnd' then 'END_BREAK' else x->>'type' end) order by x->>'timestamp',x->>'id'),'[]') into events
 from jsonb_array_elements(src->'events') x where not exists(select 1 from public.attendance_clock_events e where e.id::text=x->>'id');
 for s in select * from public.attendance_clock_sessions where work_date between p_from-1 and p_to+1 and employee_id::text in(select x->>'id' from jsonb_array_elements(src->'employees') x) order by employee_id,work_date loop
 events:=events||(select coalesce(jsonb_agg(x||jsonb_build_object('employeeId',s.employee_id,'source','System','clockSessionId',s.id,'clockRevision',s.revision)),'[]') from jsonb_array_elements(private.attendance_session_events(s.id)) x);end loop;
 for u in select value from jsonb_array_elements(src->'employees') loop
 for d in select generate_series(p_from,p_to,'1 day')::date loop
 ex:=private.attendance_exception((u->>'id')::uuid,d);
 requirements:=requirements||jsonb_build_array(jsonb_build_object('employeeId',u->>'id','date',d,'requiresClock',coalesce((ex->>'requires_clock')::boolean,true),'exceptionId',ex->>'id','exceptionRevision',ex->'revision'));end loop;end loop;
 return src||jsonb_build_object('events',events,'clockRequirements',requirements);
end $$;
-- Keep the payroll interpreter and confirmed rules. Exempt attendance is explicitly
-- schedule-based for HR review; no synthetic clock punches are written.
do $$declare ddl text;begin
 ddl:=pg_get_functiondef('private.interpret_payroll_time(jsonb,date,date)'::regprocedure);
 ddl:=replace(ddl,'n integer;flex_start','requires_clock boolean;n integer;flex_start');
 ddl:=replace(ddl,'issues:=''[]'';segments:', 'requires_clock:=coalesce((select (x->>''requiresClock'')::boolean from jsonb_array_elements(coalesce(p_source->''clockRequirements'',''[]'')) x where x->>''employeeId''=u->>''id'' and (x->>''date'')::date=d),true);'||chr(10)||' issues:=''[]'';segments:');
 ddl:=replace(ddl,'select min((x->>''timestamp'')::timestamptz) into flex_start', 'if not requires_clock then scheduled:=scheduled+(a->>''paidMinutes'')::numeric;continue;end if;'||chr(10)||' select min((x->>''timestamp'')::timestamptz) into flex_start');
 ddl:=replace(ddl,'if not rest and not full_leave and jsonb_array_length(pairs)=0', 'if requires_clock and not rest and not full_leave and jsonb_array_length(pairs)=0');
 ddl:=replace(ddl,'if actual>regular_m+actual_ot then', 'if not requires_clock and not full_leave and not rest and actual=0 then regular_m:=scheduled;end if;'||chr(10)||' if actual>regular_m+actual_ot then');
 ddl:=replace(ddl,'''restDay'',rest,''scheduleState''', '''requiresClock'',requires_clock,''attendanceBasis'',case when requires_clock then ''Recorded punches'' else ''Published schedule · HR review'' end,''restDay'',rest,''scheduleState''');
 execute ddl;
end $$;
-- Only narrowly guarded endpoints are callable; private helpers remain internal.
do $$declare r record;begin
 for r in select p.oid::regprocedure sig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='private' and p.proname in('attendance_admin','attendance_exception','attendance_schedule','attendance_session_events','attendance_day','attendance_next_state','attendance_event_write_guard','payroll_pre_clock_sources')) or
 (n.nspname='public' and p.proname in('get_my_attendance','record_my_attendance','get_attendance_exception_admin','save_attendance_exception','get_hr_attendance_day','correct_attendance_day')) loop
 execute 'revoke all on function '||r.sig||' from public,anon,authenticated';if r.nspname='public' then execute 'grant execute on function '||r.sig||' to authenticated';end if;end loop;
end $$;
notify pgrst,'reload schema';
