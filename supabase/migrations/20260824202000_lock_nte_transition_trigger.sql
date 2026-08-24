-- Trigger functions run through their trigger and must not be exposed as RPCs.
revoke all on function public.guard_nte_bod_outcome_transition() from public, anon, authenticated;
