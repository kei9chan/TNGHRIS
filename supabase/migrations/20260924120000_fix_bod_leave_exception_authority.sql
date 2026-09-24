-- An employee's employment status is not an approver restriction.  At the
-- PendingBOD stage an active, non-self BOD may decide a credit, LWOP, or
-- probationary exception.  Keep the ordinary approval chain intact by
-- requiring the request to already be at PendingBOD.
do $$
declare
  original_definition text;
  patched_definition text;
begin
  original_definition := pg_get_functiondef(
    'public.process_leave_exception_approval(uuid,text,text,text)'::regprocedure
  );

  -- Older deployments only admitted creditException requests.  Broaden that
  -- gate to the same documented exception conditions used by the current UI.
  patched_definition := replace(
    original_definition,
    E'if request_row.status <> ''PendingBOD''\n     or not coalesce((credits->>''creditException'')::boolean, false) then',
    E'if request_row.status <> ''PendingBOD''\n     or not (\n       coalesce((credits->>''creditException'')::boolean, false)\n       or coalesce(request_row.unpaid_days, 0) > 0\n       or lower(coalesce(request_row.final_classification, '''')) = ''lwop''\n       or lower(coalesce(p_outcome, '''')) = ''lwop''\n     ) then'
  );

  -- The first replacement is for the compact legacy definition.  The second
  -- removes the erroneous probationary employee veto from an already broader
  -- definition, if this migration is applied after the newer workflow fix.
  patched_definition := replace(
    patched_definition,
    E'       or lower(coalesce(employee_status, '''')) like ''%probation%''\n',
    ''
  );

  if patched_definition = original_definition then
    raise exception 'BOD leave exception authority patch did not match the installed function';
  end if;
  execute patched_definition;
end;
$$;

revoke all on function public.process_leave_exception_approval(uuid,text,text,text) from public, anon;
grant execute on function public.process_leave_exception_approval(uuid,text,text,text) to authenticated;
