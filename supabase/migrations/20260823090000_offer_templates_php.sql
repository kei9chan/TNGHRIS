-- Reusable, immutable-source offer templates. Existing offers and relationships remain intact.
create table if not exists public.job_offer_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_unit_id uuid references public.business_units(id) on delete set null,
  business_unit text not null default '',
  description text not null default '',
  category text not null default 'General',
  status text not null default 'Draft' check (status in ('Draft', 'Active', 'Archived')),
  template_key text unique,
  is_starter boolean not null default false,
  template_data jsonb not null default '{}'::jsonb,
  logo_url text,
  logo_path text,
  header_image_url text,
  header_image_path text,
  created_by_user_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.job_offers
  add column if not exists offer_template_id uuid references public.job_offer_templates(id) on delete restrict,
  add column if not exists offer_template_name text,
  add column if not exists offer_template_snapshot jsonb not null default '{}'::jsonb;

create index if not exists job_offer_templates_status_bu_idx on public.job_offer_templates(status, business_unit_id);
create index if not exists job_offers_offer_template_id_idx on public.job_offers(offer_template_id);

alter table public.job_offer_templates enable row level security;

drop policy if exists offer_templates_authenticated_read on public.job_offer_templates;
create policy offer_templates_authenticated_read
  on public.job_offer_templates for select to authenticated
  using (true);

drop policy if exists offer_templates_hr_admin_manage on public.job_offer_templates;
create policy offer_templates_hr_admin_manage
  on public.job_offer_templates for all to authenticated
  using (public.is_hr_or_admin())
  with check (public.is_hr_or_admin());

revoke all on table public.job_offer_templates from anon;
revoke all on table public.job_offer_templates from authenticated;
grant select, insert, update, delete on table public.job_offer_templates to authenticated;
grant all on table public.job_offer_templates to service_role;

create or replace function public.touch_job_offer_template_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.touch_job_offer_template_updated_at() from public, anon, authenticated;

drop trigger if exists touch_job_offer_template_updated_at on public.job_offer_templates;
create trigger touch_job_offer_template_updated_at
before update on public.job_offer_templates
for each row execute function public.touch_job_offer_template_updated_at();
