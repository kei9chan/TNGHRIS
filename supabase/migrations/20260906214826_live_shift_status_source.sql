create function public.get_live_shift_status(p_employees uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare emp uuid;d date;day0 date:=(statement_timestamp() at time zone 'Asia/Manila')::date;ctx jsonb;ss timestamptz;se timestamptz;state text;outp jsonb:='[]';old_type text;prior jsonb;begin
 if private.payroll_actor_id() is null or coalesce(cardinality(p_employees),0)>1000 then raise exception 'Active scoped attendance access required' using errcode='42501';end if;
 foreach emp in array p_employees loop
 if not private.payroll_schedule_can_read(emp) then continue;end if;
 d:=null;select work_date into d from public.attendance_clock_sessions where employee_id=emp and state in('working','on_break') limit 1;
 if d is null then prior:=private.attendance_schedule(emp,day0-1);if coalesce((prior->>'published')::boolean,false) and exists(select 1 from jsonb_array_elements(prior->'entries') x where x->>'kind'='work' and x->>'endDayOffset'='1' and statement_timestamp()<((day0+(x->>'end')::time) at time zone 'Asia/Manila')) then d:=day0-1;else d:=day0;end if;end if;
 ctx:=private.attendance_day(emp,d);state:=ctx->>'state';
 if state='not_started' then
 select type into old_type from public.time_events where employee_id=emp and timestamp>=(d::timestamp at time zone 'Asia/Manila') and timestamp<((d+1)::timestamp at time zone 'Asia/Manila') order by timestamp desc limit 1;
 state:=case old_type when 'ClockIn' then 'working' when 'CLOCK_IN' then 'working' when 'BreakEnd' then 'working' when 'END_BREAK' then 'working' when 'BreakStart' then 'on_break' when 'START_BREAK' then 'on_break' when 'ClockOut' then 'completed' when 'CLOCK_OUT' then 'completed' else state end;end if;
 if state in('working','on_break') then outp:=outp||jsonb_build_array(jsonb_build_object('employeeId',emp,'status',case when state='working' then 'in' else 'break' end));
 elsif state='not_started' and (ctx->>'requiresClock')::boolean and (ctx->'schedule'->>'published')::boolean and jsonb_array_length(ctx->'schedule'->'entries')>0 and not exists(select 1 from jsonb_array_elements(ctx->'schedule'->'entries') x where x->>'kind'<>'work' or coalesce((x->>'flexible')::boolean,false)) then
 select min((d+(x->>'start')::time) at time zone 'Asia/Manila'),max(((d+coalesce((x->>'endDayOffset')::integer,0))+(x->>'end')::time) at time zone 'Asia/Manila') into ss,se from jsonb_array_elements(ctx->'schedule'->'entries') x;
 if statement_timestamp()>ss+interval '5 minutes' and statement_timestamp()<se then outp:=outp||jsonb_build_array(jsonb_build_object('employeeId',emp,'status','late'));end if;end if;
 end loop;return outp;end $$;
revoke all on function public.get_live_shift_status(uuid[]) from public,anon;grant execute on function public.get_live_shift_status(uuid[]) to authenticated;
notify pgrst,'reload schema';

