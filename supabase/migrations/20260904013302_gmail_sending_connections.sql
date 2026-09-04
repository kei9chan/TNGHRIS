-- Per-user Gmail sending connections. This migration is additive: it does not
-- change HRIS authentication, Google Calendar integration, existing role
-- permissions, or any business record/RLS policy.
--
-- Safe rollback: deploy the previous application and Edge Function versions,
-- revoke access to the Gmail OAuth client, and leave these tables in place so
-- connection and delivery audit history is not destroyed. If permanent removal
-- is later approved, export the audit rows before dropping the three new tables.

create table if not exists public.gmail_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text not null,
  refresh_token_ciphertext text,
  refresh_token_iv text,
  granted_scopes text[] not null default '{}'::text[],
  token_expiry timestamptz,
  connection_status text not null default 'connected'
    check (connection_status in ('connected', 'revoked', 'error')),
  last_error text,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  last_verified_at timestamptz,
  updated_at timestamptz not null default now(),
  encryption_version smallint not null default 1 check (encryption_version = 1),
  constraint gmail_connections_email_check
    check (google_email = lower(btrim(google_email)) and google_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  constraint gmail_connections_scope_allowlist_check
    check (granted_scopes <@ array['https://www.googleapis.com/auth/gmail.send']::text[]),
  constraint gmail_connections_connected_secret_check
    check (
      connection_status <> 'connected'
      or (
        refresh_token_ciphertext is not null
        and refresh_token_iv is not null
        and cardinality(granted_scopes) = 1
        and granted_scopes[1] = 'https://www.googleapis.com/auth/gmail.send'
      )
    )
);

comment on table public.gmail_connections is
  'Protected per-auth-user Gmail send-only OAuth connection metadata. Refresh tokens are AES-GCM ciphertext and are never client-readable.';
comment on column public.gmail_connections.refresh_token_ciphertext is
  'AES-256-GCM ciphertext produced by the Gmail Edge Functions; never plaintext.';

create table if not exists public.gmail_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  expected_email text not null,
  return_path text not null default '/integrations',
  expires_at timestamptz not null,
  used_at timestamptz,
  callback_error text,
  created_at timestamptz not null default now(),
  constraint gmail_oauth_states_email_check
    check (expected_email = lower(btrim(expected_email)) and expected_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  constraint gmail_oauth_states_return_path_check
    check (return_path = '/integrations'),
  constraint gmail_oauth_states_expiry_check
    check (expires_at > created_at)
);

comment on table public.gmail_oauth_states is
  'Short-lived, one-time hashes for the Gmail OAuth callback. Raw state values are never stored.';

create index if not exists gmail_oauth_states_user_created_idx
  on public.gmail_oauth_states (user_id, created_at desc);

create index if not exists gmail_oauth_states_open_expiry_idx
  on public.gmail_oauth_states (expires_at)
  where used_at is null;

create table if not exists public.hris_email_delivery_log (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  hris_user_id uuid references public.hris_users(id) on delete set null,
  sender_email text not null,
  recipient_email text not null,
  subject text not null,
  document_type text not null,
  document_id uuid,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  gmail_message_id text,
  gmail_thread_id text,
  delivery_status text not null check (delivery_status in ('sent', 'failed')),
  error_message text,
  attachment_names jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint hris_email_delivery_email_check
    check (
      sender_email = lower(btrim(sender_email))
      and recipient_email = lower(btrim(recipient_email))
    )
);

comment on table public.hris_email_delivery_log is
  'Immutable Gmail delivery metadata for HRIS audit. Email bodies and OAuth credentials are intentionally excluded.';

create index if not exists hris_email_delivery_user_created_idx
  on public.hris_email_delivery_log (auth_user_id, created_at desc);

create index if not exists hris_email_delivery_document_idx
  on public.hris_email_delivery_log (document_type, document_id, created_at desc)
  where document_id is not null;

alter table public.gmail_connections enable row level security;
alter table public.gmail_connections force row level security;
alter table public.gmail_oauth_states enable row level security;
alter table public.gmail_oauth_states force row level security;
alter table public.hris_email_delivery_log enable row level security;
alter table public.hris_email_delivery_log force row level security;

-- Deliberately no client policies. Connection secrets, OAuth state, and the
-- delivery ledger are reachable only from authenticated Edge Functions after
-- they independently validate the caller and document permission. Service-role
-- access remains server-side and bypasses RLS by design.
revoke all on table public.gmail_connections from public, anon, authenticated;
revoke all on table public.gmail_oauth_states from public, anon, authenticated;
revoke all on table public.hris_email_delivery_log from public, anon, authenticated;
