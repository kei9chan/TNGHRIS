-- An uploader with BOD authority must still receive an independent HR
-- Manager review, even if that account also carries an HR Manager role.
set local lock_timeout = '5s';
do $migration$
declare ddl text;old_fragment text;new_fragment text;
begin
 ddl:=pg_get_functiondef('public.submit_actual_attendance_import(uuid,date,date,text,jsonb,jsonb,text)'::regprocedure);
 old_fragment:='case when public.has_active_role(''HR Manager'') then ''pending_bod'' else ''pending_hr_manager'' end';
 new_fragment:='case when public.has_active_role(''HR Manager'') and not public.has_active_role(''Board of Director'') then ''pending_bod'' else ''pending_hr_manager'' end';
 if strpos(ddl,old_fragment)=0 then raise exception 'Attendance approval route changed; review dual-role migration.';end if;
 execute replace(ddl,old_fragment,new_fragment);
end $migration$;
notify pgrst,'reload schema';
