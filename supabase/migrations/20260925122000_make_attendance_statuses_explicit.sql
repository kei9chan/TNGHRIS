-- Make no-punch attendance rows safe and explicit.  A blank punch is not a
-- missing record when the saved roster says rest day, holiday, suspension, or
-- no scheduled work.
do $$
declare ddl text;
begin
  ddl:=pg_get_functiondef('public.get_actual_attendance_import_context(uuid,date,date)'::regprocedure);
  ddl:=replace(ddl,'else null end day_status','else ''No scheduled work'' end day_status');
  execute ddl;

  ddl:=pg_get_functiondef('public.import_actual_attendance(uuid,date,date,text,jsonb,boolean)'::regprocedure);
  ddl:=replace(ddl,
    'day_status not in(''Workday'',''Rest day'',''Legal holiday'',''Company holiday'',''Absent (review)'',''Missing punches (review)'',''Suspended'')',
    'day_status not in(''Workday'',''Rest day'',''Legal holiday'',''Company holiday'',''No scheduled work'',''Absent (review)'',''Missing punches (review)'',''Suspended'')');
  ddl:=replace(ddl,
    'day_status in(''Company holiday'',''Absent (review)'',''Missing punches (review)'',''Suspended'')',
    'day_status in(''Company holiday'',''No scheduled work'',''Absent (review)'',''Missing punches (review)'',''Suspended'')');
  ddl:=replace(ddl,
    'if day_status=''Rest day'' and not (',
    'if day_status=''No scheduled work'' and exists(select 1 from public.shift_assignments a join public.shift_templates t on t.id=a.shift_template_id where a.employee_id=e.id and a.date=d and t.schedule_kind=''work'') then raise exception ''No scheduled work conflicts with a work shift. Fix the roster before importing.''; end if;\n  if day_status=''Rest day'' and not (');
  execute ddl;
end $$;
notify pgrst,'reload schema';
