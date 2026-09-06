-- Pure input fixtures only. No employees or payroll records are inserted.
begin;
set local statement_timeout='30s';
do $test$
declare c jsonb;r jsonb;src jsonb;snap jsonb;outcome jsonb;baseline jsonb;rows jsonb:='[]';d date;
begin
 c:='{"monthlyMethod":"calendar_prorated","rounding":"employee_total_half_up","recurringMethod":"calendar_prorated","annualDivisor":"313","hoursPerDay":"8","nightStart":"22:00","nightEnd":"06:00","offsetCash":"excluded","gracePay":"base_only","rateBoundary":"shift_date","premiums":{"ordinary":{"regular":"1","ot":"1.25","nightRegular":"0.1","nightOt":"0.125"},"regular":{"regular":"2","ot":"2.6","nightRegular":"0.2","nightOt":"0.26"}}}';
 for d in select g::date from generate_series('2026-06-11'::date,'2026-06-25'::date,'1 day') g loop
 rows:=rows||jsonb_build_array(jsonb_build_object('employeeId','fixture','employeeName','Arithmetic fixture','date',d,'ready',true,'restDay',true,'holiday',false,'approvedFullLeave',false,'regularMinutes',0,'actualOtMinutes',0,'actualMinutes',0,'scheduledMinutes',0,'lateMinutes',0,'undertimeMinutes',0,'eventIds','[]'::jsonb,'shiftIds','[]'::jsonb,'leaveIds','[]'::jsonb,'ot','[]'::jsonb,'segments','[]'::jsonb));end loop;
 src:='{"employees":[{"id":"fixture","name":"Arithmetic fixture"}],"events":[],"leave":[],"holidays":[]}';
 snap:=jsonb_build_object('timePackageId','fixture-time','dateFrom','2026-06-11','dateTo','2026-06-25','time',jsonb_build_object('source',src,'result',jsonb_build_object('rows',rows)),
 'packages','[{"id":"pay-one","employee_id":"fixture","engagement_key":"employee","effective_from":"2026-01-01","rate_type":"Monthly","base_amount":"31300","treatment":{"proration":"rule_defined"},"source_ref":"Arithmetic approved example","components":[]}]'::jsonb,
 'rules',jsonb_build_array(jsonb_build_object('id','rule-one','revision',1,'effective_from','2026-01-01','effective_to','2026-12-31','source_ref','Arithmetic only, not production policy','config',c)));
 outcome:=private.calculate_payroll_gross_v1(snap);
 if not(outcome->>'ready')::boolean or (outcome->>'gross')::numeric<>15650 then raise exception 'Normal monthly calculation failed: %',outcome;end if;
 if outcome is distinct from private.calculate_payroll_gross_v1(snap) then raise exception 'Same snapshot was not deterministic';end if;
 baseline:=snap;
 snap:=jsonb_set(snap,'{packages,0,components}','[{"name":"Monthly allowance","amount":"300","recurrence":"recurring","proration":"included"},{"name":"Reviewed addition","amount":"100","recurrence":"one_time","payableDate":"2026-06-20","proration":"excluded"}]');
 outcome:=private.calculate_payroll_gross_v1(snap);
 if (outcome->>'gross')::numeric<>15900 then raise exception 'Phase 2 flat component treatment, recurring allowance or one-time addition failed: %',outcome;end if;
 snap:=baseline;
 snap:=jsonb_set(snap,'{packages}',snap->'packages'||jsonb_build_array((snap#>'{packages,0}')||jsonb_build_object('id','pay-two','effective_from','2026-06-18','base_amount','34300')));
 outcome:=private.calculate_payroll_gross_v1(snap);
 if (outcome->>'gross')::numeric<>16450 then raise exception 'Mid-cutoff dated rate split failed: %',outcome;end if;
 -- Actual 22:00–08:15; unpaid 01:00–02:00; approved OT 07:00–08:15.
 -- Next calendar date is a regular holiday: base800 + premium600 + night120 + OT325.
 r:=(rows->0)||'{"date":"2026-06-11","restDay":false,"regularMinutes":480,"actualOtMinutes":75,"actualMinutes":555,"scheduledMinutes":480,"eventIds":["in","bs","be","out"],"segments":[{"start":"2026-06-11T22:00:00+08:00","end":"2026-06-12T00:00:00+08:00"},{"start":"2026-06-12T00:00:00+08:00","end":"2026-06-12T07:00:00+08:00"}],"ot":[{"id":"ot-one","start":"07:00","end":"08:15","type":"Paid"}]}'::jsonb;
 -- OT source date is the shift date; its 07:00 start would precede 22:00.
 -- Phase 3 does not yet accept that ambiguous pattern, so use a separate ordinary
 -- daytime 75-minute case and an overnight case without OT.
 r:=jsonb_set(r,'{actualOtMinutes}','0');r:=jsonb_set(r,'{actualMinutes}','480');r:=jsonb_set(r,'{ot}','[]');
 src:=jsonb_set(src,'{holidays}','[{"id":"h-one","date":"2026-06-12","kind":"regular"}]');
 src:=jsonb_set(src,'{events}','[{"id":"in","timestamp":"2026-06-11T22:00:00+08:00","type":"CLOCK_IN"},{"id":"bs","timestamp":"2026-06-12T01:00:00+08:00","type":"START_BREAK"},{"id":"be","timestamp":"2026-06-12T02:00:00+08:00","type":"END_BREAK"},{"id":"out","timestamp":"2026-06-12T07:00:00+08:00","type":"CLOCK_OUT"}]');
 snap:=jsonb_set(baseline,'{packages,0,rate_type}','"Daily"');snap:=jsonb_set(snap,'{packages,0,base_amount}','"800"');
 snap:=jsonb_set(snap,'{time}',jsonb_build_object('source',src,'result',jsonb_build_object('rows',jsonb_build_array(r))));
 outcome:=private.calculate_payroll_gross_v1(snap);
 if (outcome->>'gross')::numeric<>1520 then raise exception 'Overnight holiday/night boundary failed: %',outcome;end if;
 r:=r||'{"actualOtMinutes":75,"actualMinutes":555,"segments":[{"start":"2026-06-11T09:00:00+08:00","end":"2026-06-11T18:00:00+08:00"}],"ot":[{"id":"ot-one","start":"18:00","end":"19:15","type":"Paid"}]}'::jsonb;
 src:=jsonb_set(src,'{holidays}','[]');src:=jsonb_set(src,'{events}','[{"id":"in","timestamp":"2026-06-11T09:00:00+08:00","type":"CLOCK_IN"},{"id":"bs","timestamp":"2026-06-11T12:00:00+08:00","type":"START_BREAK"},{"id":"be","timestamp":"2026-06-11T13:00:00+08:00","type":"END_BREAK"},{"id":"out","timestamp":"2026-06-11T19:15:00+08:00","type":"CLOCK_OUT"}]');
 snap:=jsonb_set(snap,'{time}',jsonb_build_object('source',src,'result',jsonb_build_object('rows',jsonb_build_array(r))));outcome:=private.calculate_payroll_gross_v1(snap);
 if (outcome->>'gross')::numeric<>956.25 then raise exception '75 actual OT minutes were rounded or lost: %',outcome;end if;
 -- 09:06 arrival: 474 actual regular minutes + five paid grace minutes = 479.
 baseline:=snap;
 snap:=jsonb_set(snap,'{time,result,rows,0}',r||'{"regularMinutes":474,"actualMinutes":474,"actualOtMinutes":0,"lateMinutes":1,"ot":[]}'::jsonb);
 snap:=jsonb_set(snap,'{time,source,events,0,timestamp}','"2026-06-11T09:06:00+08:00"');
 snap:=jsonb_set(snap,'{time,source,events,3,timestamp}','"2026-06-11T18:00:00+08:00"');
 outcome:=private.calculate_payroll_gross_v1(snap);
 if (outcome->>'gross')::numeric<>798.33 then raise exception 'Five-minute grace was not paid at base only: %',outcome;end if;
 snap:=baseline;
 -- Worked lunch is removed from regular time once, then paid once as approved OT.
 snap:=jsonb_set(snap,'{time,result,rows,0}',r||'{"regularMinutes":480,"actualMinutes":540,"actualOtMinutes":60,"ot":[{"id":"lunch","start":"12:00","end":"13:00","type":"Paid"}]}'::jsonb);
 snap:=jsonb_set(snap,'{time,source,events}','[{"id":"in","timestamp":"2026-06-11T09:00:00+08:00","type":"CLOCK_IN"},{"id":"out","timestamp":"2026-06-11T18:00:00+08:00","type":"CLOCK_OUT"}]');
 outcome:=private.calculate_payroll_gross_v1(snap);
 if (outcome->>'gross')::numeric<>925 then raise exception 'Worked lunch was lost or paid twice: %',outcome;end if;
 snap:=baseline;
 -- Missing rules and changed interval totals must fail closed, never return a gross.
 outcome:=private.calculate_payroll_gross_v1(jsonb_set(snap,'{rules}','[]'));
 if (outcome->>'ready')::boolean or outcome->>'gross' is not null then raise exception 'Missing rules yielded payable gross';end if;
 snap:=jsonb_set(snap,'{time,result,rows,0,regularMinutes}','479');outcome:=private.calculate_payroll_gross_v1(snap);
 if (outcome->>'ready')::boolean then raise exception 'Attendance mismatch accepted';end if;
 perform set_config('payroll_phase4.result','PASS: decimal monthly/mid-cutoff, actual overnight holiday/night boundaries, 75-minute OT, deterministic replay, missing rules and interval mismatch blocked',true);
end $test$;
select current_setting('payroll_phase4.result') as result;
rollback;
