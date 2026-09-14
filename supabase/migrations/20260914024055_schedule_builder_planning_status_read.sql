-- Reuse the canonical schedule versions/status queries for same-BU planning.
-- This helper grants schedule reads only; no employee-profile/payroll RLS or write helpers change.
create or replace function private.payroll_schedule_can_read(p_employee uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and (
 private.payroll_schedule_can_edit(p_employee) or p_employee=public.current_hris_user_id()
 or exists(select 1 from public.hris_users h where h.id=p_employee and public.current_hris_role()='Manager' and h.reports_to=public.current_hris_name())
 or exists(select 1 from public.hris_users target join public.hris_users actor on actor.id=public.current_hris_user_id()
   where target.id=p_employee and target.business_unit_id=actor.business_unit_id and lower(target.status::text)='active'
   and (private.payroll_schedule_can_edit(actor.id) or exists(select 1 from public.hris_users report where report.reports_to=actor.id::text and report.id<>actor.id and lower(report.status::text)='active')))
 )
$$;
