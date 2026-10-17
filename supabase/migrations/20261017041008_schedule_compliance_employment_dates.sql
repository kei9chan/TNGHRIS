-- Schedule Builder already excludes dates outside employment. Apply the same
-- checks to compliance, preserving the active-team scope, exemptions, leave,
-- suspension handling and publication checks of the deployed function.
set local lock_timeout = '5s';
do $migration$
declare ddl text; needle text;
begin
  ddl := pg_get_functiondef('schedule_compliance.snapshot(uuid,date)'::regprocedure);
  needle := 'and lower(status::text)=''active''';
  if (length(ddl)-length(replace(ddl,needle,'')))/length(needle) <> 1 then
    raise exception 'Review changed compliance employee scope before applying employment dates.';
  end if;
  ddl := replace(ddl,needle,needle||chr(10)||'      and private.schedule_employee_in_week(id,p_week)');
  needle := 'for d in select generate_series(p_week,p_week+6,''1 day'')::date loop';
  if (length(ddl)-length(replace(ddl,needle,'')))/length(needle) <> 1 then
    raise exception 'Review changed compliance day loop before applying employment dates.';
  end if;
  ddl := replace(ddl,needle,needle||chr(10)||
    '      if not private.schedule_employee_in_date(e.id,d) then'||chr(10)||
    '        days:=days||jsonb_build_array(jsonb_build_object(''date'',d,''status'',''Not employed''));'||chr(10)||
    '        continue;'||chr(10)||
    '      end if;');
  execute ddl;
end $migration$;
