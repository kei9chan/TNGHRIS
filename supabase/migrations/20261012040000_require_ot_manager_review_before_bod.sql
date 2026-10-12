-- BOD may act on an OT request only after the resolved reporting manager
-- recorded a reviewed quantity. The request remains visible for correction,
-- but cannot be approved at the escalation stage without that handoff.
create or replace function private.ot_can_decide(r public.ot_requests)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and public.current_hris_user_id() <> r.employee_id
    and exists (
      select 1
      from public.hris_users
      where id = public.current_hris_user_id()
        and lower(status) = 'active'
    )
    and (
      (
        r.status::text in ('Submitted', 'PendingGM')
        and private.is_business_unit_ot_manager(public.current_hris_user_id(), r.employee_id)
      )
      or (
        r.status::text = 'PendingBOD'
        and public.has_active_role('Board of Director')
        and r.manager_confirmed_minutes is not null
        and r.manager_confirmed_by = private.resolve_ot_manager(r.employee_id)
        and exists (
          select 1
          from public.time_request_approval_assignments a
          where a.request_type = 'overtime'
            and a.request_id = r.id
            and a.approver_user_id = public.current_hris_user_id()
            and a.status = 'Pending'
        )
      )
    );
$$;

revoke all on function private.ot_can_decide(public.ot_requests) from public, anon, authenticated;
