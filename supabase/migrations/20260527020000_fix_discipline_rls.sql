alter table public.discipline_entries enable row level security;

drop policy if exists "Enable read access for all users"
  on public.discipline_entries;

create policy "Enable read access for all users"
  on public.discipline_entries
  for select
  using (true);
