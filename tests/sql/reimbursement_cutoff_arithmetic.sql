-- Pure synthetic inputs; no employee, compensation or payroll writes.
begin;
set local statement_timeout='30s';
do $$
declare snap jsonb;rows jsonb:='[]';d date;reqs jsonb;expected numeric;result jsonb;
begin
 for d in select g::date from generate_series('2026-06-11'::date,'2026-06-25'::date,'1 day') g loop
  rows:=rows||jsonb_build_array(jsonb_build_object('employeeId','fixture','employeeName','Arithmetic fixture','date',d,'ready',true,'restDay',true,'holiday',false,'approvedFullLeave',false,'regularMinutes',0,'actualOtMinutes',0,'actualMinutes',0,'scheduledMinutes',0,'lateMinutes',0,'undertimeMinutes',0,'eventIds','[]'::jsonb,'shiftIds','[]'::jsonb,'leaveIds','[]'::jsonb,'ot','[]'::jsonb,'segments','[]'::jsonb));
 end loop;
 snap:=jsonb_build_object('timePackageId','fixture-time','dateFrom','2026-06-11','dateTo','2026-06-25','time',jsonb_build_object('source','{"employees":[{"id":"fixture","name":"Arithmetic fixture"}],"events":[],"leave":[],"holidays":[]}'::jsonb,'result',jsonb_build_object('rows',rows)),
 'packages','[{"id":"pay-one","employee_id":"fixture","engagement_key":"employee","effective_from":"2026-01-01","rate_type":"Monthly","base_amount":"31300","treatment":{"proration":"rule_defined"},"source_ref":"Arithmetic example","components":[{"name":"Reimbursable allowance","category":"reimbursable_allowance","legacyField":"reimbursable","receiptRequired":true,"amount":"1000","recurrence":"recurring","proration":"included"}]}]'::jsonb,
 'rules',jsonb_build_array(jsonb_build_object('id','rule-one','revision',1,'effective_from','2026-01-01','effective_to','2026-12-31','source_ref','Arithmetic only','config',private.payroll_statutory_gross_config())));
 reqs:=private.payroll_reimbursement_requirements(snap);
 result:=private.calculate_payroll_gross_v1(snap);
 if not(result->>'ready')::boolean then raise exception 'Fixture calculation blocked: %',result;end if;
 if jsonb_array_length(reqs)<>1 or (reqs#>>'{0,requiredAmount}')::numeric<>500.00 then raise exception 'Monthly allowance must require half this cutoff: %',reqs;end if;
 -- A dated approved allowance change uses the same daily rounding as actual payroll.
 snap:=jsonb_set(snap,'{packages}',snap->'packages'||jsonb_build_array(jsonb_set(snap#>'{packages,0}','{components,0,amount}','"2000"')||jsonb_build_object('id','pay-two','effective_from','2026-06-18')));
 result:=private.calculate_payroll_gross_v1(snap);reqs:=private.payroll_reimbursement_requirements(snap);
 select round(sum(case when l->>'rounding'='employee_total_half_up' then (l->>'unrounded')::numeric else (l->>'amount')::numeric end),2) into expected from jsonb_array_elements(result#>'{employees,0,lines}') l where l#>>'{component,category}'='reimbursable_allowance';
 if (reqs#>>'{0,requiredAmount}')::numeric<>expected or expected<>766.67 then raise exception 'Dated/prorated allowance differs from actual rounded payroll lines: % vs %',reqs,expected;end if;
 if has_function_privilege('anon','public.get_payroll_reimbursement_workspace(uuid)','execute') or has_table_privilege('authenticated','private.payroll_reimbursement_evidence','select') then raise exception 'Evidence permissions expanded';end if;
end $$;
select 'PASS: actual production engine, semi-monthly required amount, mid-cutoff allowance change and daily rounding, private evidence ACL; synthetic inputs only' result;
rollback;
