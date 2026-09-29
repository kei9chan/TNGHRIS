-- Imported days have explicit work-date ownership. Do not mix the next shift's raw punches.
do $$
declare ddl text;needle text;
begin
 ddl:=pg_get_functiondef('private.interpret_payroll_time_before_ob(jsonb,date,date)'::regprocedure);
 needle:=$old$((value->>'importWorkDate'=d::text) or (value->>'importWorkDate' is null and (value->>'timestamp')::timestamptz>=ws-interval '4 hours' and (value->>'timestamp')::timestamptz<=we+interval '8 hours'))$old$;
 if strpos(ddl,needle)=0 then raise exception 'Imported event boundary function changed.';end if;
 ddl:=replace(ddl,needle,$new$((value->>'importWorkDate'=d::text) or (value->>'importWorkDate' is null and not exists(select 1 from jsonb_array_elements(coalesce(p_source->'actualAttendanceDays','[]')) imported where imported->>'employeeId'=u->>'id' and imported->>'date'=d::text) and (value->>'timestamp')::timestamptz>=ws-interval '4 hours' and (value->>'timestamp')::timestamptz<=we+interval '8 hours'))$new$);

 -- Skip ambiguous capture-window warning only for a reviewed, explicitly assigned imported day.
 needle:='if exists(select 1 from jsonb_array_elements(p_source->''shifts'') x where x->>''employeeId''=u->>''id'' and (x->>''date'')::date<>d';
 if strpos(ddl,needle)=0 then raise exception 'Adjacent-shift guard changed.';end if;
 ddl:=replace(ddl,needle,'if not exists(select 1 from jsonb_array_elements(coalesce(p_source->''actualAttendanceDays'',''[]'')) imported where imported->>''employeeId''=u->>''id'' and imported->>''date''=d::text) and exists(select 1 from jsonb_array_elements(p_source->''shifts'') x where x->>''employeeId''=u->>''id'' and (x->>''date'')::date<>d');
 needle:='actual_ot:=actual_ot+greatest(0,om);';
 if strpos(ddl,needle)=0 then raise exception 'Approved OT cap changed.';end if;
 ddl:=replace(ddl,needle,'actual_ot:=actual_ot+least(greatest(0,om),greatest(0,(o->>''approvedHours'')::numeric*60));');
 execute ddl;
end $$;
