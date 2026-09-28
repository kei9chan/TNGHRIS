-- Give a concrete roster source when a no-punch rest day is blocked.
set local lock_timeout = '5s';
do $migration$
declare ddl text;old_fragment text;new_fragment text;
begin
 ddl:=pg_get_functiondef('private.import_actual_attendance_core(uuid,date,date,text,jsonb,boolean)'::regprocedure);
 old_fragment:='raise exception ''Published rest-day roster missing for this employee and date. Check business unit, publication version and approval state in Schedule Builder.'';';
 new_fragment:='raise exception ''Published rest-day roster missing for % (%), date %, business unit %. Latest eligible publication: %, version %. Check publication approval and whether the saved roster changed; open Schedule Builder for that week.'', e.full_name,e.employee_id,d,bu_name,coalesce(private.attendance_schedule(e.id,d)->>''publicationId'',''none''),coalesce(private.attendance_schedule(e.id,d)->>''version'',''none'');';
 if strpos(ddl,old_fragment)=0 then raise exception 'Rest-day importer changed; review schedule context migration.';end if;
 execute replace(ddl,old_fragment,new_fragment);
end $migration$;
notify pgrst,'reload schema';
