-- Applied production version: 20260903121623.
-- Keep rejected NTE rows and their approval history intact while ensuring the
-- parent incident returns to the assigned handler's IR Review queue. Only an
-- issued (approved and published) notice belongs in NTE Sent.
--
-- Rollback: restore private.refresh_incident_nte_summary from migration
-- 20260901140000_nte_multi_approver_employee_specific_workflow.sql and invoke
-- it once for each affected incident_report_id. No row deletion is required.

create or replace function private.refresh_incident_nte_summary(p_incident_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_employees integer;
  employees_with_nte integer;
  active_ntes integer;
  all_nte_ids uuid[];
  status_counts jsonb;
  next_stage text;
begin
  select cardinality(ir.involved_employee_ids)
  into total_employees
  from public.incident_reports ir
  where ir.id = p_incident_report_id;

  if total_employees is null then return; end if;

  select
    count(distinct n.recipient_employee_id) filter (
      where n.status not in ('Rejected'::public.nte_status, 'Closed'::public.nte_status)
    ),
    count(*) filter (
      where n.status not in ('Rejected'::public.nte_status, 'Closed'::public.nte_status)
    ),
    coalesce(array_agg(n.id order by n.created_at, n.id), '{}'::uuid[])
  into employees_with_nte, active_ntes, all_nte_ids
  from public.ntes n
  where n.incident_report_id = p_incident_report_id;

  select coalesce(jsonb_object_agg(status_text, status_count), '{}'::jsonb)
  into status_counts
  from (
    select n.status::text status_text, count(*) status_count
    from public.ntes n
    where n.incident_report_id = p_incident_report_id
    group by n.status::text
  ) counts;

  next_stage := case
    when exists (
      select 1 from public.ntes n
      where n.incident_report_id = p_incident_report_id
        and n.status = 'PendingApproval'::public.nte_status
    ) then 'nte-for-approval'
    when exists (
      select 1 from public.ntes n
      where n.incident_report_id = p_incident_report_id
        and n.status = 'Draft'::public.nte_status
    ) then 'nte-draft'
    when exists (
      select 1 from public.ntes n
      where n.incident_report_id = p_incident_report_id
        and n.status = 'Issued'::public.nte_status
    ) then 'nte-sent'
    when exists (
      select 1 from public.ntes n
      where n.incident_report_id = p_incident_report_id
        and n.status in ('Response Submitted'::public.nte_status, 'Waiver'::public.nte_status)
    ) then 'hr-review-response'
    when exists (
      select 1 from public.ntes n
      where n.incident_report_id = p_incident_report_id
        and n.status = 'Hearing Scheduled'::public.nte_status
    ) then 'scheduled-hearing'
    when exists (
      select 1 from public.ntes n
      where n.incident_report_id = p_incident_report_id
        and n.status = 'Approved'::public.nte_status
    ) then 'nte-for-approval'
    when exists (
      select 1 from public.ntes n
      where n.incident_report_id = p_incident_report_id
        and n.status = 'Rejected'::public.nte_status
    ) then 'ir-review'
    when employees_with_nte = 0 then 'ir-review'
    when employees_with_nte < total_employees then 'nte-partial'
    else 'employee-processing-complete'
  end;

  update public.incident_reports
  set nte_ids = all_nte_ids,
      nte_processing_complete = total_employees > 0 and employees_with_nte >= total_employees,
      nte_processing_summary = jsonb_build_object(
        'totalEmployees', total_employees,
        'employeesWithNte', employees_with_nte,
        'activeNtes', active_ntes,
        'statusCounts', status_counts,
        'processingIncomplete', employees_with_nte < total_employees
      ),
      pipeline_stage = case
        when status in ('Closed'::public.ir_status, 'NoAction'::public.ir_status) then pipeline_stage
        else next_stage
      end,
      updated_at = now()
  where id = p_incident_report_id;
end;
$$;

revoke all on function private.refresh_incident_nte_summary(uuid)
  from public, anon, authenticated;

do $$
declare
  affected record;
begin
  for affected in
    select distinct n.incident_report_id
    from public.ntes n
    where n.status = 'Rejected'::public.nte_status
  loop
    perform private.refresh_incident_nte_summary(affected.incident_report_id);
  end loop;
end;
$$;
