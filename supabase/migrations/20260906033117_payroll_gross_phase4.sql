-- Phase 4: immutable, internal gross-pay reviews. No live mode or payment writer.
set local lock_timeout='5s';
set local statement_timeout='60s';

alter table public.payroll_access_scopes drop constraint payroll_phase1_processing_off;
alter table public.payroll_access_scopes add constraint payroll_no_live_processing check(processing_mode in ('off','shadow'));

create table public.payroll_phase_progress (
 id bigint generated always as identity primary key,
 scope_id uuid not null references public.payroll_access_scopes(id),
 phase integer not null check(phase between 1 and 9),
 status text not null check(status in ('waiting','in_progress','done')),
 evidence text not null check(length(btrim(evidence)) between 3 and 1000),
 actor_id uuid not null references auth.users(id), recorded_at timestamptz not null default now()
);
create index payroll_progress_scope_idx on public.payroll_phase_progress(scope_id,phase,id desc);
create index payroll_progress_actor_idx on public.payroll_phase_progress(actor_id);
create table public.payroll_gross_rules (
 id uuid primary key default gen_random_uuid(), revision bigint generated always as identity,
 scope_id uuid not null references public.payroll_access_scopes(id),
 effective_from date not null, effective_to date not null check(effective_to>=effective_from),
 config jsonb not null, source_ref text not null check(length(btrim(source_ref)) between 3 and 1000),
 approved_by uuid not null references auth.users(id), approved_at timestamptz not null default now()
);
create index payroll_gross_rule_scope_idx on public.payroll_gross_rules(scope_id,effective_from,effective_to,revision desc);
create index payroll_gross_rule_actor_idx on public.payroll_gross_rules(approved_by);
create table public.payroll_gross_runs (
 id uuid primary key default gen_random_uuid(), scope_id uuid not null references public.payroll_access_scopes(id),
 time_package_id uuid not null references public.payroll_time_packages(id),
 date_from date not null,date_to date not null,version integer not null,
 previous_id uuid references public.payroll_gross_runs(id),source_hash text not null,
 engine_version text not null check(engine_version='gross-v1'),
 source_snapshot jsonb not null,result jsonb not null,gross_amount numeric(24,2) not null,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 reason text not null check(length(btrim(reason)) between 3 and 1000),
 unique(scope_id,date_from,date_to,version),unique(scope_id,date_from,date_to,source_hash)
);
create index payroll_gross_run_time_idx on public.payroll_gross_runs(time_package_id);
create index payroll_gross_run_previous_idx on public.payroll_gross_runs(previous_id);
create index payroll_gross_run_actor_idx on public.payroll_gross_runs(created_by);
create table public.payroll_gross_audit (
 id bigint generated always as identity primary key,scope_id uuid not null references public.payroll_access_scopes(id),
 actor_id uuid not null references auth.users(id),action text not null,record_id uuid,reason text not null,
 occurred_at timestamptz not null default now()
);
create index payroll_gross_audit_scope_idx on public.payroll_gross_audit(scope_id);
create index payroll_gross_audit_actor_idx on public.payroll_gross_audit(actor_id);
alter table public.payroll_phase_progress enable row level security;
alter table public.payroll_gross_rules enable row level security;
alter table public.payroll_gross_runs enable row level security;
alter table public.payroll_gross_audit enable row level security;
revoke all on public.payroll_phase_progress,public.payroll_gross_rules,public.payroll_gross_runs,public.payroll_gross_audit from public,anon,authenticated;
create trigger payroll_progress_immutable before update or delete on public.payroll_phase_progress for each row execute function private.payroll_audit_immutable();
create trigger payroll_gross_rules_immutable before update or delete on public.payroll_gross_rules for each row execute function private.payroll_audit_immutable();
create trigger payroll_gross_runs_immutable before update or delete on public.payroll_gross_runs for each row execute function private.payroll_audit_immutable();
create trigger payroll_gross_audit_immutable before update or delete on public.payroll_gross_audit for each row execute function private.payroll_audit_immutable();

create function private.payroll_gross_permission(p_scope uuid,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null
 and exists(select 1 from public.payroll_access_scopes where id=p_scope and kind='business_unit')
 and public.has_sensitive_permission('salary_compensation',case when p_action='rules' then 'edit' else 'view' end)
 and case p_action when 'rules' then private.payroll_has_access('authorize_hr',p_scope)
 when 'prepare' then private.payroll_has_access('prepare_pr',p_scope) and private.payroll_time_permission(p_scope,'view')
 when 'view' then private.payroll_time_permission(p_scope,'view')
 and exists(select 1 from unnest(array['prepare_pr','review_endorse','authorize_hr','authorize_finance','approve_bod']) d where private.payroll_has_access(d,p_scope)) else false end
$$;
create function public.get_payroll_phase_progress() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS account required.' using errcode='42501';end if;
 return jsonb_build_object('scopes',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'canManage',private.payroll_has_access('manage_access',s.id),'progress',
 (select coalesce(jsonb_agg(to_jsonb(p)-'actor_id'-'scope_id' order by p.phase),'[]') from (select distinct on(phase) * from public.payroll_phase_progress where scope_id=s.id order by phase,id desc) p)) order by s.name)
 from public.payroll_access_scopes s where s.kind='business_unit' and (private.payroll_has_access('manage_access',s.id) or private.payroll_time_permission(s.id,'view'))),'[]'));
end $$;
create function public.record_payroll_phase_progress(p_scope_id uuid,p_phase integer,p_status text,p_evidence text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.payroll_has_access('manage_access',p_scope_id) or not exists(select 1 from public.payroll_access_scopes where id=p_scope_id and kind='business_unit') then raise exception 'Scoped Payroll Access manager required.' using errcode='42501';end if;
 insert into public.payroll_phase_progress(scope_id,phase,status,evidence,actor_id) values(p_scope_id,p_phase,p_status,p_evidence,private.payroll_actor_id());
end $$;
create function public.set_payroll_shadow_mode(p_scope_id uuid,p_enabled boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_enabled is null or not private.payroll_has_access('manage_access',p_scope_id) then raise exception 'Scoped Payroll Access manager required.' using errcode='42501';end if;
 if p_reason is null or length(btrim(p_reason)) not between 3 and 1000 then raise exception 'Record the shadow review / stop reason.';end if;
 -- The organization is a master gate. Enabling it never enables a BU by itself.
 update public.payroll_access_scopes set processing_mode=case when p_enabled then 'shadow' else 'off' end where id=p_scope_id;
 insert into public.payroll_gross_audit(scope_id,actor_id,action,reason) values(p_scope_id,private.payroll_actor_id(),case when p_enabled then 'shadow_enabled' else 'processing_off' end,p_reason);
end $$;

create function private.validate_payroll_gross_config(c jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare k text;v jsonb;n numeric;
begin
 if jsonb_typeof(c) is distinct from 'object' or c->>'monthlyMethod' is null or c->>'monthlyMethod' not in ('calendar_prorated','earned_minutes')
 or c->>'rounding' is null or c->>'rounding' not in ('per_line_half_up','employee_total_half_up')
 or c->>'recurringMethod' is null or c->>'recurringMethod' not in ('calendar_prorated','earned_fraction')
 or c->>'offsetCash' is distinct from 'excluded' or c->>'gracePay' is distinct from 'base_only'
 or c->>'rateBoundary' is distinct from 'shift_date' then raise exception 'Review monthly/allowance proration, rounding, grace, shift-date rates and offset cash treatment.';end if;
 foreach k in array array['annualDivisor','hoursPerDay'] loop
 if c->>k is null or (c->>k)!~'^[0-9]+([.][0-9]+)?$' then raise exception 'Approved % is required.',k;end if;
 n:=(c->>k)::numeric;if n<=0 or n>366 or (k='hoursPerDay' and n>24) then raise exception 'Invalid %.',k;end if;end loop;
 if c->>'nightStart' is null or c->>'nightEnd' is null or c->>'nightStart'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or c->>'nightEnd'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or c->>'nightStart'=c->>'nightEnd' then raise exception 'Enter reviewed night-window boundaries.';end if;
 if jsonb_typeof(c->'premiums') is distinct from 'object' then raise exception 'Premium coverage is required.';end if;
 for k,v in select * from jsonb_each(c->'premiums') loop
 if k not in ('ordinary','ordinary_rest','regular','regular_rest','special_nonworking','special_nonworking_rest','special_working','special_working_rest','double_regular','double_regular_rest') then raise exception 'Unknown holiday/rest category: %',k;end if;
 foreach k in array array['regular','ot','nightRegular','nightOt'] loop
 if v->>k is null or (v->>k)!~'^[0-9]+([.][0-9]+)?$' or (v->>k)::numeric>10 then raise exception 'Invalid/missing premium multiplier %.',k;end if;end loop;
 if (v->>'regular')::numeric<1 then raise exception 'Regular total multiplier must be at least one.';end if;
 end loop;
end $$;
create function public.save_payroll_gross_rules(p_scope_id uuid,p_from date,p_to date,p_config jsonb,p_source_ref text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result_id uuid;
begin
 if not private.payroll_gross_permission(p_scope_id,'rules') then raise exception 'Scoped HR authorization and existing compensation permission required.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a rule period of at most one year.';end if;
 perform private.validate_payroll_gross_config(p_config);
 insert into public.payroll_gross_rules(scope_id,effective_from,effective_to,config,source_ref,approved_by) values(p_scope_id,p_from,p_to,p_config,p_source_ref,private.payroll_actor_id()) returning id into result_id;
 insert into public.payroll_gross_audit(scope_id,actor_id,action,record_id,reason) values(p_scope_id,private.payroll_actor_id(),'rules_recorded',result_id,p_source_ref);return result_id;
end $$;

-- Partition actual worked intervals at punches, breaks, schedules, OT, midnight
-- and night-window boundaries. No minute stepping or scheduled-as-worked assumption.
create function private.payroll_gross_intervals(src jsonb,r jsonb,c jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare e jsonb;o jsonb;s jsonb;opened timestamptz;break_start timestamptz;ts timestamptz;te timestamptz;
 pairs jsonb:='[]';breaks jsonb:='[]';ots jsonb:='[]';bounds timestamptz[]:='{}';a timestamptz;b timestamptz;mid timestamptz;d date;cat text;kind text;night boolean;out_rows jsonb:='[]';
begin
 for e in select value from jsonb_array_elements(src->'events') where r->'eventIds' ? (value->>'id') order by (value->>'timestamp')::timestamptz,value->>'id' loop
 ts:=(e->>'timestamp')::timestamptz;
 case e->>'type' when 'CLOCK_IN' then opened:=ts;when 'CLOCK_OUT' then pairs:=pairs||jsonb_build_array(jsonb_build_object('start',opened,'end',ts));opened:=null;
 when 'START_BREAK' then break_start:=ts;when 'END_BREAK' then breaks:=breaks||jsonb_build_array(jsonb_build_object('start',break_start,'end',ts));break_start:=null;else null;end case;
 bounds:=array_append(bounds,ts);end loop;
 for s in select value from jsonb_array_elements(r->'segments') loop bounds:=bounds||array[(s->>'start')::timestamptz,(s->>'end')::timestamptz];end loop;
 for o in select value from jsonb_array_elements(r->'ot') loop
 ts:=((r->>'date')::date+(o->>'start')::time) at time zone 'Asia/Manila';te:=((r->>'date')::date+(o->>'end')::time) at time zone 'Asia/Manila';if te<ts then te:=te+interval '1 day';end if;
 ots:=ots||jsonb_build_array(jsonb_build_object('start',ts,'end',te,'id',o->>'id','type',o->>'type'));bounds:=bounds||array[ts,te];end loop;
 for d in select g::date from generate_series((r->>'date')::date-1,(r->>'date')::date+2,'1 day') g loop
 bounds:=bounds||array[d::timestamp at time zone 'Asia/Manila',(d+(c->>'nightStart')::time) at time zone 'Asia/Manila',(d+(c->>'nightEnd')::time) at time zone 'Asia/Manila'];end loop;
 for a,b in select x,lead(x) over(order by x) from (select distinct unnest(bounds) x) q loop
 if b is null or b<=a then continue;end if;mid:=a+(b-a)/2;
 if not exists(select 1 from jsonb_array_elements(pairs) p where (p->>'start')::timestamptz<=mid and (p->>'end')::timestamptz>mid)
 or exists(select 1 from jsonb_array_elements(breaks) p where (p->>'start')::timestamptz<=mid and (p->>'end')::timestamptz>mid) then continue;end if;
 select value into o from jsonb_array_elements(ots) where (value->>'start')::timestamptz<=mid and (value->>'end')::timestamptz>mid limit 1;
 if o is not null then kind:=case when o->>'type'='Offset' then 'offset' else 'ot' end;
 elsif exists(select 1 from jsonb_array_elements(r->'segments') p where (p->>'start')::timestamptz<=mid and (p->>'end')::timestamptz>mid) then kind:='regular';else raise exception 'Worked interval has no reviewed schedule or OT.';end if;
 d:=(mid at time zone 'Asia/Manila')::date;
 select value->>'kind' into cat from jsonb_array_elements(src->'holidays') where (value->>'date')::date=d limit 1;
 if (select count(*) from jsonb_array_elements(src->'holidays') where (value->>'date')::date=d)>1 then raise exception 'Overlapping holiday classification needs review.';end if;
 cat:=coalesce(cat,'ordinary')||case when (r->>'restDay')::boolean then '_rest' else '' end;
 night:=case when (c->>'nightStart')::time>(c->>'nightEnd')::time then (mid at time zone 'Asia/Manila')::time>=(c->>'nightStart')::time or (mid at time zone 'Asia/Manila')::time<(c->>'nightEnd')::time
 else (mid at time zone 'Asia/Manila')::time>=(c->>'nightStart')::time and (mid at time zone 'Asia/Manila')::time<(c->>'nightEnd')::time end;
 out_rows:=out_rows||jsonb_build_array(jsonb_build_object('start',a,'end',b,'date',d,'kind',kind,'category',cat,'night',night,'minutes',extract(epoch from(b-a))/60,'otId',o->>'id'));
 end loop;return out_rows;
end $$;

create function private.payroll_gross_line(label text,quantity numeric,rate numeric,factor numeric,ref jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select ref||jsonb_build_object('label',label,'quantity',quantity::text,'rate',rate::text,'factor',factor::text,'unrounded',(quantity*rate*factor)::text,'amount',round(quantity*rate*factor,2)::text)
$$;

create function private.calculate_payroll_gross_v1(snap jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare emp jsonb;r jsonb;p jsonb;rule jsonb;c jsonb;part jsonb;comp jsonb;lines jsonb;all_emps jsonb:='[]';issues jsonb;all_issues jsonb:='[]';ref jsonb;premium jsonb;
 d date;days numeric:=(snap->>'dateTo')::date-(snap->>'dateFrom')::date+1;hourly numeric;qty numeric;paid numeric;grace numeric;regular_qty numeric;ot_qty numeric;raw_total numeric;rounded_total numeric;gross numeric:=0;factor numeric;rounding text;intervals jsonb;
begin
 for emp in select value from jsonb_array_elements(snap#>'{time,source,employees}') order by value->>'id' loop
 lines:='[]';issues:='[]';rounding:=null;
 for r in select value from jsonb_array_elements(snap#>'{time,result,rows}') where value->>'employeeId'=emp->>'id' order by value->>'date' loop
 d:=(r->>'date')::date;
 if not coalesce((r->>'ready')::boolean,false) then issues:=issues||jsonb_build_array(d||': Attendance is not ready.');continue;end if;
 select value into p from jsonb_array_elements(snap->'packages') where value->>'employee_id'=emp->>'id' and value->>'engagement_key'='employee' and (value->>'effective_from')::date<=d order by (value->>'effective_from')::date desc limit 1;
 select value into rule from jsonb_array_elements(snap->'rules') where (value->>'effective_from')::date<=d and (value->>'effective_to')::date>=d order by (value->>'revision')::bigint desc limit 1;
 if p is null or rule is null then issues:=issues||jsonb_build_array(d||': Approved dated pay package or gross-pay rule missing.');continue;end if;
 c:=rule->'config';perform private.validate_payroll_gross_config(c);
 if rounding is not null and rounding<>c->>'rounding' then issues:=issues||jsonb_build_array('Rounding changes inside the cutoff need reconciliation.');continue;end if;rounding:=c->>'rounding';
 if coalesce(p#>>'{treatment,proration}','unreviewed')='unreviewed' then issues:=issues||jsonb_build_array(d||': Base-pay proration treatment is unreviewed.');continue;end if;
 hourly:=case p->>'rate_type' when 'Monthly' then (p->>'base_amount')::numeric*12/(c->>'annualDivisor')::numeric/(c->>'hoursPerDay')::numeric when 'Daily' then (p->>'base_amount')::numeric/(c->>'hoursPerDay')::numeric when 'Hourly' then (p->>'base_amount')::numeric end;
 if hourly is null or hourly<=0 then issues:=issues||jsonb_build_array(d||': A reviewed positive rate is required.');continue;end if;
 ref:=jsonb_build_object('date',d,'packageId',p->>'id','packageSource',p->>'source_ref','ruleId',rule->>'id','ruleSource',rule->>'source_ref','rounding',rounding,'timePackageId',snap->>'timePackageId','eventIds',r->'eventIds','shiftIds',r->'shiftIds','rateType',p->>'rate_type','baseRate',p->>'base_amount','annualDivisor',c->>'annualDivisor','hoursPerDay',c->>'hoursPerDay');
 paid:=0;
 if (r->>'approvedFullLeave')::boolean and exists(select 1 from jsonb_array_elements(snap#>'{time,source,leave}') l where r->'leaveIds' ? (l->>'id') and (l->>'paid')::boolean) then paid:=(r->>'scheduledMinutes')::numeric;end if;
 intervals:=private.payroll_gross_intervals(snap#>'{time,source}',r,c);
 select coalesce(sum((x->>'minutes')::numeric) filter(where x->>'kind'='regular'),0),coalesce(sum((x->>'minutes')::numeric) filter(where x->>'kind' in ('ot','offset')),0) into regular_qty,ot_qty from jsonb_array_elements(intervals) x;
 if regular_qty is distinct from (r->>'regularMinutes')::numeric or ot_qty is distinct from (r->>'actualOtMinutes')::numeric then issues:=issues||jsonb_build_array(d||': Actual interval totals differ from submitted timekeeping.');continue;end if;
 grace:=case when not (r->>'approvedFullLeave')::boolean and not(r->>'restDay')::boolean then least(5,greatest(0,(r->>'scheduledMinutes')::numeric-regular_qty-(r->>'lateMinutes')::numeric-(r->>'undertimeMinutes')::numeric)) else 0 end;
 if p->>'rate_type'='Monthly' and c->>'monthlyMethod'='calendar_prorated' then
 lines:=lines||jsonb_build_array(private.payroll_gross_line('Calendar-prorated semi-monthly basic',1/days,(p->>'base_amount')::numeric/2,1,ref));
 qty:=case when (r->>'approvedFullLeave')::boolean and paid=0 then (r->>'scheduledMinutes')::numeric else (r->>'lateMinutes')::numeric+(r->>'undertimeMinutes')::numeric end;
 if qty>0 then lines:=lines||jsonb_build_array(private.payroll_gross_line('Reviewed unpaid minutes',qty/60,hourly,-1,ref||jsonb_build_object('leaveIds',r->'leaveIds')));end if;
 else
 lines:=lines||jsonb_build_array(private.payroll_gross_line('Regular base / approved paid leave / grace', (regular_qty+paid+grace)/60,hourly,1,ref||jsonb_build_object('paidLeaveMinutes',paid::text,'graceMinutes',grace::text,'leaveIds',r->'leaveIds')));
 end if;
 for part in select value from jsonb_array_elements(intervals) loop
 if part->>'kind'='offset' then lines:=lines||jsonb_build_array(private.payroll_gross_line('Offset minutes — no cash under reviewed rule',(part->>'minutes')::numeric/60,hourly,0,ref||part));continue;end if;
 premium:=c->'premiums'->(part->>'category');
 if premium is null then issues:=issues||jsonb_build_array(d||': Missing premium coverage for '||(part->>'category'));continue;end if;
 factor:=case when part->>'kind'='ot' then (premium->>'ot')::numeric else (premium->>'regular')::numeric-1 end;
 if factor<>0 then lines:=lines||jsonb_build_array(private.payroll_gross_line(case when part->>'kind'='ot' then 'Approved actual overtime' else 'Worked-day premium above base' end,(part->>'minutes')::numeric/60,hourly,factor,ref||part));end if;
 if (part->>'night')::boolean then factor:=case when part->>'kind'='ot' then (premium->>'nightOt')::numeric else (premium->>'nightRegular')::numeric end;
 lines:=lines||jsonb_build_array(private.payroll_gross_line('Night premium — additional base-hourly multiplier',(part->>'minutes')::numeric/60,hourly,factor,ref||part));end if;
 end loop;
 -- Unworked holiday entitlements need employee eligibility evidence not present in
 -- the legacy source. Never quietly treat this as zero entitlement.
 if (r->>'holiday')::boolean and (r->>'actualMinutes')::numeric=0 then issues:=issues||jsonb_build_array(d||': Unworked holiday entitlement / leave interaction requires eligibility review.');end if;
 for comp in select value from jsonb_array_elements(p->'components') loop
 if coalesce(comp#>>'{treatment,proration}','unreviewed')='unreviewed' then issues:=issues||jsonb_build_array(d||': Component proration unreviewed: '||(comp->>'name'));continue;end if;
 if comp->>'recurrence'='one_time' then
 if (comp->>'payableDate')::date<>d then continue;end if;qty:=1;
 else qty:=case when c->>'recurringMethod'='calendar_prorated' then 1/(2*days) else (regular_qty+paid+grace)/((c->>'hoursPerDay')::numeric*60)*(12/(c->>'annualDivisor')::numeric) end;end if;
 lines:=lines||jsonb_build_array(private.payroll_gross_line(comp->>'name',qty,(comp->>'amount')::numeric,1,ref||jsonb_build_object('component',comp)));
 end loop;
 end loop;
 select coalesce(sum((x->>'unrounded')::numeric),0),coalesce(sum((x->>'amount')::numeric),0) into raw_total,rounded_total from jsonb_array_elements(lines) x;
 if rounding='employee_total_half_up' and round(raw_total,2)<>rounded_total then lines:=lines||jsonb_build_array(private.payroll_gross_line('Employee-total rounding reconciliation',1,round(raw_total,2)-rounded_total,1,jsonb_build_object('rounding',rounding,'unroundedEmployeeTotal',raw_total::text)));rounded_total:=round(raw_total,2);end if;
 if rounded_total<0 then issues:=issues||jsonb_build_array('Negative gross requires review.');end if;
 if jsonb_array_length(issues)>0 then all_issues:=all_issues||jsonb_build_array(jsonb_build_object('employeeId',emp->>'id','employeeName',emp->>'name','issues',issues));end if;
 all_emps:=all_emps||jsonb_build_array(jsonb_build_object('employeeId',emp->>'id','employeeName',emp->>'name','lines',lines,'gross',case when jsonb_array_length(issues)=0 then to_jsonb(rounded_total::text) else 'null'::jsonb end,'issues',issues));gross:=gross+rounded_total;
 end loop;
 return jsonb_build_object('engineVersion','gross-v1','employees',all_emps,'issues',all_issues,'ready',jsonb_array_length(all_issues)=0 and jsonb_array_length(all_emps)>0,'gross',case when jsonb_array_length(all_issues)=0 and jsonb_array_length(all_emps)>0 then to_jsonb(gross::text) else 'null'::jsonb end);
end $$;
-- Build trusted inputs inside the database. Client-supplied amounts are never used.
create function private.payroll_gross_snapshot(p_time_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.payroll_time_packages;review jsonb;pkgs jsonb;rules jsonb;calendar_row jsonb;emp jsonb;current_pay jsonb;latest jsonb;fingerprints jsonb:='[]';cutoff jsonb;start_expected date;end_expected date;
begin
 select * into t from public.payroll_time_packages where id=p_time_id;
 if t.id is null or not private.payroll_gross_permission(t.scope_id,'view') then raise exception 'Scoped payroll and existing compensation/timekeeping access required.' using errcode='42501';end if;
 if t.status<>'submitted' then raise exception 'HR must submit this timekeeping version first.';end if;
 review:=private.payroll_time_review(t.scope_id,t.date_from,t.date_to);
 if review->>'sourceHash'<>t.source_hash then raise exception 'Attendance sources changed. HR must submit a new version.' using errcode='40001';end if;
 if exists(select 1 from public.payroll_time_packages x where x.scope_id=t.scope_id and x.date_from=t.date_from and x.date_to=t.date_to and x.status='submitted' and x.version>t.version) then raise exception 'Use the latest HR-submitted timekeeping version.' using errcode='40001';end if;
 select to_jsonb(s) into calendar_row from public.payroll_pay_settings s where s.scope_id=t.scope_id and s.effective_from<=t.date_from order by s.effective_from desc limit 1;
 if calendar_row is null then raise exception 'Record the approved BU payday calendar in Pay Packages.';end if;
 if exists(select 1 from public.payroll_pay_settings s where s.scope_id=t.scope_id and s.effective_from>t.date_from and s.effective_from<=t.date_to) then raise exception 'Calendar changes inside the cutoff require reconciliation.';end if;
 start_expected:=null;
 for cutoff in select value from jsonb_array_elements(calendar_row->'calendar') loop
 if extract(day from t.date_from)::int=(cutoff->>'startDay')::int then
 start_expected:=t.date_from;end_expected:=(date_trunc('month',t.date_from)::date+case when (cutoff->>'startDay')::int>(cutoff->>'endDay')::int then interval '1 month' else interval '0 month' end)::date+(cutoff->>'endDay')::int-1;end if;
 end loop;
 if start_expected is null or t.date_to<>end_expected then raise exception 'Select one complete approved cutoff; partial/overlapping runs are not permitted.';end if;
 select coalesce(jsonb_agg(to_jsonb(p) order by p.employee_id,p.effective_from,p.id),'[]') into pkgs from public.payroll_pay_packages p
 where p.status='approved' and p.stream='employee_payroll' and p.effective_from<=greatest(t.date_to,(now() at time zone 'Asia/Manila')::date)
 and exists(select 1 from jsonb_array_elements(review#>'{source,employees}') e where e->>'id'=p.employee_id::text);
 for emp in select value from jsonb_array_elements(review#>'{source,employees}') loop
 if not public.can_access_hris_user((emp->>'id')::uuid) or not private.payroll_package_permission((emp->>'id')::uuid,t.scope_id,'view') then raise exception 'The BU contains employees outside your existing salary scope.' using errcode='42501';end if;
 if exists(select 1 from jsonb_array_elements(pkgs) p where p->>'employee_id'=emp->>'id' and not private.payroll_package_permission((emp->>'id')::uuid,(p->>'scope_id')::uuid,'view')) then raise exception 'Pay-package group access is required.' using errcode='42501';end if;
 current_pay:=private.payroll_source_pay_data((emp->>'id')::uuid);
 select value into latest from jsonb_array_elements(pkgs) where value->>'employee_id'=emp->>'id' and (value->>'effective_from')::date<=(now() at time zone 'Asia/Manila')::date order by (value->>'effective_from')::date desc limit 1;
 if latest is not null and ((current_pay->>'conflict')::boolean or (latest->>'base_amount')::numeric is distinct from (current_pay->>'baseAmount')::numeric
 or latest->>'rate_type' is distinct from current_pay->>'rateType'
 or private.payroll_component_total(latest->'components','deminimis') is distinct from (current_pay->>'deminimis')::numeric
 or private.payroll_component_total(latest->'components','reimbursable') is distinct from (current_pay->>'reimbursable')::numeric) then raise exception 'Current HRIS pay differs from the latest reviewed package. Reconcile Pay Packages before calculating.';end if;
 fingerprints:=fingerprints||jsonb_build_array(jsonb_build_object('employeeId',emp->>'id','hash',private.payroll_source_hash((emp->>'id')::uuid)));
 end loop;
 -- A completed PAN later revised/withdrawn must invalidate dependent pay reviews.
 for latest in select value from jsonb_array_elements(pkgs) where value->>'source_pan_id' is not null loop
 current_pay:=private.payroll_source_pay_data((latest->>'employee_id')::uuid,(latest->>'source_pan_id')::uuid);
 if current_pay->>'hash' is distinct from latest->>'source_pan_hash' then raise exception 'Approved salary PAN changed; review its pay-package version.' using errcode='40001';end if;end loop;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.revision),'[]') into rules from public.payroll_gross_rules r where r.scope_id=t.scope_id and r.effective_from<=t.date_to and r.effective_to>=t.date_from;
 return jsonb_build_object('engineVersion','gross-v1','scopeId',t.scope_id,'timePackageId',t.id,'timeVersion',t.version,'dateFrom',t.date_from,'dateTo',t.date_to,'time',jsonb_build_object('source',t.source_snapshot,'result',t.result),'packages',pkgs,'rules',rules,'calendar',calendar_row,'sourceFingerprints',fingerprints);
end $$;

create function public.get_payroll_gross_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS account required.' using errcode='42501';end if;
 return jsonb_build_object('scopes',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'mode',s.processing_mode,'canManage',private.payroll_has_access('manage_access',s.id),'canView',private.payroll_gross_permission(s.id,'view'),'canPrepare',private.payroll_gross_permission(s.id,'prepare'),'canConfigure',private.payroll_gross_permission(s.id,'rules'),'canCalculate',public.check_payroll_operation('prepare_pr',s.id,'calculate'),
 'timePackages',case when private.payroll_gross_permission(s.id,'view') then (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'from',p.date_from,'to',p.date_to) order by p.date_from desc,p.version desc),'[]') from public.payroll_time_packages p where p.scope_id=s.id and p.status='submitted') else '[]'::jsonb end,
 'rules',case when private.payroll_gross_permission(s.id,'rules') then (select coalesce(jsonb_agg(to_jsonb(r) order by r.revision desc),'[]') from public.payroll_gross_rules r where r.scope_id=s.id) else '[]'::jsonb end)
 order by s.name) from public.payroll_access_scopes s where private.payroll_has_access('manage_access',s.id) or private.payroll_gross_permission(s.id,'view') or private.payroll_gross_permission(s.id,'rules')),'[]'));
end $$;
create function public.prepare_payroll_gross(p_time_package_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.payroll_time_packages;snap jsonb;result jsonb;hash text;result_id uuid;previous public.payroll_gross_runs;
begin
 select * into t from public.payroll_time_packages where id=p_time_package_id;
 if t.id is null or not private.payroll_gross_permission(t.scope_id,'prepare') or not public.check_payroll_operation('prepare_pr',t.scope_id,'calculate') then raise exception 'Assigned preparer, compensation access and enabled shadow scope required.' using errcode='42501';end if;
 if p_reason is null or length(btrim(p_reason)) not between 3 and 1000 then raise exception 'Record the preparation / correction reference.';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-gross:'||t.scope_id::text,0));
 snap:=private.payroll_gross_snapshot(t.id);hash:=md5(snap::text);
 select id into result_id from public.payroll_gross_runs where scope_id=t.scope_id and date_from=t.date_from and date_to=t.date_to and source_hash=hash;
 if result_id is not null then return result_id;end if;
 result:=private.calculate_payroll_gross_v1(snap);
 if not(result->>'ready')::boolean then raise exception 'Gross pay is blocked: %',result->'issues';end if;
 select * into previous from public.payroll_gross_runs where scope_id=t.scope_id and date_from=t.date_from and date_to=t.date_to order by version desc limit 1;
 insert into public.payroll_gross_runs(scope_id,time_package_id,date_from,date_to,version,previous_id,source_hash,engine_version,source_snapshot,result,gross_amount,created_by,reason)
 values(t.scope_id,t.id,t.date_from,t.date_to,coalesce(previous.version,0)+1,previous.id,hash,'gross-v1',snap,result,(result->>'gross')::numeric,private.payroll_actor_id(),p_reason) returning id into result_id;
 insert into public.payroll_gross_audit(scope_id,actor_id,action,record_id,reason) values(t.scope_id,private.payroll_actor_id(),'gross_prepared',result_id,p_reason);return result_id;
end $$;
create function public.get_payroll_gross_run(p_run_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.payroll_gross_runs;snap jsonb;current_inputs boolean:=false;stale_reason text;
begin
 select * into r from public.payroll_gross_runs where id=p_run_id;
 if r.id is null or not private.payroll_gross_permission(r.scope_id,'view') then raise exception 'Scoped payroll salary access required.' using errcode='42501';end if;
 -- Recheck every saved employee, even after an employee changes business units.
 if exists(select 1 from jsonb_array_elements(r.result->'employees') e where not private.payroll_package_permission((e->>'employeeId')::uuid,r.scope_id,'view')) then raise exception 'Saved employees are outside your current salary scope.' using errcode='42501';end if;
 begin snap:=private.payroll_gross_snapshot(r.time_package_id);current_inputs:=md5(snap::text)=r.source_hash;exception when serialization_failure or raise_exception then stale_reason:=sqlerrm;end;
 return jsonb_build_object('id',r.id,'version',r.version,'previousId',r.previous_id,'from',r.date_from,'to',r.date_to,'timePackageId',r.time_package_id,'engineVersion',r.engine_version,'sourceHash',r.source_hash,'current',current_inputs,'staleReason',stale_reason,'reason',r.reason,'result',r.result,'createdAt',r.created_at);
end $$;
create function public.list_payroll_gross_runs(p_scope_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.payroll_gross_permission(p_scope_id,'view') then raise exception 'Scoped payroll salary access required.' using errcode='42501';end if;
 -- Metadata only; details and freshness are independently checked on opening.
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'version',r.version,'from',r.date_from,'to',r.date_to,'createdAt',r.created_at) order by r.created_at desc) from public.payroll_gross_runs r where r.scope_id=p_scope_id),'[]');
end $$;

revoke all on function private.payroll_gross_permission(uuid,text),private.validate_payroll_gross_config(jsonb),private.payroll_gross_intervals(jsonb,jsonb,jsonb),private.payroll_gross_line(text,numeric,numeric,numeric,jsonb),private.calculate_payroll_gross_v1(jsonb),private.payroll_gross_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.get_payroll_phase_progress(),public.record_payroll_phase_progress(uuid,integer,text,text),public.set_payroll_shadow_mode(uuid,boolean,text),public.save_payroll_gross_rules(uuid,date,date,jsonb,text),public.get_payroll_gross_context(),public.prepare_payroll_gross(uuid,text),public.get_payroll_gross_run(uuid),public.list_payroll_gross_runs(uuid) from public,anon,authenticated;
grant execute on function public.get_payroll_phase_progress(),public.record_payroll_phase_progress(uuid,integer,text,text),public.set_payroll_shadow_mode(uuid,boolean,text),public.save_payroll_gross_rules(uuid,date,date,jsonb,text),public.get_payroll_gross_context(),public.prepare_payroll_gross(uuid,text),public.get_payroll_gross_run(uuid),public.list_payroll_gross_runs(uuid) to authenticated;
