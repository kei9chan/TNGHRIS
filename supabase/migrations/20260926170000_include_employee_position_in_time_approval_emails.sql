-- Include the employee's current position in WFH/OT (and leave) approval email payloads.
-- Rebuilds the current live function definition so existing authorization and
-- cancellation guards remain intact while adding the position field.
do $$
declare
  ddl text;
begin
  select pg_get_functiondef('public.get_time_approval_email_payload(text,uuid)'::regprocedure)
    into ddl;

  ddl := replace(ddl, 'employee_name text;', E'employee_name text;\n  employee_position text;');
  ddl := replace(ddl,
    'select r.employee_id,r.employee_name,format',
    'select r.employee_id,r.employee_name,(select u.position from public.hris_users u where u.id=r.employee_id),format');
  ddl := replace(ddl,
    'into employee_id,employee_name,request_dates,status_value,context_value',
    'into employee_id,employee_name,employee_position,request_dates,status_value,context_value');
  ddl := replace(ddl,
    '''employeeName'',employee_name,',
    E'''employeeName'',employee_name,\n    ''employeePosition'',coalesce(employee_position,''Position not recorded''),');

  execute ddl;
end;
$$;
