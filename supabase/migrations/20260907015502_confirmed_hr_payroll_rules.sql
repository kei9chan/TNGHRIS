-- Confirmed TNG rules: effective from activation; append-only evidence and snapshots.
create table public.payroll_confirmed_policy (
 id integer primary key check(id=1), effective_from date not null, activated_at timestamptz not null default clock_timestamp(),
 source_ref text not null, bank_name text not null, bank_branch text not null, bank_address text not null
);
insert into public.payroll_confirmed_policy values(1,(now() at time zone 'Asia/Manila')::date,clock_timestamp(),'HR policy confirmed by company administrator','BANCO DE ORO','S MAISON','Ground Floor, S Maison, Mall of Asia Complex, Seaside Boulevard corner Coral Way, Marina Way, Brgy. 76, Pasay City');
create table public.payroll_employee_rule_versions (
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.hris_users(id),
 effective_from date not null,effective_to date not null check(effective_to>=effective_from),
 compensation_type text not null check(compensation_type in('Monthly','Daily','Hourly')),
 workweek text not null,scheduled_days integer not null check(scheduled_days between 1 and 7),
 divisor numeric not null check(divisor>0),rank_and_file boolean not null,
 offset_eligible boolean not null default false,source_ref text not null check(length(trim(source_ref))>=3),
 created_by uuid not null references public.hris_users(id),created_at timestamptz not null default clock_timestamp(),
 check(divisor<>313 or (compensation_type='Monthly' and scheduled_days=6 and rank_and_file))
);
create index payroll_employee_rule_dates on public.payroll_employee_rule_versions(employee_id,effective_from,effective_to);
create table public.payroll_bank_day_versions (
 id uuid primary key default gen_random_uuid(),day date not null,is_banking_day boolean not null,
 source_ref text not null check(length(trim(source_ref))>=3),created_by uuid not null references public.hris_users(id),created_at timestamptz not null default clock_timestamp()
);
create table public.payroll_bank_confirmations (
 id uuid primary key default gen_random_uuid(),scope_id uuid not null references public.payroll_access_scopes(id),payday date not null,
 banking_day date not null,calendar_hash text not null,stage text not null check(stage in('hr','finance')),
 source_ref text not null check(length(trim(source_ref))>=3),created_by uuid not null references public.hris_users(id),created_at timestamptz not null default clock_timestamp()
);
create table public.payroll_time_compensation_reviews (
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.hris_users(id),work_date date not null,
 starts time not null,ends time not null,kind text not null check(kind in('worked_lunch','excess_ot')),
 source_ref text not null check(length(trim(source_ref))>=3),created_by uuid not null references public.hris_users(id),created_at timestamptz not null default clock_timestamp(),
 check(starts<>ends)
);
do $$declare t text;begin foreach t in array array['payroll_confirmed_policy','payroll_employee_rule_versions','payroll_bank_day_versions','payroll_bank_confirmations','payroll_time_compensation_reviews'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('create trigger immutable before update or delete on public.%I for each row execute function private.payroll_audit_immutable()',t);
end loop;end $$;
create function private.confirmed_policy_active(p_day date) returns boolean language sql stable security definer set search_path='' as $$
 select p_day>=effective_from from public.payroll_confirmed_policy where id=1
$$;
create function private.confirmed_employee_rule(p_employee uuid,p_day date) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(r) from public.payroll_employee_rule_versions r where employee_id=p_employee and p_day between effective_from and effective_to order by created_at desc,id desc limit 1
$$;
create function private.confirmed_banking_day(p_payday date) returns date language plpgsql stable security definer set search_path='' as $$
declare d date:=p_payday;override boolean;begin
 for n in 0..31 loop
 select is_banking_day into override from public.payroll_bank_day_versions where day=d order by created_at desc,id desc limit 1;
 if coalesce(override,extract(isodow from d) between 1 and 5 and not exists(select 1 from public.holidays h where h.date=d and lower(replace(h.type,' ','_')) not in('special_working','special_working_day','special_working_holiday'))) then return d;end if;
 d:=d-1;end loop;raise exception 'No banking day found; Finance must review the bank calendar';end $$;
create function private.confirmed_bank_hash(p_day date) returns text language sql stable security definer set search_path='' as $$
 select md5(jsonb_build_object('payday',p_day,'bankingDay',private.confirmed_banking_day(p_day),'bank',(select to_jsonb(x) from public.payroll_confirmed_policy x),'exceptions',(select jsonb_agg(to_jsonb(x) order by created_at,id) from public.payroll_bank_day_versions x where day between p_day-31 and p_day),'holidays',(select jsonb_agg(to_jsonb(x) order by date,id) from public.holidays x where date between p_day-31 and p_day))::text)
$$;
create function private.confirmed_payment_date(p_scope uuid,p_day date) returns date language plpgsql stable security definer set search_path='' as $$begin
 if not private.confirmed_policy_active(p_day) then return p_day;end if;
 if (select count(distinct stage) from public.payroll_bank_confirmations where scope_id=p_scope and payday=p_day and calendar_hash=private.confirmed_bank_hash(p_day))<>2 then raise exception 'HR and Finance must confirm the originating bank calendar and processing requirements for this payday';end if;
 return private.confirmed_banking_day(p_day);end $$;
create function public.get_confirmed_payroll_policy(p_employee uuid default null,p_scope uuid default null,p_payday date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if private.payroll_actor_id() is null or not public.is_hr_or_admin() and not public.has_active_role('Finance Staff') then raise exception 'Authorized HR or Finance access required' using errcode='42501';end if;
 if p_employee is not null and not private.payroll_package_permission(p_employee,private.payroll_employee_bu_scope(p_employee),'view') then raise exception 'Employee outside salary scope' using errcode='42501';end if;
 if p_scope is not null and not private.payroll_gross_permission(p_scope,'view') then raise exception 'Scope unavailable' using errcode='42501';end if;
 return jsonb_build_object('policy',(select to_jsonb(x) from public.payroll_confirmed_policy x),
 'employeeRules',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]') from public.payroll_employee_rule_versions x where employee_id=p_employee),
 'bankingDay',case when p_payday is not null then private.confirmed_banking_day(p_payday) end,
 'bankConfirmations',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]') from public.payroll_bank_confirmations x where scope_id=p_scope and payday=p_payday and calendar_hash=private.confirmed_bank_hash(p_payday)));end $$;
create function public.save_confirmed_employee_rule(p_employee uuid,p_rule jsonb,p_ref text) returns uuid language plpgsql security definer set search_path='' as $$declare i uuid;begin
 if private.payroll_actor_id() is null or not private.payroll_package_permission(p_employee,private.payroll_employee_bu_scope(p_employee),'approve') then raise exception 'Existing compensation approval authority required' using errcode='42501';end if;
 if (p_rule->>'offsetEligible')::boolean and not (public.has_active_role('HR Manager') or public.has_active_role('Admin')) then raise exception 'Formal HR Manager offset assessment required' using errcode='42501';end if;
 insert into public.payroll_employee_rule_versions(employee_id,effective_from,effective_to,compensation_type,workweek,scheduled_days,divisor,rank_and_file,offset_eligible,source_ref,created_by)
 values(p_employee,(p_rule->>'from')::date,(p_rule->>'to')::date,p_rule->>'compensationType',p_rule->>'workweek',(p_rule->>'scheduledDays')::int,(p_rule->>'divisor')::numeric,(p_rule->>'rankAndFile')::boolean,(p_rule->>'offsetEligible')::boolean,p_ref,public.current_hris_user_id()) returning id into i;return i;end $$;
create function public.save_confirmed_bank_day(p_day date,p_open boolean,p_ref text) returns void language plpgsql security definer set search_path='' as $$begin
 if private.payroll_actor_id() is null or not (public.has_active_role('Finance Staff') or public.has_active_role('HR Manager') or public.has_active_role('Admin')) then raise exception 'HR Manager or Finance bank-calendar authority required' using errcode='42501';end if;
 insert into public.payroll_bank_day_versions(day,is_banking_day,source_ref,created_by) values(p_day,p_open,p_ref,public.current_hris_user_id());end $$;
create function public.confirm_payroll_banking_date(p_scope uuid,p_day date,p_stage text,p_ref text) returns void language plpgsql security definer set search_path='' as $$begin
 if private.payroll_actor_id() is null or not coalesce(case p_stage when 'hr' then private.payroll_gross_permission(p_scope,'rules') when 'finance' then private.payroll_net_can_review(p_scope) else false end,false) then raise exception 'Scoped HR or Finance confirmation authority required' using errcode='42501';end if;
 insert into public.payroll_bank_confirmations(scope_id,payday,banking_day,calendar_hash,stage,source_ref,created_by) values(p_scope,p_day,private.confirmed_banking_day(p_day),private.confirmed_bank_hash(p_day),p_stage,p_ref,public.current_hris_user_id());end $$;
create function public.validate_compensable_work(p_employee uuid,p_date date,p_start time,p_end time,p_kind text,p_ref text) returns uuid language plpgsql security definer set search_path='' as $$declare i uuid;begin
 if private.payroll_actor_id() is null or p_employee=public.current_hris_user_id() or not exists(select 1 from public.hris_users h where h.id=p_employee and h.reports_to=public.current_hris_user_id()::text) then raise exception 'The employee’s direct manager must validate actual compensable work' using errcode='42501';end if;
 if p_date>(now() at time zone 'Asia/Manila')::date then raise exception 'Validate work already rendered';end if;
 insert into public.payroll_time_compensation_reviews(employee_id,work_date,starts,ends,kind,source_ref,created_by) values(p_employee,p_date,p_start,p_end,p_kind,p_ref,public.current_hris_user_id()) returning id into i;return i;end $$;
CREATE OR REPLACE FUNCTION private.payroll_gross_snapshot(p_time_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 return jsonb_build_object('engineVersion','gross-v1','scopeId',t.scope_id,'timePackageId',t.id,'timeVersion',t.version,'dateFrom',t.date_from,'dateTo',t.date_to,'time',jsonb_build_object('source',t.source_snapshot,'result',t.result),'packages',pkgs,'rules',rules,'calendar',calendar_row,'sourceFingerprints',fingerprints,'confirmedPolicy',(select to_jsonb(z) from public.payroll_confirmed_policy z),'employeeRules',(select coalesce(jsonb_agg(to_jsonb(z) order by created_at,id),'[]') from public.payroll_employee_rule_versions z where z.employee_id::text in(select x->>'id' from jsonb_array_elements(t.source_snapshot->'employees') x) and z.effective_from<=t.date_to and z.effective_to>=t.date_from));
end $function$;

CREATE OR REPLACE FUNCTION private.calculate_payroll_gross_v1(snap jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare employee_rule jsonb;emp jsonb;r jsonb;p jsonb;rule jsonb;c jsonb;part jsonb;comp jsonb;lines jsonb;all_emps jsonb:='[]';issues jsonb;all_issues jsonb:='[]';ref jsonb;premium jsonb;
 d date;days numeric:=(snap->>'dateTo')::date-(snap->>'dateFrom')::date+1;hourly numeric;qty numeric;paid numeric;grace numeric;regular_qty numeric;ot_qty numeric;raw_total numeric;rounded_total numeric;gross numeric:=0;factor numeric;rounding text;intervals jsonb;
begin
 for emp in select value from jsonb_array_elements(snap#>'{time,source,employees}') order by value->>'id' loop
 lines:='[]';issues:='[]';rounding:=null;
 for r in select value from jsonb_array_elements(snap#>'{time,result,rows}') where value->>'employeeId'=emp->>'id' order by value->>'date' loop
 d:=(r->>'date')::date;
 if not coalesce((r->>'ready')::boolean,false) then issues:=issues||jsonb_build_array(d||': Attendance is not ready.');continue;end if;
 select value into p from jsonb_array_elements(snap->'packages') where value->>'employee_id'=emp->>'id' and value->>'engagement_key'='employee' and (value->>'effective_from')::date<=d and (nullif(value->>'effective_until','') is null or (value->>'effective_until')::date>d) order by (value->>'effective_from')::date desc limit 1;
 select value into rule from jsonb_array_elements(snap->'rules') where (value->>'effective_from')::date<=d and (value->>'effective_to')::date>=d order by (value->>'revision')::bigint desc limit 1;
 if p is null or rule is null then issues:=issues||jsonb_build_array(d||': Approved dated pay package or gross-pay rule missing.');continue;end if;
 c:=rule->'config';
 if d>=(snap#>>'{confirmedPolicy,effective_from}')::date then
 select value into employee_rule from jsonb_array_elements(coalesce(snap->'employeeRules','[]')) where value->>'employee_id'=emp->>'id' and d between (value->>'effective_from')::date and (value->>'effective_to')::date order by value->>'created_at' desc,value->>'id' desc limit 1;
 if employee_rule is null or employee_rule->>'compensation_type' is distinct from p->>'rate_type' then issues:=issues||jsonb_build_array(d||': HR must confirm the employee compensation/workweek/divisor configuration');continue;end if;
 c:=c||jsonb_build_object('annualDivisor',employee_rule->>'divisor','hoursPerDay','8','monthlyMethod','earned_minutes','rounding','employee_total_half_up','rateBoundary','shift_date');
 end if;
 perform private.validate_payroll_gross_config(c);
 if rounding is not null and rounding<>c->>'rounding' then issues:=issues||jsonb_build_array('Rounding changes inside the cutoff need reconciliation.');continue;end if;rounding:=c->>'rounding';
 if coalesce(p#>>'{treatment,proration}','unreviewed') not in ('included','rule_defined') then issues:=issues||jsonb_build_array(d||': Base-pay proration treatment is unreviewed.');continue;end if;
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
 if part->>'kind'='offset' and not coalesce(d>=(snap#>>'{confirmedPolicy,effective_from}')::date,false) then lines:=lines||jsonb_build_array(private.payroll_gross_line('Offset minutes — no cash under reviewed rule',(part->>'minutes')::numeric/60,hourly,0,ref||part));continue;end if;
 premium:=c->'premiums'->(part->>'category');
 if premium is null then issues:=issues||jsonb_build_array(d||': Missing premium coverage for '||(part->>'category'));continue;end if;
 factor:=case when part->>'kind' in('ot','offset') then (premium->>'ot')::numeric else (premium->>'regular')::numeric-1 end;
 if factor<>0 then lines:=lines||jsonb_build_array(private.payroll_gross_line(case when part->>'kind' in('ot','offset') then 'Approved actual overtime' else 'Worked-day premium above base' end,(part->>'minutes')::numeric/60,hourly,factor,ref||part));end if;
 if (part->>'night')::boolean then factor:=case when part->>'kind' in('ot','offset') then (premium->>'nightOt')::numeric else (premium->>'nightRegular')::numeric end;
 lines:=lines||jsonb_build_array(private.payroll_gross_line('Night premium — additional base-hourly multiplier',(part->>'minutes')::numeric/60,hourly,factor,ref||part));end if;
 end loop;
 -- Unworked holiday entitlements need employee eligibility evidence not present in
 -- the legacy source. Never quietly treat this as zero entitlement.
 if (r->>'holiday')::boolean and (r->>'actualMinutes')::numeric=0 then issues:=issues||jsonb_build_array(d||': Unworked holiday entitlement / leave interaction requires eligibility review.');end if;
 for comp in select value from jsonb_array_elements(p->'components') loop
 if coalesce(comp->>'proration','unreviewed')='unreviewed' or (comp->>'recurrence'='recurring' and comp->>'proration'='excluded') then issues:=issues||jsonb_build_array(d||': Component proration unreviewed: '||(comp->>'name'));continue;end if;
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
end $function$;

CREATE OR REPLACE FUNCTION private.payroll_net_snapshot(p_gross_id uuid, p_depth integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g public.payroll_gross_runs;v public.payroll_net_reviews;prev public.payroll_net_runs;cursor_run public.payroll_net_runs;
 gross_view jsonb;ps jsonb;loan public.payroll_loan_ledger;loans jsonb:='[]';ids jsonb:='[]';e jsonb;h public.hris_users;used numeric;pay_date date;prior_info jsonb;n int;
begin
 if p_depth>24 then raise exception 'Payroll lineage exceeds the reviewed tax-year chain.';end if;
 select * into g from public.payroll_gross_runs where id=p_gross_id;
 gross_view:=public.get_payroll_gross_run(p_gross_id);
 if not coalesce((gross_view->>'current')::boolean,false) then raise exception 'Gross inputs are out of date. Recalculate gross pay.' using errcode='40001';end if;
 if exists(select 1 from public.payroll_gross_runs where scope_id=g.scope_id and date_from=g.date_from and date_to=g.date_to and version>g.version) then raise exception 'Use the latest gross-pay version.' using errcode='40001';end if;
 select * into v from public.payroll_net_reviews where gross_run_id=g.id order by revision desc limit 1;
 if v.id is null then raise exception 'Finance must record the contribution, tax and opening-balance review.';end if;
 pay_date:=(v.inputs->>'payDate')::date;
 if exists(select 1 from public.payroll_net_runs r where r.scope_id=g.scope_id
 and r.source_snapshot#>>'{review,contributionMonth}'=v.inputs->>'contributionMonth' and r.source_snapshot#>>'{review,cutoff}'=v.inputs->>'cutoff'
 and (r.date_from<>g.date_from or r.date_to<>g.date_to)) then raise exception 'Another cutoff already occupies this contribution-month slot. Reconcile the mapping before proceeding.';end if;
 if v.inputs->>'cutoff'='2' and nullif(v.inputs->>'previousRunId','') is null and exists(select 1 from public.payroll_net_runs r where r.scope_id=g.scope_id and r.source_snapshot#>>'{review,contributionMonth}'=v.inputs->>'contributionMonth' and r.source_snapshot#>>'{review,cutoff}'='1') then raise exception 'Link the recorded first cutoff instead of importing a second opening for this month.';end if;
 if nullif(v.inputs->>'previousRunId','') is not null then
 select * into prev from public.payroll_net_runs where id=(v.inputs->>'previousRunId')::uuid;
 if prev.id is null or prev.scope_id<>g.scope_id or prev.date_to+1<>g.date_from or (prev.source_snapshot#>>'{review,payDate}')::date>=pay_date
 or extract(year from (prev.source_snapshot#>>'{review,payDate}')::date)<>extract(year from pay_date) then raise exception 'Prior net review must be the immediately preceding cutoff in the same BU and tax year.';end if;
 if exists(select 1 from public.payroll_net_runs where scope_id=prev.scope_id and date_from=prev.date_from and date_to=prev.date_to and version>prev.version) then raise exception 'Prior net review has been replaced. Select its latest version.' using errcode='40001';end if;
 ps:=private.payroll_net_snapshot(prev.gross_run_id,p_depth+1);
 if md5(ps::text)<>prev.source_hash then raise exception 'Prior net review sources changed. Recalculate it before this cutoff.' using errcode='40001';end if;
 if (prev.source_snapshot#>>'{review,contributionMonth}'=v.inputs->>'contributionMonth') then
 if prev.source_snapshot#>>'{review,cutoff}'<>'1' or v.inputs->>'cutoff'<>'2' then raise exception 'A contribution month has exactly a first and second cutoff.';end if;
 else
 if prev.source_snapshot#>>'{review,cutoff}'<>'2' or v.inputs->>'cutoff'<>'1' or (prev.source_snapshot#>>'{review,contributionMonth}')::date+interval '1 month'<>(v.inputs->>'contributionMonth')::date then raise exception 'Review the contribution-month sequence.';end if;end if;
 prior_info:=jsonb_build_object('id',prev.id,'hash',prev.source_hash,'contributionMonth',prev.source_snapshot#>>'{review,contributionMonth}','result',prev.result);
 end if;
 for e in select value from jsonb_array_elements(g.result->'employees') loop
 select * into h from public.hris_users where id=(e->>'employeeId')::uuid;
 if not private.payroll_package_permission(h.id,g.scope_id,'view') then raise exception 'Employee outside existing salary scope.' using errcode='42501';end if;
 ids:=ids||jsonb_build_array(jsonb_build_object('employeeId',h.id,'fingerprint',md5(jsonb_build_array(h.sss_no,h.philhealth_no,h.pagibig_no,h.tin)::text)));
 if nullif(trim(h.tin),'') is null then raise exception 'Review the employee TIN in the existing HRIS record: %.',e->>'employeeName';end if;
 if exists(select 1 from jsonb_array_elements(v.inputs->'employees') i where i->>'employeeId'=h.id::text and
 ((i->>'sssCovered'='true' and nullif(trim(h.sss_no),'') is null) or (i->>'philhealthCovered'='true' and nullif(trim(h.philhealth_no),'') is null) or (i->>'pagibigCovered'='true' and nullif(trim(h.pagibig_no),'') is null))) then raise exception 'Missing statutory membership number in HRIS for %.',e->>'employeeName';end if;
 for loan in select distinct on(account_ref) * from public.payroll_loan_ledger where employee_id=h.id and as_of<=pay_date order by account_ref,as_of desc,revision desc loop
 if not private.payroll_net_can_review(loan.scope_id) and not private.payroll_gross_permission(loan.scope_id,'view') then raise exception 'Loan record outside payroll scope.' using errcode='42501';end if;
 used:=0;cursor_run:=prev;n:=0;
 while cursor_run.id is not null and (cursor_run.source_snapshot#>>'{review,payDate}')::date>=loan.as_of loop
 n:=n+1;if n>24 then raise exception 'Loan projection chain exceeds the reviewed year.';end if;
 select used+coalesce(sum((l->>'amount')::numeric),0) into used from jsonb_array_elements(cursor_run.result->'employees') x cross join lateral jsonb_array_elements(x->'loans') l where x->>'employeeId'=h.id::text and l->>'account'=loan.account_ref;
 select * into cursor_run from public.payroll_net_runs where id=nullif(cursor_run.source_snapshot#>>'{review,previousRunId}','')::uuid;
 end loop;
 if used>loan.balance then raise exception 'Loan projections exceed the reconciled balance. Review the opening date and previous cutoff.';end if;
 loans:=loans||jsonb_build_array(to_jsonb(loan)||jsonb_build_object('available',(loan.balance-used)::text));
 end loop;
 end loop;
 if v.inputs->'statutoryFingerprint' is distinct from ids then raise exception 'Statutory employee data changed since Finance review. Review again.' using errcode='40001';end if;
 return jsonb_build_object('engineVersion','net-ph-2026-v1','grossId',g.id,'grossHash',g.source_hash,'gross',g.result,'reviewId',v.id,'review',v.inputs,'reviewRef',v.source_ref,'loans',loans,'statutoryFingerprint',ids,'prior',prior_info,'confirmedPolicy',(select to_jsonb(z) from public.payroll_confirmed_policy z));
end $function$;

CREATE OR REPLACE FUNCTION private.calculate_payroll_net_v1(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare protected numeric;voluntary_budget numeric;percent numeric;confirmed boolean:=coalesce((p#>>'{review,payDate}')::date >= (p#>>'{confirmedPolicy,effective_from}')::date,false);cfg jsonb:=p->'review';emp jsonb;inp jsonb;prior jsonb;line jsonb;alloc jsonb;monthly jsonb;paid jsonb;shares jsonb;loans jsonb;deductions jsonb;
 taxable_regular numeric;taxable_supp numeric;exempt_total numeric;gross numeric;mandatory numeric;employer numeric;tax numeric;net numeric;other numeric;amount numeric;basis numeric;ratio numeric;due numeric;before numeric;take numeric;
 ytd numeric;withheld numeric;periods int;cumulative boolean;k text;item jsonb;loan jsonb;issues jsonb:='[]';outp jsonb:='[]';total_g numeric:=0;total_d numeric:=0;total_n numeric:=0;total_er numeric:=0;i int;sharelines jsonb;taxdetail jsonb;
begin
 if cfg->>'ruleset' is distinct from 'PH-2026-09-06' or (cfg->>'payDate')::date not between date '2026-01-06' and date '2026-12-31' then raise exception 'This reviewed rule set covers payments January 6–December 31, 2026 only. Review the applicable rules for other dates.';end if;
 if (cfg->>'contributionMonth')::date<>date_trunc('month',(cfg->>'payDate')::date)::date then raise exception 'Contribution month must be the explicitly reviewed payment month. Other allocation requires review.';end if;
 if cfg->>'cutoff' not in('1','2') or cfg->>'insufficientNet' not in('block','defer_authorized') then raise exception 'Confirm cutoff allocation and insufficient-net policy.';end if;
 for emp in select value from jsonb_array_elements(p#>'{gross,employees}') loop
 begin
 select value into inp from jsonb_array_elements(cfg->'employees') where value->>'employeeId'=emp->>'employeeId';
 if inp is null then raise exception 'Finance review missing.';end if;
 if confirmed then
 for item in select x from jsonb_array_elements(coalesce(p#>'{prior,result,employees}','[]')) pe cross join lateral jsonb_array_elements(coalesce(pe->'otherDeductions','[]')) x where pe->>'employeeId'=emp->>'employeeId' and coalesce((x->>'carryForward')::boolean,false) and coalesce((x->>'deferred')::numeric,0)>0 loop
 if exists(select 1 from jsonb_array_elements(coalesce(inp->'deductions','[]')) x where x->>'sourceRef'=item->>'sourceRef') then raise exception 'Prior deferred deduction is carried automatically; remove duplicate source reference';end if;
 inp:=jsonb_set(inp,'{deductions}',coalesce(inp->'deductions','[]')||jsonb_build_array(item||jsonb_build_object('amount',item->>'deferred','carriedFrom',p#>>'{prior,id}')));
 end loop;end if;
 gross:=(emp->>'gross')::numeric;taxable_regular:=0;taxable_supp:=0;exempt_total:=0;
 if jsonb_array_length(inp->'taxLines')<>jsonb_array_length(emp->'lines') then raise exception 'Review the tax treatment of every gross explanation line.';end if;
 for i in 0..jsonb_array_length(emp->'lines')-1 loop
 line:=emp->'lines'->i;alloc:=inp->'taxLines'->i;amount:=(line->>'amount')::numeric;basis:=private.payroll_net_money(alloc,'taxable',true);
 if basis<least(0,amount) or basis>greatest(0,amount) or alloc->>'kind' not in('regular','supplement') then raise exception 'Tax allocation must reconcile to gross line %.',i+1;end if;
 if basis<>amount and length(trim(coalesce(alloc->>'exemptionRef','')))<3 then raise exception 'Tax-exempt portion of line % needs the reviewed legal/source reference and benefit-limit reconciliation.',i+1;end if;
 if alloc->>'kind'='regular' then taxable_regular:=taxable_regular+basis;else taxable_supp:=taxable_supp+basis;end if;
 exempt_total:=exempt_total+amount-basis;
 end loop;
 if taxable_regular<0 or taxable_supp<0 or exempt_total<0 then raise exception 'Negative compensation allocation requires a linked correction, not a regular payroll run.';end if;
 monthly:=private.payroll_contributions_2026(inp);shares:='{}';sharelines:='[]';mandatory:=0;employer:=0;
 prior:=null;
 select value into prior from jsonb_array_elements(coalesce(p#>'{prior,result,employees}','[]')) where value->>'employeeId'=emp->>'employeeId';
 paid:=case when cfg->>'cutoff'='1' then '{}'::jsonb when p#>>'{prior,contributionMonth}'=cfg->>'contributionMonth' and prior is not null then prior->'monthlyPaid' else inp->'openingContributions' end;
 if cfg->>'cutoff'='2' and paid is null then raise exception 'Second cutoff needs the first cutoff version or reviewed imported month-to-date employee AND employer contributions.';end if;
 for k in select jsonb_object_keys(monthly) loop
 due:=(monthly->>k)::numeric;before:=case when cfg->>'cutoff'='1' then 0 else private.payroll_net_money(paid,k) end;
 ratio:=private.payroll_net_money(cfg->'allocation',case when k like 'sss%' or k like 'mpf%' or k='ecER' then 'sss' when k like 'philhealth%' then 'philhealth' else 'pagibig' end);
 if ratio not in(0,.5,1) then raise exception 'Choose first-cutoff allocation 0, 0.5 or 1 for each contribution.';end if;
 if before>due then raise exception 'Prior % exceeds the reviewed monthly due. Reconcile the earlier cutoff before proceeding.',k;end if;
 take:=case when cfg->>'cutoff'='1' then round(due*ratio,2) else due-before end;
 shares:=shares||jsonb_build_object(k,(before+take)::text);
 sharelines:=sharelines||jsonb_build_array(jsonb_build_object('label',k,'monthly',due::text,'prior',before::text,'amount',take::text));
 if k like '%EE' then mandatory:=mandatory+take;else employer:=employer+take;end if;
 end loop;
 -- Mandatory employee shares are deducted once from taxable compensation; never loans/ER shares.
 taxable_regular:=greatest(0,taxable_regular-mandatory);taxable_supp:=greatest(0,taxable_supp-greatest(0,mandatory-((gross-exempt_total)-taxable_supp)));
 ytd:=case when prior is not null then (prior#>>'{ytd,taxable}')::numeric else private.payroll_net_money(inp,'openingTaxable') end;
 withheld:=case when prior is not null then (prior#>>'{ytd,withheld}')::numeric else private.payroll_net_money(inp,'openingWithheld') end;
 periods:=case when prior is not null then (prior#>>'{ytd,periods}')::int else (inp->>'openingPeriods')::int end;
 if periods is null or periods<0 or periods>23 then raise exception 'Review the number of prior semi-monthly payroll periods (0–23).';end if;
 cumulative:=coalesce((prior#>>'{ytd,cumulative}')::boolean,false) or inp->>'cumulativeAlready'='true' or inp->>'previousEmployer'='true'
 or (taxable_supp>0 and taxable_regular<=10417) or (taxable_supp>0 and taxable_supp>=taxable_regular);
 if cumulative then tax:=round(greatest(0,private.payroll_withholding_2023((ytd+taxable_regular+taxable_supp)/(periods+1))*(periods+1)-withheld),2);
 else tax:=round(private.payroll_withholding_2023(taxable_regular,taxable_supp),2);end if;
 taxdetail:=jsonb_build_object('regular',taxable_regular::text,'supplement',taxable_supp::text,'exempt',exempt_total::text,'method',case when cumulative then 'cumulative_average' else 'regular_bracket_plus_supplement' end,'priorTaxable',ytd::text,'priorWithheld',withheld::text,'priorPeriods',periods,'amount',tax::text);
 net:=gross-mandatory-tax;other:=0;loans:='[]';deductions:='[]';
 if net<0 then raise exception 'Statutory deductions exceed gross. Reconcile the employee before calculation.';end if;
 protected:=0;voluntary_budget:=net;
 if confirmed then
 percent:=coalesce(nullif(inp->>'voluntaryPercent','')::numeric,20);
 if percent<0 or percent>100 or (percent>20 and (length(trim(coalesce(inp->>'higherDeductionAuthorization','')))<3 or length(trim(coalesce(inp->>'higherDeductionLegalBasis','')))<3)) then raise exception 'Deductions over 20 percent require written employee authorization and reviewed legal basis';end if;
 protected:=net*(1-percent/100);
 -- Court/legal deductions precede voluntary collections and need an explicit legal reference.
 for item in select value from jsonb_array_elements(coalesce(inp->'deductions','[]')) where value->>'kind'='legal' loop
 amount:=private.payroll_net_money(item,'amount');
 if length(trim(coalesce(item->>'sourceRef','')))<3 then raise exception 'Legal deduction authority required';end if;
 take:=trunc(least(amount,net,voluntary_budget),2);net:=net-take;other:=other+take;voluntary_budget:=voluntary_budget-take;
 deductions:=deductions||jsonb_build_array(item||jsonb_build_object('amount',take::text,'requested',amount::text,'deferred',(amount-take)::text));end loop;
 voluntary_budget:=greatest(0,net-protected);
 end if;
 for loan in select value from jsonb_array_elements(coalesce(p->'loans','[]')) where value->>'employee_id'=emp->>'employeeId' order by value->>'account_ref' loop
 before:=(loan->>'available')::numeric;amount:=least((loan->>'installment')::numeric,before);
 if not confirmed and amount>net and cfg->>'insufficientNet'='block' then raise exception 'Insufficient net for authorized loan %. Approved deferral policy or reconciliation required.',loan->>'account_ref';end if;
 if length(trim(coalesce(loan->>'source_ref','')))<3 then raise exception 'Loan legal basis / written authorization required';end if;
 take:=trunc(least(amount,net,voluntary_budget),2);net:=net-take;other:=other+take;voluntary_budget:=voluntary_budget-take;
 loans:=loans||jsonb_build_array(jsonb_build_object('ledgerId',loan->>'id','account',loan->>'account_ref','balance',before::text,'installment',loan->>'installment','amount',take::text,'deferred',(amount-take)::text,'projectedBalance',(before-take)::text,'sourceRef',loan->>'source_ref'));
 end loop;
 for item in select value from jsonb_array_elements(coalesce(inp->'deductions','[]')) where not confirmed or coalesce(value->>'kind','voluntary')<>'legal' loop
 amount:=private.payroll_net_money(item,'amount');
 if length(trim(coalesce(item->>'sourceRef','')))<3 or length(trim(coalesce(item->>'label','')))<1 then raise exception 'Every additional deduction needs a name and employee authorization/source reference.';end if;
 if not confirmed and amount>net and cfg->>'insufficientNet'='block' then raise exception 'Insufficient net for %. Approved deferral policy or reconciliation required.',item->>'label';end if;
 take:=trunc(least(amount,net,voluntary_budget),2);net:=net-take;other:=other+take;voluntary_budget:=voluntary_budget-take;
 deductions:=deductions||jsonb_build_array(item||jsonb_build_object('amount',take::text,'requested',amount::text,'deferred',(amount-take)::text));
 end loop;
 outp:=outp||jsonb_build_array(jsonb_build_object('employeeId',emp->>'employeeId','employeeName',emp->>'employeeName','gross',gross::text,'mandatory',mandatory::text,'tax',tax::text,'other',other::text,'deductions',(mandatory+tax+other)::text,'net',net::text,'employer',employer::text,'contributions',sharelines,'monthlyPaid',shares,'taxExplanation',taxdetail,'loans',loans,'otherDeductions',deductions,'ytd',jsonb_build_object('taxable',(ytd+taxable_regular+taxable_supp)::text,'withheld',(withheld+tax)::text,'periods',periods+1,'cumulative',cumulative)));
 total_g:=total_g+gross;total_d:=total_d+mandatory+tax+other;total_n:=total_n+net;total_er:=total_er+employer;
 exception when others then issues:=issues||jsonb_build_array(jsonb_build_object('employeeId',emp->>'employeeId','employeeName',emp->>'employeeName','message',sqlerrm));end;
 end loop;
 return jsonb_build_object('engineVersion','net-ph-2026-v1','ready',jsonb_array_length(issues)=0,'issues',issues,'employees',outp,'gross',total_g::text,'deductions',total_d::text,'net',total_n::text,'employer',total_er::text,'shadow',true);
end $function$;

CREATE OR REPLACE FUNCTION private.payroll_time_sources(p_scope uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare review_row record;adjusted_ot jsonb;src jsonb;s public.attendance_clock_sessions;events jsonb;requirements jsonb:='[]';u jsonb;d date;ex jsonb;begin
 src:=private.payroll_pre_clock_sources(p_scope,p_from,p_to);
 select coalesce(jsonb_agg(x||jsonb_build_object('type',case x->>'type' when 'ClockIn' then 'CLOCK_IN' when 'ClockOut' then 'CLOCK_OUT' when 'BreakStart' then 'START_BREAK' when 'BreakEnd' then 'END_BREAK' else x->>'type' end) order by x->>'timestamp',x->>'id'),'[]') into events
 from jsonb_array_elements(src->'events') x where not exists(select 1 from public.attendance_clock_events e where e.id::text=x->>'id');
 for s in select * from public.attendance_clock_sessions where work_date between p_from-1 and p_to+1 and employee_id::text in(select x->>'id' from jsonb_array_elements(src->'employees') x) order by employee_id,work_date loop
 events:=events||(select coalesce(jsonb_agg(x||jsonb_build_object('employeeId',s.employee_id,'source','System','clockSessionId',s.id,'clockRevision',s.revision)),'[]') from jsonb_array_elements(private.attendance_session_events(s.id)) x);end loop;
 for u in select value from jsonb_array_elements(src->'employees') loop
 for d in select generate_series(p_from,p_to,'1 day')::date loop
 ex:=private.attendance_exception((u->>'id')::uuid,d);
 requirements:=requirements||jsonb_build_array(jsonb_build_object('employeeId',u->>'id','date',d,'requiresClock',coalesce((ex->>'requires_clock')::boolean,true),'exceptionId',ex->>'id','exceptionRevision',ex->'revision'));end loop;end loop;

 adjusted_ot:=coalesce(src->'ot','[]');
 for review_row in select * from public.payroll_time_compensation_reviews v where work_date between p_from and p_to and employee_id::text in(select x->>'id' from jsonb_array_elements(src->'employees') x) order by created_at,id loop
 -- Retain original approval records but replace overlapping windows in the calculation snapshot only.
 select coalesce(jsonb_agg(x),'[]') into adjusted_ot from jsonb_array_elements(adjusted_ot) x where not(x->>'employeeId'=review_row.employee_id::text and (x->>'date')::date=review_row.work_date and x->>'type'='Paid' and (x->>'start')::time=review_row.starts);
 adjusted_ot:=adjusted_ot||jsonb_build_array(jsonb_build_object('id',review_row.id,'employeeId',review_row.employee_id,'date',review_row.work_date,'start',review_row.starts,'end',review_row.ends,'type','Paid','status','Approved','configurationRequired',false,'approvedHours',extract(epoch from(review_row.ends-review_row.starts+case when review_row.ends<review_row.starts then interval '1 day' else interval '0' end))/3600,'approvedBy',review_row.created_by,'directManagerId',review_row.created_by,'compensableReview',true,'reviewRef',review_row.source_ref));end loop;
 return src||jsonb_build_object('events',events,'clockRequirements',requirements,'ot',adjusted_ot,'confirmedPolicy',(select to_jsonb(z) from public.payroll_confirmed_policy z),'employeeRules',(select coalesce(jsonb_agg(to_jsonb(z) order by created_at,id),'[]') from public.payroll_employee_rule_versions z where z.employee_id::text in(select x->>'id' from jsonb_array_elements(src->'employees') x) and z.effective_from<=p_to and z.effective_to>=p_from));
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

alter table public.payroll_released_payslips alter column disbursement_id drop not null;
CREATE OR REPLACE FUNCTION private.payroll_finish_disbursement(p_run_id uuid, p_reference text, p_paid_on date, p_amount text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.payroll_approval_runs;state jsonb;d public.payroll_disbursements;e jsonb;l jsonb;opening public.payroll_loan_ledger;posted numeric;amount numeric;paydate date;
begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-approval:'||p_run_id::text,0));
 state:=private.payroll_approval_state(p_run_id);select * into r from public.payroll_approval_runs where id=p_run_id;
 -- A repeat is still authorized, and must describe the identical real receipt.
 if not public.check_payroll_operation('release_payroll',r.scope_id,'payment') or not private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff') or r.mode<>'live' then raise exception 'Live payroll activation and scoped Finance release authority required.' using errcode='42501';end if;
 amount:=private.payroll_net_money(jsonb_build_object('amount',p_amount),'amount');
 select * into d from public.payroll_disbursements where run_id=r.id;
 if d.id is not null then if d.reference=trim(p_reference) and d.paid_on=p_paid_on and d.amount=amount then return d.id;else raise exception 'Disbursement already recorded; do not overwrite a receipt.';end if;end if;
 if state->>'canDisburse' is distinct from 'true' then raise exception 'Complete the current independent HR / Finance / two-BOD approvals first.' using errcode='42501';end if;
 paydate:=private.confirmed_payment_date(r.scope_id,(r.source_snapshot->>'payDate')::date);
 if p_paid_on is null or p_paid_on<paydate or p_paid_on>(now() at time zone 'Asia/Manila')::date or amount<>(r.source_snapshot->>'net')::numeric then raise exception 'Record the actual full approved amount on or after its reviewed payday, never a future assumed receipt.';end if;
 if r.special_run_id is not null then raise exception 'Special-pay settlements require the Phase 8 cross-case payment reconciliation. No special-pay disbursement is enabled yet.';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-settlement:'||r.settlement_key,0));
 -- Loan locks use the existing reconciliation writer's key and are acquired in
 -- deterministic order. Postings never rewrite the immutable opening snapshot.
 for e in select value from jsonb_array_elements(r.source_snapshot->'employees') order by value->>'employeeId' loop
 for l in select value from jsonb_array_elements(coalesce(e->'loans','[]')) order by value->>'account' loop
 if (l->>'amount')::numeric<=0 then continue;end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-loan:'||(e->>'employeeId')||':'||(l->>'account'),0));
 select * into opening from public.payroll_loan_ledger where employee_id=(e->>'employeeId')::uuid and account_ref=l->>'account' order by revision desc limit 1;
 if opening.id is distinct from (l->>'ledgerId')::uuid then raise exception 'Loan opening changed. Reconcile and reapprove payroll.';end if;
 select coalesce(sum(lp.amount+coalesce((select sum(x.amount) from public.payroll_loan_posting_adjustments x where x.posting_id=lp.id),0)),0) into posted from public.payroll_loan_postings lp where lp.ledger_id=opening.id;
 if opening.balance-posted<>(l->>'balance')::numeric then raise exception 'Loan actual balance differs from the approved projection. Settle preceding payroll or reconcile before release.';end if;
 end loop;end loop;
 insert into public.payroll_disbursements(run_id,settlement_key,scope_id,reference,amount,paid_on,recorded_by)
 values(r.id,r.settlement_key,r.scope_id,trim(p_reference),amount,p_paid_on,public.current_hris_user_id()) returning * into d;
 for e in select value from jsonb_array_elements(r.source_snapshot->'employees') loop
 for l in select value from jsonb_array_elements(coalesce(e->'loans','[]')) loop
 if (l->>'amount')::numeric>0 then insert into public.payroll_loan_postings(disbursement_id,employee_id,ledger_id,account_ref,amount)
 values(d.id,(e->>'employeeId')::uuid,(l->>'ledgerId')::uuid,l->>'account',(l->>'amount')::numeric);end if;end loop;
 insert into public.payroll_released_payslips(run_id,disbursement_id,employee_id,payload)
 values(r.id,d.id,(e->>'employeeId')::uuid,jsonb_build_object('employeeName',e->>'employeeName','from',r.source_snapshot->>'from','to',r.source_snapshot->>'to','payDate',p_paid_on,
 'gross',e->>'gross','deductions',e->>'deductions','net',e->>'net','tax',e->>'tax','lines',e->'lines','contributions',e->'contributions','loans',e->'loans','otherDeductions',e->'otherDeductions','contact',r.correction_contact,'version',r.source_snapshot->>'version')) on conflict(run_id,employee_id) do nothing;
 end loop;return d.id;
end $function$;

CREATE OR REPLACE FUNCTION public.prepare_payroll_payment_attempt(p_batch_id uuid, p_employee_id uuid, p_amount text, p_reference text, p_scheduled_on date, p_reissue_of uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.payroll_payment_batches;r public.payroll_approval_runs;e jsonb;pos jsonb;a public.payroll_payment_attempts;prior public.payroll_payment_attempts;
 amount numeric;available numeric;verification uuid;begin
 perform pg_advisory_xact_lock_shared(hashtextextended('payroll-pilot-control',0));
 select * into b from public.payroll_payment_batches where id=p_batch_id;
 perform pg_advisory_xact_lock(hashtextextended('payroll-approval:'||b.run_id::text,0));r:=private.payroll_payment_authority(b.run_id,true);
 if exists(select 1 from public.payroll_payment_closures where batch_id=b.id) then raise exception 'Payment batch is closed.';end if;
 amount:=private.payroll_net_money(jsonb_build_object('amount',p_amount),'amount');
 select * into a from public.payroll_payment_attempts where scope_id=b.scope_id and reference=trim(p_reference);
 if a.id is not null then
 if a.batch_id=b.id and a.employee_id=p_employee_id and a.amount=amount and a.scheduled_on=p_scheduled_on and a.reissue_of is not distinct from p_reissue_of then return a.id;end if;
 raise exception 'Payment reference already belongs to a different attempt.';end if;
 select value into e from jsonb_array_elements(r.source_snapshot->'employees') where value->>'employeeId'=p_employee_id::text;
 if e is null or not private.payroll_package_permission(p_employee_id,r.scope_id,'view') or not public.has_sensitive_permission('bank_information','view') then
 raise exception 'Employee or bank details outside existing authorized scope.' using errcode='42501';end if;
 perform 1 from public.hris_users where id=p_employee_id for share;
 if p_scheduled_on is null or p_scheduled_on<private.confirmed_payment_date(r.scope_id,(r.source_snapshot->>'payDate')::date) then raise exception 'Schedule on or after the approved payday.';end if;
 select v.id into verification from public.payroll_payment_verifications v join public.hris_users h on h.id=v.employee_id
 where v.employee_id=p_employee_id and v.details_hash=private.payroll_bank_hash(p_employee_id)
 and nullif(trim(h.bank_account_number),'') is not null and nullif(trim(h.bank_name),'') is not null order by v.verified_at desc limit 1;
 if verification is null then raise exception 'Verify the current employee bank details in Pay Packages first.';end if;
 pos:=private.payroll_employee_payment(b.id,p_employee_id,(e->>'net')::numeric);available:=(pos->>'available')::numeric;
 if p_reissue_of is null and exists(select 1 from public.payroll_payment_attempts x where x.batch_id=b.id and x.employee_id=p_employee_id and private.payroll_attempt_state(x.id) in('failed','cancelled','returned')) then
 raise exception 'Link the failed, cancelled or returned attempt when reissuing unpaid amounts.';end if;
 if p_reissue_of is not null then
 select * into prior from public.payroll_payment_attempts where id=p_reissue_of;
 if prior.id is null or prior.batch_id<>b.id or prior.employee_id<>p_employee_id or private.payroll_attempt_state(prior.id) not in('failed','cancelled','returned') then raise exception 'Reissue must link this employee/batch failed, cancelled or returned attempt.';end if;
 select least(available,prior.amount-coalesce(sum(x.amount) filter(where private.payroll_attempt_state(x.id) in('pending','confirmed')),0)) into available from public.payroll_payment_attempts x where x.reissue_of=prior.id;
 end if;
 if amount<=0 or amount>available then raise exception 'Amount exceeds unreserved unpaid balance. Pending attempts reserve funds; confirm their outcome before retrying.';end if;
 insert into public.payroll_payment_attempts(batch_id,scope_id,employee_id,amount,reference,scheduled_on,bank_hash,verification_id,reissue_of,created_by)
 values(b.id,b.scope_id,p_employee_id,amount,trim(p_reference),p_scheduled_on,private.payroll_bank_hash(p_employee_id),verification,p_reissue_of,public.current_hris_user_id()) returning id into a.id;return a.id;
end $function$;

do $$declare s text;begin s:=pg_get_functiondef('public.complete_payroll_payment_batch(uuid,text)'::regprocedure);
 if position('greatest((r.source_snapshot->>''payDate'')::date,max(e.occurred_on))' in s)=0 then raise exception 'Unexpected payment batch definition';end if;
 execute replace(s,'greatest((r.source_snapshot->>''payDate'')::date,max(e.occurred_on))','coalesce(max(e.occurred_on),private.confirmed_payment_date(r.scope_id,(r.source_snapshot->>''payDate'')::date))');end $$;create function private.issue_approved_payroll_slips(p_run uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.payroll_approval_runs;e jsonb;begin
 select * into r from public.payroll_approval_runs where id=p_run;
 if r.mode<>'live' or (select count(*) from public.payroll_approval_actions where run_id=p_run and action='approve')<>6 or exists(select 1 from public.payroll_approval_actions where run_id=p_run and action='return') then return;end if;
 for e in select value from jsonb_array_elements(r.source_snapshot->'employees') loop
 insert into public.payroll_released_payslips(run_id,employee_id,payload) values(r.id,(e->>'employeeId')::uuid,e||jsonb_build_object('employeeName',e->>'employeeName','from',r.source_snapshot->>'from','to',r.source_snapshot->>'to','payDate',r.source_snapshot->>'payDate','contact',r.correction_contact,'version',r.source_snapshot->>'version','issuedBeforePayment',true)) on conflict(run_id,employee_id) do nothing;
 end loop;end $$;
create function private.issue_payroll_slips_after_approval() returns trigger language plpgsql security definer set search_path='' as $$begin perform private.issue_approved_payroll_slips(new.run_id);return new;end $$;
create trigger issue_approved_slips after insert on public.payroll_approval_actions for each row execute function private.issue_payroll_slips_after_approval();
create function private.confirmed_slip_visible(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select s.disbursement_id is not null or (s.payload->>'payDate')::date<=(now() at time zone 'Asia/Manila')::date
 or exists(select 1 from public.payroll_payment_batches b join public.payroll_payment_attempts a on a.batch_id=b.id where b.run_id=s.run_id and a.employee_id=s.employee_id and private.payroll_attempt_state(a.id)='confirmed')
 from public.payroll_released_payslips s where s.id=p_id
$$;
create or replace function public.get_my_payroll_payslip(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p jsonb;s public.payroll_released_payslips;b uuid;pos jsonb;status text;begin
 if not coalesce(private.confirmed_slip_visible(p_id),false) then raise exception 'Payslip not yet released' using errcode='42501';end if;
 p:=private.payroll_original_my_payslip(p_id);
 select * into s from public.payroll_released_payslips where id=p_id and employee_id=public.current_hris_user_id();
 select id into b from public.payroll_payment_batches where run_id=s.run_id;
 if b is not null then pos:=private.payroll_employee_payment(b,s.employee_id,(p->>'net')::numeric);
 status:=case when pos->>'complete'='true' then 'Paid' when exists(select 1 from public.payroll_payment_attempts a where batch_id=b and employee_id=s.employee_id and private.payroll_attempt_state(a.id) in('failed','returned')) then 'Disbursement Failed' else 'Payment Pending' end;
 else status:=case when exists(select 1 from public.payroll_disbursements where run_id=s.run_id) then 'Paid' else 'Payment Pending' end;end if;
 return p||jsonb_build_object('paymentStatus',status,'unpaid',coalesce(pos->>'unpaid',case when status='Paid' then '0' else p->>'net' end));end $$;
do $$declare s text;begin
 s:=pg_get_functiondef('private.payroll_self_service_slip(uuid,boolean)'::regprocedure);
 execute replace(s,'''payrollStatus'',''Released''','''payrollStatus'',coalesce(p->>''paymentStatus'',''Approved'')');
 s:=pg_get_functiondef('public.list_payroll_self_service_payslips()'::regprocedure);
 execute replace(s,'where employee_id=public.current_hris_user_id()','where employee_id=public.current_hris_user_id() and private.confirmed_slip_visible(s.id)');
end $$;
-- A missing payment never prevents an approved, due payslip from being issued.
do $$declare r record;begin for r in select id from public.payroll_approval_runs where mode='live' loop perform private.issue_approved_payroll_slips(r.id);end loop;end $$;
create table public.payroll_leave_ledger (
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.hris_users(id),
 leave_kind text not null check(leave_kind in('vacation','sick','offset')),amount numeric(12,3) not null,
 credit_date date not null,source text not null,event_key text not null,approved_by uuid references public.hris_users(id),
 recorded_at timestamptz not null default clock_timestamp(),unique(employee_id,leave_kind,event_key)
);
create table public.payroll_leave_sync (
 employee_id uuid primary key references public.hris_users(id),through_date date not null
);
create table public.payroll_sl_conversion_due (
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.hris_users(id),year integer not null,
 days numeric(12,3) not null,daily_rate numeric,pay_on date not null,pay_by date not null,source_date date not null,
 recorded_at timestamptz not null default clock_timestamp(),unique(employee_id,year)
);
do $$declare t text;begin foreach t in array array['payroll_leave_ledger','payroll_leave_sync','payroll_sl_conversion_due'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);
end loop;end $$;
create trigger immutable before update or delete on public.payroll_leave_ledger for each row execute function private.payroll_audit_immutable();
create trigger immutable before update or delete on public.payroll_sl_conversion_due for each row execute function private.payroll_audit_immutable();
create function private.confirmed_leave_earned(p_hire date,p_on date) returns numeric language plpgsql immutable set search_path='' as $$
declare m date;earned numeric:=0;begin
 if p_hire is null or p_on<p_hire then return 0;end if;
 if p_on>=(p_hire+interval '1 year')::date then return 5.000;end if;
 m:=date_trunc('month',p_hire)::date;
 while (m+interval '1 month'-interval '1 day')::date<=p_on loop
 earned:=earned+case when m=date_trunc('month',p_hire)::date and extract(day from p_hire)>15 then .208 else .416 end;m:=(m+interval '1 month')::date;end loop;
 return least(5.000,earned);end $$;
create function private.confirmed_leave_balance(p_employee uuid,p_kind text,p_on date) returns numeric language sql stable security definer set search_path='' as $$
 select coalesce(sum(amount),0) from public.payroll_leave_ledger where employee_id=p_employee and leave_kind=p_kind and credit_date<=p_on
$$;
create function private.confirmed_daily_rate(p_employee uuid,p_on date) returns numeric language plpgsql stable security definer set search_path='' as $$declare p public.payroll_pay_packages;r jsonb;begin
 select * into p from public.payroll_pay_packages where employee_id=p_employee and engagement_key='employee' and status='approved' and effective_from<=p_on and (effective_until is null or effective_until>p_on) order by effective_from desc,created_at desc limit 1;
 if p.rate_type='Daily' then return p.base_amount;end if;
 if p.rate_type='Hourly' then return p.base_amount*8;end if;
 r:=private.confirmed_employee_rule(p_employee,p_on);
 if p.rate_type='Monthly' and r is not null then return p.base_amount*12/(r->>'divisor')::numeric;end if;return null;end $$;
create function private.sync_confirmed_leave(p_employee uuid,p_to date) returns void language plpgsql security definer set search_path='' as $$
declare h public.hris_users;last_day date;d date;k text;delta numeric;balance numeric;credit record;remaining numeric;begin
 perform pg_advisory_xact_lock(hashtextextended('confirmed-leave:'||p_employee,0));
 select * into h from public.hris_users where id=p_employee;
 if h.id is null then return;end if;
 select through_date into last_day from public.payroll_leave_sync where employee_id=p_employee;
 if last_day is null then
 last_day:=(select effective_from from public.payroll_confirmed_policy where id=1);
 insert into public.payroll_leave_sync values(p_employee,last_day);
 insert into public.payroll_leave_ledger(employee_id,leave_kind,amount,credit_date,source,event_key)
 values(p_employee,'vacation',coalesce(h.leave_quota_vacation,0),last_day,'Preserved existing opening balance','opening'),(p_employee,'sick',coalesce(h.leave_quota_sick,0),last_day,'Preserved existing opening balance','opening'),(p_employee,'offset',coalesce(h.leave_quota_offset,0),last_day,'Preserved existing offset; HR must reconcile its expiry','opening');
 end if;
 for d in select generate_series(last_day+1,least(p_to,(now() at time zone 'Asia/Manila')::date),'1 day')::date loop
 for credit in select l.*,v.expires_on from public.payroll_leave_ledger l join lateral (select expires_on from public.payroll_offset_credit_versions v where 'offset:'||v.case_id=l.event_key order by created_at desc,id desc limit 1) v on true where l.employee_id=p_employee and l.leave_kind='offset' and l.amount>0 and v.expires_on<d and not exists(select 1 from public.payroll_leave_ledger z where z.employee_id=p_employee and z.event_key='expiry:'||l.id) order by v.expires_on,l.recorded_at loop
 remaining:=greatest(0,least(credit.amount,private.confirmed_leave_balance(p_employee,'offset',d)-coalesce((select sum(amount) from public.payroll_leave_ledger x where x.employee_id=p_employee and x.leave_kind='offset' and x.amount>0 and x.credit_date<=d and (x.recorded_at,x.id)>(credit.recorded_at,credit.id)),0)));
 insert into public.payroll_leave_ledger(employee_id,leave_kind,amount,credit_date,source,event_key) values(p_employee,'offset',-remaining,d,'Unused approved offset expired after 90 days or approved extension','expiry:'||credit.id) on conflict do nothing;
 end loop;
 if h.date_hired is not null and d>=h.date_hired and (h.end_date is null or d<=h.end_date) and h.status::text='Active' then
 if extract(month from d)=1 and extract(day from d)=1 and h.employment_status='Regular' then
 foreach k in array array['vacation','sick'] loop
 balance:=greatest(0,private.confirmed_leave_balance(p_employee,k,d-1));
 if balance>0 then
 insert into public.payroll_leave_ledger(employee_id,leave_kind,amount,credit_date,source,event_key) values(p_employee,k,-balance,d,case when k='sick' then 'Unused SL reserved for cash conversion' else 'Unused VL year-end expiration; approved exceptions use ledger adjustment' end,'year-close:'||d) on conflict do nothing;
 if k='sick' then insert into public.payroll_sl_conversion_due(employee_id,year,days,daily_rate,pay_on,pay_by,source_date)
 values(p_employee,extract(year from d)::int-1,balance,private.confirmed_daily_rate(p_employee,d-1),make_date(extract(year from d)::int,2,20),make_date(extract(year from d)::int,2,28),d-1) on conflict do nothing;end if;
 end if;end loop;end if;
 delta:=0;
 if d<(h.date_hired+interval '1 year')::date then delta:=private.confirmed_leave_earned(h.date_hired,d)-private.confirmed_leave_earned(h.date_hired,d-1);
 elsif d=(h.date_hired+interval '1 year')::date then delta:=5.000-private.confirmed_leave_earned(h.date_hired,d-1);
 end if;
 if extract(month from d)=1 and extract(day from d)=1 and d>=(h.date_hired+interval '1 year')::date and h.employment_status='Regular' then delta:=5.000;end if;
 if delta>0 then foreach k in array array['vacation','sick'] loop
 insert into public.payroll_leave_ledger(employee_id,leave_kind,amount,credit_date,source,event_key)
 values(p_employee,k,delta,d,case when d=(h.date_hired+interval '1 year')::date then 'First-anniversary entitlement reconciliation' when extract(day from d)=1 and extract(month from d)=1 then 'January annual replenishment' else 'Monthly accrual; unavailable until regularization' end,'earned:'||d) on conflict do nothing;
 end loop;end if;end if;end loop;
 update public.payroll_leave_sync set through_date=greatest(last_day,least(p_to,(now() at time zone 'Asia/Manila')::date)) where employee_id=p_employee;
end $$;
create function public.get_confirmed_leave_ledger(p_employee uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare e uuid:=coalesce(p_employee,public.current_hris_user_id());h public.hris_users;today date:=(now() at time zone 'Asia/Manila')::date;begin
 if private.payroll_actor_id() is null or not(e=public.current_hris_user_id() or (public.is_hr_or_admin() and public.can_access_hris_user(e))) then raise exception 'Leave ledger outside authorized scope' using errcode='42501';end if;
 perform private.sync_confirmed_leave(e,today);select * into h from public.hris_users where id=e;
 return jsonb_build_object('employeeId',e,'eligible',h.employment_status='Regular','accruedVacation',private.confirmed_leave_balance(e,'vacation',today),'accruedSick',private.confirmed_leave_balance(e,'sick',today),'vacation',case when h.employment_status='Regular' then private.confirmed_leave_balance(e,'vacation',today) else 0 end,'sick',case when h.employment_status='Regular' then private.confirmed_leave_balance(e,'sick',today) else 0 end,'offset',private.confirmed_leave_balance(e,'offset',today),'ledger',(select coalesce(jsonb_agg(to_jsonb(x) order by credit_date desc,recorded_at desc),'[]') from public.payroll_leave_ledger x where employee_id=e),'conversions',(select coalesce(jsonb_agg(case when e=public.current_hris_user_id() or public.has_sensitive_permission('salary_compensation','view') then to_jsonb(x) else to_jsonb(x)-'daily_rate' end order by year desc),'[]') from public.payroll_sl_conversion_due x where employee_id=e));end $$;
create function public.adjust_confirmed_leave(p_employee uuid,p_kind text,p_amount numeric,p_ref text) returns void language plpgsql security definer set search_path='' as $$begin
 if private.payroll_actor_id() is null or not public.is_hr_or_admin() or not public.can_access_hris_user(p_employee) then raise exception 'Existing leave adjustment authority required' using errcode='42501';end if;
 if length(trim(coalesce(p_ref,'')))<3 or p_amount is null or p_amount<>round(p_amount,3) then raise exception 'Three-decimal amount and approval reason required';end if;
 perform private.sync_confirmed_leave(p_employee,(now() at time zone 'Asia/Manila')::date);
 insert into public.payroll_leave_ledger(employee_id,leave_kind,amount,credit_date,source,event_key,approved_by) values(p_employee,p_kind,p_amount,(now() at time zone 'Asia/Manila')::date,p_ref,'adjustment:'||gen_random_uuid(),public.current_hris_user_id());end $$;
create function private.confirmed_leave_request_accounting() returns trigger language plpgsql security definer set search_path='' as $$
declare k text;h public.hris_users;used numeric;begin
 select case when lower(name) like '%vacation%' then 'vacation' when lower(name) like '%sick%' then 'sick' when lower(name) like '%offset%' then 'offset' end into k from public.leave_types where id=new.leave_type_id;
 if k is null then return new;end if;
 if tg_op='UPDATE' and old.status='Approved' and (new.employee_id<>old.employee_id or new.leave_type_id<>old.leave_type_id or new.duration_days<>old.duration_days or new.start_date<>old.start_date or new.end_date<>old.end_date) then raise exception 'Cancel and submit a revised leave request; approved leave history is retained';end if;
 if tg_op='UPDATE' and old.status='Cancelled' and new.status='Approved' then raise exception 'Submit a new request after cancellation to preserve leave accounting';end if;
 if new.status='Approved' and (tg_op='INSERT' or old.status is distinct from 'Approved') then
 perform private.sync_confirmed_leave(new.employee_id,(now() at time zone 'Asia/Manila')::date);
 select * into h from public.hris_users where id=new.employee_id;
 if k<>'offset' and h.employment_status is distinct from 'Regular' then raise exception 'Accrued leave becomes available upon regularization';end if;
 if new.duration_days<=0 or private.confirmed_leave_balance(new.employee_id,k,(now() at time zone 'Asia/Manila')::date)<new.duration_days then raise exception 'Insufficient available leave credits';end if;
 insert into public.payroll_leave_ledger(employee_id,leave_kind,amount,credit_date,source,event_key,approved_by) values(new.employee_id,k,-new.duration_days,(now() at time zone 'Asia/Manila')::date,'Approved leave '||new.id,'usage:'||new.id,public.current_hris_user_id()) on conflict do nothing;
 elsif tg_op='UPDATE' and old.status='Approved' and new.status='Cancelled' then
 select -sum(amount) into used from public.payroll_leave_ledger where employee_id=new.employee_id and event_key='usage:'||new.id;
 if used>0 then insert into public.payroll_leave_ledger(employee_id,leave_kind,amount,credit_date,source,event_key,approved_by) values(new.employee_id,k,used,(now() at time zone 'Asia/Manila')::date,'Approved leave cancelled '||new.id,'return:'||new.id,public.current_hris_user_id()) on conflict do nothing;end if;
 end if;return new;end $$;
create trigger confirmed_leave_accounting before insert or update on public.leave_requests for each row execute function private.confirmed_leave_request_accounting();
create function private.run_confirmed_leave_accrual() returns void language plpgsql security definer set search_path='' as $$declare h record;begin
 for h in select id from public.hris_users where status::text='Active' loop perform private.sync_confirmed_leave(h.id,(now() at time zone 'Asia/Manila')::date);end loop;end $$;
-- Preserve current balances once; future credits are ledger entries, never replacements.

select cron.schedule('tng-confirmed-leave-accrual','5 16 * * *','select private.run_confirmed_leave_accrual()');

create function public.get_confirmed_leave_directory() returns jsonb language plpgsql security definer set search_path='' as $$begin
 if private.payroll_actor_id() is null or not public.is_hr_or_admin() then raise exception 'Authorized HR access required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'full_name',h.full_name,'department',h.department,'eligible',h.employment_status='Regular','leave_quota_vacation',private.confirmed_leave_balance(h.id,'vacation',(now() at time zone 'Asia/Manila')::date),'leave_quota_sick',private.confirmed_leave_balance(h.id,'sick',(now() at time zone 'Asia/Manila')::date),'leave_quota_offset',private.confirmed_leave_balance(h.id,'offset',(now() at time zone 'Asia/Manila')::date)) order by h.full_name),'[]') from public.hris_users h where h.status::text='Active' and public.can_access_hris_user(h.id));end $$;
-- Offset credits use the existing completed approval chain, one hour for one hour.
create table public.payroll_offset_credit_versions (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.payroll_offset_cases(id),
 employee_id uuid not null references public.hris_users(id),expires_on date not null,
 source_ref text not null,approved_by uuid not null references public.hris_users(id),created_at timestamptz not null default clock_timestamp()
);
alter table public.payroll_offset_credit_versions enable row level security;
revoke all on public.payroll_offset_credit_versions from public,anon,authenticated;
create trigger immutable before update or delete on public.payroll_offset_credit_versions for each row execute function private.payroll_audit_immutable();
create function private.confirmed_offset_credit() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.payroll_offset_cases;r jsonb;d date;begin
 select * into c from public.payroll_offset_cases where id=new.case_id;
 if not private.payroll_offset_complete(c.id) then return new;end if;
 select date into d from public.ot_requests where id=c.ot_request_id;
 if not private.confirmed_policy_active(d) then return new;end if;
 r:=private.confirmed_employee_rule(c.employee_id,d);
 if not coalesce((r->>'offset_eligible')::boolean,false) then raise exception 'Individual OT-exemption assessment required';end if;
 perform private.sync_confirmed_leave(c.employee_id,(now() at time zone 'Asia/Manila')::date);
 insert into public.payroll_leave_ledger(employee_id,leave_kind,amount,credit_date,source,event_key,approved_by)
 values(c.employee_id,'offset',round(c.eligible_minutes/480,3),(now() at time zone 'Asia/Manila')::date,'Approved 1:1 offset; hours converted to 8-hour leave days','offset:'||c.id,new.actor_id) on conflict do nothing;
 if not exists(select 1 from public.payroll_offset_credit_versions where case_id=c.id) then
 insert into public.payroll_offset_credit_versions(case_id,employee_id,expires_on,source_ref,approved_by) values(c.id,c.employee_id,d+90,'90-day validity from work date',new.actor_id);end if;return new;end $$;
create trigger confirmed_offset_credit after insert on public.payroll_offset_actions for each row execute function private.confirmed_offset_credit();
create function public.extend_confirmed_offset(p_case uuid,p_until date,p_ref text) returns void language plpgsql security definer set search_path='' as $$declare c public.payroll_offset_cases;begin
 select * into strict c from public.payroll_offset_cases where id=p_case;
 if private.payroll_actor_id() is null or not(public.has_active_role('HR Manager') or public.has_active_role('Admin')) or not public.can_access_hris_user(c.employee_id) or c.employee_id=public.current_hris_user_id() then raise exception 'Independent scoped HR management approval required' using errcode='42501';end if;
 if exists(select 1 from public.payroll_leave_ledger where employee_id=c.employee_id and event_key in(select 'expiry:'||id from public.payroll_leave_ledger where employee_id=c.employee_id and event_key='offset:'||p_case)) then raise exception 'Credit already expired; record an approved ledger adjustment instead';end if;
 if length(trim(coalesce(p_ref,'')))<3 or p_until<=(select max(expires_on) from public.payroll_offset_credit_versions where case_id=p_case) then raise exception 'Later expiry and management approval reference required';end if;
 insert into public.payroll_offset_credit_versions(case_id,employee_id,expires_on,source_ref,approved_by) values(p_case,c.employee_id,p_until,p_ref,public.current_hris_user_id());end $$;

select private.run_confirmed_leave_accrual();
do $$declare f record;begin for f in select p.oid::regprocedure sig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='private' and (p.proname like 'confirmed_%' or p.proname in('sync_confirmed_leave','run_confirmed_leave_accrual','issue_approved_payroll_slips','issue_payroll_slips_after_approval'))) or (n.nspname='public' and p.proname in('get_confirmed_payroll_policy','save_confirmed_employee_rule','save_confirmed_bank_day','confirm_payroll_banking_date','validate_compensable_work','get_confirmed_leave_ledger','get_confirmed_leave_directory','adjust_confirmed_leave','extend_confirmed_offset')) loop execute format('revoke all on function %s from public,anon,authenticated',f.sig);if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.sig);end if;end loop;end $$;
notify pgrst,'reload schema';
