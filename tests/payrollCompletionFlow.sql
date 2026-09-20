begin isolation level repeatable read;
set local statement_timeout='90s';
do $$
declare
 seed text:='bakebe-aura-2026-08-11-25-v1'; run payroll_scenario_private.runs; row jsonb; original jsonb;
 kay uuid; hr_manager uuid; finance uuid; employee_auth uuid; recipient_id uuid; own_output uuid; foreign_output uuid;
 state jsonb; before_state jsonb; after_state jsonb; payslips integer; reports integer; denied boolean; before_outputs integer;
begin
 select * into strict run from payroll_scenario_private.runs where seed_run_id=seed;
 select auth_user_id into strict kay from public.hris_users where lower(email)='kay@thenextperience.com';
 select auth_user_id into strict hr_manager from public.hris_users where lower(email)='hrs@thenextperience.com';
 select auth_user_id into strict finance from public.hris_users where lower(email)='financehead@thenextperience.com';
 select jsonb_build_object('officialPayslips',(select count(*) from public.payroll_released_payslips),'payments',(select count(*) from public.payroll_disbursements),'gross',(select count(*) from public.payroll_gross_runs),'net',(select count(*) from public.payroll_net_runs),'events',(select count(*) from public.time_events)) into before_state;

 -- Complete each seeded attendance exception only inside the isolated test schema.
 for row in select value from jsonb_array_elements(run.snapshot#>'{demo,timeResult,rows}') where jsonb_array_length(coalesce(value->'issues','[]'::jsonb))>0 loop
  original:=payroll_scenario_private.correction_snapshot(seed,(row->>'employeeId')::uuid,(row->>'date')::date);
  insert into payroll_scenario_private.corrections(seed_run_id,employee_id,work_date,issue_type,original_value,corrected_value,reason,status)
  values(seed,(row->>'employeeId')::uuid,(row->>'date')::date,'Focused completion test',original,original,'Focused completion test','Ready after correction')
  on conflict(seed_run_id,employee_id,work_date) do update set status='Ready after correction';
 end loop;
 if payroll_scenario_private.unresolved_count(seed)<>0 then raise exception 'Completed test payroll still reports unresolved items';end if;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',kay,'role','authenticated')::text,true);
 state:=public.generate_test_payroll_outputs(run.scope_id,run.date_from,run.date_to);
 payslips:=jsonb_array_length(state->'payslips');reports:=jsonb_array_length(state->'governmentReports');
 if payslips<>jsonb_array_length(run.snapshot->'employees') or reports<>4 then raise exception 'Required outputs were not generated';end if;
 if state#>>'{payslips,0,payload,employeeName}' is null or state#>>'{governmentReports,0,payload,submissionStatus}' not like '%not submitted%' then raise exception 'Payslip/report preview payload is incomplete';end if;
 before_outputs:=(select count(*) from payroll_scenario_private.outputs where seed_run_id=seed);

 denied:=false;begin perform public.release_test_payroll_outputs(run.scope_id,run.date_from,run.date_to);exception when others then denied:=true;end;
 if not denied then raise exception 'Release was allowed before approvals';end if;

 -- A failed report retry reuses its stable key and cannot create a duplicate.
 update payroll_scenario_private.outputs set status='Failed',error_message='Focused retry test' where seed_run_id=seed and report_code='SSS_R3';
 update payroll_scenario_private.output_batches set status='Failed',failure_message='Focused retry test' where seed_run_id=seed;
 state:=public.generate_test_payroll_outputs(run.scope_id,run.date_from,run.date_to);
 if (select count(*) from payroll_scenario_private.outputs where seed_run_id=seed)<>before_outputs or state#>>'{batch,status}'<>'Ready' then raise exception 'Retry duplicated outputs or failed to recover';end if;
 state:=public.start_test_payroll_approval(run.scope_id,run.date_from,run.date_to);

 perform set_config('request.jwt.claims',jsonb_build_object('sub',hr_manager,'role','authenticated')::text,true);
 perform public.act_test_payroll_completion(run.scope_id,run.date_from,run.date_to,1,'approve','Focused HR validation');
 perform public.act_test_payroll_completion(run.scope_id,run.date_from,run.date_to,2,'approve','Focused HR endorsement');
 perform public.act_test_payroll_completion(run.scope_id,run.date_from,run.date_to,3,'approve','Focused HR Manager authorization');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',finance,'role','authenticated')::text,true);
 perform public.act_test_payroll_completion(run.scope_id,run.date_from,run.date_to,4,'approve','Focused Finance authorization');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',kay,'role','authenticated')::text,true);
 perform public.act_test_payroll_completion(run.scope_id,run.date_from,run.date_to,5,'approve','Focused BOD final approval');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',finance,'role','authenticated')::text,true);
 state:=public.act_test_payroll_completion(run.scope_id,run.date_from,run.date_to,6,'approve','Focused Finance disbursement confirmation');
 if state->>'canRelease'<>'true' then raise exception 'Release did not become available after final approval and payment-release stage';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',kay,'role','authenticated')::text,true);
 state:=public.release_test_payroll_outputs(run.scope_id,run.date_from,run.date_to);
 if state#>>'{batch,status}'<>'Released' then raise exception 'Test outputs were not released';end if;

 select h.auth_user_id,h.id,o.id into employee_auth,recipient_id,own_output from payroll_scenario_private.outputs o join public.hris_users h on h.id=o.employee_id where o.seed_run_id=seed and o.output_type='payslip' and h.auth_user_id is not null limit 1;
 select o.id into foreign_output from payroll_scenario_private.outputs o where o.seed_run_id=seed and o.output_type='payslip' and o.employee_id<>recipient_id limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',employee_auth,'role','authenticated')::text,true);
 if jsonb_array_length(public.list_my_released_test_payslips())<>1 then raise exception 'Employee did not receive exactly their own released test payslip';end if;
 if public.get_my_released_test_payslip(own_output)->>'employeeName' is null then raise exception 'Own released test payslip is unavailable';end if;
 denied:=false;begin perform public.get_my_released_test_payslip(foreign_output);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Employee accessed another employee payslip';end if;

 select jsonb_build_object('officialPayslips',(select count(*) from public.payroll_released_payslips),'payments',(select count(*) from public.payroll_disbursements),'gross',(select count(*) from public.payroll_gross_runs),'net',(select count(*) from public.payroll_net_runs),'events',(select count(*) from public.time_events)) into after_state;
 if before_state<>after_state then raise exception 'Isolated completion flow changed official payroll or attendance data';end if;
end $$;
rollback;
select 'PASS: generated and previewed payslip/report; pre-approval release blocked; final release enabled; employee-only access enforced; retry idempotent; official data unchanged' result;
