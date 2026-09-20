-- Focused checks against the isolated seeded run. All test changes roll back.
begin isolation level repeatable read;
set local statement_timeout='45s';
do $$
declare d jsonb;again jsonb;n bigint;before_state jsonb;after_state jsonb;e jsonb;row jsonb;scenario jsonb;
begin
 select jsonb_build_object('punches',(select count(*) from public.time_events),'schedules',(select count(*) from public.shift_assignments),'gross',(select count(*) from public.payroll_gross_runs),'net',(select count(*) from public.payroll_net_runs),'payments',(select count(*) from public.payroll_payment_batches),'packages',(select count(*) from public.payroll_pay_packages),'mode',(select processing_mode from public.payroll_access_scopes where id=(select scope_id from payroll_scenario_private.runs where seed_run_id='bakebe-aura-2026-08-11-25-v1'))) into before_state;
 delete from payroll_scenario_private.calculations where seed_run_id='bakebe-aura-2026-08-11-25-v1';
 d:=payroll_scenario_private.calculate_mock_run('bakebe-aura-2026-08-11-25-v1');
 if d#>>'{comparisonNet,ready}'<>'true' or jsonb_array_length(d#>'{comparisonNet,employees}')<>8 then raise exception 'All eight comparison employees must calculate';end if;
 if (d#>>'{comparisonNet,gross}')::numeric-(d#>>'{comparisonNet,deductions}')::numeric<>(d#>>'{comparisonNet,net}')::numeric then raise exception 'Totals do not reconcile';end if;
 for e in select value from jsonb_array_elements(d#>'{comparisonNet,employees}') loop
 if (e->>'gross')::numeric-(e->>'deductions')::numeric<>(e->>'net')::numeric then raise exception 'Employee amounts do not reconcile';end if;
 if e->>'payBasis'='net_tax' and ((e->>'gross')::numeric-(e->>'tax')::numeric<>20000 or (e->>'mandatory')::numeric<=0) then raise exception 'Tax-only guarantee must retain employee contributions';end if;
 end loop;
 for scenario in select value from payroll_scenario_private.runs,jsonb_array_elements(snapshot->'scenarios') where seed_run_id='bakebe-aura-2026-08-11-25-v1' loop
 select value into row from jsonb_array_elements(d#>'{timeResult,rows}') where value->>'employeeId'=scenario->>'employeeId' and value->>'date'=scenario->>'date';
 if scenario->>'scenario'='09:05 grace boundary' and (row->>'lateMinutes')::numeric<>0 then raise exception 'Grace boundary';end if;
 if scenario->>'scenario'='09:06 one minute late' and (row->>'lateMinutes')::numeric<>1 then raise exception 'One-minute late boundary';end if;
 if scenario->>'scenario'='09:20 late arrival' and (row->>'lateMinutes')::numeric<>15 then raise exception 'Twenty-minute arrival boundary';end if;
 if scenario->>'scenario'='Undertime' and (row->>'undertimeMinutes')::numeric<>120 then raise exception 'Undertime calculation';end if;
 if scenario->>'scenario' in ('Missing clock-out','Unapproved overtime','Missing schedule','Duplicate clock-in') and coalesce((row->>'ready')::boolean,true) then raise exception 'Exception was silently cleared';end if;
 end loop;
 select count(*) into n from payroll_scenario_private.calculations;
 again:=payroll_scenario_private.calculate_mock_run('bakebe-aura-2026-08-11-25-v1');
 if d<>again or (select count(*) from payroll_scenario_private.calculations)<>n then raise exception 'Retry created duplicate result';end if;
 select jsonb_build_object('punches',(select count(*) from public.time_events),'schedules',(select count(*) from public.shift_assignments),'gross',(select count(*) from public.payroll_gross_runs),'net',(select count(*) from public.payroll_net_runs),'payments',(select count(*) from public.payroll_payment_batches),'packages',(select count(*) from public.payroll_pay_packages),'mode',(select processing_mode from public.payroll_access_scopes where id=(select scope_id from payroll_scenario_private.runs where seed_run_id='bakebe-aura-2026-08-11-25-v1'))) into after_state;
 if before_state<>after_state then raise exception 'Official records changed';end if;
end $$;
rollback;
select 'PASS: eight results; gross minus deductions equals net; net-tax contributions retained; lateness and undertime correct; exceptions held; retry idempotent; official table counts and processing mode unchanged' result;
