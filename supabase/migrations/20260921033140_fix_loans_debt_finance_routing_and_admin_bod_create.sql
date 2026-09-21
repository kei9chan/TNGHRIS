-- Repair Loans & Debt finance routing and let scoped Admin/BOD users create
-- records. Finance remains the only role that can approve and activate them.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function private.payroll_debt_designated_finance()
returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  reviewer uuid;
  matches integer;
begin
  select count(*), (array_agg(h.id order by h.id))[1]
    into matches, reviewer
  from public.hris_users h
  where h.employee_id = 'TNG-067'
    and lower(h.status) = 'active'
    and h.auth_user_id is not null
    and private.workflow_user_has_role(h.id, 'Finance Staff');

  if matches <> 1 then
    raise exception 'Finance routing is unavailable. Configure Lenny Rose Casas · Finance before submitting this record.';
  end if;

  return reviewer;
end
$$;

create or replace function private.payroll_debt_creator(p_scope uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select private.payroll_debt_manager(p_scope)
    or private.payroll_debt_oversight_view(p_scope)
    or (
      (
        private.workflow_user_has_role(public.current_hris_user_id(), 'Manager')
        or private.workflow_user_has_role(public.current_hris_user_id(), 'Business Unit Manager')
      )
      and exists (
        select 1
        from public.payroll_access_scopes s
        join public.hris_users h on h.id = public.current_hris_user_id()
        where s.id = p_scope
          and s.kind = 'business_unit'
          and s.business_unit_id = h.business_unit_id
      )
    )
$$;

revoke all on function private.payroll_debt_designated_finance() from public, anon, authenticated;
revoke all on function private.payroll_debt_creator(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
