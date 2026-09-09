-- BOD oversight is read-only here; existing workflow authority stays unchanged.
-- Preserve the restrictive recipient/publication and conflict-of-interest policies.
create function private.bod_can_view_incident(p_incident uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.has_active_role('Board of Director')
 and public.has_feature_permission('IncidentReports','view')
 and private.can_access_incident_for_nte(p_incident,null);
$$;
revoke all on function private.bod_can_view_incident(uuid) from public,anon;
grant execute on function private.bod_can_view_incident(uuid) to authenticated;
create policy incident_bod_oversight_read on public.incident_reports
for select to authenticated using (private.bod_can_view_incident(id));

create or replace function private.can_view_nte(p_nte_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
 select 1 from public.ntes n left join public.incident_reports ir on ir.id=n.incident_report_id
 where n.id=p_nte_id and (
 (n.recipient_employee_id=public.current_hris_user_id() and private.nte_is_published(n.id))
 or (n.recipient_employee_id<>public.current_hris_user_id() and (
 n.issued_by_user_id=public.current_hris_user_id()
 or ir.assigned_to_id=public.current_hris_user_id()
 or exists(select 1 from public.nte_approvals a where a.nte_id=n.id and a.approver_user_id=public.current_hris_user_id())
 or (private.can_issue_nte() and private.can_access_incident_for_nte(n.incident_report_id,n.recipient_employee_id))
 or (public.has_feature_permission('NTEs','view') and private.bod_can_view_incident(n.incident_report_id))
 ))));
$$;
revoke all on function private.can_view_nte(uuid) from public,anon;
grant execute on function private.can_view_nte(uuid) to authenticated;
notify pgrst,'reload schema';
