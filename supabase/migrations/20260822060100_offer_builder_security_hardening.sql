-- The value-builder trigger functions must never be callable through PostgREST.
-- They remain executable by the database trigger owner.
revoke all on function public.bump_job_offer_revision() from public, anon, authenticated;
revoke all on function public.capture_job_offer_history() from public, anon, authenticated;
