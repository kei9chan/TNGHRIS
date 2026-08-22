-- Phase 2: structured, optional content for the reusable public role page.
-- Keeping this in one JSONB column preserves the existing job_posts schema and
-- lets older job posts continue to work without backfilling blank sections.

alter table public.job_posts
  add column if not exists role_details jsonb not null default '{}'::jsonb;

update public.job_posts
set role_details = '{}'::jsonb
where role_details is null;

comment on column public.job_posts.role_details is
  'Optional public role page content: summary, arrangement, salary, sections, FAQs, and role image URL.';
