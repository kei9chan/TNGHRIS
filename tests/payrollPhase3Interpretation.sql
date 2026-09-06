-- Pure interpreter assertions; no source rows or test employees are created.
begin read only;
do $test$
declare base jsonb;src jsonb;r jsonb;begin
base:='{"employees":[{"id":"person","name":"Boundary example","hireDate":"2026-01-01","status":"Active","managerId":"manager"}],"shifts":[{"id":"shift","employeeId":"person","date":"2026-08-17","templateId":"day","start":"09:00","end":"18:00","breakMinutes":60}],"events":[{"id":"in","employeeId":"person","timestamp":"2026-08-17T09:00:00+08:00","type":"CLOCK_IN"},{"id":"bs","employeeId":"person","timestamp":"2026-08-17T13:00:00+08:00","type":"START_BREAK"},{"id":"be","employeeId":"person","timestamp":"2026-08-17T14:00:00+08:00","type":"END_BREAK"},{"id":"out","employeeId":"person","timestamp":"2026-08-17T18:00:00+08:00","type":"CLOCK_OUT"}],"leave":[],"ot":[],"wfh":[],"holidays":[],"leavePolicies":[],"rules":[{"id":"rule","revision":1,"effective_from":"2026-08-01","effective_to":"2026-08-31","config":{"holidayCoverageConfirmed":true,"splitShiftConfirmed":true,"restTemplates":["off"],"meals":{"day":"13:00"}}}]}'::jsonb;
r:=private.interpret_payroll_time(base,'2026-08-17','2026-08-17')#>'{rows,0}';
if not(r->>'ready')::boolean or (r->>'actualMinutes')::numeric<>480 or (r->>'scheduledMinutes')::numeric<>480 then raise exception 'Normal day failed: %',r;end if;
src:=jsonb_set(base,'{events,0,timestamp}','"2026-08-17T09:06:00+08:00"');
r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';
if (r->>'lateMinutes')::numeric<>1 or (r->>'actualMinutes')::numeric<>474 then raise exception 'Grace must be excluded, without inventing worked minutes: %',r;end if;
src:=jsonb_set(base,'{events,3,timestamp}','"2026-08-17T19:15:00+08:00"')||'{"ot":[{"id":"ot","employeeId":"person","date":"2026-08-17","start":"18:00","end":"19:15","approvedHours":1.25,"status":"Approved","type":"Paid"}]}'::jsonb;
r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';
if not(r->>'ready')::boolean or (r->>'actualOtMinutes')::numeric<>75 or (r->>'approvedOtMinutes')::numeric<>75 then raise exception '75-minute OT changed or rejected: %',r;end if;
src:=jsonb_set(src,'{ot,0,approvedHours}','1');r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';
if (r->>'ready')::boolean or (r->>'actualOtMinutes')::numeric<>75 then raise exception 'Actual/approved mismatch must block and preserve 75: %',r;end if;
src:=base||'{"shifts":[]}'::jsonb;r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';
if (r->>'ready')::boolean or not(r->'issues' ? 'Schedule missing — do not mark absent') then raise exception 'Missing schedule silently accepted: %',r;end if;
src:=base#-'{events,3}';r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';
if (r->>'ready')::boolean then raise exception 'Missing clock-out accepted';end if;
src:=jsonb_set(base,'{events}',(base->'events')||jsonb_build_array(base#>'{events,0}'));r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';
if (r->>'ready')::boolean or not(r->'issues' ? 'Duplicate or unpaired clock-in') then raise exception 'Duplicate clock-in accepted';end if;
src:=base||'{"shifts":[{"id":"night","employeeId":"person","date":"2026-08-17","templateId":"night","start":"22:00","end":"07:00","breakMinutes":60}],"events":[{"id":"in","employeeId":"person","timestamp":"2026-08-17T22:00:00+08:00","type":"CLOCK_IN"},{"id":"bs","employeeId":"person","timestamp":"2026-08-18T02:00:00+08:00","type":"START_BREAK"},{"id":"be","employeeId":"person","timestamp":"2026-08-18T03:00:00+08:00","type":"END_BREAK"},{"id":"out","employeeId":"person","timestamp":"2026-08-18T07:00:00+08:00","type":"CLOCK_OUT"}],"holidays":[{"date":"2026-08-18","kind":"regular"}]}'::jsonb;
r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';
if not(r->>'ready')::boolean or (r->>'actualMinutes')::numeric<>480 or jsonb_array_length(r->'segments')<>2 then raise exception 'Overnight holiday boundary failed: %',r;end if;
src:=base||'{"shifts":[{"id":"first","employeeId":"person","date":"2026-08-17","templateId":"am","start":"09:00","end":"13:00","breakMinutes":0},{"id":"second","employeeId":"person","date":"2026-08-17","templateId":"pm","start":"14:00","end":"18:00","breakMinutes":0}],"events":[{"id":"a","employeeId":"person","timestamp":"2026-08-17T09:00:00+08:00","type":"CLOCK_IN"},{"id":"b","employeeId":"person","timestamp":"2026-08-17T13:00:00+08:00","type":"CLOCK_OUT"},{"id":"c","employeeId":"person","timestamp":"2026-08-17T14:00:00+08:00","type":"CLOCK_IN"},{"id":"d","employeeId":"person","timestamp":"2026-08-17T18:00:00+08:00","type":"CLOCK_OUT"}]}'::jsonb;
r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';
if not(r->>'ready')::boolean or (r->>'scheduledMinutes')::numeric<>480 or (r->>'actualMinutes')::numeric<>480 then raise exception 'Split shift double-deducted break: %',r;end if;
src:=jsonb_set(base,'{events}',jsonb_build_array(base#>'{events,0}',base#>'{events,3}'))||'{"ot":[{"id":"lunch","employeeId":"person","date":"2026-08-17","start":"13:00","end":"14:00","approvedHours":1,"status":"Approved","type":"Paid","approvedBy":"manager","directManagerId":"manager"}]}'::jsonb;
r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';
if not(r->>'ready')::boolean or not(r->>'workedLunch')::boolean or (r->>'regularMinutes')::numeric<>480 or (r->>'actualOtMinutes')::numeric<>60 then raise exception 'Worked lunch with direct manager approval failed: %',r;end if;
src:=jsonb_set(src,'{ot,0,approvedBy}','"other"');r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';
if (r->>'ready')::boolean then raise exception 'Worked lunch bypassed direct manager';end if;
src:=base||'{"events":[],"leave":[{"id":"leave","employeeId":"person","startDate":"2026-08-17","endDate":"2026-08-17","status":"Approved","paid":false}]}'::jsonb;
r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';if not(r->>'ready')::boolean or not(r->>'approvedFullLeave')::boolean then raise exception 'Approved full-day unpaid leave failed: %',r;end if;
src:=jsonb_set(src,'{leave,0,paid}','true');r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';if (r->>'ready')::boolean then raise exception 'Paid leave without reconciled accrual accepted';end if;
perform set_config('payroll_phase3.result','PASS: normal day, excluded grace, exact 75-minute OT, actual/approved mismatch, missing schedule/punch, duplicate punch, overnight holiday boundary, split-shift lunch, direct-manager worked lunch and leave readiness',true);
end $test$;
select current_setting('payroll_phase3.result') as result;
rollback;
