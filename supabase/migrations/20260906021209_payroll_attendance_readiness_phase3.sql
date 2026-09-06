-- Phase 3 is an isolated consumer of the existing HRIS time sources.
-- No existing schedule, clock, leave, OT, role, trigger or RLS writer is replaced.
create table public.payroll_time_rules (
 id uuid primary key default gen_random_uuid(), revision bigint generated always as identity,
 scope_id uuid not null references public.payroll_access_scopes(id),
 effective_from date not null, effective_to date not null check(effective_to>=effective_from),
 config jsonb not null check(jsonb_typeof(config)='object'),
 source_ref text not null check(length(btrim(source_ref)) between 3 and 1000),
 approved_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index payroll_time_rules_scope_dates on public.payroll_time_rules(scope_id,effective_from,effective_to,revision desc);
create table public.payroll_time_holidays (
 id uuid primary key default gen_random_uuid(), scope_id uuid not null references public.payroll_access_scopes(id),
 date date not null, name text not null check(length(btrim(name)) between 3 and 200),
 kind text not null check(kind in('regular','special_nonworking','special_working','double_regular')),
 source_ref text not null check(length(btrim(source_ref)) between 3 and 1000),
 replaces_id uuid references public.payroll_time_holidays(id),
 approved_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create index payroll_time_holidays_scope_date on public.payroll_time_holidays(scope_id,date);
create table public.payroll_time_packages (
 id uuid primary key default gen_random_uuid(), scope_id uuid not null references public.payroll_access_scopes(id),
 date_from date not null,date_to date not null check(date_to>=date_from and date_to-date_from<31),
 version integer not null,source_hash text not null,source_snapshot jsonb not null,result jsonb not null,
 previous_id uuid references public.payroll_time_packages(id),
 status text not null default 'draft' check(status in('draft','submitted')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 submitted_by uuid references auth.users(id),submitted_at timestamptz,
 reason text not null check(length(btrim(reason)) between 3 and 1000),
 unique(scope_id,date_from,date_to,version),unique(scope_id,date_from,date_to,source_hash)
);
create table public.payroll_offset_cases (
 id uuid primary key default gen_random_uuid(),ot_request_id uuid not null references public.ot_requests(id),
 employee_id uuid not null references public.hris_users(id),scope_id uuid not null references public.payroll_access_scopes(id),
 source_hash text not null,source_snapshot jsonb not null,eligible_minutes numeric not null check(eligible_minutes>=60),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 reason text not null check(length(btrim(reason)) between 3 and 1000),unique(ot_request_id,source_hash)
);
create index payroll_offset_cases_scope on public.payroll_offset_cases(scope_id,created_at);
create index payroll_offset_cases_employee on public.payroll_offset_cases(employee_id);
create table public.payroll_offset_actions (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.payroll_offset_cases(id),
 stage text not null check(stage in('hr','gm','bod')),actor_id uuid not null references auth.users(id),
 decision text not null check(decision in('approve','reject')),
 reason text not null check(length(btrim(reason)) between 3 and 1000),created_at timestamptz not null default now(),
 unique(case_id,actor_id),unique(case_id,stage,actor_id)
);
create table public.payroll_time_audit (
 id uuid primary key default gen_random_uuid(),scope_id uuid not null references public.payroll_access_scopes(id),
 actor_id uuid not null references auth.users(id),action text not null,record_id uuid not null,
 reason text not null,created_at timestamptz not null default now()
);
create index payroll_time_audit_scope on public.payroll_time_audit(scope_id,created_at);

create function private.payroll_time_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Timekeeping history is immutable. Create a linked new version.' using errcode='42501';end $$;
create function private.payroll_time_package_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or old.status<>'draft' or new.status<>'submitted'
 or (to_jsonb(new)-array['status','submitted_by','submitted_at']) is distinct from (to_jsonb(old)-array['status','submitted_by','submitted_at'])
 or new.submitted_by is null or new.submitted_at is null then
 raise exception 'Keep prior timekeeping versions unchanged.' using errcode='42501';end if;return new;
end $$;
-- Public functions are explicitly granted only after all definitions below.
do $$ declare t text;begin
 foreach t in array array['payroll_time_rules','payroll_time_holidays','payroll_time_packages','payroll_offset_cases','payroll_offset_actions','payroll_time_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 if t<>'payroll_time_packages' then execute format('create trigger immutable before update or delete on public.%I for each row execute function private.payroll_time_immutable()',t);end if;
 end loop;
end $$;
create trigger immutable before update or delete on public.payroll_time_packages for each row execute function private.payroll_time_package_guard();

create function private.payroll_time_permission(p_scope uuid,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null
 and exists(select 1 from public.payroll_access_scopes s where s.id=p_scope and s.kind='business_unit')
 and public.has_feature_permission('Timekeeping','view')
 and case p_action when 'finalize' then private.payroll_has_access('finalize_timekeeping',p_scope)
 when 'rules' then private.payroll_has_access('authorize_hr',p_scope)
 when 'view' then exists(select 1 from unnest(array['finalize_timekeeping','prepare_pr','review_endorse','authorize_hr','authorize_finance','approve_bod']) d where private.payroll_has_access(d,p_scope)) else false end
$$;
create function private.payroll_offset_role(p_auth uuid,p_role text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.hris_users h join public.user_roles ur on ur.user_id=h.id join public.roles r on r.id=ur.role_id
 where h.auth_user_id=p_auth and lower(h.status)='active' and not coalesce(h.is_duplicate,false) and ur.is_active and r.is_active and r.id=p_role)
$$;

-- Bounded, ordered source snapshot. Excludes salaries, bank data, photos and devices.
create function private.payroll_time_sources(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare bu uuid; employees uuid[];begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 then raise exception 'Select a date range of at most 31 days.';end if;
 select business_unit_id into bu from public.payroll_access_scopes where id=p_scope and kind='business_unit';
 if bu is null then raise exception 'Choose one business unit.';end if;
 select coalesce(array_agg(h.id order by h.id),'{}') into employees from public.hris_users h where h.business_unit_id=bu and not coalesce(h.is_duplicate,false)
 and (h.date_hired is null or h.date_hired::date<=p_to) and (h.end_date is null or h.end_date::date>=p_from)
 ;
 if cardinality(employees)>300 then raise exception 'This business unit exceeds the 300-person review limit.';end if;
 return jsonb_build_object('scopeId',p_scope,'dateFrom',p_from,'dateTo',p_to,
 'employees',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'name',h.full_name,'hireDate',h.date_hired,'endDate',h.end_date,'status',h.status,'employmentStatus',h.employment_status,'managerId',h.reports_to) order by h.id) from public.hris_users h where h.id=any(employees)),'[]'),
 'shifts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'employeeId',a.employee_id,'date',a.date,'templateId',a.shift_template_id,'name',t.name,'start',t.start_time,'end',t.end_time,'breakMinutes',t.break_minutes,'flexible',t.is_flexible,'businessUnitId',a.business_unit_id) order by a.date,a.id) from public.shift_assignments a left join public.shift_templates t on t.id=a.shift_template_id where a.employee_id=any(employees) and a.date between p_from-1 and p_to+1),'[]'),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'employeeId',e.employee_id,'timestamp',e.timestamp,'type',e.type,'source',e.source,'managerId',e.manager_id,'anomalies',e.anomaly_tags) order by e.timestamp,e.id) from public.time_events e where e.employee_id=any(employees) and e.timestamp >= ((p_from-1)::timestamp at time zone 'Asia/Manila') and e.timestamp<((p_to+2)::timestamp at time zone 'Asia/Manila')),'[]'),
 'leave',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'employeeId',l.employee_id,'startDate',l.start_date,'endDate',l.end_date,'startTime',l.start_time,'endTime',l.end_time,'days',l.duration_days,'status',l.status,'typeId',l.leave_type_id,'type',t.name,'paid',t.paid,'configurationRequired',l.approver_configuration_required,'approvalChain',l.approver_chain) order by l.id) from public.leave_requests l left join public.leave_types t on t.id=l.leave_type_id where l.employee_id=any(employees) and l.start_date<=p_to and l.end_date>=p_from),'[]'),
 'ot',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'employeeId',o.employee_id,'date',o.date,'start',o.start_time,'end',o.end_time,'hours',o.hours,'approvedHours',o.approved_hours,'status',o.status,'type',o.ot_type,'paidType',o.paid_ot_type,'approvedBy',o.approved_by,'directManagerId',o.direct_manager_id,'approvalRoute',o.approval_route,'configurationRequired',o.approver_configuration_required,'converted',o.is_converted) order by o.id) from public.ot_requests o where o.employee_id=any(employees) and o.date between p_from-1 and p_to+1),'[]'),
 'wfh',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'employeeId',w.employee_id,'startDate',w.date,'endDate',coalesce(w.end_date,w.date),'status',w.status,'configurationRequired',w.approver_configuration_required) order by w.id) from public.wfh_requests w where w.employee_id=any(employees) and w.date<=p_to and coalesce(w.end_date,w.date)>=p_from),'[]'),
 'holidays',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'date',h.date,'name',h.name,'kind',h.type,'source','Existing HRIS holiday') order by h.date,h.id) from public.holidays h where h.date between p_from-1 and p_to+1),'[]') ||
 coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'date',h.date,'name',h.name,'kind',h.kind,'source',h.source_ref) order by h.date,h.id) from public.payroll_time_holidays h where h.scope_id=p_scope and h.date between p_from-1 and p_to+1 and not exists(select 1 from public.payroll_time_holidays x where x.replaces_id=h.id)),'[]'),
 'rules',coalesce((select jsonb_agg(to_jsonb(r) order by r.revision desc) from public.payroll_time_rules r where r.scope_id=p_scope and r.effective_from<=p_to and r.effective_to>=p_from),'[]'),
 'leavePolicies',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.leave_policies l),'[]'));
end $$;

-- Pure interpretation: fixtures can exercise boundaries without writing source rows.
create function private.interpret_payroll_time(p_source jsonb,p_from date,p_to date) returns jsonb
language plpgsql immutable set search_path='' as $$
declare u jsonb;d date;a jsonb;e jsonb;l jsonb;o jsonb;r jsonb;cfg jsonb;shifts jsonb;events jsonb;leaves jsonb;ots jsonb;holidays jsonb;
 rows jsonb:='[]';issues jsonb;segments jsonb;pairs jsonb;breaks jsonb;ot_segments jsonb;piece jsonb;sp jsonb;bp jsonb;
 ss timestamptz;se timestamptz;ws timestamptz;we timestamptz;ts timestamptz;opened timestamptz;break_open timestamptz;meal_s timestamptz;meal_e timestamptz;
 scheduled numeric;actual numeric;break_m numeric;regular_m numeric;late_m numeric;under_m numeric;approved_ot numeric;actual_ot numeric;om numeric;
 n integer;rest boolean;full_leave boolean;holiday boolean;is_worked_lunch boolean;source_ids jsonb;holiday_segments jsonb;day_end timestamptz;
begin
 for u in select value from jsonb_array_elements(p_source->'employees') loop
 for d in select generate_series(p_from,p_to,'1 day'::interval)::date loop
 if nullif(u->>'hireDate','') is not null and (u->>'hireDate')::date>d then continue;end if;
 if nullif(u->>'endDate','') is not null and (u->>'endDate')::date<d then continue;end if;
 issues:='[]';segments:='[]';pairs:='[]';breaks:='[]';ot_segments:='[]';holiday_segments:='[]';opened:=null;break_open:=null;
 scheduled:=0;actual:=0;regular_m:=0;break_m:=0;late_m:=0;under_m:=0;approved_ot:=0;actual_ot:=0;rest:=false;full_leave:=false;is_worked_lunch:=false;
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
 if jsonb_array_length(shifts)=0 then issues:=issues||'"Schedule missing — do not mark absent"'::jsonb;end if;
 ws:=null;we:=null;
 for a in select value from jsonb_array_elements(shifts) loop
 if coalesce(cfg->'restTemplates','[]') ? (a->>'templateId') then rest:=true;continue;end if;
 if a->>'start' is null or a->>'end' is null or a->>'start'=a->>'end' or coalesce((a->>'flexible')::boolean,false) then issues:=issues||'"Shift time or flexible-shift interpretation needs review"'::jsonb;continue;end if;
 ss:=(d+(a->>'start')::time) at time zone 'Asia/Manila';se:=(d+(a->>'end')::time) at time zone 'Asia/Manila';if se<ss then se:=se+interval '1 day';end if;
 if exists(select 1 from jsonb_array_elements(segments) x where (x->>'start')::timestamptz<se and (x->>'end')::timestamptz>ss) then issues:=issues||'"Overlapping scheduled segments"'::jsonb;end if;
 segments:=segments||jsonb_build_array(jsonb_build_object('start',ss,'end',se,'shiftId',a->>'id'));
 ws:=least(ws,ss);we:=greatest(we,se);scheduled:=scheduled+extract(epoch from(se-ss))/60;
 if coalesce((a->>'breakMinutes')::numeric,-1) not in(0,60) then issues:=issues||'"Scheduled lunch duration needs review"'::jsonb;end if;
 end loop;
 if rest and jsonb_array_length(shifts)>1 then issues:=issues||'"Rest-day and work assignments conflict"'::jsonb;end if;
 if jsonb_array_length(segments)>1 and not coalesce((cfg->>'splitShiftConfirmed')::boolean,false) then issues:=issues||'"Split-shift break treatment needs review"'::jsonb;end if;
 if jsonb_array_length(segments)>1 and exists(select 1 from jsonb_array_elements(shifts) x where (x->>'breakMinutes')::integer<>0) then issues:=issues||'"Split shifts must identify the unpaid gap without deducting it twice"'::jsonb;end if;
 if jsonb_array_length(segments)=1 and not rest then
 if scheduled<480 then issues:=issues||'"Short-shift lunch treatment needs review"'::jsonb;end if;
 scheduled:=greatest(0,scheduled-60);end if;
 -- Approved request times extend the capture window, including rest-day work.
 for o in select value from jsonb_array_elements(ots) loop
 if o->>'start' is not null and o->>'end' is not null then
 ss:=(d+(o->>'start')::time) at time zone 'Asia/Manila';se:=(d+(o->>'end')::time) at time zone 'Asia/Manila';if se<ss then se:=se+interval '1 day';end if;
 ws:=least(ws,ss);we:=greatest(we,se);end if;end loop;
 ws:=coalesce(ws,d::timestamp at time zone 'Asia/Manila');we:=coalesce(we,(d+1)::timestamp at time zone 'Asia/Manila');
 select coalesce(jsonb_agg(value order by (value->>'timestamp')::timestamptz,value->>'id'),'[]') into events from jsonb_array_elements(p_source->'events') where value->>'employeeId'=u->>'id' and (value->>'timestamp')::timestamptz>=ws-interval '4 hours' and (value->>'timestamp')::timestamptz<=we+interval '8 hours';
 -- Adjacent schedules in the same capture window are ambiguous, never silently merged.
 if exists(select 1 from jsonb_array_elements(p_source->'shifts') x where x->>'employeeId'=u->>'id' and (x->>'date')::date<>d and not(coalesce(cfg->'restTemplates','[]') ? (x->>'templateId')) and x->>'start' is not null and (((x->>'date')::date+(x->>'start')::time) at time zone 'Asia/Manila') between ws-interval '4 hours' and we+interval '8 hours') then issues:=issues||'"Adjacent shifts share a punch window — review boundaries"'::jsonb;end if;
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
 if jsonb_array_length(leaves)>1 then issues:=issues||'"Overlapping leave records"'::jsonb;end if;
 if full_leave and actual>0 then issues:=issues||'"Approved leave overlaps worked time"'::jsonb;end if;
 if not rest and not full_leave and jsonb_array_length(pairs)=0 and jsonb_array_length(segments)>0 then issues:=issues||'"Punches missing — absence requires review"'::jsonb;end if;
 if exists(select 1 from jsonb_array_elements(p_source->'wfh') w where w->>'employeeId'=u->>'id' and (w->>'startDate')::date<=d and (w->>'endDate')::date>=d and w->>'status' not in('Rejected','Cancelled','Draft') and (w->>'status' not in('Approved','WFH_FOR_TIMEKEEPING') or coalesce((w->>'configurationRequired')::boolean,false))) then issues:=issues||'"WFH approval incomplete"'::jsonb;end if;
 -- Keep requested, approved and actual OT distinct, without rounding 75 to 60/90.
 for o in select value from jsonb_array_elements(ots) loop
 if o->>'status'<>'Approved' or coalesce((o->>'configurationRequired')::boolean,false) then issues:=issues||'"OT approval incomplete"'::jsonb;continue;end if;
 if o->>'start' is null or o->>'end' is null or o->>'approvedHours' is null then issues:=issues||'"Approved OT times or duration missing"'::jsonb;continue;end if;
 ss:=(d+(o->>'start')::time) at time zone 'Asia/Manila';se:=(d+(o->>'end')::time) at time zone 'Asia/Manila';if se<ss then se:=se+interval '1 day';end if;
 if extract(epoch from(se-ss))/60<60 or (o->>'approvedHours')::numeric*60<60 then issues:=issues||'"Below-one-hour OT needs policy review; retain worked time"'::jsonb;end if;
 if exists(select 1 from jsonb_array_elements(ot_segments) x where (x->>'start')::timestamptz<se and (x->>'end')::timestamptz>ss) then issues:=issues||'"Overlapping approved OT"'::jsonb;end if;
 ot_segments:=ot_segments||jsonb_build_array(jsonb_build_object('start',ss,'end',se));om:=0;
 for piece in select value from jsonb_array_elements(pairs) loop om:=om+greatest(0,extract(epoch from(least(se,(piece->>'end')::timestamptz)-greatest(ss,(piece->>'start')::timestamptz)))/60);end loop;
 for bp in select value from jsonb_array_elements(breaks) loop om:=om-greatest(0,extract(epoch from(least(se,(bp->>'end')::timestamptz)-greatest(ss,(bp->>'start')::timestamptz)))/60);end loop;
 approved_ot:=approved_ot+(o->>'approvedHours')::numeric*60;actual_ot:=actual_ot+greatest(0,om);
 if om is distinct from (o->>'approvedHours')::numeric*60 then issues:=issues||'"Actual versus approved OT duration needs reconciliation"'::jsonb;end if;
 if o->>'type'='Offset' and not(rest or holiday) then issues:=issues||'"Ordinary-day excess is not eligible for manager offset"'::jsonb;end if;
 if o->>'type'='Offset' then issues:=issues||'"Manager offset requires HR → GM → two distinct BOD approvals and balance reconciliation"'::jsonb;end if;
 for a in select value from jsonb_array_elements(shifts) loop
 if cfg->'meals' ? (a->>'templateId') then
 meal_s:=(d+(cfg->'meals'->>(a->>'templateId'))::time) at time zone 'Asia/Manila';if meal_s<ws then meal_s:=meal_s+interval '1 day';end if;meal_e:=meal_s+interval '1 hour';
 if ss=meal_s and se=meal_e and om=60 and o->>'type'='Paid' and o->>'approvedBy'=o->>'directManagerId' and o->>'directManagerId'=u->>'managerId' then is_worked_lunch:=true;end if;end if;end loop;
 end loop;
 if not full_leave and not rest and jsonb_array_length(segments)=1 and actual>0 and break_m<>60 and not(break_m=0 and is_worked_lunch) then issues:=issues||'"One unpaid movable lunch hour needs logs or direct-manager approved worked-lunch OT"'::jsonb;end if;
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
 if is_worked_lunch then regular_m:=greatest(0,regular_m-60);end if;
 if actual>regular_m+actual_ot then issues:=issues||'"Worked time outside the reviewed schedule / OT needs reconciliation"'::jsonb;end if;
 if scheduled>0 and regular_m>scheduled and not is_worked_lunch then issues:=issues||'"Worked and scheduled minutes need reconciliation"'::jsonb;end if;
 select coalesce(jsonb_agg(distinct value),'[]') into issues from jsonb_array_elements(issues);
 rows:=rows||jsonb_build_array(jsonb_build_object('employeeId',u->>'id','employeeName',u->>'name','date',d,'restDay',rest,'holiday',holiday,'approvedFullLeave',full_leave,
 'scheduledMinutes',scheduled,'actualMinutes',actual,'regularMinutes',greatest(0,regular_m),'breakMinutes',break_m,'lateMinutes',late_m,'undertimeMinutes',under_m,
 'approvedOtMinutes',approved_ot,'actualOtMinutes',actual_ot,'workedLunch',is_worked_lunch,'issues',issues,'ready',jsonb_array_length(issues)=0,
 'shiftIds',(select coalesce(jsonb_agg(x->'id'),'[]') from jsonb_array_elements(shifts) x),'eventIds',(select coalesce(jsonb_agg(x->'id'),'[]') from jsonb_array_elements(events) x),
 'leaveIds',(select coalesce(jsonb_agg(x->'id'),'[]') from jsonb_array_elements(leaves) x),'ot',ots,'holidays',holidays,'segments',holiday_segments,'ruleId',r->'id'));
 end loop;end loop;
 return jsonb_build_object('engineVersion','phase3-v1','rows',rows,'blockedDays',(select count(*) from jsonb_array_elements(rows) x where not(x->>'ready')::boolean),'totalDays',jsonb_array_length(rows));
end $$;

create function private.payroll_offset_complete(p_case uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.payroll_offset_actions where case_id=p_case and decision='reject')
 and exists(select 1 from public.payroll_offset_actions where case_id=p_case and stage='hr' and decision='approve' and private.payroll_offset_role(actor_id,'HR Manager'))
 and exists(select 1 from public.payroll_offset_actions where case_id=p_case and stage='gm' and decision='approve' and private.payroll_offset_role(actor_id,'General Manager'))
 and (select count(distinct actor_id) from public.payroll_offset_actions where case_id=p_case and stage='bod' and decision='approve' and private.payroll_offset_role(actor_id,'Board of Director'))>=2
$$;

create function private.payroll_time_review(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare src jsonb;result jsonb;row_data jsonb;o jsonb;issues jsonb;rows jsonb:='[]';cases jsonb;cfg jsonb;ok boolean;case_hash text;begin
 src:=private.payroll_time_sources(p_scope,p_from,p_to);
 if exists(select 1 from jsonb_array_elements(src->'employees') e where not public.can_access_hris_user((e->>'id')::uuid)) then raise exception 'Existing HRIS scope does not cover this whole business unit.' using errcode='42501';end if;
 result:=private.interpret_payroll_time(src,p_from,p_to);
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'requestId',c.ot_request_id,'employeeId',c.employee_id,'minutes',c.eligible_minutes,'sourceHash',c.source_hash,'complete',private.payroll_offset_complete(c.id),'actions',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.payroll_offset_actions a where a.case_id=c.id),'[]')) order by c.created_at,c.id),'[]') into cases
 from public.payroll_offset_cases c join public.ot_requests o on o.id=c.ot_request_id where c.scope_id=p_scope and o.date between p_from and p_to;
 for row_data in select value from jsonb_array_elements(result->'rows') loop
 issues:=row_data->'issues';
 if (row_data->>'date')::date>=(now() at time zone 'Asia/Manila')::date then issues:=issues||'"Workday is not complete"'::jsonb;end if;
 if exists(select 1 from jsonb_array_elements(row_data->'ot') x where x->>'type'='Offset') then
 ok:=true;select x->'config' into cfg from jsonb_array_elements(src->'rules') x where (x->>'effective_from')::date<=(row_data->>'date')::date and (x->>'effective_to')::date>=(row_data->>'date')::date order by (x->>'revision')::bigint desc limit 1;
 case_hash:=md5(private.payroll_time_sources(p_scope,(row_data->>'date')::date,(row_data->>'date')::date)::text);
 for o in select value from jsonb_array_elements(row_data->'ot') where value->>'type'='Offset' loop
 if not exists(select 1 from jsonb_array_elements(cases) c where c->>'requestId'=o->>'id' and c->>'sourceHash'=case_hash and (c->>'complete')::boolean) then ok:=false;end if;
 if not coalesce((o->>'converted')::boolean,false) or nullif(cfg->>'offsetPolicyRef','') is null then ok:=false;end if;
 end loop;
 if ok then select coalesce(jsonb_agg(value),'[]') into issues from jsonb_array_elements(issues) where value#>>'{}'<>'Manager offset requires HR → GM → two distinct BOD approvals and balance reconciliation';end if;
 end if;
 rows:=rows||jsonb_build_array(row_data||jsonb_build_object('issues',issues,'ready',jsonb_array_length(issues)=0));
 end loop;
 src:=src||jsonb_build_object('offsetCases',cases);
 result:=result||jsonb_build_object('rows',rows,'blockedDays',(select count(*) from jsonb_array_elements(rows) x where not(x->>'ready')::boolean));
 return jsonb_build_object('source',src,'sourceHash',md5(src::text),'result',result);
end $$;

create function public.get_payroll_time_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS login required.' using errcode='42501';end if;
 return jsonb_build_object('scopes',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'canView',private.payroll_time_permission(s.id,'view'),'canFinalize',private.payroll_time_permission(s.id,'finalize'),'canConfigure',private.payroll_time_permission(s.id,'rules'),'canManage',private.payroll_has_access('manage_access',s.id)) order by s.name)
 from public.payroll_access_scopes s where s.kind='business_unit' and (private.payroll_time_permission(s.id,'view') or private.payroll_has_access('manage_access',s.id))),'[]'));
end $$;
create function public.preview_payroll_time(p_scope_id uuid,p_date_from date,p_date_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare review jsonb;begin
 if not private.payroll_time_permission(p_scope_id,'view') then raise exception 'A scoped timekeeping/payroll duty and existing Timekeeping access are required.' using errcode='42501';end if;
 review:=private.payroll_time_review(p_scope_id,p_date_from,p_date_to);
 return (review-'source')||jsonb_build_object('rules',review#>'{source,rules}','templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'start',t.start_time,'end',t.end_time) order by t.name) from public.shift_templates t join public.payroll_access_scopes s on s.business_unit_id=t.business_unit_id where s.id=p_scope_id),'[]'),
 'packages',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'status',p.status,'createdAt',p.created_at,'submittedAt',p.submitted_at,'reason',p.reason,'previousId',p.previous_id,'current',p.source_hash=review->>'sourceHash','blockedDays',p.result->'blockedDays') order by p.version desc) from public.payroll_time_packages p where p.scope_id=p_scope_id and p.date_from=p_date_from and p.date_to=p_date_to),'[]'));
end $$;

create function public.save_payroll_time_rules(p_scope_id uuid,p_date_from date,p_date_to date,p_config jsonb,p_source_ref text) returns uuid
language plpgsql security definer set search_path='' as $$
declare id uuid;entry record;bu uuid;begin
 if not private.payroll_time_permission(p_scope_id,'rules') then raise exception 'Scoped HR authorization is required.' using errcode='42501';end if;
 if p_date_from is null or p_date_to is null or p_date_to<p_date_from or p_date_to-p_date_from>366 then raise exception 'Choose a policy coverage range of at most one year.';end if;
 if jsonb_typeof(p_config)<>'object' or jsonb_typeof(coalesce(p_config->'restTemplates','[]'))<>'array' or jsonb_typeof(coalesce(p_config->'meals','{}'))<>'object' then raise exception 'Invalid time-rule configuration.';end if;
 select business_unit_id into bu from public.payroll_access_scopes where id=p_scope_id;
 for entry in select value#>>'{}' key from jsonb_array_elements(coalesce(p_config->'restTemplates','[]')) loop
 if not exists(select 1 from public.shift_templates where id=entry.key::uuid and business_unit_id=bu) then raise exception 'Rest-day template belongs to another BU.';end if;end loop;
 for entry in select * from jsonb_each_text(coalesce(p_config->'meals','{}')) loop
 if not exists(select 1 from public.shift_templates where id=entry.key::uuid and business_unit_id=bu) or entry.value!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Choose a BU template and valid prescribed meal start time.';end if;end loop;
 insert into public.payroll_time_rules(scope_id,effective_from,effective_to,config,source_ref,approved_by) values(p_scope_id,p_date_from,p_date_to,
 jsonb_build_object('graceMinutes',5,'unpaidLunchMinutes',60,'minimumOtMinutes',60,'timezone','Asia/Manila','holidayCoverageConfirmed',coalesce((p_config->>'holidayCoverageConfirmed')::boolean,false),'splitShiftConfirmed',coalesce((p_config->>'splitShiftConfirmed')::boolean,false),'restTemplates',coalesce(p_config->'restTemplates','[]'),'meals',coalesce(p_config->'meals','{}'),'leavePolicyRef',p_config->>'leavePolicyRef','offsetPolicyRef',p_config->>'offsetPolicyRef'),p_source_ref,private.payroll_actor_id()) returning payroll_time_rules.id into id;
 insert into public.payroll_time_audit(scope_id,actor_id,action,record_id,reason) values(p_scope_id,private.payroll_actor_id(),'rules_recorded',id,p_source_ref);return id;
end $$;
create function public.save_payroll_time_holiday(p_scope_id uuid,p_date date,p_name text,p_kind text,p_source_ref text,p_replaces_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare id uuid;begin
 if not private.payroll_time_permission(p_scope_id,'rules') then raise exception 'Scoped HR authorization is required.' using errcode='42501';end if;
 if p_replaces_id is not null and not exists(select 1 from public.payroll_time_holidays where payroll_time_holidays.id=p_replaces_id and scope_id=p_scope_id and date=p_date and not exists(select 1 from public.payroll_time_holidays x where x.replaces_id=p_replaces_id)) then raise exception 'Select the current holiday version for this BU/date.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_scope_id::text||p_date::text,3));
 insert into public.payroll_time_holidays(scope_id,date,name,kind,source_ref,replaces_id,approved_by) values(p_scope_id,p_date,p_name,p_kind,p_source_ref,p_replaces_id,private.payroll_actor_id()) returning payroll_time_holidays.id into id;
 insert into public.payroll_time_audit(scope_id,actor_id,action,record_id,reason) values(p_scope_id,private.payroll_actor_id(),'holiday_recorded',id,p_source_ref);return id;
end $$;

create function public.save_payroll_time_package(p_scope_id uuid,p_date_from date,p_date_to date,p_source_hash text,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare review jsonb;id uuid;previous public.payroll_time_packages;begin
 if not private.payroll_time_permission(p_scope_id,'finalize') then raise exception 'Finalize and submit timekeeping duty is required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_scope_id::text,3));
 review:=private.payroll_time_review(p_scope_id,p_date_from,p_date_to);
 if p_source_hash is distinct from review->>'sourceHash' then raise exception 'Time sources changed. Refresh the review first.' using errcode='40001';end if;
 select p.id into id from public.payroll_time_packages p where p.scope_id=p_scope_id and p.date_from=p_date_from and p.date_to=p_date_to and p.source_hash=p_source_hash;if id is not null then return id;end if;
 select * into previous from public.payroll_time_packages p where p.scope_id=p_scope_id and p.date_from=p_date_from and p.date_to=p_date_to order by p.version desc limit 1;
 insert into public.payroll_time_packages(scope_id,date_from,date_to,version,source_hash,source_snapshot,result,previous_id,created_by,reason)
 values(p_scope_id,p_date_from,p_date_to,coalesce(previous.version,0)+1,p_source_hash,review->'source',review->'result',previous.id,private.payroll_actor_id(),p_reason) returning payroll_time_packages.id into id;
 insert into public.payroll_time_audit(scope_id,actor_id,action,record_id,reason) values(p_scope_id,private.payroll_actor_id(),'review_saved',id,p_reason);return id;
end $$;
create function public.submit_payroll_time_package(p_package_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.payroll_time_packages;review jsonb;begin
 select * into strict p from public.payroll_time_packages where id=p_package_id for update;
 if not private.payroll_time_permission(p.scope_id,'finalize') then raise exception 'Finalize and submit timekeeping duty is required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p.scope_id::text,3));review:=private.payroll_time_review(p.scope_id,p.date_from,p.date_to);
 if p.source_hash is distinct from review->>'sourceHash' then raise exception 'Submitted inputs changed. Save a linked new version.' using errcode='40001';end if;
 if (review#>>'{result,totalDays}')::int=0 or (review#>>'{result,blockedDays}')::int>0 or p.date_to>=(now() at time zone 'Asia/Manila')::date then raise exception 'Resolve the listed blockers and complete the period before submission.';end if;
 if exists(select 1 from public.payroll_time_packages x where x.scope_id=p.scope_id and x.status='submitted' and x.date_from<=p.date_to and x.date_to>=p.date_from and (x.date_from<>p.date_from or x.date_to<>p.date_to)) then raise exception 'This range overlaps another submitted period. Use its exact dates for a linked correction.';end if;
 if p.status='submitted' then return;end if;
 update public.payroll_time_packages set status='submitted',submitted_by=private.payroll_actor_id(),submitted_at=now() where id=p.id;
 insert into public.payroll_time_audit(scope_id,actor_id,action,record_id,reason) values(p.scope_id,private.payroll_actor_id(),'submitted_to_finance',p.id,p.reason);
end $$;
create function public.get_payroll_time_package(p_package_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.payroll_time_packages;review jsonb;begin
 select * into strict p from public.payroll_time_packages where id=p_package_id;
 if not private.payroll_time_permission(p.scope_id,'view') then raise exception 'Timekeeping package access denied.' using errcode='42501';end if;
 review:=private.payroll_time_review(p.scope_id,p.date_from,p.date_to);
 return jsonb_build_object('id',p.id,'version',p.version,'status',p.status,'result',p.result,'previousId',p.previous_id,'current',p.source_hash=review->>'sourceHash','dateFrom',p.date_from,'dateTo',p.date_to,'reason',p.reason);
end $$;

create function public.open_payroll_offset_case(p_ot_request_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.ot_requests;scope uuid;src jsonb;row_data jsonb;id uuid;begin
 select * into strict o from public.ot_requests where ot_requests.id=p_ot_request_id;
 scope:=private.payroll_employee_bu_scope(o.employee_id);
 if not private.payroll_time_permission(scope,'finalize') or not public.can_access_hris_user(o.employee_id) then raise exception 'Scoped timekeeping finalization access required.' using errcode='42501';end if;
 if o.ot_type<>'Offset' or o.status::text<>'Approved' or coalesce(o.approver_configuration_required,false) or o.approved_hours is null or o.approved_hours<1 then raise exception 'An approved offset source of at least one hour is required.';end if;
 src:=private.payroll_time_sources(scope,o.date,o.date);
 select x into row_data from jsonb_array_elements(private.interpret_payroll_time(src,o.date,o.date)->'rows') x where x->>'employeeId'=o.employee_id::text;
 if not coalesce((row_data->>'restDay')::boolean or (row_data->>'holiday')::boolean,false) or (row_data->>'actualOtMinutes')::numeric<>o.approved_hours*60
 or jsonb_array_length(row_data->'ot')<>1 or exists(select 1 from jsonb_array_elements_text(row_data->'issues') x where x<>'Manager offset requires HR → GM → two distinct BOD approvals and balance reconciliation') then raise exception 'Resolve attendance first. Only verified rest-day/holiday work qualifies; ordinary-day excess does not.';end if;
 if o.date>=(now() at time zone 'Asia/Manila')::date then raise exception 'The workday must be complete.';end if;
 insert into public.payroll_offset_cases(ot_request_id,employee_id,scope_id,source_hash,source_snapshot,eligible_minutes,created_by,reason)
 values(o.id,o.employee_id,scope,md5(src::text),src,o.approved_hours*60,private.payroll_actor_id(),p_reason)
 on conflict(ot_request_id,source_hash) do nothing returning payroll_offset_cases.id into id;
 if id is null then select c.id into id from public.payroll_offset_cases c where c.ot_request_id=o.id and c.source_hash=md5(src::text);end if;return id;
end $$;
create function public.review_payroll_offset_case(p_case_id uuid,p_approve boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.payroll_offset_cases;stage text;day date;begin
 select * into strict c from public.payroll_offset_cases where id=p_case_id for update;
 if private.payroll_actor_id() is null or c.employee_id=public.current_hris_user_id() or not public.can_access_hris_user(c.employee_id) then raise exception 'Offset review denied; requesters cannot approve their own offset.' using errcode='42501';end if;
 select date into day from public.ot_requests where id=c.ot_request_id;
 if c.source_hash<>md5(private.payroll_time_sources(c.scope_id,day,day)::text) then raise exception 'Offset source changed. Create a new review version.' using errcode='40001';end if;
 if exists(select 1 from public.payroll_offset_actions where case_id=c.id and decision='reject') or private.payroll_offset_complete(c.id) then raise exception 'This offset review is already complete.';end if;
 if not exists(select 1 from public.payroll_offset_actions where case_id=c.id and stage='hr' and decision='approve' and private.payroll_offset_role(actor_id,'HR Manager')) then stage:='hr';
 elsif not exists(select 1 from public.payroll_offset_actions where case_id=c.id and stage='gm' and decision='approve' and private.payroll_offset_role(actor_id,'General Manager')) then stage:='gm';else stage:='bod';end if;
 if not private.payroll_offset_role(private.payroll_actor_id(),case stage when 'hr' then 'HR Manager' when 'gm' then 'General Manager' else 'Board of Director' end) then raise exception 'The current offset stage must be approved by %.',stage using errcode='42501';end if;
 insert into public.payroll_offset_actions(case_id,stage,actor_id,decision,reason) values(c.id,stage,private.payroll_actor_id(),case when p_approve then 'approve' else 'reject' end,p_reason);
 insert into public.payroll_time_audit(scope_id,actor_id,action,record_id,reason) values(c.scope_id,private.payroll_actor_id(),'offset_'||stage||case when p_approve then '_approved' else '_rejected' end,c.id,p_reason);
end $$;
create function public.get_my_payroll_offset_reviews() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if private.payroll_actor_id() is null then raise exception 'Active login required.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'employeeName',h.full_name,'date',o.date,'minutes',c.eligible_minutes,'complete',private.payroll_offset_complete(c.id),'current',c.source_hash=md5(private.payroll_time_sources(c.scope_id,o.date,o.date)::text),'isSelf',c.employee_id=public.current_hris_user_id(),'actions',coalesce((select jsonb_agg(jsonb_build_object('stage',a.stage,'decision',a.decision,'createdAt',a.created_at) order by a.created_at,a.id) from public.payroll_offset_actions a where a.case_id=c.id),'[]')) order by c.created_at desc)
 from public.payroll_offset_cases c join public.hris_users h on h.id=c.employee_id join public.ot_requests o on o.id=c.ot_request_id
 where public.can_access_hris_user(c.employee_id) and (c.employee_id=public.current_hris_user_id() or private.payroll_time_permission(c.scope_id,'finalize') or private.payroll_offset_role(private.payroll_actor_id(),'HR Manager') or private.payroll_offset_role(private.payroll_actor_id(),'General Manager') or private.payroll_offset_role(private.payroll_actor_id(),'Board of Director'))),'[]');
end $$;

-- RPC-only access; keep all raw source writers and their policies intact.
do $$ declare fn_record record;begin
 for fn_record in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='private' and p.proname in('payroll_time_immutable','payroll_time_package_guard','payroll_time_permission','payroll_offset_role','payroll_time_sources','interpret_payroll_time','payroll_offset_complete','payroll_time_review')) or
 (n.nspname='public' and p.proname in('get_payroll_time_context','preview_payroll_time','save_payroll_time_rules','save_payroll_time_holiday','save_payroll_time_package','submit_payroll_time_package','get_payroll_time_package','open_payroll_offset_case','review_payroll_offset_case','get_my_payroll_offset_reviews')) loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated',fn_record.nspname,fn_record.proname,fn_record.args);
 if fn_record.nspname='public' then execute format('grant execute on function public.%I(%s) to authenticated',fn_record.proname,fn_record.args);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
