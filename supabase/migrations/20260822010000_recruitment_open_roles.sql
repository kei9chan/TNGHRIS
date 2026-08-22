-- Recruitment Open Roles metadata.
-- Existing rows remain open immediately unless an administrator sets dates.

alter table public.job_posts
  add column if not exists application_open_at timestamptz,
  add column if not exists application_close_at timestamptz,
  add column if not exists is_active boolean default true,
  add column if not exists is_archived boolean default false,
  add column if not exists is_featured boolean default false,
  add column if not exists is_urgent boolean default false,
  add column if not exists department_label text;

update public.job_posts
set is_active = true
where is_active is null;

update public.job_posts
set is_archived = false
where is_archived is null;

update public.job_posts
set is_featured = false
where is_featured is null;

update public.job_posts
set is_urgent = false
where is_urgent is null;

alter table public.job_posts
  alter column is_active set default true,
  alter column is_active set not null,
  alter column is_archived set default false,
  alter column is_archived set not null,
  alter column is_featured set default false,
  alter column is_featured set not null,
  alter column is_urgent set default false,
  alter column is_urgent set not null;

create index if not exists job_posts_open_roles_lookup_idx
  on public.job_posts (business_unit_id, status, is_active, is_archived, application_close_at);
