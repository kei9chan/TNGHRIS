-- Applied OT still waits for its own approval, but it does not turn ordinary
-- shift variance or an incomplete break punch into extra attendance blockers.
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$declare ddl text;begin
 ddl:=pg_get_functiondef('private.interpret_payroll_time(jsonb,date,date)'::regprocedure);
 if strpos(ddl,'has_import and not has_ot and scheduled>0')=0 then raise exception 'Manual attendance interpreter changed.';end if;
 ddl:=replace(ddl,'has_import and not has_ot and scheduled>0','has_import and scheduled>0');
 execute ddl;
end $$;
