-- Allow authorized HR users to manage reusable job-post templates and save
-- finished, editable job-post designs in a separate shared library.

alter table public.job_post_templates enable row level security;

drop policy if exists ref_write on public.job_post_templates;
drop policy if exists job_post_templates_hr_insert on public.job_post_templates;
drop policy if exists job_post_templates_hr_update on public.job_post_templates;
drop policy if exists job_post_templates_hr_delete on public.job_post_templates;

create policy job_post_templates_hr_insert
  on public.job_post_templates
  for insert
  to authenticated
  with check (public.is_hr_or_admin());

create policy job_post_templates_hr_update
  on public.job_post_templates
  for update
  to authenticated
  using (public.is_hr_or_admin())
  with check (public.is_hr_or_admin());

create policy job_post_templates_hr_delete
  on public.job_post_templates
  for delete
  to authenticated
  using (public.is_hr_or_admin());

revoke all on public.job_post_templates from anon;
grant select, insert, update, delete on public.job_post_templates to authenticated;

create table if not exists public.job_post_designs (
  id uuid primary key default gen_random_uuid(),
  source_template_id uuid references public.job_post_templates(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 160),
  business_unit text,
  job_title text not null check (char_length(trim(job_title)) > 0),
  status text not null default 'Draft' check (status in ('Draft', 'Ready', 'Archived')),
  design_data jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.hris_users(id) on delete set null default public.current_hris_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_post_designs_updated_at_idx
  on public.job_post_designs (updated_at desc);

create index if not exists job_post_designs_business_unit_idx
  on public.job_post_designs (business_unit, updated_at desc);

alter table public.job_post_designs enable row level security;

drop policy if exists job_post_designs_hr_select on public.job_post_designs;
create policy job_post_designs_hr_select
  on public.job_post_designs
  for select
  to authenticated
  using (public.is_hr_or_admin());

drop policy if exists job_post_designs_hr_insert on public.job_post_designs;
create policy job_post_designs_hr_insert
  on public.job_post_designs
  for insert
  to authenticated
  with check (public.is_hr_or_admin());

drop policy if exists job_post_designs_hr_update on public.job_post_designs;
create policy job_post_designs_hr_update
  on public.job_post_designs
  for update
  to authenticated
  using (public.is_hr_or_admin())
  with check (public.is_hr_or_admin());

drop policy if exists job_post_designs_hr_delete on public.job_post_designs;
create policy job_post_designs_hr_delete
  on public.job_post_designs
  for delete
  to authenticated
  using (public.is_hr_or_admin());

revoke all on public.job_post_designs from anon;
grant select, insert, update, delete on public.job_post_designs to authenticated;

create or replace function public.set_job_post_design_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_job_post_design_updated_at on public.job_post_designs;
create trigger set_job_post_design_updated_at
before update on public.job_post_designs
for each row execute function public.set_job_post_design_updated_at();

comment on table public.job_post_designs is
  'Finished, editable job-post artwork created from reusable visual templates.';
