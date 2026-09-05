-- Phase 1F: raw time-event ingestion foundation.
-- Additive only. Legacy time_events and attendance tables remain unchanged.
-- Raw events are never edited or deleted and are not attendance interpretations.

create table if not exists public.payroll_time_ingestion_batches (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_system text not null,
  source_batch_key text not null,
  source_timezone text not null default 'Asia/Manila',
  received_at timestamptz not null default now(),
  status text not null default 'received',
  total_received integer not null default 0,
  total_accepted integer not null default 0,
  total_rejected integer not null default 0,
  total_duplicates integer not null default 0,
  manifest jsonb not null default '{}'::jsonb,
  error_summary text,
  requested_by_user_id uuid references public.hris_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_time_ingestion_batches_source_type_check check (
    source_type in ('mobile', 'biometric', 'qr', 'manual', 'work_from_home',
                    'official_business', 'import', 'device_downtime')
  ),
  constraint payroll_time_ingestion_batches_source_system_not_blank check (btrim(source_system) <> ''),
  constraint payroll_time_ingestion_batches_source_key_not_blank check (btrim(source_batch_key) <> ''),
  constraint payroll_time_ingestion_batches_timezone_not_blank check (btrim(source_timezone) <> ''),
  constraint payroll_time_ingestion_batches_status_check check (
    status in ('received', 'validating', 'partially_processed', 'processed', 'failed', 'cancelled')
  ),
  constraint payroll_time_ingestion_batches_counts_check check (
    total_received >= 0 and total_accepted >= 0 and total_rejected >= 0 and total_duplicates >= 0
    and total_accepted + total_rejected <= total_received
    and total_duplicates <= total_received
  ),
  constraint payroll_time_ingestion_batches_requester_check check (
    requested_by_user_id is not null or source_type in ('biometric', 'import', 'device_downtime')
  ),
  constraint payroll_time_ingestion_batches_unique_source_key unique (source_system, source_batch_key)
);

create index if not exists payroll_time_ingestion_batches_received_idx
  on public.payroll_time_ingestion_batches (received_at desc);
create index if not exists payroll_time_ingestion_batches_status_idx
  on public.payroll_time_ingestion_batches (status, received_at desc);
create index if not exists payroll_time_ingestion_batches_requested_by_idx
  on public.payroll_time_ingestion_batches (requested_by_user_id);

create table if not exists public.payroll_raw_time_events (
  id uuid primary key default gen_random_uuid(),
  ingestion_batch_id uuid not null references public.payroll_time_ingestion_batches(id) on delete restrict,
  employee_id uuid references public.hris_users(id) on delete restrict,
  source_employee_ref text,
  source_type text not null,
  source_system text not null,
  source_event_id text,
  idempotency_key text not null,
  event_kind text not null default 'other',
  work_context text not null default 'unknown',
  submission_mode text not null default 'online',
  event_occurred_at timestamptz not null,
  source_timestamp_text text not null,
  event_timezone text not null default 'Asia/Manila',
  device_clock_offset_seconds integer,
  device_id text,
  raw_payload jsonb not null,
  location_capture_mode text not null default 'none',
  latitude numeric(9,6),
  longitude numeric(9,6),
  location_accuracy_meters numeric(10,2),
  location_policy_version text,
  event_status text not null default 'received',
  is_duplicate boolean not null default false,
  duplicate_of_event_id uuid references public.payroll_raw_time_events(id) on delete restrict,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint payroll_raw_time_events_source_type_check check (
    source_type in ('mobile', 'biometric', 'qr', 'manual', 'work_from_home',
                    'official_business', 'import', 'device_downtime')
  ),
  constraint payroll_raw_time_events_source_system_not_blank check (btrim(source_system) <> ''),
  constraint payroll_raw_time_events_identity_check check (
    employee_id is not null or nullif(btrim(source_employee_ref), '') is not null
  ),
  constraint payroll_raw_time_events_idempotency_key_not_blank check (btrim(idempotency_key) <> ''),
  constraint payroll_raw_time_events_kind_check check (
    event_kind in ('clock_in', 'clock_out', 'break_start', 'break_end', 'other')
  ),
  constraint payroll_raw_time_events_context_check check (
    work_context in ('onsite', 'work_from_home', 'official_business', 'unknown')
  ),
  constraint payroll_raw_time_events_submission_check check (
    submission_mode in ('online', 'offline', 'sync', 'batch', 'manual')
  ),
  constraint payroll_raw_time_events_timezone_not_blank check (btrim(event_timezone) <> ''),
  constraint payroll_raw_time_events_payload_object_check check (jsonb_typeof(raw_payload) = 'object'),
  constraint payroll_raw_time_events_location_mode_check check (
    location_capture_mode in ('none', 'clock_action')
  ),
  constraint payroll_raw_time_events_coordinates_check check (
    (latitude is null and longitude is null and location_accuracy_meters is null)
    or (latitude between -90 and 90 and longitude between -180 and 180
        and (location_accuracy_meters is null or location_accuracy_meters >= 0))
  ),
  constraint payroll_raw_time_events_location_policy_check check (
    location_capture_mode = 'none'
    or (latitude is not null and longitude is not null and nullif(btrim(location_policy_version), '') is not null)
  ),
  constraint payroll_raw_time_events_status_check check (
    event_status in ('received', 'duplicate', 'quarantined', 'rejected')
  ),
  constraint payroll_raw_time_events_duplicate_check check (
    (is_duplicate and event_status = 'duplicate' and duplicate_of_event_id is not null
     and duplicate_of_event_id <> id)
    or (not is_duplicate and event_status <> 'duplicate' and duplicate_of_event_id is null)
  ),
  constraint payroll_raw_time_events_unique_idempotency unique (source_system, idempotency_key)
);

create index if not exists payroll_raw_time_events_batch_idx
  on public.payroll_raw_time_events (ingestion_batch_id, received_at);
create index if not exists payroll_raw_time_events_employee_occurred_idx
  on public.payroll_raw_time_events (employee_id, event_occurred_at desc);
create index if not exists payroll_raw_time_events_source_event_idx
  on public.payroll_raw_time_events (source_system, source_event_id)
  where source_event_id is not null;
create index if not exists payroll_raw_time_events_status_idx
  on public.payroll_raw_time_events (event_status, received_at desc);
create index if not exists payroll_raw_time_events_occurred_idx
  on public.payroll_raw_time_events (event_occurred_at desc);
create index if not exists payroll_raw_time_events_duplicate_of_idx
  on public.payroll_raw_time_events (duplicate_of_event_id)
  where duplicate_of_event_id is not null;

create or replace function private.guard_payroll_time_ingestion_batch()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.status <> 'received' then
    raise exception 'A new time-ingestion batch must begin in received status.' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status and not (
      (old.status = 'received' and new.status in ('validating','partially_processed','processed','failed','cancelled'))
      or (old.status = 'validating' and new.status in ('partially_processed','processed','failed','cancelled'))
      or (old.status = 'partially_processed' and new.status in ('processed','failed','cancelled'))
    ) then
      raise exception 'Invalid time-ingestion batch status transition: % -> %.', old.status, new.status using errcode = '22023';
    end if;
    if old.status in ('processed','failed','cancelled') and (
      new.source_type is distinct from old.source_type
      or new.source_system is distinct from old.source_system
      or new.source_batch_key is distinct from old.source_batch_key
      or new.source_timezone is distinct from old.source_timezone
      or new.received_at is distinct from old.received_at
      or new.total_received is distinct from old.total_received
      or new.total_accepted is distinct from old.total_accepted
      or new.total_rejected is distinct from old.total_rejected
      or new.total_duplicates is distinct from old.total_duplicates
      or new.manifest is distinct from old.manifest
    ) then
      raise exception 'Completed time-ingestion batches are immutable.' using errcode = '55000';
    end if;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function private.prevent_payroll_raw_time_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Raw time events are immutable; add a corrected or duplicate event instead of editing or deleting the original.' using errcode = '55000';
end;
$$;

drop trigger if exists payroll_time_ingestion_batches_guard on public.payroll_time_ingestion_batches;
create trigger payroll_time_ingestion_batches_guard before insert or update
on public.payroll_time_ingestion_batches for each row
execute function private.guard_payroll_time_ingestion_batch();

drop trigger if exists payroll_raw_time_events_mutation_guard on public.payroll_raw_time_events;
create trigger payroll_raw_time_events_mutation_guard before update or delete
on public.payroll_raw_time_events for each row
execute function private.prevent_payroll_raw_time_event_mutation();

create or replace function private.payroll_time_data_access()
returns boolean language sql stable set search_path = '' as $$
  select public.is_hr_or_admin() or public.has_active_role('Finance Staff');
$$;

alter table public.payroll_time_ingestion_batches enable row level security;
alter table public.payroll_raw_time_events enable row level security;
drop policy if exists payroll_time_ingestion_batches_authorized_read on public.payroll_time_ingestion_batches;
create policy payroll_time_ingestion_batches_authorized_read on public.payroll_time_ingestion_batches
for select to authenticated using (private.payroll_time_data_access());
drop policy if exists payroll_raw_time_events_authorized_read on public.payroll_raw_time_events;
create policy payroll_raw_time_events_authorized_read on public.payroll_raw_time_events
for select to authenticated using (private.payroll_time_data_access());

revoke all on table public.payroll_time_ingestion_batches, public.payroll_raw_time_events from public, anon, authenticated;
grant select on table public.payroll_time_ingestion_batches, public.payroll_raw_time_events to authenticated;
grant all on table public.payroll_time_ingestion_batches, public.payroll_raw_time_events to service_role;
revoke all on function private.guard_payroll_time_ingestion_batch() from public, anon, authenticated;
revoke all on function private.prevent_payroll_raw_time_event_mutation() from public, anon, authenticated;
revoke all on function private.payroll_time_data_access() from public, anon, authenticated;
grant execute on function private.payroll_time_data_access() to authenticated;

comment on table public.payroll_time_ingestion_batches is
  'Append-only ingestion batches for raw time events. Batch status tracks ingestion, not attendance interpretation.';
comment on table public.payroll_raw_time_events is
  'Immutable raw attendance/time observations. Preserve original payloads separately from later interpreted attendance results.';
