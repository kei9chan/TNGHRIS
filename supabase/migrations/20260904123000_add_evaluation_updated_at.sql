-- The assignment workspace exposes a cycle version timestamp so clients can
-- invalidate stale evaluation data after HR changes an assignment or cycle.

alter table public.evaluations
  add column if not exists updated_at timestamptz not null default now();

create or replace function private.set_evaluation_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_evaluation_updated_at() from public, anon, authenticated;

drop trigger if exists set_evaluation_updated_at on public.evaluations;
create trigger set_evaluation_updated_at
before update on public.evaluations
for each row execute function private.set_evaluation_updated_at();
