-- Keep the Phase 2 invoker functions deterministic when called through PostgREST.
alter function public.upload_job_candidate_document(
  uuid, uuid, text, text, text, text, text, bigint
) set search_path = public, pg_temp;

alter function public.remove_job_candidate_document(uuid)
  set search_path = public, pg_temp;

alter function public.get_my_pending_offer_approval_ids()
  set search_path = public, pg_temp;
