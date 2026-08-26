-- Returned or rejected Incident Reports are reporter-owned revision states.
-- Processing actions remain unavailable until the reporter resubmits and the
-- canonical status returns to Submitted. Existing reports and history remain.

drop policy if exists incident_reporter_revision_update on public.incident_reports;
create policy incident_reporter_revision_update
on public.incident_reports
for update
to authenticated
using (
  reported_by = public.current_hris_user_id()
  and status::text in ('Draft', 'Returned for Revision', 'Rejected')
)
with check (
  reported_by = public.current_hris_user_id()
  and status::text in ('Draft', 'Returned for Revision', 'Rejected')
);

create or replace function private.audit_incident_report_reporter_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_hris_user_id();
  changed_fields text[] := array[]::text[];
begin
  if actor is null
     or actor <> old.reported_by
     or old.status::text not in ('Draft', 'Returned for Revision', 'Rejected') then
    return new;
  end if;

  if new.date_time is distinct from old.date_time then changed_fields := array_append(changed_fields, 'incident date'); end if;
  if new.location is distinct from old.location then changed_fields := array_append(changed_fields, 'location'); end if;
  if new.category is distinct from old.category then changed_fields := array_append(changed_fields, 'category'); end if;
  if new.description is distinct from old.description then changed_fields := array_append(changed_fields, 'description'); end if;
  if new.involved_employee_ids is distinct from old.involved_employee_ids then changed_fields := array_append(changed_fields, 'involved employees'); end if;
  if new.witness_ids is distinct from old.witness_ids then changed_fields := array_append(changed_fields, 'witnesses'); end if;
  if new.attachment_url is distinct from old.attachment_url then changed_fields := array_append(changed_fields, 'attachment'); end if;
  if new.signature_data_url is distinct from old.signature_data_url then changed_fields := array_append(changed_fields, 'signature'); end if;

  if cardinality(changed_fields) > 0 then
    new.revision_history := coalesce(old.revision_history, '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object(
        'action', 'Reporter Edited',
        'actorId', actor,
        'actorRole', public.current_hris_role(),
        'at', now(),
        'previousStatus', old.status::text,
        'newStatus', new.status::text,
        'changedFields', to_jsonb(changed_fields)
      ));

    insert into public.audit_logs(user_id, action, entity, entity_id, details)
    values(
      actor::text,
      'UPDATE',
      'IncidentReport',
      old.id::text,
      format('Reporter revised %s while status was %s.', array_to_string(changed_fields, ', '), old.status::text)
    );
  end if;

  return new;
end
$$;

revoke all on function private.audit_incident_report_reporter_revision() from public, anon, authenticated;

drop trigger if exists incident_report_reporter_revision_audit on public.incident_reports;
create trigger incident_report_reporter_revision_audit
before update on public.incident_reports
for each row
execute function private.audit_incident_report_reporter_revision();

create or replace function public.resubmit_incident_report(p_report_id uuid)
returns public.incident_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_hris_user_id();
  row public.incident_reports;
  previous_status text;
begin
  if actor is null then
    raise exception 'Authentication is required to resubmit an incident report' using errcode = '42501';
  end if;

  select * into row
  from public.incident_reports
  where id = p_report_id
  for update;

  if row.id is null then
    raise exception 'Incident report not found' using errcode = 'P0002';
  end if;
  if row.reported_by <> actor then
    raise exception 'Only the original reporter can resubmit this incident report' using errcode = '42501';
  end if;
  if row.status::text not in ('Returned for Revision', 'Rejected') then
    raise exception 'Only a returned or rejected incident report can be resubmitted' using errcode = '22023';
  end if;

  previous_status := row.status::text;

  update public.incident_reports
  set status = 'Submitted',
      pipeline_stage = 'ir-review',
      revision_notes = null,
      rejection_reason = null,
      updated_at = now(),
      revision_history = coalesce(revision_history, '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object(
          'action', 'Resubmitted',
          'actorId', actor,
          'actorRole', public.current_hris_role(),
          'at', now(),
          'previousStatus', previous_status,
          'newStatus', 'Submitted'
        ))
  where id = p_report_id
  returning * into row;

  insert into public.audit_logs(user_id, action, entity, entity_id, details)
  values(actor::text, 'RESUBMIT', 'IncidentReport', row.id::text, format('%s -> Submitted', previous_status));

  if row.assigned_to_id is not null then
    insert into public.notifications(user_id, type, title, message, link, related_entity_id, dedupe_key)
    values(
      row.assigned_to_id::text,
      'GENERAL',
      'Incident Report Resubmitted',
      'The reporter updated and resubmitted the incident report for review.',
      '/feedback/cases?reportId=' || row.id,
      row.id::text,
      'ir-resubmit-' || row.id || '-' || extract(epoch from now())::bigint
    );
  end if;

  return row;
end
$$;

revoke all on function public.resubmit_incident_report(uuid) from public, anon;
grant execute on function public.resubmit_incident_report(uuid) to authenticated;
