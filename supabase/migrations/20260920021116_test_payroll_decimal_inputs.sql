do $$ declare ddl text;begin
 ddl:=pg_get_functiondef('payroll_scenario_private.calculate_mock_run(text)'::regprocedure);
 ddl:=replace(ddl,'authorized-demo-v1','authorized-demo-v2');
 ddl:=replace(ddl,'''sssBase'',p->>''base_amount''','''sssBase'',round((p->>''base_amount'')::numeric,2)::text');
 ddl:=replace(ddl,'''philhealthBase'',p->>''base_amount''','''philhealthBase'',round((p->>''base_amount'')::numeric,2)::text');
 ddl:=replace(ddl,'''pagibigBase'',p->>''base_amount''','''pagibigBase'',round((p->>''base_amount'')::numeric,2)::text');
 execute ddl;
end $$;
