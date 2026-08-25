-- Server-only throttling records for the public password recovery endpoint.
-- No client policies are created; only the service-role Edge Function can read
-- or write these records. Existing auth users and passwords are untouched.
create table if not exists public.password_reset_rate_limits (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  ip_hash text not null,
  requested_at timestamptz not null default now(),
  delivered boolean not null default false
);

create index if not exists password_reset_rate_limits_email_time_idx
  on public.password_reset_rate_limits (email_hash, requested_at desc);
create index if not exists password_reset_rate_limits_ip_time_idx
  on public.password_reset_rate_limits (ip_hash, requested_at desc);

alter table public.password_reset_rate_limits enable row level security;
revoke all on table public.password_reset_rate_limits from public, anon, authenticated;
