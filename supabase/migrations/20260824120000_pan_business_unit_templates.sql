-- Scope PAN templates and records to a business unit while preserving global templates.
alter table public.pan_templates
  add column if not exists business_unit_id uuid;

alter table public.pans
  add column if not exists business_unit_id uuid;

create index if not exists pan_templates_business_unit_id_idx
  on public.pan_templates (business_unit_id);

create index if not exists pans_business_unit_id_idx
  on public.pans (business_unit_id);
