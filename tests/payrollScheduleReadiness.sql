-- Production read-only checks against the installed interpreter. No source writes.
begin read only;
set local statement_timeout='30s';
do $test$
declare base jsonb;src jsonb;r jsonb;bad boolean;begin
base:='{"employees":[{"id":"person","name":"Boundary example","hireDate":"2026-01-01","status":"Active","managerId":"manager"}],"shifts":[{"id":"shift","employeeId":"person","date":"2026-08-17","templateId":"day","start":"09:00","end":"18:00","breakMinutes":60}],"events":[{"id":"in","employeeId":"person","timestamp":"2026-08-17T09:00:00+08:00","type":"CLOCK_IN"},{"id":"bs","employeeId":"person","timestamp":"2026-08-17T13:00:00+08:00","type":"START_BREAK"},{"id":"be","employeeId":"person","timestamp":"2026-08-17T14:00:00+08:00","type":"END_BREAK"},{"id":"out","employeeId":"person","timestamp":"2026-08-17T18:00:00+08:00","type":"CLOCK_OUT"}],"leave":[],"ot":[],"wfh":[],"holidays":[],"leavePolicies":[],"rules":[{"id":"rule","revision":1,"effective_from":"2026-08-01","effective_to":"2026-08-31","config":{"holidayCoverageConfirmed":true,"splitShiftConfirmed":true,"restTemplates":["off"],"meals":{"day":"13:00"}}}]}'::jsonb;

base:=jsonb_set(base,'{shifts,0}',(base#>'{shifts,0}')||'{"kind":"work","published":true,"endDayOffset":0}')||'{"scheduleDays":[{"employeeId":"person","date":"2026-08-17","status":"published"}]}';
r:=private.interpret_payroll_time(base,'2026-08-17','2026-08-17')#>'{rows,0}';
if not(r->>'ready')::boolean or (r->>'scheduledMinutes')::numeric<>480 or (r->>'regularMinutes')::numeric<>480 or (r->>'breakMinutes')::numeric<>60 then raise exception 'Normal: %',r;end if;
src:=jsonb_set(base,'{events,0,timestamp}','"2026-08-17T09:06:00+08:00"');r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';
if not(r->>'ready')::boolean or (r->>'lateMinutes')::numeric<>1 or (r->>'actualMinutes')::numeric<>474 then raise exception 'Five-minute grace: %',r;end if;
src:=base||'{"shifts":[{"id":"night","employeeId":"person","date":"2026-08-17","templateId":"night","start":"17:00","end":"02:00","endDayOffset":1,"kind":"work","published":true,"breakMinutes":60}],"events":[{"id":"in","employeeId":"person","timestamp":"2026-08-17T17:00:00+08:00","type":"CLOCK_IN"},{"id":"bs","employeeId":"person","timestamp":"2026-08-17T22:00:00+08:00","type":"START_BREAK"},{"id":"be","employeeId":"person","timestamp":"2026-08-17T23:00:00+08:00","type":"END_BREAK"},{"id":"out","employeeId":"person","timestamp":"2026-08-18T02:00:00+08:00","type":"CLOCK_OUT"}]}';
r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';
if not(r->>'ready')::boolean or (r->>'regularMinutes')::numeric<>480 or jsonb_array_length(r->'segments')<>2 then raise exception 'Overnight: %',r;end if;
src:=jsonb_set(src,'{shifts,0,endDayOffset}','0');r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';if (r->>'ready')::boolean then raise exception 'Unconfirmed overnight accepted';end if;
src:=jsonb_set(base,'{shifts,0}',(base#>'{shifts,0}')||'{"flexible":true,"paidMinutes":480,"start":"00:00","end":"00:00"}');
r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';
if not(r->>'ready')::boolean or (r->>'regularMinutes')::numeric<>480 or (r->>'lateMinutes')::numeric<>0 then raise exception 'Flexible: %',r;end if;
src:=src#-'{shifts,0,paidMinutes}';r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';if (r->>'ready')::boolean then raise exception 'Flexible without paid hours accepted';end if;
src:=jsonb_set(base,'{shifts,0}',(base#>'{shifts,0}')||'{"kind":"rest","start":"00:00","end":"00:00","breakMinutes":0}')||'{"events":[]}';
r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';
if not(r->>'ready')::boolean or r->>'scheduleState'<>'Rest Day' or (r->>'scheduledMinutes')::numeric<>0 then raise exception 'Rest day: %',r;end if;
src:=jsonb_set(src,'{shifts,0,kind}','"no_schedule"');r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';
if not(r->>'ready')::boolean or r->>'scheduleState'<>'Leave / No Schedule' then raise exception 'Explicit no schedule: %',r;end if;
src:=src||'{"leave":[{"id":"leave","employeeId":"person","startDate":"2026-08-17","endDate":"2026-08-17","status":"Approved","paid":false}]}';
r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';if (r->>'ready')::boolean then raise exception 'Leave valuation without planned hours accepted';end if;
src:=jsonb_set(src,'{shifts,0,paidMinutes}','480');r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';if not(r->>'ready')::boolean or (r->>'scheduledMinutes')::numeric<>480 then raise exception 'Leave planned hours: %',r;end if;
src:=base||'{"shifts":[],"events":[],"scheduleDays":[{"employeeId":"person","date":"2026-08-17","status":"missing"}]}';r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';
if (r->>'ready')::boolean or r->>'scheduleState'<>'Missing Schedule' or not(r->'issues' ? 'Missing Schedule — do not mark absent') then raise exception 'Missing schedule: %',r;end if;
src:=jsonb_set(base,'{scheduleDays,0,status}','"unpublished"');r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';if (r->>'ready')::boolean then raise exception 'Unpublished schedule accepted';end if;
src:=jsonb_set(base,'{shifts,0,published}','false');r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';if (r->>'ready')::boolean then raise exception 'Unpublished row bypass accepted';end if;
-- Existing OT precision and worked-lunch approvals still apply.
src:=jsonb_set(base,'{events,3,timestamp}','"2026-08-17T19:15:00+08:00"')||'{"ot":[{"id":"ot","employeeId":"person","date":"2026-08-17","start":"18:00","end":"19:15","approvedHours":1.25,"status":"Approved","type":"Paid"}]}';
r:=private.interpret_payroll_time(src,'2026-08-17','2026-08-17')#>'{rows,0}';if not(r->>'ready')::boolean or (r->>'actualOtMinutes')::numeric<>75 then raise exception 'Existing OT precision: %',r;end if;
bad:=false;begin perform private.payroll_schedule_validate((base#>'{shifts,0}')||'{"end":"08:00","endDayOffset":null}');exception when raise_exception then bad:=true;end;if not bad then raise exception 'Publication validator accepted overnight without confirmation';end if;
end $test$;
select 'PASS: normal 8 paid hours; 5-minute grace; overnight next-day boundary; flexible paid-hours requirement; rest day; explicit no schedule/leave valuation; missing/unpublished denial; existing 75-minute OT.' as result;
rollback;
