-- Phase 3: controlled service-charge eligibility, allocation and payroll snapshot.
-- Existing loan/debt, NTE/ATD, approval and locking functions are intentionally
-- left in place. Service charge is an independently versioned gross-pay source.

create table public.payroll_service_charge_setups (
 id uuid primary key default gen_random_uuid(),
 scope_id uuid not null references public.payroll_access_scopes(id),
 period_from date not null,
 period_to date not null,
 pay_date date not null,
 effective_date date not null,
 version integer not null check(version > 0),
 previous_id uuid references public.payroll_service_charge_setups(id),
 status text not null default 'Draft' check(status in('Draft','Needs review','Previewed','Included in payroll snapshot','Released','Cancelled')),
 pool_amount numeric(14,2) not null default 0 check(pool_amount >= 0),
 default_classification text not null default 'Rank and file',
 classification_filter text not null default 'Rank and file',
 approved_rule_name text,
 approved_rule_reference text,
 approved_rule_version text,
 allocation_basis text,
 funding_source text,
 selection_notes text,
 selection_confirmed boolean not null default false,
 preview_hash text,
 snapshot_id uuid,
 created_by uuid not null references public.hris_users(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_by uuid not null references public.hris_users(id),
 updated_at timestamptz not null default clock_timestamp(),
 confirmed_by uuid references public.hris_users(id),
 confirmed_at timestamptz,
 released_at timestamptz,
 check(period_to >= period_from),
 unique(scope_id,period_from,period_to,pay_date,version)
);

create table public.payroll_service_charge_allocations (
 id uuid primary key default gen_random_uuid(),
 setup_id uuid not null references public.payroll_service_charge_setups(id) on delete restrict,
 employee_id uuid not null references public.hris_users(id),
 employee_name text not null,
 employee_code text,
 business_unit_id uuid,
 business_unit_name text,
 classification text not null,
 eligibility_status text not null check(eligibility_status in('Eligible','Not eligible','Not configured','Needs review')),
 selected boolean not null default false,
 amount numeric(14,2) not null default 0 check(amount >= 0),
 inclusion_status text not null check(inclusion_status in('Selected for this payroll','Excluded from this payroll','Needs review','Included in payroll snapshot','Released')),
 decision_reason text,
 override_applied boolean not null default false,
 override_reason text,
 override_approved_by uuid references public.hris_users(id),
 override_approved_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(setup_id,employee_id),
 check(selected or amount = 0),
 check(not override_applied or length(btrim(coalesce(override_reason,''))) >= 3)
);

create table public.payroll_service_charge_snapshots (
 id uuid primary key default gen_random_uuid(),
 setup_id uuid not null unique references public.payroll_service_charge_setups(id),
 scope_id uuid not null references public.payroll_access_scopes(id),
 period_from date not null,
 period_to date not null,
 pay_date date not null,
 setup_version integer not null,
 snapshot_hash text not null unique,
 snapshot jsonb not null,
 created_by uuid not null references public.hris_users(id),
 created_at timestamptz not null default clock_timestamp()
);

create table public.payroll_service_charge_postings (
 id uuid primary key default gen_random_uuid(),
 snapshot_id uuid not null references public.payroll_service_charge_snapshots(id),
 approval_run_id uuid not null references public.payroll_approval_runs(id),
 employee_id uuid not null references public.hris_users(id),
 amount numeric(14,2) not null check(amount >= 0),
 released_by uuid not null references public.hris_users(id),
 released_at timestamptz not null default clock_timestamp(),
 unique(approval_run_id,employee_id)
);

create table public.payroll_service_charge_audit (
 id bigint generated always as identity primary key,
 setup_id uuid references public.payroll_service_charge_setups(id),
 snapshot_id uuid references public.payroll_service_charge_snapshots(id),
 actor_id uuid not null references public.hris_users(id),
 action text not null,
 previous_value jsonb,
 new_value jsonb,
 reason text,
 created_at timestamptz not null default clock_timestamp()
);

create index payroll_service_charge_setup_period on public.payroll_service_charge_setups(scope_id,period_from,period_to,version desc);
create index payroll_service_charge_allocation_employee on public.payroll_service_charge_allocations(employee_id,setup_id);
create index payroll_service_charge_audit_setup on public.payroll_service_charge_audit(setup_id,created_at desc);

do $$declare t text;begin
 foreach t in array array['payroll_service_charge_setups','payroll_service_charge_allocations','payroll_service_charge_snapshots','payroll_service_charge_postings','payroll_service_charge_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on table public.%I from public,anon,authenticated',t);
 end loop;
end $$;
create trigger payroll_service_charge_snapshot_immutable before update or delete on public.payroll_service_charge_snapshots for each row execute function private.payroll_audit_immutable();
create trigger payroll_service_charge_posting_immutable before update or delete on public.payroll_service_charge_postings for each row execute function private.payroll_audit_immutable();
create trigger payroll_service_charge_audit_immutable before update or delete on public.payroll_service_charge_audit for each row execute function private.payroll_audit_immutable();

create function private.payroll_service_charge_permission(p_scope uuid,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and private.payroll_gross_permission(p_scope,'view') and case
  when p_action='view' then true
  when p_action='manage' then private.payroll_gross_permission(p_scope,'rules') or
   (private.payroll_gross_permission(p_scope,'prepare') and public.has_active_role('Finance Staff'))
  else false end
$$;

create function private.payroll_service_charge_employee_in_scope(p_employee uuid,p_scope uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.hris_users h
  join public.payroll_access_scopes employee_scope on employee_scope.kind='business_unit' and employee_scope.business_unit_id=h.business_unit_id
  where h.id=p_employee and private.payroll_scope_covers(p_scope,employee_scope.id)
 )
$$;

create function private.payroll_service_charge_setup_json(p_setup uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(s)||jsonb_build_object(
  'allocations',coalesce((select jsonb_agg(jsonb_build_object(
   'id',a.id,'employeeId',a.employee_id,'employeeName',a.employee_name,'employeeCode',a.employee_code,
   'businessUnitId',a.business_unit_id,'businessUnit',a.business_unit_name,'classification',a.classification,
   'eligibilityStatus',a.eligibility_status,'selected',a.selected,'amount',a.amount::text,
   'inclusionStatus',a.inclusion_status,'reason',a.decision_reason,'overrideApplied',a.override_applied,
   'overrideReason',a.override_reason) order by a.employee_name,a.employee_id)
   from public.payroll_service_charge_allocations a where a.setup_id=s.id),'[]'::jsonb),
  'selectedCount',(select count(*) from public.payroll_service_charge_allocations a where a.setup_id=s.id and a.selected),
  'excludedCount',(select count(*) from public.payroll_service_charge_allocations a where a.setup_id=s.id and not a.selected),
  'allocatedAmount',(select coalesce(sum(a.amount),0)::text from public.payroll_service_charge_allocations a where a.setup_id=s.id and a.selected),
  'unallocatedAmount',(s.pool_amount-(select coalesce(sum(a.amount),0) from public.payroll_service_charge_allocations a where a.setup_id=s.id and a.selected))::text
 ) from public.payroll_service_charge_setups s where s.id=p_setup
$$;

create function public.initialize_payroll_service_charge(p_scope_id uuid,p_from date,p_to date,p_pay_date date) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_actor uuid:=private.payroll_actor_id();v_version integer;
begin
 if not private.payroll_service_charge_permission(p_scope_id,'manage') then raise exception 'Authorized scoped HR or Finance payroll access required.' using errcode='42501';end if;
 if p_to<p_from or p_to-p_from>31 or p_pay_date<p_to then raise exception 'Enter a valid payroll period and pay date.';end if;
 select id into v_id from public.payroll_service_charge_setups where scope_id=p_scope_id and period_from=p_from and period_to=p_to and pay_date=p_pay_date order by version desc limit 1;
 if v_id is not null then return v_id;end if;
 select coalesce(max(version),0)+1 into v_version from public.payroll_service_charge_setups where scope_id=p_scope_id and period_from=p_from and period_to=p_to and pay_date=p_pay_date;
 insert into public.payroll_service_charge_setups(scope_id,period_from,period_to,pay_date,effective_date,version,created_by,updated_by)
 values(p_scope_id,p_from,p_to,p_pay_date,p_from,v_version,v_actor,v_actor) returning id into v_id;
 insert into public.payroll_service_charge_allocations(setup_id,employee_id,employee_name,employee_code,business_unit_id,business_unit_name,classification,eligibility_status,selected,inclusion_status)
 select v_id,h.id,h.full_name,h.employee_id,h.business_unit_id,coalesce(h.business_unit,'Not configured'),
  case when r.id is null then 'Not configured' when r.rank_and_file then 'Rank and file' else coalesce(nullif(h.position,''),'Other classification') end,
  case when r.id is null then 'Not configured' when r.rank_and_file then 'Eligible' else 'Not eligible' end,
  coalesce(r.rank_and_file,false),
  case when r.rank_and_file then 'Selected for this payroll' when r.id is null then 'Needs review' else 'Excluded from this payroll' end
 from public.hris_users h
 left join lateral(select x.id,x.rank_and_file from public.payroll_employee_rule_versions x where x.employee_id=h.id and x.effective_from<=p_to and x.effective_to>=p_from order by x.created_at desc,x.id desc limit 1) r on true
 where private.payroll_service_charge_employee_in_scope(h.id,p_scope_id)
  and lower(coalesce(h.status,''))='active' and coalesce(h.date_hired,p_from)<=p_to and (h.end_date is null or h.end_date>=p_from)
  and coalesce(h.is_duplicate,false)=false;
 insert into public.payroll_service_charge_audit(setup_id,actor_id,action,new_value,reason)
 values(v_id,v_actor,'setup_initialized',private.payroll_service_charge_setup_json(v_id),'Rank-and-file employees seeded as a default selection; explicit review is still required.');
 return v_id;
end $$;

create function public.get_payroll_service_charge(p_scope_id uuid,p_from date,p_to date,p_pay_date date default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_id uuid;v_result jsonb;
begin
 if not private.payroll_service_charge_permission(p_scope_id,'view') then raise exception 'Scoped payroll access required.' using errcode='42501';end if;
 select id into v_id from public.payroll_service_charge_setups where scope_id=p_scope_id and period_from=p_from and period_to=p_to and (p_pay_date is null or pay_date=p_pay_date) order by version desc limit 1;
 if v_id is null then return jsonb_build_object('configured',false,'scopeId',p_scope_id,'from',p_from,'to',p_to,'canManage',private.payroll_service_charge_permission(p_scope_id,'manage'));end if;
 v_result:=private.payroll_service_charge_setup_json(v_id);
 return jsonb_build_object('configured',true,'canManage',private.payroll_service_charge_permission(p_scope_id,'manage'),'setup',v_result,
  'audit',coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'reason',a.reason,'at',a.created_at,'actor',h.full_name,'previous',a.previous_value,'next',a.new_value) order by a.created_at desc) from public.payroll_service_charge_audit a left join public.hris_users h on h.id=a.actor_id where a.setup_id=v_id),'[]'::jsonb));
end $$;

create function public.save_payroll_service_charge(p_setup_id uuid,p_setup jsonb,p_allocations jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.payroll_service_charge_setups;v_actor uuid:=private.payroll_actor_id();v_before jsonb;v jsonb;
begin
 select * into s from public.payroll_service_charge_setups where id=p_setup_id for update;
 if s.id is null or not private.payroll_service_charge_permission(s.scope_id,'manage') then raise exception 'Authorized scoped payroll access required.' using errcode='42501';end if;
 if s.status not in('Draft','Needs review') then raise exception 'This selection is frozen. Start a new review version before changing it.' using errcode='55000';end if;
 if (p_setup->>'poolAmount')::numeric<0 then raise exception 'Service-charge pool cannot be negative.';end if;
 if length(btrim(coalesce(p_setup->>'approvedRuleReference','')))<3 then raise exception 'Record the approved allocation-rule reference.';end if;
 if length(btrim(coalesce(p_setup->>'fundingSource','')))<3 then raise exception 'Record the approved funding source.';end if;
 v_before:=private.payroll_service_charge_setup_json(s.id);
 for v in select value from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) loop
  if not exists(select 1 from public.payroll_service_charge_allocations a where a.setup_id=s.id and a.employee_id=(v->>'employeeId')::uuid) then raise exception 'Employee selection is outside this setup.' using errcode='42501';end if;
  if not private.payroll_service_charge_employee_in_scope((v->>'employeeId')::uuid,s.scope_id) then raise exception 'Employee is outside your authorized business-unit scope.' using errcode='42501';end if;
  if not coalesce((v->>'selected')::boolean,false) and coalesce((v->>'amount')::numeric,0)<>0 then raise exception 'Excluded employees must have a zero allocation.';end if;
  if coalesce((v->>'selected')::boolean,false) and (select eligibility_status='Not configured' from public.payroll_service_charge_allocations where setup_id=s.id and employee_id=(v->>'employeeId')::uuid) then raise exception 'Configure employee classification before selecting this employee.';end if;
  if not coalesce((v->>'selected')::boolean,false) and (select eligibility_status='Eligible' from public.payroll_service_charge_allocations where setup_id=s.id and employee_id=(v->>'employeeId')::uuid) and length(btrim(coalesce(v->>'reason','')))<3 then raise exception 'Record why an eligible employee is excluded.';end if;
  if coalesce((v->>'selected')::boolean,false) and (select classification<>'Rank and file' from public.payroll_service_charge_allocations where setup_id=s.id and employee_id=(v->>'employeeId')::uuid) and length(btrim(coalesce(v->>'reason','')))<3 then raise exception 'An approved classification override reason is required.';end if;
  update public.payroll_service_charge_allocations set
   selected=(v->>'selected')::boolean,amount=round(coalesce((v->>'amount')::numeric,0),2),decision_reason=nullif(btrim(v->>'reason'),''),
   eligibility_status=case when (v->>'selected')::boolean and classification<>'Rank and file' then 'Eligible' else eligibility_status end,
   inclusion_status=case when (v->>'selected')::boolean then 'Selected for this payroll' else 'Excluded from this payroll' end,
   override_applied=(v->>'selected')::boolean and classification<>'Rank and file',
   override_reason=case when (v->>'selected')::boolean and classification<>'Rank and file' then btrim(v->>'reason') end,
   override_approved_by=case when (v->>'selected')::boolean and classification<>'Rank and file' then v_actor end,
   override_approved_at=case when (v->>'selected')::boolean and classification<>'Rank and file' then clock_timestamp() end,
   updated_at=clock_timestamp()
  where setup_id=s.id and employee_id=(v->>'employeeId')::uuid;
 end loop;
 if jsonb_array_length(coalesce(p_allocations,'[]'::jsonb))<>(select count(*) from public.payroll_service_charge_allocations where setup_id=s.id) then raise exception 'Review and submit every employee selection.';end if;
 update public.payroll_service_charge_setups set pool_amount=round((p_setup->>'poolAmount')::numeric,2),effective_date=(p_setup->>'effectiveDate')::date,
  classification_filter=coalesce(nullif(p_setup->>'classificationFilter',''),'Rank and file'),approved_rule_name=nullif(btrim(p_setup->>'approvedRuleName'),''),
  approved_rule_reference=btrim(p_setup->>'approvedRuleReference'),approved_rule_version=nullif(btrim(p_setup->>'approvedRuleVersion'),''),
  allocation_basis=nullif(btrim(p_setup->>'allocationBasis'),''),funding_source=btrim(p_setup->>'fundingSource'),selection_notes=nullif(btrim(p_setup->>'notes'),''),
  selection_confirmed=true,status='Draft',preview_hash=null,updated_by=v_actor,updated_at=clock_timestamp()
 where id=s.id;
 insert into public.payroll_service_charge_audit(setup_id,actor_id,action,previous_value,new_value,reason)
 values(s.id,v_actor,'selection_saved',v_before,private.payroll_service_charge_setup_json(s.id),nullif(btrim(p_setup->>'notes'),''));
 return private.payroll_service_charge_setup_json(s.id);
end $$;

create function public.preview_payroll_service_charge(p_setup_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.payroll_service_charge_setups;v_actor uuid:=private.payroll_actor_id();v_total numeric;v_hash text;v_preview jsonb;
begin
 select * into s from public.payroll_service_charge_setups where id=p_setup_id for update;
 if s.id is null or not private.payroll_service_charge_permission(s.scope_id,'manage') then raise exception 'Authorized scoped payroll access required.' using errcode='42501';end if;
 if s.status not in('Draft','Needs review') or not s.selection_confirmed then raise exception 'Review and save the individual employee selection first.';end if;
 if coalesce(s.pool_amount,0)<=0 then raise exception 'Enter the approved service-charge pool.';end if;
 if s.approved_rule_reference is null or s.funding_source is null then raise exception 'Approved allocation rule and funding source are required.';end if;
 if exists(select 1 from public.payroll_service_charge_allocations a where a.setup_id=s.id and a.selected and a.eligibility_status in('Not configured','Needs review')) then raise exception 'Resolve employees marked Not configured or Needs review.';end if;
 if not exists(select 1 from public.payroll_service_charge_allocations a where a.setup_id=s.id and a.selected) then raise exception 'Select at least one employee.';end if;
 select coalesce(sum(amount),0) into v_total from public.payroll_service_charge_allocations where setup_id=s.id and selected;
 if v_total<>s.pool_amount then raise exception 'Allocation is blocked: selected employees total %, but the approved pool is %. Difference: %.',v_total,s.pool_amount,s.pool_amount-v_total;end if;
 update public.payroll_service_charge_setups set status='Previewed',updated_by=v_actor,updated_at=clock_timestamp() where id=s.id;
 v_preview:=private.payroll_service_charge_setup_json(s.id);v_hash:=md5((v_preview-'preview_hash'-'updated_at'-'status')::text);
 update public.payroll_service_charge_setups set preview_hash=v_hash where id=s.id;
 insert into public.payroll_service_charge_audit(setup_id,actor_id,action,new_value,reason) values(s.id,v_actor,'allocation_preview_approved',v_preview,'100% of the approved pool allocated.');
 return private.payroll_service_charge_setup_json(s.id);
end $$;

create function public.include_payroll_service_charge_snapshot(p_setup_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.payroll_service_charge_setups;v_actor uuid:=private.payroll_actor_id();v_payload jsonb;v_hash text;v_id uuid;
begin
 select * into s from public.payroll_service_charge_setups where id=p_setup_id for update;
 if s.id is null or not private.payroll_service_charge_permission(s.scope_id,'manage') then raise exception 'Authorized scoped payroll access required.' using errcode='42501';end if;
 if s.status<>'Previewed' then raise exception 'Approve the allocation preview before including service charge in payroll.';end if;
 v_payload:=private.payroll_service_charge_setup_json(s.id);v_hash:=md5((v_payload-'preview_hash'-'updated_at'-'status')::text);
 if v_hash<>s.preview_hash then raise exception 'The allocation changed after preview. Review it again.' using errcode='40001';end if;
 insert into public.payroll_service_charge_snapshots(setup_id,scope_id,period_from,period_to,pay_date,setup_version,snapshot_hash,snapshot,created_by)
 values(s.id,s.scope_id,s.period_from,s.period_to,s.pay_date,s.version,v_hash,v_payload,v_actor) returning id into v_id;
 update public.payroll_service_charge_setups set status='Included in payroll snapshot',snapshot_id=v_id,confirmed_by=v_actor,confirmed_at=clock_timestamp(),updated_by=v_actor,updated_at=clock_timestamp() where id=s.id;
 update public.payroll_service_charge_allocations set inclusion_status='Included in payroll snapshot',updated_at=clock_timestamp() where setup_id=s.id and selected;
 insert into public.payroll_service_charge_audit(setup_id,snapshot_id,actor_id,action,new_value,reason) values(s.id,v_id,v_actor,'included_in_payroll_snapshot',v_payload,'Frozen service-charge selection and allocation.');
 return v_id;
end $$;

create function public.revise_payroll_service_charge(p_setup_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.payroll_service_charge_setups;v_actor uuid:=private.payroll_actor_id();v_id uuid;v_version integer;
begin
 select * into s from public.payroll_service_charge_setups where id=p_setup_id for update;
 if s.id is null or not private.payroll_service_charge_permission(s.scope_id,'manage') then raise exception 'Authorized scoped payroll access required.' using errcode='42501';end if;
 if s.status not in('Previewed','Included in payroll snapshot') or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'A recorded reason is required to start a new review.';end if;
 if exists(select 1 from public.payroll_disbursements d join public.payroll_approval_runs r on r.id=d.run_id where r.scope_id=s.scope_id and r.source_snapshot->>'from'=s.period_from::text and r.source_snapshot->>'to'=s.period_to::text) then raise exception 'Locked payroll cannot be edited. Use a linked adjustment in a future cutoff.' using errcode='55000';end if;
 select coalesce(max(version),0)+1 into v_version from public.payroll_service_charge_setups where scope_id=s.scope_id and period_from=s.period_from and period_to=s.period_to and pay_date=s.pay_date;
 insert into public.payroll_service_charge_setups(scope_id,period_from,period_to,pay_date,effective_date,version,previous_id,status,pool_amount,default_classification,classification_filter,approved_rule_name,approved_rule_reference,approved_rule_version,allocation_basis,funding_source,selection_notes,selection_confirmed,created_by,updated_by)
 select scope_id,period_from,period_to,pay_date,effective_date,v_version,id,'Draft',pool_amount,default_classification,classification_filter,approved_rule_name,approved_rule_reference,approved_rule_version,allocation_basis,funding_source,p_reason,false,v_actor,v_actor from public.payroll_service_charge_setups where id=s.id returning id into v_id;
 insert into public.payroll_service_charge_allocations(setup_id,employee_id,employee_name,employee_code,business_unit_id,business_unit_name,classification,eligibility_status,selected,amount,inclusion_status,decision_reason,override_applied,override_reason,override_approved_by,override_approved_at)
 select v_id,employee_id,employee_name,employee_code,business_unit_id,business_unit_name,classification,eligibility_status,selected,amount,case when selected then 'Selected for this payroll' else 'Excluded from this payroll' end,decision_reason,override_applied,override_reason,override_approved_by,override_approved_at from public.payroll_service_charge_allocations where setup_id=s.id;
 insert into public.payroll_service_charge_audit(setup_id,actor_id,action,previous_value,new_value,reason) values(v_id,v_actor,'review_version_created',private.payroll_service_charge_setup_json(s.id),private.payroll_service_charge_setup_json(v_id),p_reason);
 return v_id;
end $$;

create function private.payroll_service_charge_snapshot_for_run(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.payroll_service_charge_setups;v jsonb;
begin
 select * into s from public.payroll_service_charge_setups where scope_id=p_scope and period_from=p_from and period_to=p_to order by version desc limit 1;
 if s.id is null then return null;end if;
 if s.status not in('Included in payroll snapshot','Released') or s.snapshot_id is null then raise exception 'Service-charge selection changed or still needs review. Confirm a new allocation preview before calculating payroll.' using errcode='40001';end if;
 select snapshot||jsonb_build_object('snapshotId',id,'snapshotHash',snapshot_hash) into v from public.payroll_service_charge_snapshots where id=s.snapshot_id;
 return v;
end $$;

alter function private.payroll_gross_snapshot(uuid) rename to payroll_gross_snapshot_without_service_charge_phase3;
create function private.payroll_gross_snapshot(p_time_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v jsonb;v_sc jsonb;begin
 v:=private.payroll_gross_snapshot_without_service_charge_phase3(p_time_id);
 v_sc:=private.payroll_service_charge_snapshot_for_run((v->>'scopeId')::uuid,(v->>'dateFrom')::date,(v->>'dateTo')::date);
 if v_sc is not null then v:=v||jsonb_build_object('serviceCharge',v_sc);end if;
 return v;
end $$;

alter function private.calculate_payroll_gross_v1(jsonb) rename to calculate_payroll_gross_without_service_charge_phase3;
create function private.calculate_payroll_gross_v1(snap jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v_result jsonb;v_sc jsonb:=snap->'serviceCharge';v_emp jsonb;v_a jsonb;v_line jsonb;v_employees jsonb:='[]';v_amount numeric;v_gross numeric;
begin
 v_result:=private.calculate_payroll_gross_without_service_charge_phase3(snap);
 if v_sc is null then return v_result;end if;
 for v_emp in select value from jsonb_array_elements(v_result->'employees') loop
  select value into v_a from jsonb_array_elements(v_sc->'allocations') where value->>'employeeId'=v_emp->>'employeeId' and (value->>'selected')::boolean;
  if v_a is not null then
   v_amount:=(v_a->>'amount')::numeric;
   v_line:=private.payroll_gross_line('Service Charge',1,v_amount,1,jsonb_build_object('kind','earning','sourceKind','service_charge','snapshotId',v_sc->>'snapshotId','ruleReference',v_sc->>'approved_rule_reference','allocationBasis',v_sc->>'allocation_basis'));
   v_emp:=jsonb_set(v_emp,'{lines}',coalesce(v_emp->'lines','[]'::jsonb)||jsonb_build_array(v_line));
   if v_emp->>'gross' is not null then v_emp:=jsonb_set(v_emp,'{gross}',to_jsonb(((v_emp->>'gross')::numeric+v_amount)::text));end if;
  end if;
  v_employees:=v_employees||jsonb_build_array(v_emp);v_a:=null;
 end loop;
 v_result:=jsonb_set(v_result,'{employees}',v_employees);
 if v_result->>'gross' is not null then
  v_gross:=(v_result->>'gross')::numeric+(v_sc->>'pool_amount')::numeric;
  v_result:=jsonb_set(v_result,'{gross}',to_jsonb(v_gross::text));
 end if;
 return v_result||jsonb_build_object('serviceChargeSnapshotId',v_sc->>'snapshotId','serviceChargePool',v_sc->>'pool_amount');
end $$;

alter function private.payroll_approval_source(uuid,uuid) rename to payroll_approval_source_without_service_charge_phase3;
create function private.payroll_approval_source(p_net uuid,p_special uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v jsonb;v_sc jsonb;begin
 v:=private.payroll_approval_source_without_service_charge_phase3(p_net,p_special);
 if p_net is not null then
  select g.source_snapshot->'serviceCharge' into v_sc from public.payroll_net_runs n join public.payroll_gross_runs g on g.id=n.gross_run_id where n.id=p_net;
  if v_sc is not null then v:=v||jsonb_build_object('serviceCharge',v_sc,'serviceChargeSnapshotId',v_sc->>'snapshotId');end if;
 end if;
 return v;
end $$;

create function private.release_payroll_service_charge() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_snapshot uuid;v_setup uuid;begin
 select nullif(source_snapshot->>'serviceChargeSnapshotId','')::uuid into v_snapshot from public.payroll_approval_runs where id=new.run_id;
 if v_snapshot is null then return new;end if;
 select setup_id into v_setup from public.payroll_service_charge_snapshots where id=v_snapshot;
 insert into public.payroll_service_charge_postings(snapshot_id,approval_run_id,employee_id,amount,released_by)
 select v_snapshot,new.run_id,a.employee_id,a.amount,new.recorded_by from public.payroll_service_charge_allocations a where a.setup_id=v_setup and a.selected
 on conflict(approval_run_id,employee_id) do nothing;
 update public.payroll_service_charge_setups set status='Released',released_at=clock_timestamp(),updated_by=new.recorded_by,updated_at=clock_timestamp() where id=v_setup;
 update public.payroll_service_charge_allocations set inclusion_status='Released',updated_at=clock_timestamp() where setup_id=v_setup and selected;
 insert into public.payroll_service_charge_audit(setup_id,snapshot_id,actor_id,action,new_value,reason)
 values(v_setup,v_snapshot,new.recorded_by,'released',(select snapshot from public.payroll_service_charge_snapshots where id=v_snapshot),'Released with payroll disbursement '||new.id::text);
 return new;
end $$;
create trigger release_payroll_service_charge after insert on public.payroll_disbursements for each row execute function private.release_payroll_service_charge();

revoke all on function private.payroll_service_charge_permission(uuid,text),private.payroll_service_charge_employee_in_scope(uuid,uuid),private.payroll_service_charge_setup_json(uuid),private.payroll_service_charge_snapshot_for_run(uuid,date,date),private.release_payroll_service_charge(),private.payroll_gross_snapshot_without_service_charge_phase3(uuid),private.calculate_payroll_gross_without_service_charge_phase3(jsonb),private.payroll_approval_source_without_service_charge_phase3(uuid,uuid),private.payroll_gross_snapshot(uuid),private.calculate_payroll_gross_v1(jsonb),private.payroll_approval_source(uuid,uuid) from public,anon,authenticated;
revoke all on function public.initialize_payroll_service_charge(uuid,date,date,date),public.get_payroll_service_charge(uuid,date,date,date),public.save_payroll_service_charge(uuid,jsonb,jsonb),public.preview_payroll_service_charge(uuid),public.include_payroll_service_charge_snapshot(uuid),public.revise_payroll_service_charge(uuid,text) from public,anon,authenticated;
grant execute on function public.initialize_payroll_service_charge(uuid,date,date,date),public.get_payroll_service_charge(uuid,date,date,date),public.save_payroll_service_charge(uuid,jsonb,jsonb),public.preview_payroll_service_charge(uuid),public.include_payroll_service_charge_snapshot(uuid),public.revise_payroll_service_charge(uuid,text) to authenticated;
