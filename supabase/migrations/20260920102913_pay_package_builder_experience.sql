-- Visual pay-package builder support. Existing payroll calculation, source review,
-- approval and immutable-history rules remain authoritative.
set local lock_timeout='5s';
set local statement_timeout='45s';

-- The business identity is person + BU scope + stream + effective date.
drop index if exists public.payroll_package_effective_unique;
create unique index payroll_package_effective_unique
 on public.payroll_pay_packages(employee_id,scope_id,stream,effective_from)
 where status='approved';

alter table public.payroll_pay_packages drop constraint if exists payroll_pay_packages_rate_type_check;
alter table public.payroll_pay_packages add constraint payroll_pay_packages_rate_type_check
 check(rate_type in ('Monthly','Daily','Hourly','Per invoice','Other approved frequency'));

create table public.payroll_pay_package_documents(
 id uuid primary key default gen_random_uuid(),
 package_id uuid not null references public.payroll_pay_packages(id) on delete restrict,
 storage_path text not null unique,
 file_name text not null check(length(btrim(file_name)) between 1 and 255),
 uploaded_by uuid not null references auth.users(id) on delete restrict,
 uploaded_at timestamptz not null default clock_timestamp()
);
create index payroll_pay_package_documents_package_idx on public.payroll_pay_package_documents(package_id,uploaded_at);
alter table public.payroll_pay_package_documents enable row level security;
revoke all on public.payroll_pay_package_documents from public,anon,authenticated;
create trigger payroll_pay_package_documents_immutable before update or delete on public.payroll_pay_package_documents
 for each row execute function private.payroll_audit_immutable();

create or replace function private.payroll_package_scope_permission(p_employee uuid,p_scope uuid,p_action text,p_stream text)
returns boolean language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null
 and public.can_access_hris_user(p_employee)
 and public.has_sensitive_permission('salary_compensation',case when p_action='view' then 'view' else 'edit' end)
 and exists(
  select 1 from public.hris_users u join public.payroll_access_scopes s on s.id=p_scope
  where u.id=p_employee and s.kind in ('business_unit','payroll_group')
  and (p_stream='professional_fee' or s.business_unit_id=u.business_unit_id)
  and case p_action
   when 'edit' then private.payroll_has_access('prepare_pr',s.id) and public.current_hris_user_id()<>p_employee
   when 'approve' then private.payroll_has_access('authorize_hr',s.id) and public.current_hris_user_id()<>p_employee
   when 'view' then exists(select 1 from unnest(array['prepare_pr','review_endorse','authorize_hr','authorize_finance','approve_bod','release_payroll']) duty where private.payroll_has_access(duty,s.id))
   else false end
 )
$$;
revoke all on function private.payroll_package_scope_permission(uuid,uuid,text,text) from public,anon,authenticated;

create or replace function public.get_payroll_package_directory() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',u.id,'name',u.full_name,'employeeCode',u.employee_id,
  'businessUnit',coalesce(b.name,u.business_unit),'businessUnitId',u.business_unit_id,
  'department',coalesce(d.name,u.department),'departmentId',u.department_id,
  'status',coalesce(u.employment_status::text,u.status::text)
 ) order by u.full_name),'[]')
 from public.hris_users u
 left join public.business_units b on b.id=u.business_unit_id
 left join public.departments d on d.id=u.department_id
 where private.payroll_actor_id() is not null and not coalesce(u.is_duplicate,false)
 and (u.id=public.current_hris_user_id()
  or private.payroll_package_permission(u.id,private.payroll_employee_bu_scope(u.id),'view')
  or exists(select 1 from public.payroll_access_scopes s where private.payroll_package_scope_permission(u.id,s.id,'view','professional_fee')))
$$;

create or replace function public.get_payroll_pay_packages(p_employee_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.hris_users; own boolean; staff boolean; scope uuid; bank_access boolean;
begin
 select * into u from public.hris_users where id=p_employee_id;
 scope:=private.payroll_employee_bu_scope(u.id); own:=u.id=public.current_hris_user_id();
 staff:=private.payroll_package_permission(u.id,scope,'view') or exists(select 1 from public.payroll_access_scopes s where private.payroll_package_scope_permission(u.id,s.id,'view','professional_fee'));
 if private.payroll_actor_id() is null or u.id is null or not coalesce(own or staff,false) then raise exception 'Payroll salary access denied.' using errcode='42501'; end if;
 bank_access:=staff and public.has_sensitive_permission('bank_information','view') and private.payroll_has_access('authorize_finance',scope);
 return jsonb_build_object('employeeId',u.id,'name',u.full_name,'isSelf',own,'scopeId',scope,
 'managed',exists(select 1 from public.payroll_pay_packages where employee_id=u.id and stream='employee_payroll' and status='approved'),
 'canEdit',private.payroll_package_permission(u.id,scope,'edit'),'canApprove',private.payroll_package_permission(u.id,scope,'approve'),
 'sourceHash',case when staff then private.payroll_source_hash(u.id) else null end,
 'scopes',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'businessUnitId',s.business_unit_id,
  'canEdit',private.payroll_package_scope_permission(u.id,s.id,'edit',case when s.business_unit_id=u.business_unit_id then 'employee_payroll' else 'professional_fee' end),
  'canApprove',private.payroll_package_scope_permission(u.id,s.id,'approve',case when s.business_unit_id=u.business_unit_id then 'employee_payroll' else 'professional_fee' end),
  'employeePayroll',s.business_unit_id=u.business_unit_id)
  order by (s.business_unit_id=u.business_unit_id) desc,s.name)
  from public.payroll_access_scopes s where s.kind in ('business_unit','payroll_group') and
  (private.payroll_package_scope_permission(u.id,s.id,'view','employee_payroll') or private.payroll_package_scope_permission(u.id,s.id,'view','professional_fee'))),'[]'),
 'legacy',case when staff or own then jsonb_build_object('rateType',u.rate_type,'rateAmount',u.rate_amount,'salaryBasic',u.salary_basic,'deminimis',u.salary_deminimis,'reimbursable',u.salary_reimbursable,'taxStatus',u.tax_status) else null end,
 'sources',case when staff then jsonb_build_array(private.payroll_source_pay_data(u.id))||coalesce((select jsonb_agg(private.payroll_source_pay_data(u.id,p.id)) from public.pans p where p.employee_id=u.id and p.status::text='Completed' and p.workflow_version>=2 and coalesce((p.action_taken->>'salaryIncrease')::boolean,false)
  and not exists(select 1 from jsonb_array_elements(p.routing_steps) s where s->>'status' is distinct from 'Approved')
  and exists(select 1 from jsonb_array_elements(p.routing_steps) s where private.pan_user_is_bod(s->>'userId'))),'[]') else '[]'::jsonb end,
 'sourceMatches',(select not(coalesce(u.rate_amount,0)>0 and coalesce(u.salary_basic,0)>0 and u.rate_amount<>u.salary_basic) and p.base_amount is not distinct from coalesce(nullif(u.rate_amount,0),u.salary_basic,u.rate_amount) and p.rate_type is not distinct from u.rate_type
  and private.payroll_component_total(p.components,'deminimis')=coalesce(u.salary_deminimis,0) and private.payroll_component_total(p.components,'reimbursable')=coalesce(u.salary_reimbursable,0)
  from public.payroll_pay_packages p where p.employee_id=u.id and p.stream='employee_payroll' and p.status='approved' and p.effective_from<=(now() at time zone 'Asia/Manila')::date order by p.effective_from desc limit 1),
 'packages',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object(
   'effective_until',case when p.status='approved' then (select min(n.effective_from) from public.payroll_pay_packages n where n.employee_id=p.employee_id and n.scope_id=p.scope_id and n.stream=p.stream and n.status='approved' and n.effective_from>p.effective_from) else null end,
   'documents',coalesce((select jsonb_agg(jsonb_build_object('id',doc.id,'path',doc.storage_path,'name',doc.file_name,'uploadedAt',doc.uploaded_at) order by doc.uploaded_at) from public.payroll_pay_package_documents doc where doc.package_id=p.id),'[]'))
  order by p.effective_from desc,p.created_at desc)
  from public.payroll_pay_packages p where p.employee_id=u.id and ((own and p.status in ('approved','superseded')) or private.payroll_package_scope_permission(u.id,p.scope_id,'view',p.stream))),'[]'),
 'settings',coalesce((select jsonb_agg(to_jsonb(s) order by s.effective_from desc) from public.payroll_pay_settings s where staff and (s.scope_id=scope or exists(select 1 from public.payroll_access_scopes a where a.id=s.scope_id and a.kind='organization'))),'[]'),
 'bank',case when bank_access then jsonb_build_object('bankName',u.bank_name,'accountLast4',right(u.bank_account_number,4),'accountType',u.bank_account_type,'fingerprint',private.payroll_bank_hash(u.id),
  'canVerify',public.has_sensitive_permission('bank_information','edit') and u.id<>public.current_hris_user_id(),
  'verified',exists(select 1 from public.payroll_payment_verifications v where v.employee_id=u.id and v.details_hash=private.payroll_bank_hash(u.id))) else null end);
end $$;

create or replace function public.save_payroll_pay_package(p_employee_id uuid,p_scope_id uuid,p_package jsonb,p_source_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result_id uuid; employee_row public.hris_users; selected_source jsonb; pan_id uuid; selected_stream text; replacing uuid;
begin
 select * into employee_row from public.hris_users where id=p_employee_id for update;
 selected_stream:=coalesce(p_package->>'stream','employee_payroll');
 if selected_stream not in ('employee_payroll','professional_fee') then raise exception 'Invalid pay stream.';end if;
 if not private.payroll_package_scope_permission(p_employee_id,p_scope_id,'edit',selected_stream) then raise exception 'User does not have edit access to this payroll scope.' using errcode='42501'; end if;
 if p_source_hash is distinct from private.payroll_source_hash(p_employee_id) then raise exception 'The salary source changed. Refresh the preview before saving.' using errcode='40001'; end if;
 if selected_stream='employee_payroll' and not exists(select 1 from public.payroll_access_scopes s where s.id=p_scope_id and s.business_unit_id=employee_row.business_unit_id) then raise exception 'Approved salary source conflicts with the selected business unit.';end if;
 pan_id:=case when selected_stream='employee_payroll' then nullif(p_package->>'sourcePanId','')::uuid else null end;
 replacing:=nullif(p_package->>'replacesId','')::uuid;
 if replacing is null and exists(select 1 from public.payroll_pay_packages p where p.employee_id=p_employee_id and p.scope_id=p_scope_id and p.stream=selected_stream and p.effective_from=(p_package->>'effectiveFrom')::date and p.status in ('draft','approved')) then raise exception 'Duplicate active package exists for the same employee, business unit, pay stream, and effective date.';end if;
 selected_source:=case when selected_stream='employee_payroll' then private.payroll_source_pay_data(p_employee_id,pan_id) else null end;
 insert into public.payroll_pay_packages(employee_id,scope_id,engagement_key,stream,effective_from,rate_type,base_amount,components,treatment,tax_profile_ref,source_ref,reason,source_hash,source_pan_id,source_pan_hash,replaces_id,created_by)
 values(p_employee_id,p_scope_id,case when selected_stream='employee_payroll' then 'employee' else nullif(p_package->>'engagementKey','') end,selected_stream,(p_package->>'effectiveFrom')::date,p_package->>'rateType',(p_package->>'baseAmount')::numeric,
 coalesce(p_package->'components','[]'),coalesce(p_package->'treatment','{}'),nullif(p_package->>'taxProfileRef',''),p_package->>'sourceRef',p_package->>'reason',p_source_hash,pan_id,selected_source->>'hash',replacing,private.payroll_actor_id()) returning id into result_id;
 insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason) values(p_employee_id,p_scope_id,result_id,private.payroll_actor_id(),'draft',p_package->>'reason');
 return result_id;
end $$;

create or replace function public.review_payroll_pay_package(p_package_id uuid,p_approve boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.payroll_pay_packages;
begin
 select * into strict p from public.payroll_pay_packages where id=p_package_id;
 if not private.payroll_package_scope_permission(p.employee_id,p.scope_id,'approve',p.stream) then raise exception 'Package approval requires scoped HR authorization and existing compensation edit permission.' using errcode='42501'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Record a review reason.'; end if;
 if p_approve then perform private.approve_payroll_package(p.id,private.payroll_actor_id());
 else
  perform 1 from public.hris_users where id=p.employee_id for update;
  update public.payroll_pay_packages set status='rejected' where id=p.id and status='draft';
  if not found then raise exception 'Only a draft can be rejected.';end if;
  insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason) values(p.employee_id,p.scope_id,p.id,private.payroll_actor_id(),'reject',p_reason);
 end if;
end $$;

create function public.attach_payroll_pay_package_document(p_package_id uuid,p_path text,p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.payroll_pay_packages; result_id uuid;
begin
 select * into strict p from public.payroll_pay_packages where id=p_package_id;
 if not private.payroll_package_scope_permission(p.employee_id,p.scope_id,'edit',p.stream) then raise exception 'User does not have edit access to this payroll scope.' using errcode='42501';end if;
 if p.status<>'draft' or p_path not like p.id::text||'/%' or length(btrim(p_name)) not between 1 and 255 or not exists(select 1 from storage.objects where bucket_id='payroll-pay-package-documents' and name=p_path) then raise exception 'Supporting document is unavailable or the package is no longer editable.';end if;
 insert into public.payroll_pay_package_documents(package_id,storage_path,file_name,uploaded_by) values(p.id,p_path,btrim(p_name),private.payroll_actor_id()) returning id into result_id;
 insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason) values(p.employee_id,p.scope_id,p.id,private.payroll_actor_id(),'document_attached','Supporting document attached: '||btrim(p_name));
 return result_id;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payroll-pay-package-documents','payroll-pay-package-documents',false,10485760,array['application/pdf','image/png','image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy payroll_pay_package_document_insert on storage.objects for insert to authenticated with check(
 bucket_id='payroll-pay-package-documents' and exists(select 1 from public.payroll_pay_packages p where p.id=(storage.foldername(name))[1]::uuid and p.status='draft' and private.payroll_package_scope_permission(p.employee_id,p.scope_id,'edit',p.stream)));
create policy payroll_pay_package_document_read on storage.objects for select to authenticated using(
 bucket_id='payroll-pay-package-documents' and exists(select 1 from public.payroll_pay_package_documents d join public.payroll_pay_packages p on p.id=d.package_id where d.storage_path=name and (p.employee_id=public.current_hris_user_id() or private.payroll_package_scope_permission(p.employee_id,p.scope_id,'view',p.stream))));

revoke all on function public.get_payroll_package_directory(),public.get_payroll_pay_packages(uuid),public.save_payroll_pay_package(uuid,uuid,jsonb,text),public.review_payroll_pay_package(uuid,boolean,text),public.attach_payroll_pay_package_document(uuid,text,text) from public,anon,authenticated;
grant execute on function public.get_payroll_package_directory(),public.get_payroll_pay_packages(uuid),public.save_payroll_pay_package(uuid,uuid,jsonb,text),public.review_payroll_pay_package(uuid,boolean,text),public.attach_payroll_pay_package_document(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
