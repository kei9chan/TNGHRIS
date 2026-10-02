-- Cheap preflight for saved attendance; source freshness remains enforced by calculation.
create function public.get_payroll_calculation_preflight(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.payroll_time_packages; e jsonb; p jsonb; live jsonb; issues jsonb:='[]'; label text;
begin
 if auth.uid() is null or not private.payroll_gross_permission(p_scope,'view') then
 raise exception 'Payroll compensation access required.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>62 then raise exception 'Choose a valid cutoff of up to 63 days.';end if;
 select * into t from public.payroll_time_packages x where x.scope_id=p_scope and x.date_from=p_from and x.date_to=p_to and x.status='submitted' order by version desc limit 1;
 if t.id is null then return jsonb_build_object('issues',jsonb_build_array(jsonb_build_object('code','attendance','message','Submit attendance for this cutoff first.')));end if;
 if exists(select 1 from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d
 where not exists(select 1 from public.payroll_gross_rules r where r.scope_id=p_scope and d::date between r.effective_from and r.effective_to)) then
 issues:=issues||jsonb_build_array(jsonb_build_object('code','rules','message','Approved calculation rules do not cover the whole cutoff. Complete the rule setup below.'));end if;
 for e in select value from jsonb_array_elements(t.source_snapshot->'employees') loop
 if not public.can_access_hris_user((e->>'id')::uuid) or not private.payroll_package_permission((e->>'id')::uuid,p_scope,'view') then raise exception 'Employee compensation access denied.' using errcode='42501';end if;
 label:=coalesce(e->>'name',e->>'id');
 if exists(select 1 from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d
 where not exists(select 1 from public.payroll_pay_packages x where x.employee_id=(e->>'id')::uuid and x.status='approved' and x.stream='employee_payroll' and x.effective_from<=d::date)) then
 issues:=issues||jsonb_build_array(jsonb_build_object('code','package','employeeName',label,'message',label||': approved pay package does not cover the whole cutoff.'));end if;
 select to_jsonb(x) into p from public.payroll_pay_packages x where x.employee_id=(e->>'id')::uuid and x.status='approved' and x.stream='employee_payroll' and x.effective_from<=(now() at time zone 'Asia/Manila')::date order by x.effective_from desc limit 1;
 live:=private.payroll_source_pay_data((e->>'id')::uuid);
 if p is not null and (coalesce((live->>'conflict')::boolean,false) or (p->>'base_amount')::numeric is distinct from (live->>'baseAmount')::numeric or p->>'rate_type' is distinct from live->>'rateType'
 or private.payroll_component_total(p->'components','deminimis') is distinct from (live->>'deminimis')::numeric
 or private.payroll_component_total(p->'components','reimbursable') is distinct from (live->>'reimbursable')::numeric) then
 issues:=issues||jsonb_build_array(jsonb_build_object('code','package','employeeName',label,'message',label||': profile compensation differs from the approved pay package. Reconcile the two before calculation.'));end if;
 if exists(select 1 from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d join public.payroll_confirmed_policy policy on d::date>=policy.effective_from
 where not exists(select 1 from public.payroll_employee_rule_versions r where r.employee_id=(e->>'id')::uuid and d::date between r.effective_from and r.effective_to)) then
 issues:=issues||jsonb_build_array(jsonb_build_object('code','employee_rules','employeeId',e->>'id','canApprove',private.payroll_package_permission((e->>'id')::uuid,p_scope,'approve'),'compensationType',p->>'rate_type','employeeName',label,'message',label||': compensation type, workweek and divisor need dated HR confirmation.'));end if;
 end loop;
 return jsonb_build_object('issues',issues);
end $$;
revoke all on function public.get_payroll_calculation_preflight(uuid,date,date) from public,anon;
grant execute on function public.get_payroll_calculation_preflight(uuid,date,date) to authenticated;
