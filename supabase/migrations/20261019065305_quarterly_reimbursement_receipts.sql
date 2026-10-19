-- Quarterly receipts: only the payroll cutoff containing the quarter's deadline is gated.
set local lock_timeout='5s';
set local statement_timeout='60s';
create table private.payroll_reimbursement_quarter_targets (
 id uuid primary key default gen_random_uuid(),scope_id uuid not null references public.payroll_access_scopes(id),
 quarter_from date not null,quarter_to date not null,employee_id uuid not null references public.hris_users(id),
 required_amount numeric(14,2) not null check(required_amount>=0),basis_reference text not null check(length(btrim(basis_reference)) between 3 and 2000),
 revision bigint not null default 1,confirmed_by uuid not null references public.hris_users(id),confirmed_at timestamptz not null default clock_timestamp(),
 unique(scope_id,quarter_from,employee_id),check(quarter_to>=quarter_from)
);
alter table private.payroll_reimbursement_quarter_targets enable row level security;
revoke all on private.payroll_reimbursement_quarter_targets from public,anon,authenticated;
create policy rpc_only on private.payroll_reimbursement_quarter_targets for all to anon,authenticated using(false) with check(false);
create table private.payroll_reimbursement_target_audit (
 id uuid primary key default gen_random_uuid(),target_id uuid not null references private.payroll_reimbursement_quarter_targets(id),
 actor_id uuid not null references public.hris_users(id),record jsonb not null,occurred_at timestamptz not null default clock_timestamp()
);
alter table private.payroll_reimbursement_target_audit enable row level security;
revoke all on private.payroll_reimbursement_target_audit from public,anon,authenticated;
create policy rpc_only on private.payroll_reimbursement_target_audit for all to anon,authenticated using(false) with check(false);
create trigger immutable before update or delete on private.payroll_reimbursement_target_audit for each row execute function private.payroll_audit_immutable();
alter table private.payroll_reimbursement_evidence add column target_revision bigint;

create function private.payroll_receipt_quarter(p_from date,p_to date) returns jsonb
language plpgsql immutable set search_path='' as $$
declare q date;deadline date;begin
 if p_from is null or p_to is null or p_to<p_from then return null;end if;
 for q in select x::date from generate_series(date_trunc('quarter',p_from)::timestamp,date_trunc('quarter',p_to)::timestamp,interval '3 months') x loop
  deadline:=q+14;
  if deadline between p_from and p_to then return jsonb_build_object('from',(q-interval '3 months')::date,'to',q-1,'deadline',deadline,'affectedFrom',p_from,'affectedTo',p_to);end if;
 end loop;
 return null;
end $$;

create function private.payroll_quarter_receipt_source(p_time_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare snap jsonb;q jsonb;targets jsonb;eligible jsonb;
begin
 snap:=private.payroll_gross_source_before_reimbursement(p_time_id);
 q:=private.payroll_receipt_quarter((snap->>'dateFrom')::date,(snap->>'dateTo')::date);
 if q is null then return snap;end if;
 -- The existing source function authorizes the BU and each employee's compensation.
 -- Include historical receipt-based arrangements still relevant to this quarter.
 select coalesce(jsonb_agg(distinct p.employee_id),'[]') into eligible from public.payroll_pay_packages p
 where p.status in('approved','superseded') and p.stream='employee_payroll' and p.effective_from<=(q->>'to')::date
 and exists(select 1 from jsonb_array_elements(snap#>'{time,source,employees}') e where e->>'id'=p.employee_id::text)
 and not exists(select 1 from public.payroll_pay_packages newer where newer.employee_id=p.employee_id and newer.engagement_key=p.engagement_key and newer.status in('approved','superseded') and newer.effective_from>p.effective_from and newer.effective_from<=(q->>'from')::date)
 and exists(select 1 from jsonb_array_elements(p.components) c where private.payroll_is_reimbursement_component(c) and coalesce((c->>'amount')::numeric,0)>0);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.employee_id),'[]') into targets from private.payroll_reimbursement_quarter_targets t
 where t.scope_id=(snap->>'scopeId')::uuid and t.quarter_from=(q->>'from')::date
 and exists(select 1 from jsonb_array_elements(snap#>'{time,source,employees}') e where e->>'id'=t.employee_id::text);
 return snap||jsonb_build_object('receiptQuarter',q,'quarterlyReceiptEligible',eligible,'quarterlyReceiptTargets',targets);
end $$;

create function private.payroll_reimbursement_hash(snap jsonb) returns text
language sql immutable set search_path='' return md5((snap-'quarterlyReceiptTargets')::text);

create or replace function private.payroll_reimbursement_requirements(snap jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select case when snap->'receiptQuarter' is null then '[]'::jsonb else coalesce((
 select jsonb_agg(jsonb_build_object('employeeId',e->>'id','employeeName',e->>'name','requiredAmount',t->>'required_amount',
 'calculationReady',t is not null,'targetRevision',t->>'revision','quarterTarget',t) order by e->>'id')
 from jsonb_array_elements(snap#>'{time,source,employees}') e
 left join lateral (select value from jsonb_array_elements(coalesce(snap->'quarterlyReceiptTargets','[]')) where value->>'employee_id'=e->>'id') target(t) on true
 where t is not null or coalesce(snap->'quarterlyReceiptEligible','[]') ? (e->>'id')
 or exists(select 1 from jsonb_array_elements(coalesce(snap->'packages','[]')) p cross join lateral jsonb_array_elements(coalesce(p->'components','[]')) c
 where p->>'employee_id'=e->>'id' and private.payroll_is_reimbursement_component(c) and coalesce((c->>'amount')::numeric,0)>0)), '[]'::jsonb) end
$$;

create function private.confirm_payroll_reimbursement_quarter_target(p_time_id uuid,p_employee uuid,p_source_hash text,p_required numeric,p_basis text,p_expected_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare snap jsonb;q jsonb;scope uuid;actor uuid:=public.current_hris_user_id();row private.payroll_reimbursement_quarter_targets;
begin
 if auth.uid() is null or private.payroll_actor_id() is null or actor is null then raise exception 'Active signed-in account required.' using errcode='42501';end if;
 select scope_id into scope from public.payroll_time_packages where id=p_time_id;
 if not coalesce(private.payroll_nte_finance(scope),false) or actor=p_employee then raise exception 'Assigned Finance required; you cannot confirm your own allowance requirement.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-gross:'||scope::text,0));
 snap:=private.payroll_quarter_receipt_source(p_time_id);q:=snap->'receiptQuarter';
 if q is null then raise exception 'Quarterly receipts are not required for this payroll cutoff.';end if;
 if p_source_hash is distinct from private.payroll_reimbursement_hash(snap) then raise exception 'Payroll inputs changed. Refresh before confirming the quarterly requirement.' using errcode='PT409';end if;
 if not exists(select 1 from jsonb_array_elements(private.payroll_reimbursement_requirements(snap)) r where r->>'employeeId'=p_employee::text) then raise exception 'Employee is outside this quarterly receipt review.' using errcode='42501';end if;
 if p_required is null or p_required<0 or p_required>999999999 or p_required<>round(p_required,2) or coalesce(length(btrim(p_basis)),0) not between 3 and 2000 then raise exception 'Enter the whole-quarter required amount and the approved allowance breakdown reference. Zero requires a documented no-allowance basis.';end if;
 select * into row from private.payroll_reimbursement_quarter_targets where scope_id=scope and quarter_from=(q->>'from')::date and employee_id=p_employee for update;
 if coalesce(row.revision,0) is distinct from coalesce(p_expected_revision,0) then raise exception 'The quarterly requirement changed. Refresh before editing.' using errcode='PT409';end if;
 insert into private.payroll_reimbursement_quarter_targets(scope_id,quarter_from,quarter_to,employee_id,required_amount,basis_reference,confirmed_by)
 values(scope,(q->>'from')::date,(q->>'to')::date,p_employee,p_required,btrim(p_basis),actor)
 on conflict(scope_id,quarter_from,employee_id) do update set required_amount=excluded.required_amount,basis_reference=excluded.basis_reference,confirmed_by=excluded.confirmed_by,confirmed_at=clock_timestamp(),revision=private.payroll_reimbursement_quarter_targets.revision+1 returning * into row;
 insert into private.payroll_reimbursement_target_audit(target_id,actor_id,record) values(row.id,actor,to_jsonb(row));
end $$;
create function public.confirm_payroll_reimbursement_quarter_target(p_time_id uuid,p_employee uuid,p_source_hash text,p_required numeric,p_basis text,p_expected_revision bigint) returns void language sql security invoker set search_path='' return private.confirm_payroll_reimbursement_quarter_target(p_time_id,p_employee,p_source_hash,p_required,p_basis,p_expected_revision);
create or replace function private.get_payroll_reimbursement_workspace(p_time_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare snap jsonb;requirements jsonb;rows jsonb;scope uuid;hash text;
begin
 if auth.uid() is null or private.payroll_actor_id() is null then raise exception 'Active signed-in account required.' using errcode='42501';end if;
 snap:=private.payroll_quarter_receipt_source(p_time_id);scope:=(snap->>'scopeId')::uuid;hash:=private.payroll_reimbursement_hash(snap);
 requirements:=private.payroll_reimbursement_requirements(snap);
 select coalesce(jsonb_agg(r||jsonb_build_object('employeeCode',u.employee_id,'evidence',case when x.id is null then null else to_jsonb(x)||jsonb_build_object('verifiedName',v.full_name) end,
 'verified',coalesce(x.source_hash=hash and x.required_amount=(r->>'requiredAmount')::numeric and x.supported_amount>=x.required_amount and x.verified_by is not null and x.target_revision=(r->>'targetRevision')::bigint,false) or coalesce((r->>'requiredAmount')::numeric=0,false)) order by r->>'employeeName'),'[]') into rows
 from jsonb_array_elements(requirements) r join public.hris_users u on u.id=(r->>'employeeId')::uuid
 left join private.payroll_reimbursement_evidence x on x.scope_id=scope and x.date_from=(snap->>'dateFrom')::date and x.date_to=(snap->>'dateTo')::date and x.employee_id=u.id
 left join public.hris_users v on v.id=x.verified_by;
 return jsonb_build_object('from',snap->>'dateFrom','to',snap->>'dateTo','sourceHash',hash,'canSubmit',private.payroll_gross_permission(scope,'prepare') or private.payroll_nte_finance(scope),
 'canVerify',private.payroll_nte_finance(scope),'actorId',public.current_hris_user_id(),'quarter',snap->'receiptQuarter','rows',rows);
end $$;


create or replace function private.save_payroll_reimbursement_evidence(p_time_id uuid,p_employee uuid,p_source_hash text,p_supported numeric,p_url text) returns uuid
language plpgsql security definer set search_path='' as $$
declare snap jsonb;scope uuid;req jsonb;result uuid;actor uuid:=public.current_hris_user_id();row private.payroll_reimbursement_evidence;
begin
 if auth.uid() is null or actor is null then raise exception 'Active signed-in account required.' using errcode='42501';end if;
 select scope_id into scope from public.payroll_time_packages where id=p_time_id;
 if not coalesce(private.payroll_gross_permission(scope,'prepare') or private.payroll_nte_finance(scope),false) then raise exception 'Assigned payroll preparer or Finance access required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-gross:'||scope::text,0));
 snap:=private.payroll_quarter_receipt_source(p_time_id);
 if p_source_hash is distinct from private.payroll_reimbursement_hash(snap) then raise exception 'Payroll inputs changed. Refresh cutoff requirements before saving.' using errcode='PT409';end if;
 select value into req from jsonb_array_elements(private.payroll_reimbursement_requirements(snap)) where value->>'employeeId'=p_employee::text;
 if req is null then raise exception 'Quarterly receipts are not required for this employee and payroll cutoff.';end if;
 if req->>'requiredAmount' is null then raise exception 'Finance must first confirm the whole-quarter required allowance amount.';end if;
 if not private.payroll_receipt_link_valid(btrim(p_url)) then raise exception 'Use an HTTPS Google Drive receipt/folder or Google Sheets breakdown link.';end if;
 if p_supported is null or p_supported<0 or p_supported>999999999 or p_supported<>round(p_supported,2) then raise exception 'Enter the supported receipt total in pesos, with at most two decimals.';end if;
 insert into private.payroll_reimbursement_evidence(scope_id,date_from,date_to,employee_id,source_hash,required_amount,supported_amount,document_url,submitted_by,target_revision)
 values(scope,(snap->>'dateFrom')::date,(snap->>'dateTo')::date,p_employee,p_source_hash,(req->>'requiredAmount')::numeric,p_supported,btrim(p_url),actor,(req->>'targetRevision')::bigint)
 on conflict(scope_id,date_from,date_to,employee_id) do update set source_hash=excluded.source_hash,required_amount=excluded.required_amount,supported_amount=excluded.supported_amount,document_url=excluded.document_url,submitted_by=excluded.submitted_by,target_revision=excluded.target_revision,submitted_at=clock_timestamp(),verified_by=null,verified_at=null
 returning * into row;
 insert into private.payroll_reimbursement_evidence_audit(evidence_id,actor_id,action,record) values(row.id,actor,'submitted',to_jsonb(row));
 return row.id;
end $$;


create or replace function private.verify_payroll_reimbursement_evidence(p_time_id uuid,p_employee uuid,p_source_hash text,p_submitted_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare snap jsonb;scope uuid;req jsonb;row private.payroll_reimbursement_evidence;actor uuid:=public.current_hris_user_id();
begin
 if auth.uid() is null or actor is null then raise exception 'Active signed-in account required.' using errcode='42501';end if;
 select scope_id into scope from public.payroll_time_packages where id=p_time_id;
 if not coalesce(private.payroll_nte_finance(scope),false) or actor=p_employee then raise exception 'Assigned Finance verifier required; you cannot verify your own allowance.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-gross:'||scope::text,0));
 snap:=private.payroll_quarter_receipt_source(p_time_id);
 select value into req from jsonb_array_elements(private.payroll_reimbursement_requirements(snap)) where value->>'employeeId'=p_employee::text;
 select * into row from private.payroll_reimbursement_evidence where scope_id=scope and date_from=(snap->>'dateFrom')::date and date_to=(snap->>'dateTo')::date and employee_id=p_employee for update;
 if p_source_hash is distinct from private.payroll_reimbursement_hash(snap) or row.source_hash is distinct from p_source_hash or row.submitted_at is distinct from p_submitted_at or req is null or row.required_amount is distinct from (req->>'requiredAmount')::numeric or row.target_revision is distinct from (req->>'targetRevision')::bigint then raise exception 'Evidence or payroll inputs changed. Refresh and review the latest link and amount.' using errcode='PT409';end if;
 if not (req->>'calculationReady')::boolean then raise exception 'Finance must confirm the quarterly allowance requirement before verification.';end if;
 if row.supported_amount<row.required_amount then raise exception 'The supported total must meet the whole-quarter required allowance.';end if;
 if not private.payroll_receipt_link_valid(row.document_url) then raise exception 'A valid Drive or Sheets link is required.';end if;
 if row.verified_by is not null then return;end if;
 update private.payroll_reimbursement_evidence set verified_by=actor,verified_at=clock_timestamp() where id=row.id returning * into row;
 insert into private.payroll_reimbursement_evidence_audit(evidence_id,actor_id,action,record) values(row.id,actor,'finance_verified',to_jsonb(row));
end $$;


create or replace function private.payroll_gross_snapshot(p_time_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare snap jsonb;reqs jsonb;req jsonb;row private.payroll_reimbursement_evidence;evidence jsonb:='[]';hash text;
begin
 snap:=private.payroll_quarter_receipt_source(p_time_id);hash:=private.payroll_reimbursement_hash(snap);reqs:=private.payroll_reimbursement_requirements(snap);
 if jsonb_array_length(reqs)=0 then return snap;end if;
 for req in select value from jsonb_array_elements(reqs) loop
  if req->>'requiredAmount' is null then raise exception 'Finance must confirm the whole-quarter reimbursable allowance requirement for % in Run Payroll.',req->>'employeeName';end if;
  if (req->>'requiredAmount')::numeric=0 then continue;end if;
  select * into row from private.payroll_reimbursement_evidence where scope_id=(snap->>'scopeId')::uuid and date_from=(snap->>'dateFrom')::date and date_to=(snap->>'dateTo')::date and employee_id=(req->>'employeeId')::uuid;
  if row.id is null or row.verified_by is null or row.source_hash<>hash or row.required_amount<>(req->>'requiredAmount')::numeric or row.supported_amount<row.required_amount or row.target_revision is distinct from (req->>'targetRevision')::bigint then
   raise exception 'Reimbursable allowance for % requires PHP % supported by a Drive/Sheets link verified by Finance for the whole quarter. This is the payroll cutoff containing the quarterly deadline. Open Run Payroll → Reimbursable allowance receipts.',req->>'employeeName',req->>'requiredAmount';
  end if;
  evidence:=evidence||jsonb_build_array(to_jsonb(row));
 end loop;
 return snap||jsonb_build_object('reimbursementEvidence',evidence);
end $$;

revoke all on function private.payroll_receipt_quarter(date,date),private.payroll_quarter_receipt_source(uuid),private.payroll_reimbursement_hash(jsonb) from public,anon,authenticated;
revoke all on function private.confirm_payroll_reimbursement_quarter_target(uuid,uuid,text,numeric,text,bigint),public.confirm_payroll_reimbursement_quarter_target(uuid,uuid,text,numeric,text,bigint) from public,anon;
grant execute on function private.confirm_payroll_reimbursement_quarter_target(uuid,uuid,text,numeric,text,bigint),public.confirm_payroll_reimbursement_quarter_target(uuid,uuid,text,numeric,text,bigint) to authenticated;
notify pgrst,'reload schema';
