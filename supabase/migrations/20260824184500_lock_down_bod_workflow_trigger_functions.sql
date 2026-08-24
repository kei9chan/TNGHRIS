-- Trigger functions are internal workflow controls and must not be exposed as RPCs.
revoke all on function public.enforce_employee_award_bod_gate() from public, anon, authenticated;
revoke all on function public.enforce_job_requisition_bod_workflow() from public, anon, authenticated;
revoke all on function public.notify_job_requisition_current_step() from public, anon, authenticated;
