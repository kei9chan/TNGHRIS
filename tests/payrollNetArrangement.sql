-- Pure fixtures only; run after the migration. No payroll records written.
do $test$
declare p jsonb; r jsonb; e jsonb; base jsonb; tax_only jsonb;
begin
 p:='{"review":{"ruleset":"PH-2026-09-06","payDate":"2026-09-15","contributionMonth":"2026-09-01","cutoff":"1","allocation":{"sss":"0.5","philhealth":"0.5","pagibig":"0.5"},"insufficientNet":"block","employees":[{"employeeId":"fixture","sssBase":"40000","philhealthBase":"40000","pagibigBase":"40000","sssCovered":true,"philhealthCovered":true,"pagibigCovered":true,"openingTaxable":"0","openingWithheld":"0","openingPeriods":"0","previousEmployer":false,"cumulativeAlready":false,"taxLines":[{"taxable":"15000","kind":"regular"}],"deductions":[]}]},"gross":{"employees":[{"employeeId":"fixture","employeeName":"Net fixture","gross":"15000","lines":[{"packageId":"package","label":"Basic","amount":"15000"}]}]},"loans":[],"packages":[{"id":"package","stream":"employee_payroll","treatment":{"payBasis":"gross"}}]}';
 base:=private.calculate_payroll_net_v1(p);
 if not (base->>'ready')::boolean or (base#>>'{employees,0,companyTopUp}')::numeric<>0 then raise exception 'Gross regression %',base;end if;
 p:=jsonb_set(p,'{packages,0,treatment,payBasis}','"net_tax"');
 p:=jsonb_set(p,'{review,employees,0}',p#>'{review,employees,0}'||'{"payBasis":"net_tax","netTarget":"15000","arrangementRef":"Fixture reviewed cutoff allocation","grossUpBasisRef":"Fixture final monthly statutory bases including gross-up","grossUpConfirmed":true}'::jsonb);
 r:=private.calculate_payroll_net_v1(p);e:=r#>'{employees,0}';tax_only:=r;
 if not(r->>'ready')::boolean or (e->>'gross')::numeric-(e->>'tax')::numeric<>15000 or (e->>'companyTopUp')::numeric<=0 then raise exception 'Tax-only gross-up %',r;end if;
 p:=jsonb_set(p,'{packages,0,treatment,payBasis}','"net_all"');p:=jsonb_set(p,'{review,employees,0,payBasis}','"net_all"');
 r:=private.calculate_payroll_net_v1(p);e:=r#>'{employees,0}';
 if not(r->>'ready')::boolean or (e->>'net')::numeric<>15000 or (e->>'companyTopUp')::numeric<=(tax_only#>>'{employees,0,companyTopUp}')::numeric then raise exception 'All shares gross-up %',r;end if;
 if (r->>'employerTotalCost')::numeric<>(r->>'gross')::numeric+(r->>'employer')::numeric then raise exception 'Employer cost double counts tax';end if;
 p:=jsonb_set(p,'{review,employees,0,deductions}','[{"label":"Loan separate from guarantee","amount":"100","sourceRef":"Fixture authorization"}]');
 r:=private.calculate_payroll_net_v1(p);if (r->>'net')::numeric<>14900 then raise exception 'Other deductions were absorbed by employer %',r;end if;
 p:=jsonb_set(p,'{review,employees,0,grossUpConfirmed}','false');r:=private.calculate_payroll_net_v1(p);if (r->>'ready')::boolean then raise exception 'Unreviewed bases accepted';end if;
 p:=jsonb_set(p,'{review,employees,0,grossUpConfirmed}','true');p:=jsonb_set(p,'{review,employees,0,payBasis}','"gross"');r:=private.calculate_payroll_net_v1(p);if (r->>'ready')::boolean then raise exception 'Net package silently computed as gross';end if;
 p:=jsonb_set(p,'{review,employees,0,payBasis}','"net_all"');p:=jsonb_set(p,'{review,employees,0,taxLines,0,taxable}','"0"');r:=private.calculate_payroll_net_v1(p);if (r->>'ready')::boolean then raise exception 'Net treated as tax exemption';end if;
 raise notice 'PASS: gross unchanged, both net modes, tax-on-top-up, cost reconciliation, loans separate, final-base confirmation, approved-mode match, exemption evidence.';
end $test$;
