-- Use the work date explicitly confirmed in an attendance import to keep an
-- overnight punch with its own row. Raw clock events still use the existing
-- schedule-based capture window. No pay policy or approval rule is changed.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $migration$
declare ddl text;
old_filter text := 'where value->>''employeeId''=u->>''id'' and (value->>''timestamp'')::timestamptz>=ws-interval ''4 hours'' and (value->>''timestamp'')::timestamptz<=we+interval ''8 hours''';
new_filter text := 'where value->>''employeeId''=u->>''id'' and ((value->>''importWorkDate''=d::text) or (value->>''importWorkDate'' is null and (value->>''timestamp'')::timestamptz>=ws-interval ''4 hours'' and (value->>''timestamp'')::timestamptz<=we+interval ''8 hours''))';
begin
 ddl:=pg_get_functiondef('private.interpret_payroll_time_before_ob(jsonb,date,date)'::regprocedure);
 if strpos(ddl,old_filter)=0 then
   raise exception 'Timekeeping punch capture changed; inspect before applying';
 end if;
 execute replace(ddl,old_filter,new_filter);
end $migration$;
revoke all on function private.interpret_payroll_time_before_ob(jsonb,date,date) from public,anon,authenticated;
