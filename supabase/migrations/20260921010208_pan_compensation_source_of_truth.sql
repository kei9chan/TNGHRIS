-- An approved PAN is the compensation approval.  Payroll consumes the
-- effective-dated package created here; employee acknowledgement remains a
-- separate document acknowledgement and never creates a second approval.
set local lock_timeout='5s';
set local statement_timeout='45s';

alter table public.payroll_pay_packages
  add column if not exists source_kind text not null default 'direct_entry'
    check(source_kind in ('approved_pan','direct_entry','copied_package','correction')),
  add column if not exists source_metadata jsonb not null default '{}'::jsonb,
  add column if not exists version_no integer not null default 1 check(version_no>0),
  add column if not exists correction_of_id uuid references public.payroll_pay_packages(id) on delete restrict,
  add column if not exists approval_state text not null default 'draft'
    check(approval_state in ('draft','pending','approved','returned','rejected')),
  add column if not exists approval_steps jsonb not null default '[]'::jsonb;

create unique index if not exists payroll_package_pan_source_unique
  on public.payroll_pay_packages(source_pan_id) where source_pan_id is not null and source_kind='approved_pan';
create index if not exists payroll_package_correction_idx on public.payroll_pay_packages(correction_of_id);

create table if not exists private.pan_compensation_apply_context(
  transaction_id bigint not null,
  employee_id uuid not null,
  pan_id uuid not null references public.pans(id) on delete restrict,
  primary key(transaction_id,employee_id)
);
alter table private.pan_compensation_apply_context enable row level security;
revoke all on private.pan_compensation_apply_context from public,anon,authenticated;

create or replace function public.guard_hris_user_security_update()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (new.role,new.data_access_scope,new.dashboard_type,new.auth_user_id)
       is distinct from (old.role,old.data_access_scope,old.dashboard_type,old.auth_user_id)
     and current_setting('app.rbac_role_update',true) <> 'allowed' then
    raise exception 'Role, scope, dashboard, and authentication links must be changed through the audited RBAC function.' using errcode='42501';
  end if;
  if (new.sss_no is distinct from old.sss_no and not public.has_sensitive_permission('sss','edit'))
      or (new.tin is distinct from old.tin and not public.has_sensitive_permission('tin','edit'))
      or (new.pagibig_no is distinct from old.pagibig_no and not public.has_sensitive_permission('pagibig','edit'))
      or (new.philhealth_no is distinct from old.philhealth_no and not public.has_sensitive_permission('philhealth','edit'))
      or ((new.bank_name,new.bank_account_number,new.bank_account_type) is distinct from (old.bank_name,old.bank_account_number,old.bank_account_type)
          and not public.has_sensitive_permission('bank_information','edit'))
      or ((new.rate_amount,new.salary_basic,new.salary_deminimis,new.salary_reimbursable) is distinct from (old.rate_amount,old.salary_basic,old.salary_deminimis,old.salary_reimbursable)
          and not public.has_sensitive_permission('salary_compensation','edit')
          and not (
            new.rate_amount is not distinct from old.rate_amount and exists(
              select 1 from private.pan_accept_context c join public.pans p on p.id=c.pan_id
              where c.transaction_id=txid_current() and c.employee_id=new.id
                and p.employee_id=public.current_hris_user_id() and p.status::text='Pending Employee'
                and coalesce((p.action_taken->>'salaryIncrease')::boolean,false)
                and new.salary_basic is not distinct from coalesce(nullif(p.particulars#>>'{to,salary,basic}','')::numeric,old.salary_basic)
                and new.salary_deminimis is not distinct from coalesce(nullif(p.particulars#>>'{to,salary,deminimis}','')::numeric,old.salary_deminimis)
                and new.salary_reimbursable is not distinct from coalesce(nullif(p.particulars#>>'{to,salary,reimbursable}','')::numeric,old.salary_reimbursable)
            )
          )
          and not (
            new.rate_amount is not distinct from old.rate_amount and exists(
              select 1 from private.pan_compensation_apply_context c join public.pans p on p.id=c.pan_id
              where c.transaction_id=txid_current() and c.employee_id=new.id and p.employee_id=new.id
                and p.approval_completed_at is not null and p.status::text in ('Pending Employee','Completed')
                and not exists(select 1 from jsonb_array_elements(p.routing_steps) s where s->>'status' is distinct from 'Approved')
                and new.salary_basic is not distinct from coalesce(nullif(p.particulars#>>'{to,salary,basic}','')::numeric,old.salary_basic)
                and new.salary_deminimis is not distinct from coalesce(nullif(p.particulars#>>'{to,salary,deminimis}','')::numeric,old.salary_deminimis)
                and new.salary_reimbursable is not distinct from coalesce(nullif(p.particulars#>>'{to,salary,reimbursable}','')::numeric,old.salary_reimbursable)
            )
          )) then
    raise exception 'Protected HR field update is not authorized.' using errcode='42501';
  end if;
  return new;
end $$;

create or replace function private.validate_payroll_package() returns trigger
language plpgsql set search_path='' as $$
declare c jsonb; key_name text;
begin
 if tg_op='DELETE' then raise exception 'Pay history cannot be deleted.' using errcode='42501'; end if;
 if tg_op='UPDATE' then
   if (to_jsonb(new)-array['status','approved_by','approved_at','approval_steps','approval_state'])
      is distinct from (to_jsonb(old)-array['status','approved_by','approved_at','approval_steps','approval_state']) then
     raise exception 'Create a new pay-package version; history is immutable.' using errcode='42501';
   end if;
   if old.status<>new.status and not ((old.status='draft' and new.status in ('approved','rejected')) or (old.status='approved' and new.status='superseded')) then
     raise exception 'Invalid pay-package status transition.' using errcode='42501';
   end if;
   if old.status='approved' and (new.approved_by,new.approved_at) is distinct from (old.approved_by,old.approved_at) then
     raise exception 'Approved compensation history is immutable.' using errcode='42501';
   end if;
 end if;
 if new.source_kind='approved_pan' and (new.source_pan_id is null or new.status<>'approved' or new.approval_state<>'approved') then
   raise exception 'A PAN-generated package must be an approved, locked compensation record.';
 end if;
 if new.source_kind='correction' and new.correction_of_id is null then raise exception 'A correction must reference its locked source package.'; end if;
 if jsonb_typeof(new.approval_steps)<>'array' or jsonb_typeof(new.source_metadata)<>'object' then raise exception 'Invalid package provenance.'; end if;
 if jsonb_typeof(new.components)<>'array' or jsonb_array_length(new.components)>30 then raise exception 'Use at most 30 pay components.'; end if;
 if jsonb_typeof(new.treatment)<>'object' then raise exception 'Invalid basic-pay treatment.'; end if;
 foreach key_name in array array['tax','sss','philhealth','pagibig','thirteenthMonth','proration'] loop
   if coalesce(new.treatment->>key_name,'unreviewed') not in ('unreviewed','included','excluded','rule_defined') then raise exception 'Invalid treatment.'; end if;
 end loop;
 for c in select * from jsonb_array_elements(new.components) loop
   if jsonb_typeof(c)<>'object' or coalesce(length(btrim(c->>'name')),0) not between 1 and 100
     or coalesce(c->>'recurrence','') not in ('recurring','one_time')
     or coalesce(c->>'amount','') !~ '^[0-9]+(\.[0-9]{1,6})?$'
     or (c->>'amount')::numeric>99999999999999
     or coalesce(c->>'tax','unreviewed') not in ('unreviewed','included','excluded','rule_defined')
     or coalesce(c->>'sss','unreviewed') not in ('unreviewed','included','excluded','rule_defined')
     or coalesce(c->>'philhealth','unreviewed') not in ('unreviewed','included','excluded','rule_defined')
     or coalesce(c->>'pagibig','unreviewed') not in ('unreviewed','included','excluded','rule_defined')
     or coalesce(c->>'thirteenthMonth','unreviewed') not in ('unreviewed','included','excluded','rule_defined')
     or coalesce(c->>'proration','unreviewed') not in ('unreviewed','included','excluded','rule_defined')
     or coalesce(c->>'legacyField','') not in ('','deminimis','reimbursable') then raise exception 'Invalid pay component.'; end if;
   if c->>'recurrence'='one_time' and (nullif(c->>'payableDate','') is null or (c->>'payableDate')::date<new.effective_from) then raise exception 'A one-time component needs a payable date on/after the package start.'; end if;
 end loop;
 return new;
end $$;

create or replace function private.direct_package_approval_steps(p_creator uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare hr public.hris_users; finance public.hris_users; result jsonb:='[]'::jsonb; creator_hris uuid:=public.current_hris_user_id();
begin
 select * into hr from public.hris_users u where lower(u.role)='hr manager' and lower(u.full_name) like '%jedediah%' order by (u.auth_user_id is not null) desc,u.created_at limit 1;
 select * into finance from public.hris_users u where lower(u.full_name) like '%casas%' and lower(u.full_name) like '%lenny%' order by (lower(u.role) like '%finance%') desc,(u.auth_user_id is not null) desc,u.created_at limit 1;
 if hr.id is null then raise exception 'Jedidiah/Jedediah HR Manager is not configured for compensation approval.'; end if;
 if finance.id is null then raise exception 'Lenny Rose Casas · Finance is not configured for compensation approval.'; end if;
 if creator_hris is distinct from hr.id then result:=result||jsonb_build_array(jsonb_build_object('userId',hr.id,'name',hr.full_name,'role','HR Manager','status','Pending')); end if;
 if creator_hris is distinct from finance.id then result:=result||jsonb_build_array(jsonb_build_object('userId',finance.id,'name',finance.full_name,'role','Finance','status','Pending')); end if;
 if jsonb_array_length(result)=0 then raise exception 'The creator cannot approve their own compensation entry.'; end if;
 return result;
end $$;

create or replace function private.apply_approved_pan_compensation(p_pan_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.pans; employee public.hris_users; scope_id uuid; target_bu uuid; pkg_id uuid; auth_actor uuid:=private.payroll_actor_id();
        salary jsonb; components jsonb:='[]'::jsonb; metadata jsonb; previous jsonb; version integer; rate text; basis text; approval_people jsonb;
begin
 select * into strict p from public.pans where id=p_pan_id for update;
 if p.approval_completed_at is null or p.status::text not in ('Pending Employee','Completed')
    or exists(select 1 from jsonb_array_elements(p.routing_steps) s where s->>'status' is distinct from 'Approved') then
   raise exception 'A pending, rejected, expired, or incompletely approved PAN cannot update compensation.';
 end if;
 if not coalesce((p.action_taken->>'salaryIncrease')::boolean,false) then return null; end if;
 select * into strict employee from public.hris_users where id=p.employee_id for update;
 if coalesce(p.particulars#>>'{to,businessUnitId}','') ~* '^[0-9a-f-]{36}$' then target_bu:=(p.particulars#>>'{to,businessUnitId}')::uuid; end if;
 target_bu:=coalesce(target_bu,p.business_unit_id,employee.business_unit_id);
 select s.id into scope_id from public.payroll_access_scopes s where s.business_unit_id=target_bu and s.kind='business_unit' order by s.created_at limit 1;
 if scope_id is null then raise exception 'The approved PAN business unit has no payroll scope. Configure it before final approval.'; end if;
 if exists(select 1 from public.payroll_pay_packages x where x.source_pan_id=p.id and x.source_kind='approved_pan') then
   select x.id into pkg_id from public.payroll_pay_packages x where x.source_pan_id=p.id and x.source_kind='approved_pan'; return pkg_id;
 end if;
 salary:=coalesce(p.particulars#>'{to,salary}','{}'::jsonb); basis:=coalesce(salary->>'payBasis','gross'); rate:=coalesce(employee.rate_type,'Monthly');
 if coalesce((salary->>'basic')::numeric,0)<0 then raise exception 'Approved PAN basic pay is invalid.'; end if;
 if coalesce((salary->>'deminimis')::numeric,0)>0 then components:=components||jsonb_build_array(jsonb_build_object('name','De minimis','amount',salary->>'deminimis','recurrence','recurring','legacyField','deminimis','category','de_minimis','frequency',rate,'paidBy','employer','taxTreatment','non_taxable','tax','excluded','sss','excluded','philhealth','excluded','pagibig','excluded','thirteenthMonth','excluded','proration','rule_defined','effectiveDate',p.effective_date,'eligibilityRule','Approved PAN','policyRef','PAN #'||p.id,'status','active')); end if;
 if coalesce((salary->>'reimbursable')::numeric,0)>0 then components:=components||jsonb_build_array(jsonb_build_object('name','Reimbursable allowance','amount',salary->>'reimbursable','recurrence','recurring','legacyField','reimbursable','category','reimbursable_allowance','frequency',rate,'paidBy','employer','taxTreatment','reimbursable','tax','excluded','sss','excluded','philhealth','excluded','pagibig','excluded','thirteenthMonth','excluded','proration','rule_defined','effectiveDate',p.effective_date,'eligibilityRule','Approved receipt required','policyRef','PAN #'||p.id,'receiptRequired',true,'receiptStatus','receipt_required','status','active')); end if;
 select coalesce(jsonb_agg(jsonb_build_object('userId',s->>'userId','name',coalesce(u.full_name,s->>'name'),'role',coalesce(u.role,s->>'role'),'approvedAt',s->>'timestamp') order by ordinality),'[]'::jsonb)
 into approval_people from jsonb_array_elements(p.routing_steps) with ordinality r(s,ordinality) left join public.hris_users u on u.id=(s->>'userId')::uuid where s->>'status'='Approved';
 select to_jsonb(x) into previous from public.payroll_pay_packages x where x.employee_id=p.employee_id and x.engagement_key='employee' and x.status='approved' and x.effective_from<=p.effective_date order by x.effective_from desc,x.created_at desc limit 1;
 select coalesce(max(x.version_no),0)+1 into version from public.payroll_pay_packages x where x.employee_id=p.employee_id and x.engagement_key='employee';
 metadata:=jsonb_build_object('panReference',p.id,'panApprovalDate',p.approval_completed_at,'approvers',approval_people,'effectiveDate',p.effective_date,'sourceDocument',jsonb_build_object('label','Approved PAN #'||p.id,'url','/employees/pan?item='||p.id),'previousCompensation',previous);
 insert into public.payroll_pay_packages(employee_id,scope_id,engagement_key,stream,effective_from,rate_type,base_amount,components,treatment,tax_profile_ref,source_ref,reason,source_hash,source_pan_hash,source_pan_id,status,created_by,approved_by,approved_at,source_kind,source_metadata,version_no,approval_state,approval_steps)
 values(p.employee_id,scope_id,'employee','employee_payroll',p.effective_date,rate,coalesce((salary->>'basic')::numeric,0),components,
   jsonb_build_object('payBasis',basis,'coverageMode',case when basis='net_tax' then 'net_tax' else 'gross' end,'taxResponsibility',case when basis='net_tax' then 'employer' else 'employee' end,'taxCoverage','entire_package','benefitResponsibility','employee','tax','rule_defined','sss','rule_defined','philhealth','rule_defined','pagibig','rule_defined','thirteenthMonth','rule_defined','proration','rule_defined','calculationVersion','approved-pan-v1'),
   null,'Approved PAN #'||p.id,'Automatically generated from final PAN approval',md5(to_jsonb(p)::text),md5(to_jsonb(p)::text),p.id,'approved',auth_actor,auth_actor,p.approval_completed_at,'approved_pan',metadata,version,'approved',approval_people)
 returning id into pkg_id;
 insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason,previous_value,new_value,source,supporting_documents,calculation_version)
 values(p.employee_id,scope_id,pkg_id,auth_actor,'pan_package_created','PAN approved. Pay package updated automatically.',previous,(select to_jsonb(x) from public.payroll_pay_packages x where x.id=pkg_id),'approved_pan',jsonb_build_array(metadata->'sourceDocument'),'approved-pan-v1');
 if p.effective_date<=(now() at time zone 'Asia/Manila')::date then
   insert into private.pan_compensation_apply_context values(txid_current(),p.employee_id,p.id);
   update public.hris_users set salary_basic=coalesce((salary->>'basic')::numeric,salary_basic),salary_deminimis=coalesce((salary->>'deminimis')::numeric,salary_deminimis),salary_reimbursable=coalesce((salary->>'reimbursable')::numeric,salary_reimbursable) where id=p.employee_id;
   delete from private.pan_compensation_apply_context where transaction_id=txid_current() and employee_id=p.employee_id;
 end if;
 insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason,previous_value,new_value,source,calculation_version)
 values(p.employee_id,scope_id,pkg_id,auth_actor,'employee_compensation_profile_updated','Employee compensation profile now resolves from the approved effective-dated PAN package.',previous,metadata,'approved_pan','approved-pan-v1');
 perform private.pan_notify(p.created_by_user_id,'PAN_UPDATE','Compensation updated automatically',format('PAN %s was approved. The pay package and employee compensation profile were updated automatically.',p.id),format('/payroll/pay-packages?employee=%s&view=review',p.employee_id),p.id,format('pan:%s:compensation-updated',p.id));
 perform private.pan_notify(u.id,'PAN_UPDATE','Approved PAN updated compensation',format('PAN %s was approved. Payroll package version %s is active from %s.',p.id,version,p.effective_date),format('/payroll/pay-packages?employee=%s&view=review',p.employee_id),p.id,format('pan:%s:compensation-updated:%s',p.id,u.id))
 from public.hris_users u
 where (lower(u.role)='hr manager' or (lower(u.full_name) like '%casas%' and lower(u.full_name) like '%lenny%'))
   and u.id is distinct from p.created_by_user_id;
 return pkg_id;
end $$;

create or replace function private.pan_compensation_after_approval() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.approval_completed_at is not null and old.approval_completed_at is null then perform private.apply_approved_pan_compensation(new.id); end if;
 return new;
end $$;
drop trigger if exists pan_compensation_after_approval on public.pans;
create trigger pan_compensation_after_approval after update of approval_completed_at on public.pans for each row execute function private.pan_compensation_after_approval();

create or replace function public.save_payroll_pay_package(p_employee_id uuid,p_scope_id uuid,p_package jsonb,p_source_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result_id uuid; employee_row public.hris_users; selected_source jsonb; selected_stream text; replacing uuid; source_kind text; intent text; steps jsonb:='[]'::jsonb; state text:='draft'; correction uuid;
begin
 select * into employee_row from public.hris_users where id=p_employee_id for update;
 selected_stream:=coalesce(p_package->>'stream','employee_payroll');
 if selected_stream not in ('employee_payroll','professional_fee') then raise exception 'Invalid pay stream.';end if;
 if not private.payroll_package_scope_permission(p_employee_id,p_scope_id,'edit',selected_stream) then raise exception 'User does not have edit access to this payroll scope.' using errcode='42501'; end if;
 if p_source_hash is distinct from private.payroll_source_hash(p_employee_id) then raise exception 'The salary source changed. Refresh the preview before saving.' using errcode='40001'; end if;
 if selected_stream='employee_payroll' and not exists(select 1 from public.payroll_access_scopes s where s.id=p_scope_id and s.business_unit_id=employee_row.business_unit_id) then raise exception 'Approved salary source conflicts with the selected business unit.';end if;
 replacing:=nullif(p_package->>'replacesId','')::uuid; correction:=nullif(p_package->>'correctionOfId','')::uuid;
 source_kind:=coalesce(nullif(p_package->>'sourceKind',''),'direct_entry');
 if source_kind not in ('direct_entry','copied_package','correction') then raise exception 'Approved PAN packages are created only by the PAN approval workflow.'; end if;
 if source_kind='correction' and not exists(select 1 from public.payroll_pay_packages x where x.id=correction and x.employee_id=p_employee_id and x.source_kind='approved_pan') then raise exception 'Create a correction from the locked approved PAN package.'; end if;
 if replacing is null and exists(select 1 from public.payroll_pay_packages x where x.employee_id=p_employee_id and x.scope_id=p_scope_id and x.stream=selected_stream and x.effective_from=(p_package->>'effectiveFrom')::date and x.status in ('draft','approved')) then raise exception 'Duplicate active package exists for the same employee, business unit, pay stream, and effective date.';end if;
 selected_source:=case when selected_stream='employee_payroll' then private.payroll_source_pay_data(p_employee_id,null) else null end;
 intent:=coalesce(p_package#>>'{treatment,submissionIntent}','draft');
 if intent='approval' then steps:=private.direct_package_approval_steps(private.payroll_actor_id());state:='pending'; end if;
 insert into public.payroll_pay_packages(employee_id,scope_id,engagement_key,stream,effective_from,rate_type,base_amount,components,treatment,tax_profile_ref,source_ref,reason,source_hash,source_pan_id,source_pan_hash,replaces_id,created_by,source_kind,source_metadata,version_no,correction_of_id,approval_state,approval_steps)
 values(p_employee_id,p_scope_id,case when selected_stream='employee_payroll' then 'employee' else nullif(p_package->>'engagementKey','') end,selected_stream,(p_package->>'effectiveFrom')::date,p_package->>'rateType',(p_package->>'baseAmount')::numeric,
 coalesce(p_package->'components','[]'),coalesce(p_package->'treatment','{}'),nullif(p_package->>'taxProfileRef',''),p_package->>'sourceRef',p_package->>'reason',p_source_hash,null,selected_source->>'hash',replacing,private.payroll_actor_id(),source_kind,
 jsonb_build_object('label',case source_kind when 'correction' then 'Correction to approved PAN package' when 'copied_package' then 'Copied from previous approved package' else 'Direct compensation entry' end,'submittedAt',case when intent='approval' then now() else null end),
 coalesce((select max(x.version_no)+1 from public.payroll_pay_packages x where x.employee_id=p_employee_id and x.engagement_key=case when selected_stream='employee_payroll' then 'employee' else nullif(p_package->>'engagementKey','') end),1),correction,state,steps) returning id into result_id;
 insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason,new_value,source,calculation_version) values(p_employee_id,p_scope_id,result_id,private.payroll_actor_id(),case when intent='approval' then 'submitted_for_approval' else 'draft' end,p_package->>'reason',(select to_jsonb(x) from public.payroll_pay_packages x where x.id=result_id),source_kind,'pay-package-builder-v2');
 return result_id;
end $$;

create or replace function public.review_payroll_pay_package(p_package_id uuid,p_approve boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.payroll_pay_packages; actor uuid:=public.current_hris_user_id(); actor_auth uuid:=private.payroll_actor_id(); rebuilt jsonb:='[]'::jsonb; step jsonb; found boolean:=false; first_pending uuid; all_done boolean;
begin
 select * into strict p from public.payroll_pay_packages where id=p_package_id for update;
 if p.source_kind='approved_pan' then raise exception 'PAN approval is the compensation approval. Create a correction instead of reapproving or editing this package.'; end if;
 if p.status<>'draft' or p.approval_state<>'pending' then raise exception 'This package is not pending compensation approval.'; end if;
 if p.created_by=actor_auth then raise exception 'The creator cannot approve their own compensation entry.' using errcode='42501'; end if;
 select (s->>'userId')::uuid into first_pending from jsonb_array_elements(p.approval_steps) s where s->>'status'='Pending' limit 1;
 if first_pending is distinct from actor then raise exception 'This compensation entry is awaiting the assigned approver.' using errcode='42501'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Record a review reason.'; end if;
 for step in select value from jsonb_array_elements(p.approval_steps) loop
   if not found and step->>'status'='Pending' and step->>'userId'=actor::text then step:=step||jsonb_build_object('status',case when p_approve then 'Approved' else 'Rejected' end,'timestamp',now(),'notes',btrim(p_reason));found:=true;end if;
   rebuilt:=rebuilt||jsonb_build_array(step);
 end loop;
 if not found then raise exception 'You are not an assigned approver.' using errcode='42501'; end if;
 if not p_approve then
   update public.payroll_pay_packages set approval_steps=rebuilt,approval_state='rejected',status='rejected' where id=p.id;
   insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason,previous_value,new_value,source,calculation_version) values(p.employee_id,p.scope_id,p.id,actor_auth,'reject',p_reason,to_jsonb(p),(select to_jsonb(x) from public.payroll_pay_packages x where x.id=p.id),p.source_kind,'pay-package-builder-v2');return;
 end if;
 select not exists(select 1 from jsonb_array_elements(rebuilt) s where s->>'status'<>'Approved') into all_done;
 update public.payroll_pay_packages set approval_steps=rebuilt,approval_state=case when all_done then 'approved' else 'pending' end where id=p.id;
 if all_done then perform private.approve_payroll_package(p.id,actor_auth); end if;
 insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason,previous_value,new_value,source,calculation_version) values(p.employee_id,p.scope_id,p.id,actor_auth,case when all_done then 'approve_and_activate' else 'approval_step' end,p_reason,to_jsonb(p),(select to_jsonb(x) from public.payroll_pay_packages x where x.id=p.id),p.source_kind,'pay-package-builder-v2');
end $$;

create or replace function private.approve_payroll_package(p_package_id uuid,p_approver uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.payroll_pay_packages; replaced public.payroll_pay_packages;
begin
 select * into strict p from public.payroll_pay_packages where id=p_package_id;
 perform 1 from public.hris_users where id=p.employee_id for update;
 select * into strict p from public.payroll_pay_packages where id=p_package_id for update;
 if p.status='approved' then return;end if;
 if p.status<>'draft' then raise exception 'Only a draft can be approved.';end if;
 if p.source_kind='approved_pan' then raise exception 'PAN-generated packages are approved only by the PAN workflow.';end if;
 if p.approval_state<>'approved' or exists(select 1 from jsonb_array_elements(p.approval_steps) s where s->>'status'<>'Approved') then raise exception 'Both assigned compensation approvals must be completed first.';end if;
 if p.source_hash is distinct from private.payroll_source_hash(p.employee_id) then raise exception 'The approved history or employee compensation changed. Refresh and create a new draft.' using errcode='40001';end if;
 if p.replaces_id is not null then
  select * into strict replaced from public.payroll_pay_packages where id=p.replaces_id;
  if replaced.employee_id<>p.employee_id or replaced.engagement_key<>p.engagement_key or replaced.effective_from<>p.effective_from or replaced.status<>'approved' then raise exception 'A same-date correction must reference the current approved version.';end if;
  update public.payroll_pay_packages set status='superseded' where id=p.replaces_id;
 end if;
 update public.payroll_pay_packages set status='approved',approved_by=p_approver,approved_at=now() where id=p.id;
 insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason,previous_value,new_value,source,calculation_version)
 values(p.employee_id,p.scope_id,p.id,p_approver,'approve',p.reason,to_jsonb(p),(select to_jsonb(x) from public.payroll_pay_packages x where x.id=p.id),p.source_kind,'pay-package-builder-v2');
end $$;

create or replace function public.get_employee_compensation_profile(p_employee_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare own boolean:=p_employee_id=public.current_hris_user_id(); allowed boolean;
begin
 allowed:=own or (public.can_access_hris_user(p_employee_id) and public.has_sensitive_permission('salary_compensation','view'));
 if not coalesce(allowed,false) then raise exception 'Compensation profile access denied.' using errcode='42501'; end if;
 return jsonb_build_object(
  'current',(select to_jsonb(x) from public.payroll_pay_packages x where x.employee_id=p_employee_id and x.stream='employee_payroll' and x.status='approved' and x.effective_from<=(now() at time zone 'Asia/Manila')::date order by x.effective_from desc,x.created_at desc limit 1),
  'upcoming',(select to_jsonb(x) from public.payroll_pay_packages x where x.employee_id=p_employee_id and x.stream='employee_payroll' and x.status='approved' and x.effective_from>(now() at time zone 'Asia/Manila')::date order by x.effective_from,x.created_at limit 1),
  'consultantPackages',coalesce((select jsonb_agg(to_jsonb(x) order by x.effective_from desc) from public.payroll_pay_packages x where x.employee_id=p_employee_id and x.stream='professional_fee' and x.status='approved'),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(to_jsonb(x) order by x.effective_from desc,x.created_at desc) from public.payroll_pay_packages x where x.employee_id=p_employee_id and x.status in ('approved','superseded')),'[]'::jsonb));
end $$;

-- Employee acceptance acknowledges the document.  Compensation was already
-- approved and versioned, so acceptance must not create or approve it again.
create or replace function public.accept_pan(p_pan_id uuid,p_signature_data_url text,p_signature_name text) returns public.pans
language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=public.current_hris_user_id(); pan_row public.pans; bod_approved boolean; all_approved boolean; to_data jsonb; action_data jsonb;
 next_position text;next_department text;next_employment_status text;next_business_unit text;next_business_unit_id uuid; apply_current boolean;
begin
 if actor_id is null then raise exception 'Authentication required.' using errcode='42501';end if;
 if nullif(trim(coalesce(p_signature_name,'')),'') is null or nullif(trim(coalesce(p_signature_data_url,'')),'') is null then raise exception 'Your typed name and signature are required.';end if;
 select * into pan_row from public.pans where id=p_pan_id for update;
 if pan_row.id is null then raise exception 'PAN record not found.';end if;
 if pan_row.employee_id is distinct from actor_id then raise exception 'Only the employee named in this PAN may accept it.' using errcode='42501';end if;
 if pan_row.status::text='Completed' and pan_row.accepted_by=actor_id then return pan_row;end if;
 if pan_row.status::text<>'Pending Employee' then raise exception 'This PAN is not awaiting employee acceptance.';end if;
 select not exists(select 1 from jsonb_array_elements(pan_row.routing_steps) s where s->>'status'<>'Approved') into all_approved;
 select exists(select 1 from jsonb_array_elements(pan_row.routing_steps) s where s->>'status'='Approved' and private.pan_user_is_bod(s->>'userId')) into bod_approved;
 if pan_row.workflow_version>=2 and (not all_approved or not bod_approved) then raise exception 'Required approvals, including Board of Director approval, are incomplete.';end if;
 if coalesce((pan_row.action_taken->>'salaryIncrease')::boolean,false) and not exists(select 1 from public.payroll_pay_packages x where x.source_pan_id=pan_row.id and x.source_kind='approved_pan' and x.status='approved') then raise exception 'The approved compensation package is missing. HR must resolve it before employee acknowledgement.';end if;
 to_data:=coalesce(pan_row.particulars->'to','{}'::jsonb);action_data:=coalesce(pan_row.action_taken,'{}'::jsonb);
 next_position:=nullif(trim(to_data->>'position'),'');next_department:=nullif(trim(to_data->>'department'),'');next_employment_status:=nullif(trim(to_data->>'employmentStatus'),'');next_business_unit:=nullif(trim(to_data->>'businessUnit'),'');
 if coalesce(to_data->>'businessUnitId','')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then next_business_unit_id:=(to_data->>'businessUnitId')::uuid;end if;
 apply_current:=pan_row.effective_date<=(now() at time zone 'Asia/Manila')::date;
 if pan_row.workflow_version>=2 then
  insert into private.pan_accept_context(transaction_id,employee_id,pan_id) values(txid_current(),actor_id,p_pan_id);
  update public.hris_users set
   position=case when coalesce((action_data->>'promotion')::boolean,false) or coalesce((action_data->>'changeOfJobTitle')::boolean,false) or coalesce((action_data->>'transfer')::boolean,false) then case when lower(coalesce(next_position,'')) in('same','not applicable') then position else coalesce(next_position,position) end else position end,
   department=case when coalesce((action_data->>'transfer')::boolean,false) then case when lower(coalesce(next_department,'')) in('same','not applicable') then department else coalesce(next_department,department) end else department end,
   business_unit=case when coalesce((action_data->>'transfer')::boolean,false) then case when lower(coalesce(next_business_unit,'')) in('same','not applicable') then business_unit else coalesce(next_business_unit,business_unit) end else business_unit end,
   business_unit_id=case when coalesce((action_data->>'transfer')::boolean,false) then coalesce(next_business_unit_id,business_unit_id) else business_unit_id end,
   employment_status=case when coalesce((action_data->>'changeOfStatus')::boolean,false) then case when lower(coalesce(next_employment_status,'')) in('same','not applicable') then employment_status else coalesce(next_employment_status,employment_status) end else employment_status end,
   salary_basic=case when apply_current and coalesce((action_data->>'salaryIncrease')::boolean,false) then coalesce(nullif(to_data#>>'{salary,basic}','')::numeric,salary_basic) else salary_basic end,
   salary_deminimis=case when apply_current and coalesce((action_data->>'salaryIncrease')::boolean,false) then coalesce(nullif(to_data#>>'{salary,deminimis}','')::numeric,salary_deminimis) else salary_deminimis end,
   salary_reimbursable=case when apply_current and coalesce((action_data->>'salaryIncrease')::boolean,false) then coalesce(nullif(to_data#>>'{salary,reimbursable}','')::numeric,salary_reimbursable) else salary_reimbursable end
  where id=pan_row.employee_id;
  delete from private.pan_accept_context where transaction_id=txid_current() and employee_id=actor_id;
 end if;
 update public.pans set status='Completed',signed_at=now(),signature_data_url=p_signature_data_url,signature_name=trim(p_signature_name),accepted_at=now(),accepted_by=actor_id,
  applied_at=case when workflow_version>=2 and apply_current then coalesce(applied_at,now()) else applied_at end,updated_at=now() where id=p_pan_id returning * into pan_row;
 perform private.pan_notify(pan_row.created_by_user_id,'PAN_UPDATE','PAN Accepted',format('%s acknowledged and accepted PAN %s.',pan_row.employee_name,p_pan_id),format('/employees/pan?item=%s',p_pan_id),p_pan_id,format('pan:%s:accepted',p_pan_id));
 perform private.pan_audit('ACCEPT',p_pan_id,jsonb_build_object('employeeId',actor_id,'status','Completed','compensationAlreadyApproved',coalesce((action_data->>'salaryIncrease')::boolean,false),'employeeRecordApplied',pan_row.workflow_version>=2 and apply_current));
 return pan_row;
end $$;

revoke all on function public.get_employee_compensation_profile(uuid) from public,anon,authenticated;
grant execute on function public.get_employee_compensation_profile(uuid) to authenticated;
notify pgrst,'reload schema';
