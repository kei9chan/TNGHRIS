-- The queue only needs the caller's existing job_requisitions SELECT policy.
-- Run as the caller so future RLS changes remain fail-closed.
alter function public.get_my_pending_job_requisition_approvals() security invoker;

revoke all on function public.get_my_pending_job_requisition_approvals() from public, anon;
grant execute on function public.get_my_pending_job_requisition_approvals() to authenticated;

notify pgrst, 'reload schema';
