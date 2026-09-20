alter table payroll_scenario_private.corrections drop constraint corrections_status_check;
alter table payroll_scenario_private.corrections add constraint corrections_status_check check(status in ('Saved','Pending approval','Approved','Rejected','Needs attention','Ready after correction','Recalculation failed'));

do $$ declare ddl text;begin
 ddl:=pg_get_functiondef('payroll_scenario_private.calculate_mock_run(text)'::regprocedure);
 ddl:=replace(ddl,
  'update payroll_scenario_private.corrections set status=''Ready after correction'',recalculated_at=clock_timestamp(),failure_message=null where seed_run_id=p_seed and status in (''Saved'',''Approved'');',
  'update payroll_scenario_private.corrections c set status=case when coalesce((select (x->>''ready'')::boolean from jsonb_array_elements(result#>''{timeResult,rows}'') x where x->>''employeeId''=c.employee_id::text and x->>''date''=c.work_date::text),false) then ''Ready after correction'' else ''Needs attention'' end,recalculated_at=clock_timestamp(),failure_message=case when coalesce((select (x->>''ready'')::boolean from jsonb_array_elements(result#>''{timeResult,rows}'') x where x->>''employeeId''=c.employee_id::text and x->>''date''=c.work_date::text),false) then null else ''The saved values still need review. Open the employee and date to continue.'' end where c.seed_run_id=p_seed and c.status in (''Saved'',''Approved'');');
 execute ddl;
end $$;

notify pgrst,'reload schema';
