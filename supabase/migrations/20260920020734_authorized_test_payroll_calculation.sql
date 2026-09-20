-- Explicitly authorized mock settings. Never write official payroll or approval tables.
create table payroll_scenario_private.calculations (
 id uuid primary key default gen_random_uuid(),
 seed_run_id text not null references payroll_scenario_private.runs(seed_run_id),
 input_hash text not null, actor_id uuid, created_at timestamptz not null default now(),
 result jsonb not null, unique(seed_run_id,input_hash)
);
alter table payroll_scenario_private.calculations enable row level security;
revoke all on payroll_scenario_private.calculations from public,anon,authenticated;

create function payroll_scenario_private.calculate_mock_run(p_seed text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r payroll_scenario_private.runs; src jsonb; packages jsonb; rules jsonb; cfg jsonb; interpreted jsonb; gross jsonb;
 baseline jsonb; employees jsonb; shifts jsonb:='[]'; events jsonb:='[]'; sh jsonb; e jsonb; p jsonb; d date; typ text; tm text; sid text; rest boolean;
 baseline_time jsonb; baseline_gross jsonb; net_inputs jsonb:='[]'; net_result jsonb; net_snapshot jsonb; result jsonb; input_hash text; previous jsonb; assumption_changes jsonb:='[]';
begin
 select * into strict r from payroll_scenario_private.runs where seed_run_id=p_seed and is_test for update;
 if jsonb_array_length(r.snapshot->'employees')<>jsonb_array_length(r.snapshot->'packages') then raise exception 'Each test employee needs a saved source or mock package';end if;
 input_hash:=md5(jsonb_build_array('authorized-demo-v1',r.snapshot->'source',r.snapshot->'packages',r.pay_date)::text);
 select c.result into previous from payroll_scenario_private.calculations c where c.seed_run_id=p_seed and c.input_hash=calculate_mock_run.input_hash;
 if previous is not null then return previous;end if;
 -- Copy into a calculation snapshot. Original evidence and draft approval states remain unchanged.
 src:=r.snapshot->'source';
 src:=jsonb_set(src,'{rules}',jsonb_build_array(jsonb_build_object('id','TEST-TIME-RULES','effective_from',r.date_from,'effective_to',r.date_to,'revision',1,'config',jsonb_build_object('holidayCoverageConfirmed',true,'leavePolicyRef','Mock paid-leave eligibility','restTemplates',jsonb_build_array('test-rest'),'splitShiftConfirmed',true))));
 src:=jsonb_set(src,'{leavePolicies}','[{"leave_type_id":"test-leave","accrual_rule":"mock_only"}]');
 select jsonb_agg(x||jsonb_build_object('treatment',coalesce(x->'treatment','{}')||'{"proration":"rule_defined"}'::jsonb,'components',(select coalesce(jsonb_agg(c||'{"proration":"included"}'::jsonb),'[]') from jsonb_array_elements(x->'components') c))) into packages from jsonb_array_elements(r.snapshot->'packages') x;
 cfg:='{"monthlyMethod":"calendar_prorated","rounding":"employee_total_half_up","recurringMethod":"calendar_prorated","annualDivisor":"313","hoursPerDay":"8","nightStart":"22:00","nightEnd":"06:00","offsetCash":"excluded","gracePay":"base_only","rateBoundary":"shift_date","premiums":{"ordinary":{"regular":"1","ot":"1.25","nightRegular":"0.1","nightOt":"0.125"},"ordinary_rest":{"regular":"1.3","ot":"1.69","nightRegular":"0.13","nightOt":"0.169"}}}';
 rules:=jsonb_build_array(jsonb_build_object('id','TEST-GROSS-RULES','revision',1,'effective_from',r.date_from,'effective_to',r.date_to,'source_ref','User-authorized mock settings, not official policy','config',cfg));
 interpreted:=private.interpret_payroll_time(src,r.date_from,r.date_to);
 gross:=private.calculate_payroll_gross_v1(jsonb_build_object('dateFrom',r.date_from,'dateTo',r.date_to,'time',jsonb_build_object('source',src,'result',interpreted),'packages',packages,'rules',rules));
 -- Separate complete-attendance comparison. Never clear the scenario exceptions above.
 employees:='[]';
 for e in select value from jsonb_array_elements(src->'employees') loop
 if nullif(e->>'hireDate','') is null then
 assumption_changes:=assumption_changes||jsonb_build_array(jsonb_build_object('employeeId',e->>'id','field','hireDate','mockValue',r.date_from,'reason','Unknown hire date; comparison assumes employed throughout cutoff. Official profile unchanged.'));
 e:=e||jsonb_build_object('hireDate',r.date_from);
 end if;
 employees:=employees||jsonb_build_array(e);
 for d in select generate_series(r.date_from,r.date_to,'1 day')::date loop
 if (e->>'hireDate')::date>d or (nullif(e->>'endDate','') is not null and (e->>'endDate')::date<d) then continue;end if;
 rest:=extract(isodow from d)=7;sid:='baseline:'||(e->>'id')||':'||d;
 shifts:=shifts||jsonb_build_array(jsonb_build_object('id',sid,'employeeId',e->>'id','date',d,'kind',case when rest then 'rest' else 'work' end,'published',true,'start','09:00','end','18:00','endDayOffset',0,'breakMinutes',60,'paidMinutes',480,'flexible',false,'templateId',case when rest then 'test-rest' else 'baseline-work' end));
 if not rest then
 foreach typ in array array['CLOCK_IN','START_BREAK','END_BREAK','CLOCK_OUT'] loop
 tm:=case typ when 'CLOCK_IN' then '09:00' when 'START_BREAK' then '12:00' when 'END_BREAK' then '13:00' else '18:00' end;
 events:=events||jsonb_build_array(jsonb_build_object('id',sid||':'||typ,'employeeId',e->>'id','timestamp',d||'T'||tm||':00+08:00','type',typ,'source','Mock complete-attendance comparison'));
 end loop;end if;
 end loop;end loop;
 baseline:=src||jsonb_build_object('employees',employees,'shifts',shifts,'events',events,'leave','[]'::jsonb,'ot','[]'::jsonb,'scheduleDays',(select jsonb_agg(jsonb_build_object('employeeId',x->>'employeeId','date',x->>'date','status','published')) from jsonb_array_elements(shifts) x));
 baseline_time:=private.interpret_payroll_time(baseline,r.date_from,r.date_to);
 baseline_gross:=private.calculate_payroll_gross_v1(jsonb_build_object('dateFrom',r.date_from,'dateTo',r.date_to,'time',jsonb_build_object('source',baseline,'result',baseline_time),'packages',packages,'rules',rules));
 for e in select value from jsonb_array_elements(baseline_gross->'employees') where value->>'gross' is not null loop
 select value into p from jsonb_array_elements(packages) where value->>'employee_id'=e->>'employeeId';
 net_inputs:=net_inputs||jsonb_build_array(jsonb_build_object('employeeId',e->>'employeeId','sssBase',p->>'base_amount','philhealthBase',p->>'base_amount','pagibigBase',p->>'base_amount','sssCovered',true,'philhealthCovered',true,'pagibigCovered',true,'openingTaxable','0','openingWithheld','0','openingPeriods','0','previousEmployer',false,'cumulativeAlready',false,'payBasis',coalesce(p#>>'{treatment,payBasis}','gross'),'netTarget',round((p->>'base_amount')::numeric/2,2)::text,'arrangementRef','Mock half-month net allocation','grossUpBasisRef','Mock fixed monthly statutory bases','grossUpConfirmed',true,'deductions','[]'::jsonb,'taxLines',(select jsonb_agg(jsonb_build_object('taxable',x->>'amount','kind','regular')) from jsonb_array_elements(e->'lines') x)));
 end loop;
 net_snapshot:=jsonb_build_object('gross',jsonb_build_object('employees',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(baseline_gross->'employees') x where x->>'gross' is not null)),'packages',packages,'loans','[]'::jsonb,'review',jsonb_build_object('ruleset','PH-2026-09-06','payDate',r.pay_date,'contributionMonth',date_trunc('month',r.pay_date)::date,'cutoff','1','allocation','{"sss":"0.5","philhealth":"0.5","pagibig":"0.5"}'::jsonb,'insufficientNet','block','employees',net_inputs));
 net_result:=private.calculate_payroll_net_v1(net_snapshot);
 result:=jsonb_build_object('version','authorized-demo-v1','calculatedAt',now(),'inputHash',input_hash,'isTest',true,'assumptions',jsonb_build_array('MOCK: 313-day divisor; 8 paid hours/day; calendar-prorated monthly salary and allowances; half-up rounding.','MOCK: ordinary overtime 1.25; rest-day regular 1.3 and overtime 1.69; night window 22:00–06:00. No holidays assumed.','MOCK: paid-leave eligibility assumed. Missing punches, partial leave and unapproved overtime remain exceptions.','COMPARISON ONLY: complete 09:00–18:00 attendance with 12:00–13:00 unpaid break; Sundays off. This does not replace scenario attendance.','MOCK: all statutory coverage; contribution bases equal monthly basic pay; 50% on first September payday; zero opening balances, loans and recurring deductions.','MOCK: all earnings, including allowance, treated as taxable. Net-of-tax target equals half the monthly target. These are demonstrations, not official payroll results.'),'assumptionChanges',assumption_changes,'packages',packages,'rules',rules,'scenarioSource',src,'timeResult',interpreted,'scenarioGross',gross,'comparisonSource',baseline,'comparisonTime',baseline_time,'comparisonGross',baseline_gross,'comparisonNetInput',net_snapshot,'comparisonNet',net_result);
 insert into payroll_scenario_private.calculations(seed_run_id,input_hash,actor_id,result) values(p_seed,input_hash,auth.uid(),result);
 update payroll_scenario_private.runs set snapshot=snapshot||jsonb_build_object('demo',result) where seed_run_id=p_seed;
 return result;
end $$;
revoke all on function payroll_scenario_private.calculate_mock_run(text) from public,anon,authenticated;

create function public.calculate_payroll_scenario_demo(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;begin
 -- Existing read gate checks both BU and every employee's compensation scope.
 r:=public.get_payroll_scenario_run(p_scope,p_from,p_to);
 if not coalesce(private.payroll_gross_permission(p_scope,'prepare') or private.payroll_gross_permission(p_scope,'rules') or private.payroll_has_access('manage_access',p_scope),false) then raise exception 'Scoped payroll preparation, HR rules or payroll administration access required' using errcode='42501';end if;
 if r is null then raise exception 'No isolated test run for this cutoff';end if;
 return payroll_scenario_private.calculate_mock_run(r->>'seed_run_id');
end $$;
revoke all on function public.calculate_payroll_scenario_demo(uuid,date,date) from public,anon;
grant execute on function public.calculate_payroll_scenario_demo(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
