-- Align the Pay Package Builder with the established HR access model.
-- Scoped HR Manager and HR Staff users may view and prepare compensation
-- packages for employees they can already access. Approval authority remains
-- controlled separately by authorize_hr, and self-entry remains prohibited.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function private.payroll_package_scope_permission(
  p_employee uuid,
  p_scope uuid,
  p_action text,
  p_stream text
) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.payroll_actor_id() is not null
    and public.can_access_hris_user(p_employee)
    and public.has_sensitive_permission(
      'salary_compensation',
      case when p_action = 'view' then 'view' else 'edit' end
    )
    and exists (
      select 1
      from public.hris_users u
      join public.payroll_access_scopes s on s.id = p_scope
      where u.id = p_employee
        and s.kind in ('business_unit', 'payroll_group')
        and (p_stream = 'professional_fee' or s.business_unit_id = u.business_unit_id)
        and case p_action
          when 'edit' then (
            private.payroll_has_access('prepare_pr', s.id)
            or private.workflow_user_has_role(public.current_hris_user_id(), 'HR Manager')
            or private.workflow_user_has_role(public.current_hris_user_id(), 'HR Staff')
          ) and public.current_hris_user_id() <> p_employee
          when 'approve' then
            private.payroll_has_access('authorize_hr', s.id)
            and public.current_hris_user_id() <> p_employee
          when 'view' then (
            private.workflow_user_has_role(public.current_hris_user_id(), 'HR Manager')
            or private.workflow_user_has_role(public.current_hris_user_id(), 'HR Staff')
            or exists (
              select 1
              from unnest(array[
                'prepare_pr',
                'review_endorse',
                'authorize_hr',
                'authorize_finance',
                'approve_bod',
                'release_payroll'
              ]) duty
              where private.payroll_has_access(duty, s.id)
            )
          )
          else false
        end
    )
$$;

revoke all on function private.payroll_package_scope_permission(uuid, uuid, text, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
