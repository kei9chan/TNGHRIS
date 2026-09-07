-- Run in a transaction and roll back; synthetic calculations only.
begin;
do $test$
declare snap jsonb;r jsonb;baseline numeric;
begin
 snap:='{"review":{"ruleset":"PH-2026-09-06","payDate":"2026-09-15","contributionMonth":"2026-09-01","cutoff":"1","allocation":{"sss":"0.5","philhealth":"0.5","pagibig":"0.5"},"insufficientNet":"block","employees":[{"employeeId":"fixture","sssBase":"30000","philhealthBase":"30000","pagibigBase":"30000","sssCovered":true,"philhealthCovered":true,"pagibigCovered":true,"openingTaxable":"0","openingWithheld":"0","openingPeriods":"0","previousEmployer":false,"cumulativeAlready":false,"taxLines":[{"taxable":"15000","kind":"regular"}],"deductions":[{"label":"Authorized deduction","amount":"100","sourceRef":"Arithmetic authorization"}]}]},"gross":{"employees":[{"employeeId":"fixture","employeeName":"Arithmetic fixture","gross":"15000","lines":[{"label":"Basic","amount":"15000"}]}]},"loans":[{"id":"loan-fixture","employee_id":"fixture","account_ref":"Loan A","available":"500","installment":"400","source_ref":"Arithmetic opening"}]}';

 snap:=snap||'{"confirmedPolicy":{"effective_from":"2026-09-07"}}'::jsonb;
 snap:=jsonb_set(snap,'{loans,0,available}','"99999"');snap:=jsonb_set(snap,'{loans,0,installment}','"99999"');
 r:=private.calculate_payroll_net_v1(snap);
 baseline:=15000-1225-503.70;
 if not(r->>'ready')::boolean or (r->>'net')::numeric<baseline*.8 or (r#>>'{employees,0,loans,0,amount}')::numeric<>trunc(baseline*.2,2) then raise exception '20%% protection failed: %',r;end if;
 snap:=jsonb_set(snap,'{review,employees,0,voluntaryPercent}','"30"');r:=private.calculate_payroll_net_v1(snap);
 if (r->>'ready')::boolean then raise exception 'Missing higher deduction authorization allowed';end if;
 snap:=jsonb_set(snap,'{review,employees,0,higherDeductionAuthorization}','"Written employee request"');snap:=jsonb_set(snap,'{review,employees,0,higherDeductionLegalBasis}','"Finance reviewed lawful deduction"');r:=private.calculate_payroll_net_v1(snap);
 if not(r->>'ready')::boolean or (r->>'net')::numeric<baseline*.7 then raise exception 'Authorized higher deduction failed: %',r;end if;
 if private.confirmed_leave_earned('2026-01-01','2026-06-30')<>2.496 then raise exception 'Six month accrual';end if;
 if private.confirmed_leave_earned('2026-01-15','2026-01-31')<>.416 or private.confirmed_leave_earned('2026-01-16','2026-01-31')<>.208 then raise exception 'Hire month boundary';end if;
 if private.confirmed_leave_earned('2026-01-01','2026-12-31')<>4.992 or private.confirmed_leave_earned('2026-01-01','2027-01-01')<>5 then raise exception 'Anniversary reconciliation';end if;
 if private.confirmed_leave_earned('2026-01-16','2027-01-16')<>5 then raise exception 'Partial hire month annual cap';end if;
 if extract(isodow from private.confirmed_banking_day('2026-09-13'))>5 or private.confirmed_banking_day('2026-09-13')>'2026-09-11'::date then raise exception 'Preceding bank day';end if;
 if has_function_privilege('anon','public.get_confirmed_leave_ledger(uuid)','EXECUTE') then raise exception 'Anonymous leave access';end if;
 if has_table_privilege('authenticated','public.payroll_leave_ledger','UPDATE') then raise exception 'Client ledger mutation';end if;
 perform set_config('confirmed_test.result','PASS: accrual boundaries, six months, anniversary top-up, 20% protection, higher-deduction evidence, preceding bank day, restricted ledger access',true);
end $test$;
select current_setting('confirmed_test.result') as result;
rollback;
