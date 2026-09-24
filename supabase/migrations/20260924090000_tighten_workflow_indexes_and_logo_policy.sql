-- Keep logo rows visible only through the same authorized HR/admin policy,
-- without duplicate permissive SELECT policies. Index newly added FK lookups.
drop policy if exists business_unit_logos_recruitment_read on public.business_unit_logos;

create index if not exists business_unit_logos_updated_by_idx
  on public.business_unit_logos(updated_by);

create index if not exists job_offers_job_requisition_id_idx
  on public.job_offers(job_requisition_id);
