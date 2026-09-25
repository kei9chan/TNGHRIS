-- Probationary status can be the reason a leave request needs a BOD
-- exception. It must never be used to deny the authorized BOD approver.
do $$
declare
  original_definition text;
  patched_definition text;
begin
  original_definition := pg_get_functiondef(
    'public.process_leave_exception_approval(uuid,text,text,text)'::regprocedure
  );
  patched_definition := replace(
    original_definition,
    E'       or lower(coalesce(request_row.final_classification, '''')) = ''lwop''\n       or lower(coalesce(p_outcome, '''')) = ''lwop''',
    E'       or lower(coalesce(request_row.final_classification, '''')) = ''lwop''\n       or lower(coalesce(employee_status, '''')) like ''%probation%''\n       or lower(coalesce(p_outcome, '''')) = ''lwop'''
  );
  if patched_definition = original_definition then
    raise exception 'Probationary BOD exception reason patch did not match the installed function';
  end if;
  execute patched_definition;
end;
$$;
