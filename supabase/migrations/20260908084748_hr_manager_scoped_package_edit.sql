create or replace function private.payroll_package_permission(p_employee uuid,p_scope uuid,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and public.can_access_hris_user(p_employee)
 and public.has_sensitive_permission('salary_compensation',case when p_action='view' then 'view' else 'edit' end)
 and exists(select 1 from public.hris_users u join public.payroll_access_scopes s on s.id=p_scope
   where u.id=p_employee and s.business_unit_id=u.business_unit_id and s.kind in ('business_unit','payroll_group')
   and (s.kind='business_unit' or private.payroll_has_access('prepare_pr',private.payroll_employee_bu_scope(u.id))
     or private.payroll_has_access('authorize_hr',private.payroll_employee_bu_scope(u.id))
     or exists(select 1 from public.payroll_pay_packages p where p.employee_id=u.id and p.scope_id=s.id and p.status='approved' and p.stream='employee_payroll'
       and p.effective_from<=(now() at time zone 'Asia/Manila')::date and not exists(select 1 from public.payroll_pay_packages later where later.employee_id=p.employee_id
       and later.engagement_key=p.engagement_key and later.status='approved' and later.effective_from>p.effective_from and later.effective_from<=(now() at time zone 'Asia/Manila')::date))))
 and case p_action
 when 'edit' then (private.payroll_has_access('prepare_pr',p_scope) or (public.has_active_role('HR Manager') and private.payroll_has_access('authorize_hr',p_scope))) and public.current_hris_user_id()<>p_employee
 when 'approve' then private.payroll_has_access('authorize_hr',p_scope) and public.current_hris_user_id()<>p_employee
 when 'view' then exists(select 1 from unnest(array['prepare_pr','review_endorse','authorize_hr','authorize_finance','approve_bod','release_payroll']) duty where private.payroll_has_access(duty,p_scope))
 else false end
$$;
notify pgrst,'reload schema';
