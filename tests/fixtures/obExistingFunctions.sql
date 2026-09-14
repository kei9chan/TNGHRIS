-- Existing production function definitions, captured read-only for isolated integration checks.
create function private.attendance_next_state(p_state text,p_action text) returns text language plpgsql immutable set search_path='' as $$begin
 if p_state='not_started' and p_action='CLOCK_IN' then return 'working';end if;
 if p_state='working' and p_action='START_BREAK' then return 'on_break';end if;
 if p_state='on_break' and p_action='END_BREAK' then return 'working';end if;
 if p_state='working' and p_action='CLOCK_OUT' then return 'completed';end if;
 raise exception 'Your attendance has changed. Refresh to see your next action.' using errcode='40001';end $$;
CREATE OR REPLACE FUNCTION private.record_attendance_core(p_action text, p_request_id uuid, p_expected_revision integer, p_work_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.get_my_attendance()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp uuid;d date;prior jsonb;today date:=(statement_timestamp() at time zone 'Asia/Manila')::date;begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS sign-in required.' using errcode='42501';end if;emp:=public.current_hris_user_id();
 select work_date into d from public.attendance_clock_sessions where employee_id=emp and state in('working','on_break') limit 1;
 if d is null and not exists(select 1 from public.attendance_clock_sessions where employee_id=emp and work_date=today) then
 prior:=private.attendance_schedule(emp,today-1);
 if (prior->>'published')::boolean and exists(select 1 from jsonb_array_elements(prior->'entries') x where x->>'kind'='work' and x->>'endDayOffset'='1' and statement_timestamp()<((today+(x->>'end')::time) at time zone 'Asia/Manila')) then d:=today-1;end if;end if;
 return private.attendance_day(emp,coalesce(d,today));end $function$;

CREATE OR REPLACE FUNCTION public.record_my_attendance_verified(p_action text, p_request_id uuid, p_expected_revision integer, p_work_date date, p_evidence jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp uuid:=public.current_hris_user_id();bu uuid;cfg jsonb;method text:=coalesce(p_evidence->>'method','web');s public.sites;d public.attendance_devices;q public.attendance_qr_challenges;lat double precision;lon double precision;acc double precision;distance double precision;result jsonb;ev uuid;detail jsonb:='{}';begin
 if private.payroll_actor_id() is null then raise exception 'Active sign-in required' using errcode='42501';end if;
 select business_unit_id into bu from public.hris_users where id=emp;perform pg_advisory_xact_lock_shared(hashtextextended('attendance-channel:'||bu::text,0));perform pg_advisory_xact_lock(hashtextextended('attendance-clock:'||emp::text,0));
 if exists(select 1 from public.attendance_clock_events where employee_id=emp and request_id=p_request_id and action=p_action) then return public.get_my_attendance();end if;cfg:=private.attendance_channel_config(bu);
 if method='web' then if not(cfg->>'web_allowed')::boolean then raise exception 'Use your configured GPS or QR clock method';end if;
 elsif method='gps' then
 if not(cfg->>'gps_enabled')::boolean then raise exception 'GPS clocking is not enabled for your business unit';end if;
 select * into s from public.sites where id=(p_evidence->>'siteId')::uuid and business_unit_id=bu;
 lat:=(p_evidence->>'latitude')::double precision;lon:=(p_evidence->>'longitude')::double precision;acc:=(p_evidence->>'accuracy')::double precision;
 if s.id is null or s.latitude is null or s.longitude is null or s.radius_meters is null or s.radius_meters<=0 or lat is null or lon is null or acc is null or lat not between -90 and 90 or lon not between -180 and 180 or lat is null or lon is null or acc is null or acc not between 0 and 100 then raise exception 'Use a configured work site and a fresh location reading accurate within 100 metres';end if;
 distance:=6371000*2*asin(sqrt(least(1.0,power(sin(radians(lat-s.latitude)/2),2)+cos(radians(lat))*cos(radians(s.latitude))*power(sin(radians(lon-s.longitude)/2),2))));
 if distance+acc>s.radius_meters then raise exception 'Your location is outside the site boundary or not accurate enough. Retry at the work site.';end if;
 detail:=jsonb_build_object('latitude',lat,'longitude',lon,'accuracy',acc,'distanceMetres',distance,'radiusMetres',s.radius_meters,'locationSource','Device-reported GPS');
 elsif method='qr' then
 if not(cfg->>'qr_enabled')::boolean then raise exception 'QR clocking is not enabled for your business unit';end if;
 select * into q from public.attendance_qr_challenges where token_hash=encode(extensions.digest(coalesce(p_evidence->>'token',''),'sha256'),'hex');
 select * into d from public.attendance_devices where id=q.device_id for share;
 if q.id is null or q.expires_at<=clock_timestamp() or not d.active or d.kind<>'qr' or d.business_unit_id is distinct from bu then raise exception 'QR code expired or belongs to another business unit. Scan the current kiosk code.';end if;
 if exists(select 1 from public.attendance_channel_evidence e where e.challenge_id=q.id and e.detail->>'employeeId'=emp::text) then raise exception 'You already used this kiosk code. Scan the next code.';end if;
 detail:=jsonb_build_object('employeeId',emp);else raise exception 'Choose Web, GPS or QR clocking';end if;
 result:=private.record_attendance_core(p_action,p_request_id,p_expected_revision,p_work_date);select id into strict ev from public.attendance_clock_events where employee_id=emp and request_id=p_request_id;
 insert into public.attendance_channel_evidence(event_id,method,site_id,device_id,challenge_id,detail) values(ev,method,coalesce(s.id,d.site_id),d.id,q.id,detail);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION private.interpret_payroll_time(p_source jsonb, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare u jsonb;d date;a jsonb;e jsonb;l jsonb;o jsonb;r jsonb;cfg jsonb;shifts jsonb;events jsonb;leaves jsonb;ots jsonb;holidays jsonb;
 rows jsonb:='[]';issues jsonb;segments jsonb;pairs jsonb;breaks jsonb;ot_segments jsonb;piece jsonb;sp jsonb;bp jsonb;
 ss timestamptz;se timestamptz;ws timestamptz;we timestamptz;ts timestamptz;opened timestamptz;break_open timestamptz;meal_s timestamptz;meal_e timestamptz;
 scheduled numeric;actual numeric;break_m numeric;regular_m numeric;late_m numeric;under_m numeric;approved_ot numeric;actual_ot numeric;om numeric;
 worked_lunch_minutes numeric;requires_clock boolean;n integer;flex_start timestamptz;rest boolean;full_leave boolean;holiday boolean;is_worked_lunch boolean;source_ids jsonb;holiday_segments jsonb;day_end timestamptz;
begin
 for u in select value from jsonb_array_elements(p_source->'employees') loop
 for d in select generate_series(p_from,p_to,'1 day'::interval)::date loop
 if nullif(u->>'hireDate','') is not null and (u->>'hireDate')::date>d then continue;end if;
 if nullif(u->>'endDate','') is not null and (u->>'endDate')::date<d then continue;end if;
 requires_clock:=coalesce((select (x->>'requiresClock')::boolean from jsonb_array_elements(coalesce(p_source->'clockRequirements','[]')) x where x->>'employeeId'=u->>'id' and (x->>'date')::date=d),true);
 issues:='[]';segments:='[]';pairs:='[]';breaks:='[]';ot_segments:='[]';holiday_segments:='[]';opened:=null;break_open:=null;
 worked_lunch_minutes:=0;scheduled:=0;actual:=0;regular_m:=0;break_m:=0;late_m:=0;under_m:=0;approved_ot:=0;actual_ot:=0;rest:=false;full_leave:=false;is_worked_lunch:=false;
 select value into r from jsonb_array_elements(p_source->'rules') where (value->>'effective_from')::date<=d and (value->>'effective_to')::date>=d order by (value->>'revision')::bigint desc limit 1;cfg:=r->'config';
 if r is null then issues:=issues||'"Approved time rules missing"'::jsonb;end if;
 if nullif(u->>'hireDate','') is null then issues:=issues||'"Employment start date missing"'::jsonb;end if;
 if lower(u->>'status')<>'active' and nullif(u->>'endDate','') is null then issues:=issues||'"Inactive employee has no end date — confirm period coverage"'::jsonb;end if;
 if not coalesce((cfg->>'holidayCoverageConfirmed')::boolean,false) then issues:=issues||'"Holiday calendar coverage needs review"'::jsonb;end if;
 select coalesce(jsonb_agg(value order by value->>'start'),'[]') into shifts from jsonb_array_elements(p_source->'shifts') where value->>'employeeId'=u->>'id' and (value->>'date')::date=d;
 select coalesce(jsonb_agg(value),'[]') into leaves from jsonb_array_elements(p_source->'leave') where value->>'employeeId'=u->>'id' and (value->>'startDate')::date<=d and (value->>'endDate')::date>=d and value->>'status' not in('Rejected','Cancelled','Draft');
 select coalesce(jsonb_agg(value),'[]') into ots from jsonb_array_elements(p_source->'ot') where value->>'employeeId'=u->>'id' and (value->>'date')::date=d and value->>'status' not in('Rejected','Cancelled','Draft');
 select coalesce(jsonb_agg(value),'[]') into holidays from jsonb_array_elements(p_source->'holidays') where (value->>'date')::date between d and d+1;
 holiday:=exists(select 1 from jsonb_array_elements(holidays) where (value->>'date')::date=d);
 if jsonb_array_length(shifts)=0 then issues:=issues||'"Missing Schedule — do not mark absent"'::jsonb;end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(p_source->'scheduleDays','[]')) x where x->>'employeeId'=u->>'id' and (x->>'date')::date=d and x->>'status'='published') then issues:=issues||'"Missing or unpublished schedule — publish the reviewed week first"'::jsonb;end if;
 ws:=null;we:=null;
 for a in select value from jsonb_array_elements(shifts) loop
 if a->>'published' is distinct from 'true' then issues:=issues||'"Unpublished schedule"'::jsonb;end if;
 if a->>'kind'='rest' or coalesce(cfg->'restTemplates','[]') ? (a->>'templateId') then rest:=true;continue;end if;
 if a->>'kind'='no_schedule' then continue;end if;
 begin perform private.payroll_schedule_validate(a);exception when raise_exception then issues:=issues||jsonb_build_array(sqlerrm);continue;end;
 if coalesce((a->>'flexible')::boolean,false) then
 if not requires_clock then scheduled:=scheduled+(a->>'paidMinutes')::numeric;continue;end if;
 select min((x->>'timestamp')::timestamptz) into flex_start from jsonb_array_elements(p_source->'events') x where x->>'employeeId'=u->>'id' and x->>'type'='CLOCK_IN' and ((x->>'timestamp')::timestamptz at time zone 'Asia/Manila')::date=d;
 if flex_start is null then issues:=issues||'"Flexible shift punches missing — do not assume hours worked"'::jsonb;continue;end if;
 ss:=flex_start;se:=ss+make_interval(mins=>(a->>'paidMinutes')::integer+60);
 else
 ss:=(d+(a->>'start')::time) at time zone 'Asia/Manila';se:=((d+coalesce((a->>'endDayOffset')::integer,0))+(a->>'end')::time) at time zone 'Asia/Manila';end if;
 if exists(select 1 from jsonb_array_elements(segments) x where (x->>'start')::timestamptz<se and (x->>'end')::timestamptz>ss) then issues:=issues||'"Overlapping scheduled segments"'::jsonb;end if;
 segments:=segments||jsonb_build_array(jsonb_build_object('start',ss,'end',se,'shiftId',a->>'id'));
 ws:=least(ws,ss);we:=greatest(we,se);scheduled:=scheduled+extract(epoch from(se-ss))/60;
 if coalesce((a->>'breakMinutes')::numeric,-1) not in(0,60) then issues:=issues||'"Scheduled lunch duration needs review"'::jsonb;end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(shifts) x where x->>'kind'='no_schedule') and jsonb_array_length(shifts)>1 then issues:=issues||'"Leave / No Schedule conflicts with a working assignment"'::jsonb;end if;
 if rest and jsonb_array_length(shifts)>1 then issues:=issues||'"Rest-day and work assignments conflict"'::jsonb;end if;
 if jsonb_array_length(segments)>1 and not coalesce((cfg->>'splitShiftConfirmed')::boolean,false) then issues:=issues||'"Split-shift break treatment needs review"'::jsonb;end if;
 if jsonb_array_length(segments)>1 and exists(select 1 from jsonb_array_elements(shifts) x where (x->>'breakMinutes')::integer<>0) then issues:=issues||'"Split shifts must identify the unpaid gap without deducting it twice"'::jsonb;end if;
 if jsonb_array_length(segments)=1 and not rest then
 if scheduled<480 and not exists(select 1 from jsonb_array_elements(shifts) x where x->>'flexible'='true') then issues:=issues||'"Short-shift lunch treatment needs review"'::jsonb;end if;
 scheduled:=greatest(0,scheduled-60);end if;
 -- Approved request times extend the capture window, including rest-day work.
 for o in select value from jsonb_array_elements(ots) loop
 if o->>'start' is not null and o->>'end' is not null then
 ss:=(d+(o->>'start')::time) at time zone 'Asia/Manila';se:=(d+(o->>'end')::time) at time zone 'Asia/Manila';if se<ss then se:=se+interval '1 day';end if;
 ws:=least(ws,ss);we:=greatest(we,se);end if;end loop;
 ws:=coalesce(ws,d::timestamp at time zone 'Asia/Manila');we:=coalesce(we,(d+1)::timestamp at time zone 'Asia/Manila');
 select coalesce(jsonb_agg(value order by (value->>'timestamp')::timestamptz,value->>'id'),'[]') into events from jsonb_array_elements(p_source->'events') where value->>'employeeId'=u->>'id' and (value->>'timestamp')::timestamptz>=ws-interval '4 hours' and (value->>'timestamp')::timestamptz<=we+interval '8 hours';
 -- Adjacent schedules in the same capture window are ambiguous, never silently merged.
 if exists(select 1 from jsonb_array_elements(p_source->'shifts') x where x->>'employeeId'=u->>'id' and (x->>'date')::date<>d and coalesce(x->>'kind','work')='work' and not(coalesce(cfg->'restTemplates','[]') ? (x->>'templateId')) and x->>'start' is not null and (((x->>'date')::date+(x->>'start')::time) at time zone 'Asia/Manila') between ws-interval '4 hours' and we+interval '8 hours') then issues:=issues||'"Adjacent shifts share a punch window — review boundaries"'::jsonb;end if;
 for e in select value from jsonb_array_elements(events) loop
 ts:=(e->>'timestamp')::timestamptz;
 if e->>'source'='Manual' and nullif(e->>'managerId','') is null then issues:=issues||'"Manual punch requires manager evidence"'::jsonb;end if;
 case e->>'type'
 when 'CLOCK_IN' then if opened is not null then issues:=issues||'"Duplicate or unpaired clock-in"'::jsonb;else opened:=ts;end if;
 when 'CLOCK_OUT' then if opened is null or ts<=opened or break_open is not null then issues:=issues||'"Missing or out-of-order punch"'::jsonb;else pairs:=pairs||jsonb_build_array(jsonb_build_object('start',opened,'end',ts));opened:=null;end if;
 when 'START_BREAK' then if opened is null or break_open is not null then issues:=issues||'"Unpaired break punch"'::jsonb;else break_open:=ts;end if;
 when 'END_BREAK' then if break_open is null or ts<=break_open then issues:=issues||'"Unpaired break punch"'::jsonb;else breaks:=breaks||jsonb_build_array(jsonb_build_object('start',break_open,'end',ts));break_open:=null;end if;
 else issues:=issues||'"Unsupported punch type"'::jsonb;end case;
 end loop;
 if opened is not null or break_open is not null then issues:=issues||'"Missing clock-out or break end"'::jsonb;end if;
 for piece in select value from jsonb_array_elements(pairs) loop actual:=actual+extract(epoch from((piece->>'end')::timestamptz-(piece->>'start')::timestamptz))/60;end loop;
 for bp in select value from jsonb_array_elements(breaks) loop break_m:=break_m+extract(epoch from((bp->>'end')::timestamptz-(bp->>'start')::timestamptz))/60;end loop;actual:=greatest(0,actual-break_m);
 for l in select value from jsonb_array_elements(leaves) loop
 if l->>'status'<>'Approved' or coalesce((l->>'configurationRequired')::boolean,false) then issues:=issues||'"Leave approval incomplete"'::jsonb;
 elsif nullif(l->>'startTime','') is not null or nullif(l->>'endTime','') is not null then issues:=issues||'"Partial-day leave needs an approved time interpretation"'::jsonb;
 else full_leave:=true;end if;
 if coalesce((l->>'paid')::boolean,false) and (nullif(cfg->>'leavePolicyRef','') is null or not exists(select 1 from jsonb_array_elements(p_source->'leavePolicies') p where p->>'leave_type_id'=l->>'typeId' and p->>'accrual_rule' is not null and p->>'accrual_rule'<>'none')) then issues:=issues||'"Paid leave accrual / regularization source needs reconciliation"'::jsonb;end if;
 if l->>'type'='Offset Leave' then issues:=issues||'"Offset leave balance and consumption require reconciliation"'::jsonb;end if;
 end loop;
 if full_leave and exists(select 1 from jsonb_array_elements(shifts) x where x->>'kind'='no_schedule') then
 select (x->>'paidMinutes')::integer into scheduled from jsonb_array_elements(shifts) x where x->>'kind'='no_schedule' limit 1;
 if scheduled is null then scheduled:=0;issues:=issues||'"Leave / No Schedule needs planned paid-hours information for leave valuation"'::jsonb;end if;end if;
 if jsonb_array_length(leaves)>1 then issues:=issues||'"Overlapping leave records"'::jsonb;end if;
 if full_leave and actual>0 then issues:=issues||'"Approved leave overlaps worked time"'::jsonb;end if;
 if requires_clock and not rest and not full_leave and jsonb_array_length(pairs)=0 and jsonb_array_length(segments)>0 then issues:=issues||'"Punches missing — absence requires review"'::jsonb;end if;
 if exists(select 1 from jsonb_array_elements(p_source->'wfh') w where w->>'employeeId'=u->>'id' and (w->>'startDate')::date<=d and (w->>'endDate')::date>=d and w->>'status' not in('Rejected','Cancelled','Draft') and (w->>'status' not in('Approved','WFH_FOR_TIMEKEEPING') or coalesce((w->>'configurationRequired')::boolean,false))) then issues:=issues||'"WFH approval incomplete"'::jsonb;end if;
 -- Keep requested, approved and actual OT distinct, without rounding 75 to 60/90.
 for o in select value from jsonb_array_elements(ots) loop
 if o->>'status'<>'Approved' or coalesce((o->>'configurationRequired')::boolean,false) then issues:=issues||'"OT approval incomplete"'::jsonb;continue;end if;
 if o->>'start' is null or o->>'end' is null or o->>'approvedHours' is null then issues:=issues||'"Approved OT times or duration missing"'::jsonb;continue;end if;
 ss:=(d+(o->>'start')::time) at time zone 'Asia/Manila';se:=(d+(o->>'end')::time) at time zone 'Asia/Manila';if se<ss then se:=se+interval '1 day';end if;
 if not coalesce((o->>'compensableReview')::boolean,false) and (extract(epoch from(se-ss))/60<60 or (o->>'approvedHours')::numeric*60<60) then issues:=issues||'"Below-one-hour OT needs policy review; retain worked time"'::jsonb;end if;
 if exists(select 1 from jsonb_array_elements(ot_segments) x where (x->>'start')::timestamptz<se and (x->>'end')::timestamptz>ss) then issues:=issues||'"Overlapping approved OT"'::jsonb;end if;
 ot_segments:=ot_segments||jsonb_build_array(jsonb_build_object('start',ss,'end',se));om:=0;
 for piece in select value from jsonb_array_elements(pairs) loop om:=om+greatest(0,extract(epoch from(least(se,(piece->>'end')::timestamptz)-greatest(ss,(piece->>'start')::timestamptz)))/60);end loop;
 for bp in select value from jsonb_array_elements(breaks) loop om:=om-greatest(0,extract(epoch from(least(se,(bp->>'end')::timestamptz)-greatest(ss,(bp->>'start')::timestamptz)))/60);end loop;
 approved_ot:=approved_ot+(o->>'approvedHours')::numeric*60;actual_ot:=actual_ot+greatest(0,om);
 if (o->>'type'='Offset' and om is distinct from (o->>'approvedHours')::numeric*60) or om>(o->>'approvedHours')::numeric*60 then issues:=issues||'"Actual versus approved OT duration needs reconciliation"'::jsonb;end if;
 if o->>'type'='Offset' and d>=(p_source#>>'{confirmedPolicy,effective_from}')::date and not coalesce((select (x->>'offset_eligible')::boolean from jsonb_array_elements(coalesce(p_source->'employeeRules','[]')) x where x->>'employee_id'=u->>'id' and d between (x->>'effective_from')::date and (x->>'effective_to')::date order by x->>'created_at' desc,x->>'id' desc limit 1),false) then issues:=issues||jsonb_build_array('Individual HR offset / OT-exemption assessment required; use regular OT until approved');end if;
 if o->>'type'='Offset' and not(rest or holiday) then issues:=issues||'"Ordinary-day excess is not eligible for manager offset"'::jsonb;end if;
 if o->>'type'='Offset' then issues:=issues||'"Manager offset requires HR → GM → two distinct BOD approvals and balance reconciliation"'::jsonb;end if;
 for a in select value from jsonb_array_elements(shifts) loop
 if cfg->'meals' ? (a->>'templateId') then
 meal_s:=(d+(cfg->'meals'->>(a->>'templateId'))::time) at time zone 'Asia/Manila';if meal_s<ws then meal_s:=meal_s+interval '1 day';end if;meal_e:=meal_s+interval '1 hour';
 if ss>=meal_s and se<=meal_e and om>0 and o->>'type'='Paid' and o->>'approvedBy'=o->>'directManagerId' and o->>'directManagerId'=u->>'managerId' then is_worked_lunch:=true;worked_lunch_minutes:=worked_lunch_minutes+om;end if;end if;end loop;
 end loop;
 if not full_leave and not rest and jsonb_array_length(segments)=1 and actual>0 and break_m<>60 and not(is_worked_lunch and break_m+worked_lunch_minutes=60) then issues:=issues||'"One unpaid movable lunch hour needs logs or direct-manager approved worked-lunch OT"'::jsonb;end if;
 if rest and actual>0 and approved_ot=0 then issues:=issues||'"Rest-day work requires approved source request"'::jsonb;end if;
 for sp in select value from jsonb_array_elements(segments) loop
 ss:=(sp->>'start')::timestamptz;se:=(sp->>'end')::timestamptz;
 select min((x->>'start')::timestamptz),max((x->>'end')::timestamptz) into opened,ts from jsonb_array_elements(pairs) x where (x->>'end')::timestamptz>ss and (x->>'start')::timestamptz<se;
 if opened is not null then late_m:=late_m+greatest(0,extract(epoch from(opened-ss))/60-5);under_m:=under_m+greatest(0,extract(epoch from(se-ts))/60);end if;
 for piece in select value from jsonb_array_elements(pairs) loop regular_m:=regular_m+greatest(0,extract(epoch from(least(se,(piece->>'end')::timestamptz)-greatest(ss,(piece->>'start')::timestamptz)))/60);end loop;
 for bp in select value from jsonb_array_elements(breaks) loop regular_m:=regular_m-greatest(0,extract(epoch from(least(se,(bp->>'end')::timestamptz)-greatest(ss,(bp->>'start')::timestamptz)))/60);end loop;
 -- Explicit calendar-day segments preserve overnight holiday boundaries for Phase 4.
 day_end:=(((ss at time zone 'Asia/Manila')::date+1)::timestamp at time zone 'Asia/Manila');
 holiday_segments:=holiday_segments||jsonb_build_array(jsonb_build_object('date',(ss at time zone 'Asia/Manila')::date,'start',ss,'end',least(se,day_end)));
 if se>day_end then holiday_segments:=holiday_segments||jsonb_build_array(jsonb_build_object('date',(day_end at time zone 'Asia/Manila')::date,'start',day_end,'end',se));end if;
 end loop;
 if is_worked_lunch then regular_m:=greatest(0,regular_m-worked_lunch_minutes);end if;
 if not requires_clock and not full_leave and not rest and actual=0 then regular_m:=scheduled;end if;
 if actual>regular_m+actual_ot then issues:=issues||'"Worked time outside the reviewed schedule / OT needs reconciliation"'::jsonb;end if;
 if scheduled>0 and regular_m>scheduled and not is_worked_lunch then issues:=issues||'"Worked and scheduled minutes need reconciliation"'::jsonb;end if;
 select coalesce(jsonb_agg(distinct value),'[]') into issues from jsonb_array_elements(issues);
 rows:=rows||jsonb_build_array(jsonb_build_object('employeeId',u->>'id','employeeName',u->>'name','date',d,'requiresClock',requires_clock,'attendanceBasis',case when requires_clock then 'Recorded punches' else 'Published schedule · HR review' end,'restDay',rest,'scheduleState',case when rest then 'Rest Day' when full_leave or exists(select 1 from jsonb_array_elements(shifts) x where x->>'kind'='no_schedule') then 'Leave / No Schedule' when jsonb_array_length(shifts)=0 then 'Missing Schedule' else 'Work' end,'holiday',holiday,'approvedFullLeave',full_leave,
 'scheduledMinutes',scheduled,'actualMinutes',actual,'regularMinutes',greatest(0,regular_m),'breakMinutes',break_m,'lateMinutes',late_m,'undertimeMinutes',under_m,
 'approvedOtMinutes',approved_ot,'actualOtMinutes',actual_ot,'workedLunch',is_worked_lunch,'issues',issues,'ready',jsonb_array_length(issues)=0,
 'shiftIds',(select coalesce(jsonb_agg(x->'id'),'[]') from jsonb_array_elements(shifts) x),'eventIds',(select coalesce(jsonb_agg(x->'id'),'[]') from jsonb_array_elements(events) x),
 'leaveIds',(select coalesce(jsonb_agg(x->'id'),'[]') from jsonb_array_elements(leaves) x),'ot',ots,'holidays',holidays,'segments',holiday_segments,'ruleId',r->'id'));
 end loop;end loop;
 return jsonb_build_object('engineVersion','phase3-v1','rows',rows,'blockedDays',(select count(*) from jsonb_array_elements(rows) x where not(x->>'ready')::boolean),'totalDays',jsonb_array_length(rows));
end $function$;

