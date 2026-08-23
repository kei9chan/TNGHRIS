alter table public.job_offers
  drop constraint if exists job_offers_draft_step_check;

alter table public.job_offers
  add constraint job_offers_draft_step_check
  check (draft_step between 1 and 6);
