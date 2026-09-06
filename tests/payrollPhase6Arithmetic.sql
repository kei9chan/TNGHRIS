-- Pure arithmetic assertions only. No real employees, grants or source writes.
do $$
declare p jsonb;r jsonb;base jsonb;failed boolean;
begin
 base:='{"kind":"correction","dateFrom":"2026-01-01","dateTo":"2026-09-05","payDate":"2026-09-20","sourceRef":"fixture approved source","settlementRef":"fixture actual settlement","taxRef":"fixture Finance tax calculation","reviewedCoverage":true,"taxMethod":"reviewed_adjustment","reviewedTax":"150","taxableContributionAdjustment":"0","lines":[{"sourceKey":"fixture:salary:1","label":"Corrected salary","kind":"earning","category":"basic","amount":"15000","settled":"14000","taxable":"1000","sourceRef":"fixture salary source","taxRef":""}]}'::jsonb;
 r:=private.calculate_payroll_special_v1(base);
 if (r->>'gross')::numeric<>1000 or (r->>'tax')::numeric<>150 or (r->>'net')::numeric<>850 then raise exception 'Correction delta reconciliation failed: %',r;end if;
 if r is distinct from private.calculate_payroll_special_v1(base) then raise exception 'Replay is not deterministic.';end if;
 p:=base||'{"kind":"thirteenth","lines":[],"basicPeriods":[{"period":"2026-01","amount":"60000","sourceRef":"fixture basic January"},{"period":"2026-02","amount":"60000","sourceRef":"fixture basic February"}],"eligibilityRef":"fixture eligibility and complete history","bonusSettled":"2000","benefitsUsed":"2000","reviewedTax":"0"}'::jsonb;
 r:=private.calculate_payroll_special_v1(p);
 if (r->>'thirteenthEntitlement')::numeric<>10000 or (r->>'net')::numeric<>8000 then raise exception '13th month less earlier payment failed: %',r;end if;
 p:=p||'{"kind":"final","taxMethod":"annual","priorTaxable":"300000","priorWithheld":"10000","previousEmployerTaxable":"100000","previousEmployerWithheld":"10000","bonusSettled":"5000","benefitsUsed":"5000","leaveRef":"fixture approved days and rate","accountabilityRef":"fixture lawful recovery","basicPeriods":[{"period":"2026-01","amount":"180000","sourceRef":"fixture earned basic"}],"lines":[{"sourceKey":"fixture:last:salary","label":"Unpaid salary","kind":"earning","category":"basic","amount":"10000","settled":"5000","taxable":"5000","sourceRef":"fixture payroll"},{"sourceKey":"fixture:leave","label":"Leave conversion","kind":"earning","category":"leave","amount":"1000","settled":"0","taxable":"1000","sourceRef":"fixture approved conversion"},{"sourceKey":"fixture:accountability","label":"Authorized recovery","kind":"deduction","category":"accountability","amount":"700","settled":"200","taxable":"0","sourceRef":"fixture recovery authority"}]}'::jsonb;
 r:=private.calculate_payroll_special_v1(p);
 if (r->>'gross')::numeric<>16000 or (r->>'tax')::numeric<>3700 or (r->>'deductions')::numeric<>4200 or (r->>'net')::numeric<>11800 then raise exception 'Final pay / prior employer annualization failed: %',r;end if;
 r:=private.calculate_payroll_special_v1(p||'{"priorTaxable":"100000","previousEmployerTaxable":"0","priorWithheld":"5000","previousEmployerWithheld":"0"}'::jsonb);
 if (r->>'tax')::numeric<>-5000 or (r->>'net')::numeric<>20500 then raise exception 'Annual tax refund failed.';end if;
 if private.payroll_annual_tax_2023(250000)<>0 or private.payroll_annual_tax_2023(400000)<>22500 or private.payroll_annual_tax_2023(800000)<>102500 or private.payroll_annual_tax_2023(2000000)<>402500 or private.payroll_annual_tax_2023(8000000)<>2202500 then raise exception 'Annual tax anchors failed.';end if;
 failed:=false;begin perform private.calculate_payroll_special_v1(base||jsonb_build_object('lines',(base->'lines')||(base->'lines')));exception when raise_exception then failed:=true;end;if not failed then raise exception 'Duplicate sources accepted.';end if;
 failed:=false;begin perform private.calculate_payroll_special_v1(p||'{"bonusSettled":"20000"}'::jsonb);exception when raise_exception then failed:=true;end;if not failed then raise exception '13th-month overpayment silently accepted.';end if;
 failed:=false;begin perform private.calculate_payroll_special_v1(p||'{"taxMethod":"reviewed_adjustment"}'::jsonb);exception when raise_exception then failed:=true;end;if not failed then raise exception 'Final pay bypassed annualization.';end if;
 failed:=false;begin perform private.calculate_payroll_special_v1(base||'{"reviewedTax":"NaN"}'::jsonb);exception when raise_exception then failed:=true;end;if not failed then raise exception 'Nonfinite money accepted.';end if;
end $$;
