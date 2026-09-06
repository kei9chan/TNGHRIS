-- Lean Phase 2. Reuses staging 1C's immutable versions, exact amounts, source
-- evidence and serialized effective dates; replaces its role-based access model.
-- Isolated implementation: no existing function/policy/trigger is replaced,
-- no HRIS salary is written, and no scheduled job or extension is installed.
set local lock_timeout='5s';
set local statement_timeout='45s';

create table public.payroll_pay_packages (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.hris_users(id) on delete restrict,
 scope_id uuid not null references public.payroll_access_scopes(id) on delete restrict,
 engagement_key text not null default 'employee' check(length(btrim(engagement_key)) between 1 and 100),
 stream text not null default 'employee_payroll' check(stream in ('employee_payroll','professional_fee')),
 effective_from date not null, rate_type text not null check(rate_type in ('Monthly','Daily','Hourly')),
 base_amount numeric(20,6) not null check(base_amount>=0 and base_amount<'Infinity'::numeric), currency text not null default 'PHP' check(currency='PHP'),
 components jsonb not null default '[]', treatment jsonb not null default '{}', tax_profile_ref text,
 source_ref text not null check(length(btrim(source_ref)) between 3 and 1000), reason text not null check(length(btrim(reason)) between 3 and 1000),
 source_hash text not null, source_pan_hash text, source_pan_id uuid references public.pans(id) on delete restrict,
 status text not null default 'draft' check(status in ('draft','approved','superseded','rejected')),
 replaces_id uuid references public.payroll_pay_packages(id) on delete restrict,
 created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
 approved_by uuid references auth.users(id) on delete restrict, approved_at timestamptz,
 check((status in ('approved','superseded'))=(approved_by is not null and approved_at is not null)),
 check((stream='employee_payroll' and engagement_key='employee') or (stream='professional_fee' and engagement_key<>'employee' and tax_profile_ref is not null and length(btrim(tax_profile_ref))>=3))
);
create unique index payroll_package_effective_unique on public.payroll_pay_packages(employee_id,engagement_key,effective_from) where status='approved';
create index payroll_package_pan_idx on public.payroll_pay_packages(source_pan_id);
create index payroll_package_scope_idx on public.payroll_pay_packages(scope_id);
create index payroll_package_creator_idx on public.payroll_pay_packages(created_by);
create index payroll_package_approver_idx on public.payroll_pay_packages(approved_by);
create index payroll_package_replaces_idx on public.payroll_pay_packages(replaces_id);

create table public.payroll_pay_audit (
 id uuid primary key default gen_random_uuid(), employee_id uuid references public.hris_users(id) on delete restrict,
 scope_id uuid not null references public.payroll_access_scopes(id) on delete restrict,
 package_id uuid references public.payroll_pay_packages(id) on delete restrict,
 actor_id uuid references auth.users(id) on delete restrict, action text not null, reason text not null,
 occurred_at timestamptz not null default now()
);
create index payroll_pay_audit_employee_idx on public.payroll_pay_audit(employee_id,occurred_at desc);
create index payroll_pay_audit_scope_idx on public.payroll_pay_audit(scope_id);
create index payroll_pay_audit_package_idx on public.payroll_pay_audit(package_id);
create index payroll_pay_audit_actor_idx on public.payroll_pay_audit(actor_id);

-- Verification references the existing bank master; never a second bank writer.
create table public.payroll_payment_verifications (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.hris_users(id) on delete restrict,
 details_hash text not null, source_ref text not null check(length(btrim(source_ref)) between 3 and 1000),
 verified_by uuid not null references auth.users(id) on delete restrict, verified_at timestamptz not null default now()
);
create index payroll_payment_employee_idx on public.payroll_payment_verifications(employee_id,verified_at desc);
create index payroll_payment_verifier_idx on public.payroll_payment_verifications(verified_by);

create table public.payroll_pay_settings (
 id uuid primary key default gen_random_uuid(), scope_id uuid not null references public.payroll_access_scopes(id) on delete restrict,
 effective_from date not null, calendar jsonb not null, holiday_handling text not null check(holiday_handling in ('unconfirmed','previous_business_day','next_business_day','unchanged')),
 policy_ref text not null check(length(btrim(policy_ref)) between 3 and 1000),
 approved_by uuid not null references auth.users(id) on delete restrict, approved_at timestamptz not null default now(),
 unique(scope_id,effective_from)
);
create index payroll_settings_approver_idx on public.payroll_pay_settings(approved_by);

alter table public.payroll_pay_packages enable row level security;
alter table public.payroll_pay_audit enable row level security;
alter table public.payroll_payment_verifications enable row level security;
alter table public.payroll_pay_settings enable row level security;
revoke all on public.payroll_pay_packages,public.payroll_pay_audit,public.payroll_payment_verifications,public.payroll_pay_settings from public,anon,authenticated;

create function private.payroll_employee_bu_scope(p_employee uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select s.id from public.hris_users u join public.payroll_access_scopes s on s.business_unit_id=u.business_unit_id and s.kind='business_unit' where u.id=p_employee
$$;
create function private.payroll_package_permission(p_employee uuid,p_scope uuid,p_action text) returns boolean
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
 when 'edit' then private.payroll_has_access('prepare_pr',p_scope) and public.current_hris_user_id()<>p_employee
 when 'approve' then private.payroll_has_access('authorize_hr',p_scope) and public.current_hris_user_id()<>p_employee
 when 'view' then exists(select 1 from unnest(array['prepare_pr','review_endorse','authorize_hr','authorize_finance','approve_bod','release_payroll']) duty where private.payroll_has_access(duty,p_scope))
 else false end
$$;
create function private.payroll_source_hash(p_employee uuid) returns text
language sql stable security definer set search_path='' as $$
 select md5(jsonb_build_array(u.rate_type,u.rate_amount,u.salary_basic,u.salary_deminimis,u.salary_reimbursable,u.tax_status,u.business_unit_id,
 (select coalesce(string_agg(p.id::text,',' order by p.id),'') from public.payroll_pay_packages p where p.employee_id=u.id and p.status in ('approved','superseded')))::text)
 from public.hris_users u where u.id=p_employee
$$;
create function private.payroll_bank_hash(p_employee uuid) returns text
language sql stable security definer set search_path='' as $$
 select md5(jsonb_build_array(bank_name,bank_account_number,bank_account_type)::text) from public.hris_users where id=p_employee
$$;
create function private.payroll_component_total(p_components jsonb,p_legacy text) returns numeric
language sql immutable set search_path='' as $$
 select coalesce(sum((x->>'amount')::numeric),0) from jsonb_array_elements(p_components) x where x->>'legacyField'=p_legacy and x->>'recurrence'='recurring'
$$;

-- HRIS/PAN remains the sole writer of base salary and its existing allowances.
-- Payroll records immutable reviewed snapshots; it cannot overwrite that master.
create function private.payroll_source_pay_data(p_employee uuid,p_pan uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.hris_users; p public.pans; v jsonb;
begin
 select * into strict u from public.hris_users where id=p_employee;
 if p_pan is null then return jsonb_build_object('id',null,'label','Current HRIS record','baseAmount',coalesce(nullif(u.rate_amount,0),u.salary_basic,u.rate_amount),
 'rateType',u.rate_type,'deminimis',coalesce(u.salary_deminimis,0),'reimbursable',coalesce(u.salary_reimbursable,0),
 'conflict',u.rate_amount>0 and u.salary_basic>0 and u.rate_amount<>u.salary_basic,'hash',null); end if;
 select * into p from public.pans where id=p_pan and employee_id=p_employee;
 if p.id is null or p.status::text<>'Completed' or p.workflow_version<2 or not coalesce((p.action_taken->>'salaryIncrease')::boolean,false)
 or exists(select 1 from jsonb_array_elements(p.routing_steps) s where s->>'status' is distinct from 'Approved')
 or not exists(select 1 from jsonb_array_elements(p.routing_steps) s where private.pan_user_is_bod(s->>'userId')) then
 raise exception 'Select a completed, approved salary PAN for this employee.' using errcode='42501'; end if;
 v:=p.particulars#>'{to,salary}';
 return jsonb_build_object('id',p.id,'label','Completed PAN '||p.effective_date,'effectiveFrom',p.effective_date,
 'baseAmount',(v->>'basic')::numeric,'deminimis',(v->>'deminimis')::numeric,'reimbursable',(v->>'reimbursable')::numeric,
 'rateType',null,'conflict',false,'hash',md5(to_jsonb(p)::text));
end $$;

create function private.validate_payroll_package() returns trigger
language plpgsql set search_path='' as $$
declare c jsonb; key_name text;
begin
 if tg_op='DELETE' then raise exception 'Pay history cannot be deleted.' using errcode='42501'; end if;
 if tg_op='UPDATE' and ((to_jsonb(new)-array['status','approved_by','approved_at']) is distinct from (to_jsonb(old)-array['status','approved_by','approved_at'])
 or not ((old.status='draft' and new.status in ('approved','rejected')) or (old.status='approved' and new.status='superseded'))
 or (old.status='approved' and (new.approved_by,new.approved_at) is distinct from (old.approved_by,old.approved_at))) then
 raise exception 'Create a new pay-package version; history is immutable.' using errcode='42501'; end if;
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
create trigger payroll_package_guard before insert or update or delete on public.payroll_pay_packages for each row execute function private.validate_payroll_package();
create trigger payroll_pay_audit_immutable before update or delete on public.payroll_pay_audit for each row execute function private.payroll_audit_immutable();
create trigger payroll_payment_immutable before update or delete on public.payroll_payment_verifications for each row execute function private.payroll_audit_immutable();
create trigger payroll_settings_immutable before update or delete on public.payroll_pay_settings for each row execute function private.payroll_audit_immutable();

create function public.get_payroll_package_directory() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name,'employeeCode',u.employee_id) order by u.full_name),'[]')
 from public.hris_users u where private.payroll_actor_id() is not null and not coalesce(u.is_duplicate,false)
 and (u.id=public.current_hris_user_id() or private.payroll_package_permission(u.id,private.payroll_employee_bu_scope(u.id),'view')
 or exists(select 1 from public.payroll_access_scopes s where s.kind='payroll_group' and s.business_unit_id=u.business_unit_id
 and exists(select 1 from public.payroll_pay_packages p where p.employee_id=u.id and p.scope_id=s.id) and private.payroll_package_permission(u.id,s.id,'view')))
$$;

create function public.get_payroll_pay_packages(p_employee_id uuid) returns jsonb
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
 'sourceMatches', (select p.base_amount is not distinct from coalesce(nullif(u.rate_amount,0),u.salary_basic,u.rate_amount) and p.rate_type is not distinct from u.rate_type
 and private.payroll_component_total(p.components,'deminimis')=coalesce(u.salary_deminimis,0) and private.payroll_component_total(p.components,'reimbursable')=coalesce(u.salary_reimbursable,0)
 from public.payroll_pay_packages p where p.employee_id=u.id and p.stream='employee_payroll' and p.status='approved' and p.effective_from<=(now() at time zone 'Asia/Manila')::date order by p.effective_from desc limit 1),
 'packages',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('effective_until',case when p.status='approved' then (select min(n.effective_from) from public.payroll_pay_packages n where n.employee_id=p.employee_id and n.engagement_key=p.engagement_key and n.status='approved' and n.effective_from>p.effective_from) else null end) order by p.effective_from desc,p.created_at desc)
 from public.payroll_pay_packages p where p.employee_id=u.id and ((own and p.status in ('approved','superseded')) or private.payroll_package_permission(u.id,p.scope_id,'view'))),'[]'),
 'settings',coalesce((select jsonb_agg(to_jsonb(s) order by s.effective_from desc) from public.payroll_pay_settings s where staff and (s.scope_id=scope or exists(select 1 from public.payroll_access_scopes a where a.id=s.scope_id and a.kind='organization'))),'[]'),
 'bank',case when bank_access then jsonb_build_object('bankName',u.bank_name,'accountLast4',right(u.bank_account_number,4),'accountType',u.bank_account_type,'fingerprint',private.payroll_bank_hash(u.id),
 'canVerify',public.has_sensitive_permission('bank_information','edit') and u.id<>public.current_hris_user_id(),
 'verified',exists(select 1 from public.payroll_payment_verifications v where v.employee_id=u.id and v.details_hash=private.payroll_bank_hash(u.id))) else null end);
end $$;

create function public.save_payroll_pay_package(p_employee_id uuid,p_scope_id uuid,p_package jsonb,p_source_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result_id uuid; employee_row public.hris_users; selected_source jsonb; pan_id uuid;
begin
 select * into employee_row from public.hris_users where id=p_employee_id for update;
 if not private.payroll_package_permission(p_employee_id,p_scope_id,'edit') then raise exception 'Preparing a package requires scoped Prepare PR access and existing compensation edit permission.' using errcode='42501'; end if;
 if p_source_hash is distinct from private.payroll_source_hash(p_employee_id) then raise exception 'The salary source changed. Refresh the preview before saving.' using errcode='40001'; end if;
 pan_id:=nullif(p_package->>'sourcePanId','')::uuid;
 selected_source:=private.payroll_source_pay_data(p_employee_id,pan_id);
 insert into public.payroll_pay_packages(employee_id,scope_id,engagement_key,stream,effective_from,rate_type,base_amount,components,treatment,tax_profile_ref,source_ref,reason,source_hash,source_pan_id,source_pan_hash,replaces_id,created_by)
 values(p_employee_id,p_scope_id,coalesce(nullif(p_package->>'engagementKey',''),'employee'),coalesce(p_package->>'stream','employee_payroll'),(p_package->>'effectiveFrom')::date,p_package->>'rateType',(p_package->>'baseAmount')::numeric,
 coalesce(p_package->'components','[]'),coalesce(p_package->'treatment','{}'),nullif(p_package->>'taxProfileRef',''),p_package->>'sourceRef',p_package->>'reason',p_source_hash,pan_id,selected_source->>'hash',nullif(p_package->>'replacesId','')::uuid,private.payroll_actor_id()) returning id into result_id;
 insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason) values(p_employee_id,p_scope_id,result_id,private.payroll_actor_id(),'draft',p_package->>'reason');
 return result_id;
end $$;

create function private.approve_payroll_package(p_package_id uuid,p_approver uuid) returns void
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

create function public.review_payroll_pay_package(p_package_id uuid,p_approve boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.payroll_pay_packages;
begin
 select * into strict p from public.payroll_pay_packages where id=p_package_id;
 if not private.payroll_package_permission(p.employee_id,p.scope_id,'approve') then raise exception 'Package approval requires scoped HR authorization and existing compensation edit permission.' using errcode='42501'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Record a review reason.'; end if;
 if p_approve then perform private.approve_payroll_package(p.id,private.payroll_actor_id());
 else
 perform 1 from public.hris_users where id=p.employee_id for update;
 update public.payroll_pay_packages set status='rejected' where id=p.id and status='draft';
 end if;
 insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason) values(p.employee_id,p.scope_id,p.id,private.payroll_actor_id(),case when p_approve then 'review_approved' else 'review_rejected' end,btrim(p_reason));
end $$;

create function public.verify_payroll_payment_details(p_employee_id uuid,p_fingerprint text,p_source_ref text) returns void
language plpgsql security definer set search_path='' as $$
declare scope uuid; u public.hris_users;
begin
 select * into strict u from public.hris_users where id=p_employee_id for update; scope:=private.payroll_employee_bu_scope(u.id);
 if private.payroll_actor_id() is null or not public.can_access_hris_user(u.id) or not private.payroll_has_access('authorize_finance',scope)
 or not public.has_sensitive_permission('bank_information','edit') or u.id=public.current_hris_user_id() then raise exception 'Payment verification denied.' using errcode='42501'; end if;
 if nullif(btrim(u.bank_name),'') is null or nullif(btrim(u.bank_account_number),'') is null then raise exception 'Complete the existing employee bank record first.'; end if;
 if p_fingerprint is distinct from private.payroll_bank_hash(u.id) then raise exception 'Bank details changed; refresh before verification.' using errcode='40001'; end if;
 insert into public.payroll_payment_verifications(employee_id,details_hash,source_ref,verified_by) values(u.id,p_fingerprint,p_source_ref,private.payroll_actor_id());
 insert into public.payroll_pay_audit(employee_id,scope_id,actor_id,action,reason) values(u.id,scope,private.payroll_actor_id(),'payment_details_verified',p_source_ref);
end $$;

create function public.save_payroll_pay_settings(p_scope_id uuid,p_effective_from date,p_calendar jsonb,p_holiday_handling text,p_policy_ref text) returns uuid
language plpgsql security definer set search_path='' as $$
declare c jsonb; result_id uuid;
begin
 if not private.payroll_has_access('authorize_hr',p_scope_id) then raise exception 'Scoped HR authorization is required to record approved payroll settings.' using errcode='42501'; end if;
 if jsonb_typeof(p_calendar)<>'array' or jsonb_array_length(p_calendar)<>2 then raise exception 'Enter two semi-monthly cutoffs.'; end if;
 for c in select * from jsonb_array_elements(p_calendar) loop
 if coalesce((c->>'startDay')::integer,0) not between 1 and 28 or coalesce((c->>'endDay')::integer,0) not between 1 and 28 or coalesce((c->>'payDay')::integer,0) not between 1 and 28
 or coalesce((c->>'payMonthOffset')::integer,-1) not in (0,1) then raise exception 'Invalid cutoff/pay-date mapping.'; end if;
 end loop;
 if (p_calendar->0->>'startDay')::int<>11 or (p_calendar->0->>'endDay')::int<>25 or (p_calendar->1->>'startDay')::int<>26 or (p_calendar->1->>'endDay')::int<>10 then raise exception 'Phase 2 supports the supplied 11–25 and 26–10 semi-monthly cutoffs.'; end if;
 insert into public.payroll_pay_settings(scope_id,effective_from,calendar,holiday_handling,policy_ref,approved_by) values(p_scope_id,p_effective_from,p_calendar,p_holiday_handling,p_policy_ref,private.payroll_actor_id()) returning id into result_id;
 insert into public.payroll_pay_audit(scope_id,actor_id,action,reason) values(p_scope_id,private.payroll_actor_id(),'settings_recorded',p_policy_ref); return result_id;
end $$;

-- Intentionally RPC-only: no salary/bank table is directly selectable by clients.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='private' and p.proname in ('payroll_employee_bu_scope','payroll_package_permission','payroll_source_hash','payroll_bank_hash','payroll_component_total','payroll_source_pay_data','validate_payroll_package','approve_payroll_package'))
 or (n.nspname='public' and p.proname in ('get_payroll_package_directory','get_payroll_pay_packages','save_payroll_pay_package','review_payroll_pay_package','verify_payroll_payment_details','save_payroll_pay_settings')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;
grant execute on function public.get_payroll_package_directory(),public.get_payroll_pay_packages(uuid),public.save_payroll_pay_package(uuid,uuid,jsonb,text),public.review_payroll_pay_package(uuid,boolean,text),public.verify_payroll_payment_details(uuid,text,text),public.save_payroll_pay_settings(uuid,date,jsonb,text,text) to authenticated;
notify pgrst,'reload schema';
