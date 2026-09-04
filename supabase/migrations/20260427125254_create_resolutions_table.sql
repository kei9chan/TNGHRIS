-- Restored from the production migration ledger so the repository
-- records the dependency that originally exposed the missing schema baseline.

create table if not exists public.resolutions (
  id uuid primary key default gen_random_uuid(),
  incident_report_id uuid references public.incident_reports(id) on delete cascade,
  employee_id uuid references public.hris_users(id),
  resolution_type text not null,
  details text not null,
  decision_date timestamptz,
  closed_by_user_id uuid references public.hris_users(id),
  status text not null default 'Draft',
  approver_steps jsonb default '[]'::jsonb,
  decision_maker_signature_url text,
  supporting_document_url text,
  employee_acknowledged_at timestamptz,
  employee_acknowledgement_signature_url text,
  acknowledgement_deadline timestamptz,
  sent_to_employee_at timestamptz,
  manual_closure_reason text,
  suspension_type text,
  suspension_days integer,
  suspension_start_date timestamptz,
  suspension_end_date timestamptz,
  suspension_dates jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.resolutions enable row level security;

drop policy if exists "Enable read access for all users" on public.resolutions;
drop policy if exists "Enable insert for authenticated users only" on public.resolutions;
drop policy if exists "Enable update for authenticated users only" on public.resolutions;

create policy "Enable read access for all users"
  on public.resolutions for select using (true);
create policy "Enable insert for authenticated users only"
  on public.resolutions for insert with check (true);
create policy "Enable update for authenticated users only"
  on public.resolutions for update using (true);
