-- Keep schedule publishing aligned with the actual role label stored in roles.
-- The legacy compact BusinessUnitManager comparison did not match the active
-- "Business Unit Manager" role used by HRIS accounts such as Dacanay.
create or replace function private.payroll_schedule_can_edit(p_employee uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select private.payroll_actor_id() is not null
    and exists(
      select 1
      from public.hris_users target
      join public.hris_users actor on actor.auth_user_id = auth.uid()
      where target.id = p_employee
        and (
          public.is_hr_or_admin()
          or private.schedule_team_can_manage(p_employee)
          or (
            public.has_active_role('Business Unit Manager')
            and target.business_unit_id = actor.business_unit_id
          )
          or (
            public.has_active_role('Manager')
            and (
              target.department = actor.department
              or target.reports_to in (actor.id::text, actor.auth_user_id::text)
            )
          )
        )
    );
$function$;
