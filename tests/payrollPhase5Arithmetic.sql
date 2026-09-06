-- Pure JSON fixtures only: no real employees, permissions, balances or records are changed.
begin read only;
set local statement_timeout='30s';
do $test$
declare snap jsonb;first_run jsonb;second_run jsonb;r jsonb;changed jsonb;monthly jsonb;k text;failed boolean;
begin
 snap:='{"review":{"ruleset":"PH-2026-09-06","payDate":"2026-09-15","contributionMonth":"2026-09-01","cutoff":"1","allocation":{"sss":"0.5","philhealth":"0.5","pagibig":"0.5"},"insufficientNet":"block","employees":[{"employeeId":"fixture","sssBase":"30000","philhealthBase":"30000","pagibigBase":"30000","sssCovered":true,"philhealthCovered":true,"pagibigCovered":true,"openingTaxable":"0","openingWithheld":"0","openingPeriods":"0","previousEmployer":false,"cumulativeAlready":false,"taxLines":[{"taxable":"15000","kind":"regular"}],"deductions":[{"label":"Authorized deduction","amount":"100","sourceRef":"Arithmetic authorization"}]}]},"gross":{"employees":[{"employeeId":"fixture","employeeName":"Arithmetic fixture","gross":"15000","lines":[{"label":"Basic","amount":"15000"}]}]},"loans":[{"id":"loan-fixture","employee_id":"fixture","account_ref":"Loan A","available":"500","installment":"400","source_ref":"Arithmetic opening"}]}';
 first_run:=private.calculate_payroll_net_v1(snap);
 -- EE:750 SSS+375 PH+100 HDMF=1225; taxable13775; tax503.70; loan400+other100.
 if not(first_run->>'ready')::boolean or (first_run->>'net')::numeric<>12771.30 or (first_run->>'employer')::numeric<>1990 or (first_run->>'deductions')::numeric<>2228.70 then raise exception 'Complete net reconciliation failed: %',first_run;end if;
 if first_run is distinct from private.calculate_payroll_net_v1(snap) then raise exception 'Identical input not deterministic';end if;
 changed:=jsonb_set(snap,'{review,cutoff}','"2"');changed:=jsonb_set(changed,'{review,payDate}','"2026-09-30"');
 changed:=changed||jsonb_build_object('prior',jsonb_build_object('contributionMonth','2026-09-01','result',first_run));
 changed:=jsonb_set(changed,'{loans,0,available}','"100"');second_run:=private.calculate_payroll_net_v1(changed);
 if not(second_run->>'ready')::boolean or (second_run#>>'{employees,0,loans,0,amount}')::numeric<>100 or (second_run#>>'{employees,0,loans,0,projectedBalance}')::numeric<>0 or (second_run->>'net')::numeric<>13071.30 then raise exception 'Second cutoff / final loan cap failed: %',second_run;end if;
 monthly:=private.payroll_contributions_2026(snap#>'{review,employees,0}');
 for k in select jsonb_object_keys(monthly) loop
 if (second_run#>>array['employees','0','monthlyPaid',k])::numeric<>(monthly->>k)::numeric then raise exception 'Monthly contribution not reconciled: %',k;end if;end loop;
 if (second_run#>>'{employees,0,ytd,periods}')::int<>2 or (second_run#>>'{employees,0,ytd,withheld}')::numeric<>1007.40 then raise exception 'YTD carry failed';end if;
 -- SSS thresholds / ceiling, separate MPF/EC and PH / HDMF floors and ceilings.
 r:=private.payroll_contributions_2026('{"sssBase":"5249.99","philhealthBase":"5000","pagibigBase":"1500"}');
 if (r->>'sssEE')::numeric<>250 or (r->>'ecER')::numeric<>10 or (r->>'philhealthEE')::numeric<>250 or (r->>'pagibigEE')::numeric<>15 then raise exception 'Lower statutory brackets failed';end if;
 r:=private.payroll_contributions_2026('{"sssBase":"5250","philhealthBase":"200000","pagibigBase":"1500.01"}');
 if (r->>'sssEE')::numeric<>275 or (r->>'philhealthEE')::numeric<>2500 or (r->>'pagibigEE')::numeric<>30 then raise exception 'Bracket boundaries failed';end if;
 r:=private.payroll_contributions_2026('{"sssBase":"100000","philhealthBase":"30000","pagibigBase":"30000"}');
 if (r->>'sssEE')::numeric<>1000 or (r->>'mpfEE')::numeric<>750 or (r->>'mpfER')::numeric<>1500 or (r->>'ecER')::numeric<>30 or (r->>'pagibigEE')::numeric<>200 then raise exception 'Statutory caps / employer allocation failed';end if;
 if private.payroll_withholding_2023(10417)<>0 or private.payroll_withholding_2023(16667)<>937.50 or private.payroll_withholding_2023(33333)<>4270.70 or private.payroll_withholding_2023(83333)<>16770.70 or private.payroll_withholding_2023(333333)<>91770.70 then raise exception 'Official BIR bracket anchors failed';end if;
 -- Regular bracket is selected before ordinary supplement; exceptional case invokes cumulative average.
 if private.payroll_withholding_2023(16000,1000)<>987.45 then raise exception 'Supplement bracket treatment failed';end if;
 changed:=jsonb_set(snap,'{review,employees,0,previousEmployer}','true');changed:=jsonb_set(changed,'{review,employees,0,openingTaxable}','"200000"');changed:=jsonb_set(changed,'{review,employees,0,openingWithheld}','"15000"');changed:=jsonb_set(changed,'{review,employees,0,openingPeriods}','"10"');r:=private.calculate_payroll_net_v1(changed);
 if r#>>'{employees,0,taxExplanation,method}'<>'cumulative_average' or (r#>>'{employees,0,ytd,taxable}')::numeric<>213775 or (r#>>'{employees,0,ytd,periods}')::int<>11 then raise exception 'Reviewed midyear / previous-employer opening failed: %',r;end if;
 -- A component called allowance is not automatically exempt; explicitly reviewed portions reconcile.
 changed:=jsonb_set(snap,'{review,employees,0,taxLines,0,taxable}','"14000"');r:=private.calculate_payroll_net_v1(changed);
 if (r->>'ready')::boolean then raise exception 'Unreferenced exemption accepted';end if;
 changed:=jsonb_set(changed,'{review,employees,0,taxLines,0,exemptionRef}','"Reviewed permitted benefit and limit usage"');r:=private.calculate_payroll_net_v1(changed);
 if not(r->>'ready')::boolean or (r#>>'{employees,0,taxExplanation,exempt}')::numeric<>1000 then raise exception 'Reviewed tax split failed';end if;
 -- Imported first-cutoff shares are required when the second cutoff has no predecessor.
 changed:=jsonb_set(snap,'{review,cutoff}','"2"');r:=private.calculate_payroll_net_v1(changed);if (r->>'ready')::boolean then raise exception 'Missing monthly opening accepted';end if;
 changed:=jsonb_set(changed,'{review,employees,0,openingContributions}',first_run#>'{employees,0,monthlyPaid}');r:=private.calculate_payroll_net_v1(changed);if not(r->>'ready')::boolean then raise exception 'Reviewed monthly opening failed: %',r;end if;
 changed:=jsonb_set(changed,'{review,employees,0,openingContributions,sssEE}','"999999"');r:=private.calculate_payroll_net_v1(changed);if (r->>'ready')::boolean then raise exception 'Prior over-deduction accepted';end if;
 changed:=jsonb_set(snap,'{loans,0,available}','"99999"');changed:=jsonb_set(changed,'{loans,0,installment}','"99999"');r:=private.calculate_payroll_net_v1(changed);if (r->>'ready')::boolean then raise exception 'Insufficient-net block failed';end if;
 changed:=jsonb_set(changed,'{review,insufficientNet}','"defer_authorized"');r:=private.calculate_payroll_net_v1(changed);if not(r->>'ready')::boolean or (r->>'net')::numeric<>0 or (r#>>'{employees,0,loans,0,deferred}')::numeric<=0 then raise exception 'Approved deferral failed: %',r;end if;
 failed:=false;begin perform private.payroll_net_money('{"amount":"NaN"}','amount');exception when raise_exception then failed:=true;end;if not failed then raise exception 'Non-finite amount accepted';end if;
 perform set_config('payroll_phase5.result','PASS: full net reconciliation, two-cutoff EE/ER totals, final loan cap, deterministic shadow arithmetic, statutory boundaries, BIR brackets/supplement, midyear YTD, exemption evidence and insufficient-net/import guards. No data changed.',true);
end $test$;
select current_setting('payroll_phase5.result') as result;
rollback;
