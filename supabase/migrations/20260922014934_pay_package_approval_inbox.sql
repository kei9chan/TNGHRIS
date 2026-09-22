-- One authorization-aware source for the Pay Package Builder pending tab and
-- each reviewer's Approval Center. Direct table access remains unavailable.
create or replace function public.get_payroll_pay_package_approval_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor uuid := public.current_hris_user_id();
  payroll_actor uuid := private.payroll_actor_id();
begin
  if actor is null or payroll_actor is null then
    raise exception 'Authenticated payroll user required.' using errcode='42501';
  end if;

  return jsonb_build_object(
    'pending', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',p.id,
          'employeeId',u.id,
          'employeeName',u.full_name,
          'employeeCode',u.employee_id,
          'businessUnitId',u.business_unit_id,
          'businessUnit',coalesce(b.name,u.business_unit,'Not assigned'),
          'departmentId',u.department_id,
          'department',coalesce(d.name,u.department,'Not assigned'),
          'scopeId',p.scope_id,
          'scopeName',coalesce(s.name,'Payroll scope'),
          'stream',p.stream,
          'sourceKind',p.source_kind,
          'effectiveFrom',p.effective_from,
          'baseAmount',p.base_amount,
          'rateType',p.rate_type,
          'createdAt',p.created_at,
          'submittedBy',coalesce(submitter.full_name,'Authorized submitter'),
          'approvalSteps',p.approval_steps,
          'pendingApprovers',coalesce((
            select jsonb_agg(step->>'name' order by step_index)
            from jsonb_array_elements(p.approval_steps) with ordinality as steps(step,step_index)
            where step->>'status'='Pending'
          ),'[]'::jsonb),
          'isActionable',exists(
            select 1 from jsonb_array_elements(p.approval_steps) step
            where step->>'status'='Pending' and step->>'userId'=actor::text
          ) and p.created_by<>actor and p.created_by<>payroll_actor
        ) order by p.created_at desc
      )
      from public.payroll_pay_packages p
      join public.hris_users u on u.id=p.employee_id
      left join public.business_units b on b.id=u.business_unit_id
      left join public.departments d on d.id=u.department_id
      left join public.payroll_access_scopes s on s.id=p.scope_id
      left join public.hris_users submitter on submitter.id=p.created_by or submitter.auth_user_id=p.created_by
      where p.status='draft'
        and p.approval_state='pending'
        and (
          private.payroll_package_scope_permission(p.employee_id,p.scope_id,'view',p.stream)
          or exists(
            select 1 from jsonb_array_elements(p.approval_steps) step
            where step->>'userId'=actor::text
          )
        )
    ),'[]'::jsonb)
  );
end $$;

revoke all on function public.get_payroll_pay_package_approval_workspace() from public,anon,authenticated;
grant execute on function public.get_payroll_pay_package_approval_workspace() to authenticated;
notify pgrst,'reload schema';
