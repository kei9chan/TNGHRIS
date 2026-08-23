create table if not exists public.job_social_media_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  business_unit_id uuid references public.business_units(id) on delete set null,
  style jsonb not null default '{}'::jsonb,
  headline text not null default 'WE ARE HIRING',
  cta_line text not null default '',
  subject_line text not null default 'Subject: [POSITION] - [FULL NAME]',
  logo_url text,
  background_url text,
  background_fit text not null default 'cover' check (background_fit in ('cover', 'contain', 'fill')),
  overlay_opacity numeric(4,3) not null default 0.08 check (overlay_opacity between 0 and 0.65),
  contrast_helper boolean not null default false,
  status text not null default 'Active' check (status in ('Active', 'Archived')),
  created_by_user_id uuid references public.hris_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_social_media_templates_business_unit_idx
  on public.job_social_media_templates (business_unit_id, status, updated_at desc);

alter table public.job_social_media_templates enable row level security;

drop policy if exists social_media_templates_authenticated_read on public.job_social_media_templates;
create policy social_media_templates_authenticated_read
  on public.job_social_media_templates
  for select
  to authenticated
  using (true);

drop policy if exists social_media_templates_hr_admin_insert on public.job_social_media_templates;
create policy social_media_templates_hr_admin_insert
  on public.job_social_media_templates
  for insert
  to authenticated
  with check (public.is_hr_or_admin());

drop policy if exists social_media_templates_hr_admin_update on public.job_social_media_templates;
create policy social_media_templates_hr_admin_update
  on public.job_social_media_templates
  for update
  to authenticated
  using (public.is_hr_or_admin())
  with check (public.is_hr_or_admin());

drop policy if exists social_media_templates_hr_admin_delete on public.job_social_media_templates;
create policy social_media_templates_hr_admin_delete
  on public.job_social_media_templates
  for delete
  to authenticated
  using (public.is_hr_or_admin());

grant select, insert, update, delete on public.job_social_media_templates to authenticated;

create or replace function public.set_job_social_media_template_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_job_social_media_template_updated_at on public.job_social_media_templates;
create trigger set_job_social_media_template_updated_at
before update on public.job_social_media_templates
for each row execute function public.set_job_social_media_template_updated_at();

comment on table public.job_social_media_templates is
  'Reusable, editable visual presets for Recruitment job social media posts.';
