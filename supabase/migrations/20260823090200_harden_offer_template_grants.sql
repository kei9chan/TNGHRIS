revoke all on table public.job_offer_templates from anon;
revoke all on table public.job_offer_templates from authenticated;
grant select, insert, update, delete on table public.job_offer_templates to authenticated;
grant all on table public.job_offer_templates to service_role;
