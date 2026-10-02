-- Approved packages are the compensation authority for the historical cutoff.
-- Built-in PH Labor Code Art. 86/87/93/94 rates fill missing company rules.
-- Monthly means paid calendar days (DOLE factor 365); explicit existing dated
-- company/employee overrides remain in force. This does not approve new salaries.
-- Sources: https://nwpc.dole.gov.ph/faqs/
-- https://cda.gov.ph/wp-content/uploads/2019/07/coopsday-DOLE-BWC-FAQs-on-Labor-Standards.pdf
create or replace function private.payroll_statutory_gross_config() returns jsonb
language sql immutable set search_path='' as $$
 select '{"monthlyMethod":"calendar_prorated","rounding":"employee_total_half_up","recurringMethod":"calendar_prorated","annualDivisor":"365","hoursPerDay":"8","nightStart":"22:00","nightEnd":"06:00","offsetCash":"excluded","gracePay":"base_only","rateBoundary":"shift_date","premiums":{"ordinary":{"regular":"1","ot":"1.25","nightRegular":"0.1","nightOt":"0.125"},"ordinary_rest":{"regular":"1.3","ot":"1.69","nightRegular":"0.13","nightOt":"0.169"},"regular":{"regular":"2","ot":"2.6","nightRegular":"0.2","nightOt":"0.26"},"regular_rest":{"regular":"2.6","ot":"3.38","nightRegular":"0.26","nightOt":"0.338"},"special_nonworking":{"regular":"1.3","ot":"1.69","nightRegular":"0.13","nightOt":"0.169"},"special_nonworking_rest":{"regular":"1.5","ot":"1.95","nightRegular":"0.15","nightOt":"0.195"},"special_working":{"regular":"1","ot":"1.25","nightRegular":"0.1","nightOt":"0.125"},"special_working_rest":{"regular":"1.3","ot":"1.69","nightRegular":"0.13","nightOt":"0.169"},"double_regular":{"regular":"3","ot":"3.9","nightRegular":"0.3","nightOt":"0.39"},"double_regular_rest":{"regular":"3.9","ot":"5.07","nightRegular":"0.39","nightOt":"0.507"}}}'::jsonb
$$;
revoke all on function private.payroll_statutory_gross_config() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.payroll_gross_snapshot_without_service_charge_phase3(p_time_id uuid)
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
 if calendar_row is null then
 select to_jsonb(c) into calendar_row from public.payroll_calendar_rules c
 where (c.scope_id is null or c.scope_id=t.scope_id) and c.effective_from<=t.date_from
 order by c.scope_id nulls last,c.effective_from desc,c.created_at desc limit 1;
 if exists(select 1 from public.payroll_calendar_rules c where (c.scope_id is null or c.scope_id=t.scope_id)
 and c.effective_from>t.date_from and c.effective_from<=t.date_to) then
 raise exception 'Calendar changes inside the cutoff require reconciliation.';end if;
 end if;
 if calendar_row is null then raise exception 'Record the approved payday calendar before calculating.';end if;
 if exists(select 1 from public.payroll_pay_settings s where s.scope_id=t.scope_id and s.effective_from>t.date_from and s.effective_from<=t.date_to) then raise exception 'Calendar changes inside the cutoff require reconciliation.';end if;
 start_expected:=null;
 for cutoff in select value from jsonb_array_elements(calendar_row->'calendar') loop
 if extract(day from t.date_from)::int=(cutoff->>'startDay')::int then
 start_expected:=t.date_from;end_expected:=(date_trunc('month',t.date_from)::date+case when (cutoff->>'startDay')::int>(cutoff->>'endDay')::int then interval '1 month' else interval '0 month' end)::date+(cutoff->>'endDay')::int-1;end if;
 end loop;
 if start_expected is null or t.date_to<>end_expected then raise exception 'Select one complete approved cutoff; partial/overlapping runs are not permitted.';end if;
 select coalesce(jsonb_agg(to_jsonb(p) order by p.employee_id,p.effective_from,p.id),'[]') into pkgs from public.payroll_pay_packages p
 where p.status='approved' and p.stream='employee_payroll' and p.effective_from<=t.date_to
 and exists(select 1 from jsonb_array_elements(review#>'{source,employees}') e where e->>'id'=p.employee_id::text);
 for emp in select value from jsonb_array_elements(review#>'{source,employees}') loop
 if not public.can_access_hris_user((emp->>'id')::uuid) or not private.payroll_package_permission((emp->>'id')::uuid,t.scope_id,'view') then raise exception 'The BU contains employees outside your existing salary scope.' using errcode='42501';end if;
 if exists(select 1 from jsonb_array_elements(pkgs) p where p->>'employee_id'=emp->>'id' and not private.payroll_package_permission((emp->>'id')::uuid,(p->>'scope_id')::uuid,'view')) then raise exception 'Pay-package group access is required.' using errcode='42501';end if;
 -- Packages themselves are snapshotted and hashed below. Profile salary edits
 -- must not invalidate an approved historical package or block calculation.
 end loop;
 -- A completed PAN later revised/withdrawn must invalidate dependent pay reviews.
 for latest in select value from jsonb_array_elements(pkgs) where value->>'source_pan_id' is not null loop
 current_pay:=private.payroll_source_pay_data((latest->>'employee_id')::uuid,(latest->>'source_pan_id')::uuid);
 if current_pay->>'hash' is distinct from latest->>'source_pan_hash' then raise exception 'Approved salary PAN changed; review its pay-package version.' using errcode='40001';end if;end loop;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.revision),'[]') into rules from public.payroll_gross_rules r where r.scope_id=t.scope_id and r.effective_from<=t.date_to and r.effective_to>=t.date_from;
 return jsonb_build_object('engineVersion','gross-v1','scopeId',t.scope_id,'timePackageId',t.id,'timeVersion',t.version,'dateFrom',t.date_from,'dateTo',t.date_to,'time',jsonb_build_object('source',t.source_snapshot,'result',t.result),'packages',pkgs,'approvedPackageDefaults',true,'rules',jsonb_build_array(jsonb_build_object('id','ph-statutory-v1','revision',0,'effective_from','2000-01-01','effective_to','9999-12-31','source_ref','PH Labor Code statutory rates; monthly-paid calendar salary','config',private.payroll_statutory_gross_config()))||rules,'calendar',calendar_row,'sourceFingerprints',fingerprints,'confirmedPolicy',(select to_jsonb(z) from public.payroll_confirmed_policy z),'employeeRules',(select coalesce(jsonb_agg(to_jsonb(z) order by created_at,id),'[]') from public.payroll_employee_rule_versions z where z.employee_id::text in(select x->>'id' from jsonb_array_elements(t.source_snapshot->'employees') x) and z.effective_from<=t.date_to and z.effective_to>=t.date_from));
end $function$
;

CREATE OR REPLACE FUNCTION private.calculate_payroll_gross_without_service_charge_phase3(snap jsonb)
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
 -- Approved package owns compensation type. Only apply a matching explicit override.
 if employee_rule is not null and employee_rule->>'compensation_type'=p->>'rate_type' then
 c:=c||jsonb_build_object('annualDivisor',employee_rule->>'divisor','hoursPerDay','8','monthlyMethod','earned_minutes','rounding','employee_total_half_up','rateBoundary','shift_date');
 end if;
 end if;
 perform private.validate_payroll_gross_config(c);
 if rounding is not null and rounding<>c->>'rounding' then issues:=issues||jsonb_build_array('Rounding changes inside the cutoff need reconciliation.');continue;end if;rounding:=c->>'rounding';
 if coalesce((snap->>'approvedPackageDefaults')::boolean,false) and coalesce(p#>>'{treatment,proration}','unreviewed')='unreviewed' then p:=p||jsonb_build_object('treatment',coalesce(p->'treatment','{}')||jsonb_build_object('proration','rule_defined'));end if;
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
 if (r->>'holiday')::boolean and (r->>'actualMinutes')::numeric=0 and not(p->>'rate_type'='Monthly' and c->>'monthlyMethod'='calendar_prorated') then issues:=issues||jsonb_build_array(d||': Unworked holiday entitlement / leave interaction requires eligibility review.');end if;
 for comp in select value from jsonb_array_elements(p->'components') loop
 if coalesce((snap->>'approvedPackageDefaults')::boolean,false) and comp->>'recurrence'='recurring' and coalesce(comp->>'proration','unreviewed')='unreviewed' then comp:=comp||jsonb_build_object('proration','rule_defined');end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.get_payroll_calculation_preflight(p_scope uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.payroll_time_packages; e jsonb; p jsonb; live jsonb; issues jsonb:='[]'; label text;
begin
 if auth.uid() is null or not private.payroll_gross_permission(p_scope,'view') then
 raise exception 'Payroll compensation access required.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>62 then raise exception 'Choose a valid cutoff of up to 63 days.';end if;
 select * into t from public.payroll_time_packages x where x.scope_id=p_scope and x.date_from=p_from and x.date_to=p_to and x.status='submitted' order by version desc limit 1;
 if t.id is null then return jsonb_build_object('issues',jsonb_build_array(jsonb_build_object('code','attendance','message','Submit attendance for this cutoff first.')));end if;
 for e in select value from jsonb_array_elements(t.source_snapshot->'employees') loop
 if not public.can_access_hris_user((e->>'id')::uuid) or not private.payroll_package_permission((e->>'id')::uuid,p_scope,'view') then raise exception 'Employee compensation access denied.' using errcode='42501';end if;
 label:=coalesce(e->>'name',e->>'id');
 if exists(select 1 from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d
 where not exists(select 1 from public.payroll_pay_packages x where x.employee_id=(e->>'id')::uuid and x.status='approved' and x.stream='employee_payroll' and x.effective_from<=d::date)) then
 issues:=issues||jsonb_build_array(jsonb_build_object('code','package','employeeName',label,'message',label||': approved pay package does not cover the whole cutoff.'));end if;
 end loop;
 return jsonb_build_object('issues',issues,'compensationSource','approved_pay_package','statutoryRules','ph-statutory-v1');
end $function$
;
revoke all on function private.payroll_gross_snapshot_without_service_charge_phase3(uuid),private.calculate_payroll_gross_without_service_charge_phase3(jsonb) from public,anon,authenticated;
revoke all on function public.get_payroll_calculation_preflight(uuid,date,date) from public,anon;
grant execute on function public.get_payroll_calculation_preflight(uuid,date,date) to authenticated;
