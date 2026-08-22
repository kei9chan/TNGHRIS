-- Preserve a submitted resume link separately when an applicant also uploads a file.
-- This is additive and does not change or remove any existing applications.
alter table public.job_applications
  add column if not exists resume_link text;

comment on column public.job_applications.resume_link is
  'Applicant-provided resume or CV URL, preserved independently from an uploaded file.';
