-- Phase 3: public role-specific and general application snapshots.
-- Keep the existing job_applications workflow (stage, notes, cover_letter) and
-- add immutable public-submission context around it.

alter table public.job_candidates
  add column if not exists current_city text,
  add column if not exists linkedin_url text,
  add column if not exists current_employer text,
  add column if not exists years_relevant_experience text,
  add column if not exists earliest_start_date date;

alter table public.job_applications
  add column if not exists role_id text,
  add column if not exists role_slug text,
  add column if not exists role_title_snapshot text,
  add column if not exists department_snapshot text,
  add column if not exists location_snapshot text,
  add column if not exists employment_type_snapshot text,
  add column if not exists work_arrangement_snapshot text,
  add column if not exists role_answers jsonb not null default '{}'::jsonb,
  add column if not exists source_application_page text,
  add column if not exists application_reference text,
  add column if not exists submission_token text,
  add column if not exists resume_file_url text,
  add column if not exists resume_file_path text;

-- A general application intentionally has no selected job post. Existing
-- role-specific applications remain unchanged.
alter table public.job_applications
  alter column job_post_id drop not null;

update public.job_applications
set role_id = job_post_id::text
where role_id is null and job_post_id is not null;

create index if not exists job_applications_role_id_idx
  on public.job_applications (role_id);

create index if not exists job_applications_application_reference_idx
  on public.job_applications (application_reference);

create unique index if not exists job_applications_submission_token_idx
  on public.job_applications (submission_token)
  where submission_token is not null;

comment on column public.job_applications.stage is
  'Existing recruitment workflow status; public submissions start at New.';
comment on column public.job_applications.role_answers is
  'Answers to the role-specific application questions captured at submission time.';
comment on column public.job_applications.role_title_snapshot is
  'Role title at the time of application; General Application for unassigned submissions.';

-- The existing recruitment-uploads bucket is reused for resumes. This creates
-- it only for installations that do not already have it and does not alter an
-- existing bucket configuration.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recruitment-uploads',
  'recruitment-uploads',
  false,
  5242880,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do nothing;

drop policy if exists "Public applicants can upload resumes" on storage.objects;
create policy "Public applicants can upload resumes"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'recruitment-uploads'
  and name like 'resumes/public/%'
);
