-- Prefer the most recently approved eligible package, so approved corrections supersede older imports.
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
 select value into p from jsonb_array_elements(snap->'packages') where value->>'employee_id'=emp->>'id' and value->>'engagement_key'='employee' and (value->>'effective_from')::date<=d and (nullif(value->>'effective_until','') is null or (value->>'effective_until')::date>d) order by (value->>'approved_at')::timestamptz desc nulls last,(value->>'effective_from')::date desc,(value->>'created_at')::timestamptz desc nulls last,value->>'id' desc limit 1;
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
 begin
 intervals:=private.payroll_gross_intervals(snap#>'{time,source}',r,c);
 exception when others then issues:=issues||jsonb_build_array(private.payroll_time_rate_issue(r,sqlerrm));continue;end;
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
CREATE OR REPLACE FUNCTION private.payroll_gross_snapshot(p_time_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;t public.payroll_time_packages;
begin
 result:=private.payroll_gross_snapshot_before_pending_attendance(p_time_id);
 select * into t from public.payroll_time_packages where id=p_time_id;
 if exists(select 1 from private.payroll_attendance_import_reviews where scope_id=t.scope_id and date_from<=t.date_to and date_to>=t.date_from and status in('pending_hr_manager','pending_bod')) then
  raise exception 'Attendance fixes still await approval. Complete those decisions, then recalculate payroll.';
 end if;
 return result||jsonb_build_object('packageSelection','latest_approved_eligible_v1');
end $function$
;
create or replace function private.payroll_net_package_terms(result jsonb, packages jsonb)
returns jsonb language plpgsql immutable set search_path='' as $fn$
declare e jsonb;used jsonb;modes text[];outp jsonb:='[]';refs text;issue text;
begin
 for e in select value from jsonb_array_elements(result->'employees') loop
  select coalesce(jsonb_agg(p order by p->>'effective_from'),'[]'),
   array_agg(distinct coalesce(p#>>'{treatment,payBasis}','gross')),
   string_agg(distinct coalesce(nullif(p#>>'{treatment,arrangementRef}',''),p->>'source_ref'),' / ')
  into used,modes,refs from jsonb_array_elements(packages) p
  where exists(select 1 from jsonb_array_elements(e->'lines') l where l->>'packageId'=p->>'id');
  issue:=case when cardinality(modes)>1 then 'Approved packages change the gross/net arrangement during this cutoff. Correct the package effective dates or arrange a reviewed split calculation; Finance cannot replace the approved terms.'
    when coalesce(cardinality(modes),0)=0 then 'No approved package is linked to these earnings.'
    when modes[1] not in ('gross','net_tax','net_all') then 'The approved package contains custom terms requiring review.' else null end;
  outp:=outp||jsonb_build_array(jsonb_build_object('employeeId',e->>'employeeId','employeeName',e->>'employeeName',
   'payBasis',case when cardinality(modes)=1 then modes[1] else 'mixed' end,'arrangementRef',refs,'issue',issue,
   'cutoffTarget',case when cardinality(modes)=1 and modes[1] in ('net_tax','net_all') and not exists(select 1 from jsonb_array_elements(used) p where nullif(p#>>'{treatment,netTarget}','')::numeric is distinct from (p->>'base_amount')::numeric) then e->>'gross' else null end,
   'packages',(select coalesce(jsonb_agg(jsonb_build_object('id',p->>'id','effectiveFrom',p->>'effective_from','approvedAt',p->>'approved_at','rateType',p->>'rate_type','baseAmount',p->>'base_amount','payBasis',coalesce(p#>>'{treatment,payBasis}','gross'),'netTarget',p#>>'{treatment,netTarget}','sourceRef',p->>'source_ref')),'[]') from jsonb_array_elements(used) p),
   'taxLines',(select coalesce(jsonb_agg(jsonb_build_object('treatment',case when l ? 'component' then l#>>'{component,tax}' else p#>>'{treatment,tax}' end,'sourceRef',coalesce(l#>>'{component,documentRef}',p#>>'{treatment,taxBasisRef}'), 'isOvertime',l->>'kind'='ot') order by n),'[]')
    from jsonb_array_elements(e->'lines') with ordinality lines(l,n) left join lateral (select value p from jsonb_array_elements(packages) where value->>'id'=l->>'packageId' limit 1) pkg on true)));
 end loop;
 return outp;
end $fn$;
revoke all on function private.payroll_net_package_terms(jsonb,jsonb) from public,anon,authenticated;



-- Derive Finance metadata from the same configured period selected for this gross run.
create or replace function private.payroll_net_context(p_gross_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare g public.payroll_gross_runs;periods jsonb;cycle jsonb;prior public.payroll_net_runs;month_start date;slot int;policy text;previous_policy text;
begin
 select * into g from public.payroll_gross_runs where id=p_gross_id;
 if g.id is null or not private.payroll_gross_permission(g.scope_id,'view') then raise exception 'Scoped payroll compensation access required.' using errcode='42501';end if;
 periods:=public.get_normal_payroll_periods(g.scope_id,extract(year from g.date_to)::int)||
  public.get_normal_payroll_periods(g.scope_id,extract(year from g.date_to)::int+1);
 if (select count(*) from jsonb_array_elements(periods) x where x->>'from'=g.date_from::text and x->>'to'=g.date_to::text)<>1 then
  raise exception 'The saved cutoff does not match one configured payroll period. Check Payroll Settings.';end if;
 select value into cycle from jsonb_array_elements(periods) where value->>'from'=g.date_from::text and value->>'to'=g.date_to::text;
 month_start:=date_trunc('month',(cycle->>'releaseDate')::date)::date;
 select count(*) into slot from jsonb_array_elements(periods) x where date_trunc('month',(x->>'releaseDate')::date)::date=month_start and x->>'releaseDate'<=cycle->>'releaseDate';
 if slot not in(1,2) then raise exception 'The configured month must contain two payroll releases.';end if;
 select * into prior from public.payroll_net_runs r where r.scope_id=g.scope_id and r.date_to+1=g.date_from
  and (r.source_snapshot#>>'{review,payDate}')::date<(cycle->>'releaseDate')::date
  and extract(year from (r.source_snapshot#>>'{review,payDate}')::date)=extract(year from (cycle->>'releaseDate')::date)
  order by r.version desc limit 1;
 select r.inputs->>'insufficientNet' into previous_policy from public.payroll_net_reviews r where r.scope_id=g.scope_id and r.inputs->>'insufficientNet' in('block','defer_authorized') order by r.approved_at desc,r.revision desc limit 1;
 policy:=coalesce(previous_policy,'block');
 return jsonb_build_object('payDate',cycle->>'releaseDate','contributionMonth',month_start,'cutoff',slot::text,
  'allocation',jsonb_build_object('sss','0.5','philhealth','0.5','pagibig','0.5'),
  'previousRunId',coalesce(prior.id::text,''),'insufficientNet',policy,
  'policyRef',coalesce(cycle->>'policy','Configured payroll calendar')||'; 50% contributions per cutoff; insufficient pay: '||policy,
  'sourceRef','Finance review of gross payroll '||g.id::text||' ('||g.date_from::text||' to '||g.date_to::text||')');
end $fn$;
revoke all on function private.payroll_net_context(uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_payroll_net_workspace(p_gross_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g public.payroll_gross_runs;gross_view jsonb;v public.payroll_net_reviews;
begin
 gross_view:=public.get_payroll_gross_run(p_gross_id);select * into g from public.payroll_gross_runs where id=p_gross_id;
 select * into v from public.payroll_net_reviews where gross_run_id=g.id order by revision desc limit 1;
 return jsonb_build_object('defaults',private.payroll_net_context(g.id),'packageTerms',private.payroll_net_package_terms(g.result,g.source_snapshot->'packages'),'gross',gross_view,'canReview',private.payroll_net_can_review(g.scope_id),'review',case when v.id is null then null else jsonb_build_object('id',v.id,'inputs',v.inputs-'statutoryFingerprint','sourceRef',v.source_ref,'approvedAt',v.approved_at) end,
 'loans',(select coalesce(jsonb_agg(to_jsonb(l) order by l.employee_id,l.account_ref,l.revision desc),'[]') from public.payroll_loan_ledger l where exists(select 1 from jsonb_array_elements(g.result->'employees') e where e->>'employeeId'=l.employee_id::text) and private.payroll_gross_permission(l.scope_id,'view')),
 'runs',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'version',r.version,'grossId',r.gross_run_id,'from',r.date_from,'to',r.date_to,'payDate',r.source_snapshot#>>'{review,payDate}') order by r.date_from desc,r.version desc),'[]') from public.payroll_net_runs r where r.scope_id=g.scope_id));
end $function$
;
CREATE OR REPLACE FUNCTION public.save_payroll_net_review(p_gross_id uuid, p_inputs jsonb, p_source_ref text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g public.payroll_gross_runs;new_id uuid;fingerprint jsonb;payload jsonb;prior_inputs jsonb;context jsonb;terms jsonb;item jsonb;term jsonb;canonical jsonb:='[]';
begin
 select * into g from public.payroll_gross_runs where id=p_gross_id;
 if g.id is null or not private.payroll_net_can_review(g.scope_id) then raise exception 'Scoped Finance authorization required.' using errcode='42501';end if;
 context:=private.payroll_net_context(g.id);
 p_inputs:=p_inputs||(context-'sourceRef');
 p_source_ref:=context->>'sourceRef';
 terms:=private.payroll_net_package_terms(g.result,g.source_snapshot->'packages');
 for item in select value from jsonb_array_elements(p_inputs->'employees') loop
  select value into term from jsonb_array_elements(terms) where value->>'employeeId'=item->>'employeeId';
  if nullif(term->>'issue','') is not null then raise exception '%: %',term->>'employeeName',term->>'issue';end if;
  if term->>'payBasis' in ('net_tax','net_all') then
   if nullif(term->>'cutoffTarget','') is null then raise exception 'The approved net target needs a supported allocation for %.',term->>'employeeName';end if;
   item:=item||jsonb_build_object('netTarget',term->>'cutoffTarget','grossUpBasisRef','Approved package; monthly contribution bases recorded in this Finance review');
  end if;
  canonical:=canonical||jsonb_build_array(item||jsonb_build_object('payBasis',term->>'payBasis','arrangementRef',term->>'arrangementRef'));
 end loop;
 p_inputs:=p_inputs||jsonb_build_object('employees',canonical,'allocation',jsonb_build_object('sss','0.5','philhealth','0.5','pagibig','0.5'));
 perform pg_advisory_xact_lock(hashtextextended('payroll-net:'||g.scope_id::text,0));
 select inputs into prior_inputs from public.payroll_net_reviews where gross_run_id=g.id order by revision desc limit 1;
 p_inputs:=private.payroll_net_review_for_actor(p_inputs,prior_inputs,public.current_hris_user_id()::text);
 perform private.payroll_net_review_validate(p_gross_id,p_inputs);
 select jsonb_agg(jsonb_build_object('employeeId',h.id,'fingerprint',md5(jsonb_build_array(h.sss_no,h.philhealth_no,h.pagibig_no,h.tin)::text)) order by e.ordinality)
 into fingerprint from jsonb_array_elements(g.result->'employees') with ordinality e(value,ordinality) join public.hris_users h on h.id=(e.value->>'employeeId')::uuid;
 payload:=(p_inputs-'statutoryFingerprint')||jsonb_build_object('statutoryFingerprint',fingerprint);
 select id into new_id from public.payroll_net_reviews where gross_run_id=g.id and inputs=payload and source_ref=p_source_ref order by revision desc limit 1;
 if new_id is not null and new_id=(select id from public.payroll_net_reviews where gross_run_id=g.id order by revision desc limit 1) then return new_id;end if;
 insert into public.payroll_net_reviews(gross_run_id,scope_id,inputs,source_ref,approved_by) values(g.id,g.scope_id,payload,p_source_ref,public.current_hris_user_id()) returning id into new_id;
 return new_id;
end $function$
;
