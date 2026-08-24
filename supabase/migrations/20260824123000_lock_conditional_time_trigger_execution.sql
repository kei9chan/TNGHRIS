-- Trigger-only function: table triggers may call it, API roles may not.
revoke all on function public.guard_conditional_time_approval_transition() from public,anon,authenticated;
