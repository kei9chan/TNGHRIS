-- A returned or rejected report belongs to the reporter's revision step.
-- Prevent HR/admin direct table updates from bypassing that state while still
-- allowing the ownership-validated resubmission RPC to advance to Submitted.

create or replace function private.enforce_incident_report_revision_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_hris_user_id();
begin
  if old.status::text not in ('Returned for Revision', 'Rejected') or actor is null then
    return new;
  end if;

  if actor <> old.reported_by then
    raise exception 'This incident report is waiting for revision by the original reporter'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and new.status::text <> 'Submitted' then
    raise exception 'Use the resubmit action to advance this incident report'
      using errcode = '22023';
  end if;

  return new;
end
$$;

revoke all on function private.enforce_incident_report_revision_state() from public, anon, authenticated;

drop trigger if exists incident_report_revision_state_guard on public.incident_reports;
create trigger incident_report_revision_state_guard
before update on public.incident_reports
for each row
execute function private.enforce_incident_report_revision_state();
