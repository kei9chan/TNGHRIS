-- Canonical record-level authorization for Leave, WFH, Overtime, Recruitment,
-- and reporter-controlled Incident Report revisions. This migration is
-- intentionally data-preserving and safe to apply after the production repair.

create or replace function public.can_view_time_request(
  p_request_type text,
  p_request_id uuid,
  p_employee_id uuid,
  p_direct_manager_id uuid,
  p_business_unit_id uuid
) returns boolean
language plpgsql stable security definer set search_path=''
as $$
declare
  actor uuid := public.current_hris_user_id();
  request_status text;
  manager_stage boolean := false;
begin
  if actor is null then return false; end if;
  if actor = p_employee_id then return true; end if;

  if lower(p_request_type) = 'leave' then
    select status into request_status from public.leave_requests where id = p_request_id;
    manager_stage := request_status in ('Pending', 'PendingGM');
  elsif lower(p_request_type) = 'wfh' then
    select status into request_status from public.wfh_requests where id = p_request_id;
    manager_stage := request_status in ('WFH_PENDING_DEPT_HEAD_APPROVAL', 'WFH_PENDING_GM_APPROVAL');
  elsif lower(p_request_type) = 'overtime' then
    select status::text into request_status from public.ot_requests where id = p_request_id;
    manager_stage := request_status in ('Submitted', 'PendingGM');
  else
    return false;
  end if;

  if manager_stage and (
    actor = p_direct_manager_id or private.is_direct_reporting_manager(actor, p_employee_id)
  ) then return true; end if;

  if exists (
    select 1 from public.time_request_approval_assignments assignment
    where assignment.request_type = lower(p_request_type)
      and assignment.request_id = p_request_id
      and assignment.approver_user_id = actor
      and assignment.status = 'Pending'
  ) then return true; end if;

  return (
    public.has_active_role('Admin')
    or public.has_active_role('HR Manager')
    or public.has_active_role('HR Staff')
  ) and public.can_access_hris_user(p_employee_id);
end $$;

revoke all on function public.can_view_time_request(text,uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.can_view_time_request(text,uuid,uuid,uuid,uuid) to authenticated;

drop policy if exists leave_authorized_update on public.leave_requests;
create policy leave_authorized_update on public.leave_requests for update to authenticated
using (
  (employee_id = public.current_hris_user_id() and status = 'Draft')
  or public.is_system_admin()
  or ((public.has_active_role('HR Manager') or public.has_active_role('HR Staff')) and public.can_access_hris_user(employee_id))
)
with check (public.can_view_time_request('leave',id,employee_id,direct_manager_id,business_unit_id));

drop policy if exists wfh_authorized_update on public.wfh_requests;
create policy wfh_authorized_update on public.wfh_requests for update to authenticated
using (
  (employee_id = public.current_hris_user_id() and status = 'WFH_PENDING_SUBMISSION')
  or public.is_system_admin()
  or ((public.has_active_role('HR Manager') or public.has_active_role('HR Staff')) and public.can_access_hris_user(employee_id))
)
with check (public.can_view_time_request('wfh',id,employee_id,direct_manager_id,business_unit_id));

drop policy if exists ot_authorized_update on public.ot_requests;
create policy ot_authorized_update on public.ot_requests for update to authenticated
using (
  (employee_id = public.current_hris_user_id() and status::text = 'Draft')
  or public.is_system_admin()
  or ((public.has_active_role('HR Manager') or public.has_active_role('HR Staff')) and public.can_access_hris_user(employee_id))
)
with check (public.can_view_time_request('overtime',id,employee_id,direct_manager_id,business_unit_id));

-- Repair only active manager stages. Completed approvals and history remain intact.
update public.leave_requests request
set direct_manager_id = private.resolve_direct_manager_id(request.employee_id),
    approver_configuration_required = private.resolve_direct_manager_id(request.employee_id) is null,
    approval_configuration_note = case when private.resolve_direct_manager_id(request.employee_id) is null then 'Approver Configuration Required' end
where request.status in ('Pending','PendingGM')
  and request.direct_manager_id is distinct from private.resolve_direct_manager_id(request.employee_id);

update public.wfh_requests request
set direct_manager_id = private.resolve_direct_manager_id(request.employee_id),
    approver_configuration_required = private.resolve_direct_manager_id(request.employee_id) is null,
    approval_configuration_note = case when private.resolve_direct_manager_id(request.employee_id) is null then 'Approver Configuration Required' end
where request.status in ('WFH_PENDING_DEPT_HEAD_APPROVAL','WFH_PENDING_GM_APPROVAL')
  and request.direct_manager_id is distinct from private.resolve_direct_manager_id(request.employee_id);

update public.ot_requests request
set direct_manager_id = private.resolve_direct_manager_id(request.employee_id),
    approver_configuration_required = private.resolve_direct_manager_id(request.employee_id) is null,
    approval_configuration_note = case when private.resolve_direct_manager_id(request.employee_id) is null then 'Approver Configuration Required' end
where request.status::text in ('Submitted','PendingGM')
  and request.direct_manager_id is distinct from private.resolve_direct_manager_id(request.employee_id);

-- All recruitment data remains protected by record-level RLS. These helper
-- functions deliberately distinguish HR recruitment administration from an
-- explicitly assigned hiring manager's single-record access.
create or replace function public.has_any_recruitment_access()
returns boolean language sql stable security definer set search_path=''
as $$
  select public.has_recruitment_admin_access() or exists (
    select 1 from public.job_requisitions request
    where request.hiring_manager_id = public.current_hris_user_id()
       or request.created_by_user_id = public.current_hris_user_id()
       or exists (
         select 1 from jsonb_array_elements(coalesce(request.routing_steps,'[]'::jsonb)) step
         where step->>'userId' = public.current_hris_user_id()::text
       )
  )
$$;
revoke all on function public.has_any_recruitment_access() from public, anon;
grant execute on function public.has_any_recruitment_access() to authenticated;

-- Storage access for Incident Report files follows the report, not a broad BU.
-- Object names are rooted at the reporter's HRIS user ID.
drop policy if exists incident_report_attachment_owner_insert on storage.objects;
create policy incident_report_attachment_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'incident_reports_attachments'
  and (storage.foldername(name))[1] = public.current_hris_user_id()::text
);

drop policy if exists incident_report_attachment_owner_update on storage.objects;
create policy incident_report_attachment_owner_update on storage.objects for update to authenticated
using (
  bucket_id = 'incident_reports_attachments'
  and (storage.foldername(name))[1] = public.current_hris_user_id()::text
)
with check (
  bucket_id = 'incident_reports_attachments'
  and (storage.foldername(name))[1] = public.current_hris_user_id()::text
);
