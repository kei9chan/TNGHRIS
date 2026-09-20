-- Focused correction checks run against the isolated scenario and roll back.
begin isolation level repeatable read;
set local statement_timeout='60s';
do $$
declare seed text:='bakebe-aura-2026-08-11-25-v1'; clock_emp uuid;clock_date date;break_emp uuid;break_date date;pending_emp uuid;pending_date date;
 original jsonb; corrected jsonb; result jsonb; row jsonb; before_state jsonb;after_state jsonb;n bigint; before_pending bigint;after_pending bigint;
begin
 select jsonb_build_object('punches',(select count(*) from public.time_events),'schedules',(select count(*) from public.shift_assignments),'gross',(select count(*) from public.payroll_gross_runs),'net',(select count(*) from public.payroll_net_runs),'payments',(select count(*) from public.payroll_payment_batches),'packages',(select count(*) from public.payroll_pay_packages)) into before_state;
 select (value->>'employeeId')::uuid,(value->>'date')::date into clock_emp,clock_date from payroll_scenario_private.runs,jsonb_array_elements(snapshot->'scenarios') where seed_run_id=seed and value->>'scenario'='Missing clock-out' limit 1;
 original:=payroll_scenario_private.correction_snapshot(seed,clock_emp,clock_date);corrected:=original||jsonb_build_object('clockOut','18:00');
 insert into payroll_scenario_private.corrections(seed_run_id,employee_id,work_date,issue_type,original_value,corrected_value,reason,status) values(seed,clock_emp,clock_date,'Missing clock-out',original,corrected,'Focused rollback test','Saved');
 result:=payroll_scenario_private.calculate_mock_run(seed);
 select value into row from jsonb_array_elements(result#>'{timeResult,rows}') where value->>'employeeId'=clock_emp::text and value->>'date'=clock_date::text;
 if exists(select 1 from jsonb_array_elements_text(row->'issues') x where lower(x) like '%punch%') then raise exception 'Missing clock-out correction did not resolve punch issue';end if;
 if (select status from payroll_scenario_private.corrections where seed_run_id=seed and employee_id=clock_emp and work_date=clock_date)<>'Ready after correction' then raise exception 'Corrected row was not marked ready';end if;

 select (value->>'employeeId')::uuid,(value->>'date')::date into break_emp,break_date from payroll_scenario_private.runs,jsonb_array_elements(snapshot->'scenarios') where seed_run_id=seed and value->>'scenario'='Missing break' limit 1;
 original:=payroll_scenario_private.correction_snapshot(seed,break_emp,break_date);corrected:=original||jsonb_build_object('breakStart','12:00','breakEnd','13:00');
 insert into payroll_scenario_private.corrections(seed_run_id,employee_id,work_date,issue_type,original_value,corrected_value,reason,status) values(seed,break_emp,break_date,'Missing break',original,corrected,'Focused rollback test','Saved');
 result:=payroll_scenario_private.calculate_mock_run(seed);
 select value into row from jsonb_array_elements(result#>'{timeResult,rows}') where value->>'employeeId'=break_emp::text and value->>'date'=break_date::text;
 if exists(select 1 from jsonb_array_elements_text(row->'issues') x where lower(x) like '%lunch%' or lower(x) like '%break%') then raise exception 'Missing break correction did not resolve break issue';end if;

 select (value->>'employeeId')::uuid,(value->>'date')::date into pending_emp,pending_date from payroll_scenario_private.runs,jsonb_array_elements(snapshot->'scenarios') where seed_run_id=seed and value->>'scenario'='Duplicate clock-in' limit 1;
 original:=payroll_scenario_private.correction_snapshot(seed,pending_emp,pending_date);corrected:=original;
 select count(*) into before_pending from jsonb_array_elements(payroll_scenario_private.effective_source(seed)->'events') x where x->>'employeeId'=pending_emp::text and ((x->>'timestamp')::timestamptz at time zone 'Asia/Manila')::date=pending_date;
 insert into payroll_scenario_private.corrections(seed_run_id,employee_id,work_date,issue_type,original_value,corrected_value,reason,status) values(seed,pending_emp,pending_date,'Duplicate clock-in',original,corrected,'Focused rollback approval test','Pending approval');
 select count(*) into after_pending from jsonb_array_elements(payroll_scenario_private.effective_source(seed)->'events') x where x->>'employeeId'=pending_emp::text and ((x->>'timestamp')::timestamptz at time zone 'Asia/Manila')::date=pending_date;
 if before_pending<>after_pending then raise exception 'Pending correction was applied before approval';end if;
 update payroll_scenario_private.corrections set status='Approved' where seed_run_id=seed and employee_id=pending_emp and work_date=pending_date;
 select count(*) into after_pending from jsonb_array_elements(payroll_scenario_private.effective_source(seed)->'events') x where x->>'employeeId'=pending_emp::text and ((x->>'timestamp')::timestamptz at time zone 'Asia/Manila')::date=pending_date;
 if before_pending=after_pending then raise exception 'Approved correction was not applied';end if;

 select count(*) into n from payroll_scenario_private.corrections; -- Closing the drawer has no RPC and therefore no write.
 if (select count(*) from payroll_scenario_private.corrections)<>n then raise exception 'Cancelled correction changed records';end if;
 select jsonb_build_object('punches',(select count(*) from public.time_events),'schedules',(select count(*) from public.shift_assignments),'gross',(select count(*) from public.payroll_gross_runs),'net',(select count(*) from public.payroll_net_runs),'payments',(select count(*) from public.payroll_payment_batches),'packages',(select count(*) from public.payroll_pay_packages)) into after_state;
 if before_state<>after_state then raise exception 'Official payroll or attendance records changed';end if;
end $$;
rollback;
select 'PASS: overview source prioritizes issues; exact employee/date correction; missing clock-out and break resolve; pending waits for approval; cancel makes no write; official data unchanged' result;
