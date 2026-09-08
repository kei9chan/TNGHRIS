-- Carry the approved PAN gross/net choice into payroll source review.
create or replace function private.payroll_source_pay_data(p_employee uuid,p_pan uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.hris_users; p public.pans; v jsonb;
begin
 select * into strict u from public.hris_users where id=p_employee;
 if p_pan is null then return jsonb_build_object('id',null,'label','Current HRIS record','baseAmount',coalesce(nullif(u.rate_amount,0),u.salary_basic,u.rate_amount),
 'rateType',u.rate_type,'deminimis',coalesce(u.salary_deminimis,0),'reimbursable',coalesce(u.salary_reimbursable,0),'payBasis','gross',
 'conflict',u.rate_amount>0 and u.salary_basic>0 and u.rate_amount<>u.salary_basic,'hash',null); end if;
 select * into p from public.pans where id=p_pan and employee_id=p_employee;
 if p.id is null or p.status::text<>'Completed' or p.workflow_version<2 or not coalesce((p.action_taken->>'salaryIncrease')::boolean,false)
 or exists(select 1 from jsonb_array_elements(p.routing_steps) s where s->>'status' is distinct from 'Approved')
 or not exists(select 1 from jsonb_array_elements(p.routing_steps) s where private.pan_user_is_bod(s->>'userId')) then
 raise exception 'Select a completed, approved salary PAN for this employee.' using errcode='42501'; end if;
 v:=p.particulars#>'{to,salary}';
 return jsonb_build_object('id',p.id,'label','Completed PAN '||p.effective_date,'effectiveFrom',p.effective_date,
 'baseAmount',(v->>'basic')::numeric,'deminimis',(v->>'deminimis')::numeric,'reimbursable',(v->>'reimbursable')::numeric,
 'payBasis',coalesce(v->>'payBasis','gross'),'rateType',null,'conflict',false,'hash',md5(to_jsonb(p)::text));
end $$;

create or replace function private.approve_payroll_package(p_package_id uuid,p_approver uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.payroll_pay_packages; replaced public.payroll_pay_packages; source_data jsonb;
begin
 select * into strict p from public.payroll_pay_packages where id=p_package_id;
 perform 1 from public.hris_users where id=p.employee_id for update;
 select * into strict p from public.payroll_pay_packages where id=p_package_id for update;
 if p.status='approved' then return; end if;
 if p.status<>'draft' then raise exception 'Only a draft can be approved.'; end if;
 if p.source_hash is distinct from private.payroll_source_hash(p.employee_id) then raise exception 'The approved history or HRIS salary changed. Refresh and create a new draft.' using errcode='40001'; end if;
 if p.stream='employee_payroll' then
 source_data:=private.payroll_source_pay_data(p.employee_id,p.source_pan_id);
 if coalesce((source_data->>'conflict')::boolean,false) then raise exception 'The HRIS rate and basic salary conflict. Reconcile the existing record or use an approved PAN.'; end if;
 if (source_data->>'baseAmount') is null or p.base_amount is distinct from (source_data->>'baseAmount')::numeric
 or (source_data->>'deminimis') is null or (source_data->>'reimbursable') is null
 or private.payroll_component_total(p.components,'deminimis') is distinct from (source_data->>'deminimis')::numeric
 or private.payroll_component_total(p.components,'reimbursable') is distinct from (source_data->>'reimbursable')::numeric
 or (p.source_pan_id is null and p.rate_type is distinct from source_data->>'rateType') then
 raise exception 'Base pay and existing allowances must match the selected HRIS/PAN source. Use the existing salary workflow for a salary change.'; end if;
 if p.source_pan_id is not null and coalesce(p.treatment->>'payBasis','gross') is distinct from coalesce(source_data->>'payBasis','gross') then
 raise exception 'Gross/net salary arrangement must match the approved PAN.'; end if;
 if p.source_pan_hash is distinct from source_data->>'hash' then raise exception 'PAN source changed; refresh and create a new draft.' using errcode='40001'; end if;
 if p.source_pan_id is not null and p.effective_from is distinct from (source_data->>'effectiveFrom')::date then raise exception 'Use the PAN effective date. Confirm the pay unit from its supporting document.'; end if;
 end if;
 if p.replaces_id is not null then
 select * into strict replaced from public.payroll_pay_packages where id=p.replaces_id;
 if replaced.employee_id<>p.employee_id or replaced.engagement_key<>p.engagement_key or replaced.effective_from<>p.effective_from or replaced.status<>'approved' then raise exception 'Correction must reference the current approved version for the same employee, engagement and date.'; end if;
 update public.payroll_pay_packages set status='superseded' where id=p.replaces_id;
 end if;
 update public.payroll_pay_packages set status='approved',approved_by=p_approver,approved_at=now() where id=p.id;
 insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason) values(p.employee_id,p.scope_id,p.id,p_approver,'approve',p.reason);
end $$;
