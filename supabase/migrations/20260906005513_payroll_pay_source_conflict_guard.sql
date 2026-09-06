-- Flag PAN/basic-versus-rate conflicts as requiring reconciliation.
-- Only updates the new Phase 2 read RPC; no shared HRIS function or writer changes.
set local lock_timeout='5s';
create or replace function public.get_payroll_pay_packages(p_employee_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.hris_users; own boolean; staff boolean; scope uuid; bank_access boolean;
begin
 select * into u from public.hris_users where id=p_employee_id;
 scope:=private.payroll_employee_bu_scope(u.id); own:=u.id=public.current_hris_user_id();
 staff:=private.payroll_package_permission(u.id,scope,'view') or exists(select 1 from public.payroll_pay_packages p where p.employee_id=u.id and private.payroll_package_permission(u.id,p.scope_id,'view'));
 if private.payroll_actor_id() is null or u.id is null or not coalesce(own or staff,false) then raise exception 'Payroll salary access denied.' using errcode='42501'; end if;
 bank_access:=staff and public.has_sensitive_permission('bank_information','view') and private.payroll_has_access('authorize_finance',scope);
 return jsonb_build_object('employeeId',u.id,'name',u.full_name,'isSelf',own,'scopeId',scope,
 'managed',exists(select 1 from public.payroll_pay_packages where employee_id=u.id and stream='employee_payroll' and status='approved'),'canEdit',private.payroll_package_permission(u.id,scope,'edit'),
 'canApprove',private.payroll_package_permission(u.id,scope,'approve'),'sourceHash',case when staff then private.payroll_source_hash(u.id) else null end,
 'scopes',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'canEdit',private.payroll_package_permission(u.id,s.id,'edit'),'canApprove',private.payroll_package_permission(u.id,s.id,'approve')))
 from public.payroll_access_scopes s where s.business_unit_id=u.business_unit_id and private.payroll_package_permission(u.id,s.id,'view')),'[]'),
 'legacy',case when staff or own then jsonb_build_object('rateType',u.rate_type,'rateAmount',u.rate_amount,'salaryBasic',u.salary_basic,'deminimis',u.salary_deminimis,'reimbursable',u.salary_reimbursable,'taxStatus',u.tax_status) else null end,
 'sources',case when staff then jsonb_build_array(private.payroll_source_pay_data(u.id))||coalesce((select jsonb_agg(private.payroll_source_pay_data(u.id,p.id)) from public.pans p where p.employee_id=u.id and p.status::text='Completed' and p.workflow_version>=2 and coalesce((p.action_taken->>'salaryIncrease')::boolean,false)
 and not exists(select 1 from jsonb_array_elements(p.routing_steps) s where s->>'status' is distinct from 'Approved')
 and exists(select 1 from jsonb_array_elements(p.routing_steps) s where private.pan_user_is_bod(s->>'userId'))),'[]') else '[]'::jsonb end,
 'sourceMatches', (select not (coalesce(u.rate_amount,0)>0 and coalesce(u.salary_basic,0)>0 and u.rate_amount<>u.salary_basic) and p.base_amount is not distinct from coalesce(nullif(u.rate_amount,0),u.salary_basic,u.rate_amount) and p.rate_type is not distinct from u.rate_type
 and private.payroll_component_total(p.components,'deminimis')=coalesce(u.salary_deminimis,0) and private.payroll_component_total(p.components,'reimbursable')=coalesce(u.salary_reimbursable,0)
 from public.payroll_pay_packages p where p.employee_id=u.id and p.stream='employee_payroll' and p.status='approved' and p.effective_from<=(now() at time zone 'Asia/Manila')::date order by p.effective_from desc limit 1),
 'packages',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('effective_until',case when p.status='approved' then (select min(n.effective_from) from public.payroll_pay_packages n where n.employee_id=p.employee_id and n.engagement_key=p.engagement_key and n.status='approved' and n.effective_from>p.effective_from) else null end) order by p.effective_from desc,p.created_at desc)
 from public.payroll_pay_packages p where p.employee_id=u.id and ((own and p.status in ('approved','superseded')) or private.payroll_package_permission(u.id,p.scope_id,'view'))),'[]'),
 'settings',coalesce((select jsonb_agg(to_jsonb(s) order by s.effective_from desc) from public.payroll_pay_settings s where staff and (s.scope_id=scope or exists(select 1 from public.payroll_access_scopes a where a.id=s.scope_id and a.kind='organization'))),'[]'),
 'bank',case when bank_access then jsonb_build_object('bankName',u.bank_name,'accountLast4',right(u.bank_account_number,4),'accountType',u.bank_account_type,'fingerprint',private.payroll_bank_hash(u.id),
 'canVerify',public.has_sensitive_permission('bank_information','edit') and u.id<>public.current_hris_user_id(),
 'verified',exists(select 1 from public.payroll_payment_verifications v where v.employee_id=u.id and v.details_hash=private.payroll_bank_hash(u.id))) else null end);
end $$;
notify pgrst,'reload schema';
