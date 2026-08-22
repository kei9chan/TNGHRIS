-- Job Post Templates: reusable business-unit starter metadata and storage support.
--
-- The six starter rows are inserted idempotently by the Job Post Templates page
-- after it reads the current table. This keeps an administrator's edited starter
-- intact and also works for installations where the base table already contains
-- legacy templates without template keys.

alter table if exists public.job_post_templates
  add column if not exists template_key text,
  add column if not exists business_unit text,
  add column if not exists status text not null default 'Draft',
  add column if not exists is_starter boolean not null default false,
  add column if not exists sections jsonb not null default '[]'::jsonb,
  add column if not exists cta_link text,
  add column if not exists brand_wordmark text;

create unique index if not exists job_post_templates_template_key_unique
  on public.job_post_templates (template_key)
  where template_key is not null;

comment on column public.job_post_templates.template_key is
  'Stable idempotency key for reusable starter templates.';
comment on column public.job_post_templates.sections is
  'Repeatable job-post content sections, each with an id, title, and newline-delimited bullets.';

-- Use the existing recruitment asset bucket. The path is deliberately scoped to
-- the authenticated uploader so the public preview can read assets without
-- allowing arbitrary authenticated writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-page-assets',
  'application-page-assets',
  true,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read job post template assets" on storage.objects;
create policy "Public can read job post template assets"
on storage.objects
for select
using (
  bucket_id = 'application-page-assets'
  and name like 'hero/%/job-post-templates/%'
);

drop policy if exists "Authenticated users can upload job post template assets" on storage.objects;
create policy "Authenticated users can upload job post template assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'application-page-assets'
  and auth.uid() is not null
  and name like ('hero/' || auth.uid()::text || '/job-post-templates/%')
);

drop policy if exists "Owners can update job post template assets" on storage.objects;
create policy "Owners can update job post template assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'application-page-assets'
  and name like ('hero/' || auth.uid()::text || '/job-post-templates/%')
)
with check (
  bucket_id = 'application-page-assets'
  and name like ('hero/' || auth.uid()::text || '/job-post-templates/%')
);

drop policy if exists "Owners can delete job post template assets" on storage.objects;
create policy "Owners can delete job post template assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'application-page-assets'
  and name like ('hero/' || auth.uid()::text || '/job-post-templates/%')
);
