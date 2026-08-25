-- Allow authorized requisition writes to run the protected route normalizer
-- without exposing the private schema to authenticated client roles.
--
-- The table RLS policy remains the authorization gate. This trigger only
-- validates and normalizes the mandatory HR Manager -> BOD approval snapshot.

alter function public.enforce_job_requisition_bod_workflow()
  security definer;

alter function public.enforce_job_requisition_bod_workflow()
  set search_path = '';

revoke all on function public.enforce_job_requisition_bod_workflow()
  from public, anon, authenticated;

grant execute on function public.enforce_job_requisition_bod_workflow()
  to service_role;

comment on function public.enforce_job_requisition_bod_workflow() is
  'Protected trigger that validates the HR Manager then BOD requisition route. Table RLS remains the caller authorization gate.';

