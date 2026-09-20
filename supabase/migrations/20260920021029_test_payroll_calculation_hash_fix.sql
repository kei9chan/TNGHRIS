do $$ declare ddl text;begin
 ddl:=pg_get_functiondef('payroll_scenario_private.calculate_mock_run(text)'::regprocedure);
 ddl:=replace(ddl,'input_hash text; previous','v_hash text; previous');
 ddl:=replace(ddl,'input_hash:=','v_hash:=');
 ddl:=replace(ddl,'calculate_mock_run.input_hash','v_hash');
 ddl:=replace(ddl,'''inputHash'',input_hash','''inputHash'',v_hash');
 ddl:=replace(ddl,'values(p_seed,input_hash,','values(p_seed,v_hash,');
 execute ddl;
end $$;
