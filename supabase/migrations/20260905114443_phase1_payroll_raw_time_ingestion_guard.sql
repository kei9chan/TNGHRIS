-- Phase 1F follow-up: close the raw-ingestion batch boundary.
-- Raw events may be appended only while their batch is being received or processed.

create or replace function private.guard_payroll_raw_time_event_insert()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_batch_status text;
  v_batch_source_type text;
  v_batch_source_system text;
begin
  select b.status, b.source_type, b.source_system
    into v_batch_status, v_batch_source_type, v_batch_source_system
  from public.payroll_time_ingestion_batches b
  where b.id = new.ingestion_batch_id;

  if v_batch_status is null then
    raise exception 'The referenced time-ingestion batch does not exist.' using errcode = '23503';
  end if;

  if v_batch_status not in ('received', 'validating', 'partially_processed') then
    raise exception 'Raw time events cannot be appended to a % ingestion batch.' , v_batch_status
      using errcode = '55000';
  end if;

  if new.source_type is distinct from v_batch_source_type
     or new.source_system is distinct from v_batch_source_system then
    raise exception 'Raw event source must match its ingestion batch.' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists payroll_raw_time_events_insert_guard on public.payroll_raw_time_events;
create trigger payroll_raw_time_events_insert_guard
before insert on public.payroll_raw_time_events
for each row execute function private.guard_payroll_raw_time_event_insert();

alter table public.payroll_raw_time_events
  add constraint payroll_raw_time_events_location_event_check
  check (
    location_capture_mode = 'none'
    or event_kind in ('clock_in', 'clock_out')
  );

revoke all on function private.guard_payroll_raw_time_event_insert() from public, anon, authenticated;

