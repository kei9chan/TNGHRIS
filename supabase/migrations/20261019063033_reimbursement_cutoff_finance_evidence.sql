-- Evidence is specific to a payroll cutoff, never a standing salary-package approval.
set local lock_timeout='5s';
set local statement_timeout='60s';
create table private.payroll_reimbursement_evidence (
 id uuid primary key default gen_random_uuid(),
 scope_id uuid not null references public.payroll_access_scopes(id),
 date_from date not null,date_to date not null,employee_id uuid not null references public.hris_users(id),
 source_hash text not null,required_amount numeric(14,2) not null check(required_amount>0),
 supported_amount numeric(14,2) not null check(supported_amount>=0),document_url text not null,
 submitted_by uuid not null references public.hris_users(id),submitted_at timestamptz not null default clock_timestamp(),
 verified_by uuid references public.hris_users(id),verified_at timestamptz,
 unique(scope_id,date_from,date_to,employee_id),check(date_to>=date_from),
 check((verified_by is null)=(verified_at is null))
);
alter table private.payroll_reimbursement_evidence enable row level security;
revoke all on private.payroll_reimbursement_evidence from public,anon,authenticated;
create table private.payroll_reimbursement_evidence_audit (
 id uuid primary key default gen_random_uuid(),evidence_id uuid not null references private.payroll_reimbursement_evidence(id),
 actor_id uuid not null references public.hris_users(id),action text not null,record jsonb not null,occurred_at timestamptz not null default clock_timestamp()
);
alter table private.payroll_reimbursement_evidence_audit enable row level security;
revoke all on private.payroll_reimbursement_evidence_audit from public,anon,authenticated;
create trigger immutable before update or delete on private.payroll_reimbursement_evidence_audit for each row execute function private.payroll_audit_immutable();

create function private.payroll_is_reimbursement_component(c jsonb) returns boolean
language sql immutable set search_path='' return coalesce(c->>'category'='reimbursable_allowance' or c->>'legacyField'='reimbursable' or c->>'classification'='receipt_based' or (c->>'receiptRequired')::boolean,false);
create function private.payroll_receipt_link_valid(link text) returns boolean
language sql immutable set search_path='' return coalesce(link ~ '^https://(drive[.]google[.]com/(file/d/|drive/(u/[0-9]+/)?folders/|open[?]id=)|docs[.]google[.]com/spreadsheets/d/)[A-Za-z0-9_-]+' and length(link)<=2000 and link !~ '[[:space:]]',false);

-- Preserve the existing source chain so the evidence workspace can load before the gate is met.
do $$declare ddl text;begin
 ddl:=pg_get_functiondef('private.payroll_gross_snapshot(uuid)'::regprocedure);
 ddl:=replace(ddl,'FUNCTION private.payroll_gross_snapshot(','FUNCTION private.payroll_gross_source_before_reimbursement(');
 execute ddl;
end $$;

-- Use the actual dated and rounded payroll lines, including existing proration rules.
create function private.payroll_reimbursement_requirements(snap jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('employeeId',e->>'employeeId','employeeName',e->>'employeeName',
 'requiredAmount',v.amount::text,'calculationReady',jsonb_array_length(coalesce(e->'issues','[]'))=0) order by e->>'employeeId'),'[]')
 from jsonb_array_elements(private.calculate_payroll_gross_v1(snap)->'employees') e
 cross join lateral (select round(coalesce(sum(case when l->>'rounding'='employee_total_half_up' then (l->>'unrounded')::numeric else (l->>'amount')::numeric end),0),2) amount from jsonb_array_elements(e->'lines') l where private.payroll_is_reimbursement_component(l->'component')) v
 where v.amount>0
$$;

create function private.get_payroll_reimbursement_workspace(p_time_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare snap jsonb;requirements jsonb;rows jsonb;scope uuid;hash text;
begin
 if auth.uid() is null or private.payroll_actor_id() is null then raise exception 'Active signed-in account required.' using errcode='42501';end if;
 snap:=private.payroll_gross_source_before_reimbursement(p_time_id);scope:=(snap->>'scopeId')::uuid;hash:=md5(snap::text);
 requirements:=private.payroll_reimbursement_requirements(snap);
 select coalesce(jsonb_agg(r||jsonb_build_object('employeeCode',u.employee_id,'evidence',case when x.id is null then null else to_jsonb(x)||jsonb_build_object('verifiedName',v.full_name) end,
 'verified',coalesce(x.source_hash=hash and x.required_amount=(r->>'requiredAmount')::numeric and x.supported_amount>=x.required_amount and x.verified_by is not null,false)) order by r->>'employeeName'),'[]') into rows
 from jsonb_array_elements(requirements) r join public.hris_users u on u.id=(r->>'employeeId')::uuid
 left join private.payroll_reimbursement_evidence x on x.scope_id=scope and x.date_from=(snap->>'dateFrom')::date and x.date_to=(snap->>'dateTo')::date and x.employee_id=u.id
 left join public.hris_users v on v.id=x.verified_by;
 return jsonb_build_object('from',snap->>'dateFrom','to',snap->>'dateTo','sourceHash',hash,'canSubmit',private.payroll_gross_permission(scope,'prepare') or private.payroll_nte_finance(scope),
 'canVerify',private.payroll_nte_finance(scope),'actorId',private.payroll_actor_id(),'rows',rows);
end $$;

create function private.save_payroll_reimbursement_evidence(p_time_id uuid,p_employee uuid,p_source_hash text,p_supported numeric,p_url text) returns uuid
language plpgsql security definer set search_path='' as $$
declare snap jsonb;scope uuid;req jsonb;result uuid;actor uuid:=private.payroll_actor_id();row private.payroll_reimbursement_evidence;
begin
 if auth.uid() is null or actor is null then raise exception 'Active signed-in account required.' using errcode='42501';end if;
 select scope_id into scope from public.payroll_time_packages where id=p_time_id;
 if not coalesce(private.payroll_gross_permission(scope,'prepare') or private.payroll_nte_finance(scope),false) then raise exception 'Assigned payroll preparer or Finance access required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-gross:'||scope::text,0));
 snap:=private.payroll_gross_source_before_reimbursement(p_time_id);
 if p_source_hash is distinct from md5(snap::text) then raise exception 'Payroll inputs changed. Refresh cutoff requirements before saving.' using errcode='PT409';end if;
 select value into req from jsonb_array_elements(private.payroll_reimbursement_requirements(snap)) where value->>'employeeId'=p_employee::text;
 if req is null then raise exception 'No reimbursable allowance is due for this employee and cutoff.';end if;
 if not private.payroll_receipt_link_valid(btrim(p_url)) then raise exception 'Use an HTTPS Google Drive receipt/folder or Google Sheets breakdown link.';end if;
 if p_supported is null or p_supported<0 or p_supported>999999999 or p_supported<>round(p_supported,2) then raise exception 'Enter the supported receipt total in pesos, with at most two decimals.';end if;
 insert into private.payroll_reimbursement_evidence(scope_id,date_from,date_to,employee_id,source_hash,required_amount,supported_amount,document_url,submitted_by)
 values(scope,(snap->>'dateFrom')::date,(snap->>'dateTo')::date,p_employee,p_source_hash,(req->>'requiredAmount')::numeric,p_supported,btrim(p_url),actor)
 on conflict(scope_id,date_from,date_to,employee_id) do update set source_hash=excluded.source_hash,required_amount=excluded.required_amount,supported_amount=excluded.supported_amount,document_url=excluded.document_url,submitted_by=excluded.submitted_by,submitted_at=clock_timestamp(),verified_by=null,verified_at=null
 returning * into row;
 insert into private.payroll_reimbursement_evidence_audit(evidence_id,actor_id,action,record) values(row.id,actor,'submitted',to_jsonb(row));
 return row.id;
end $$;

create function private.verify_payroll_reimbursement_evidence(p_time_id uuid,p_employee uuid,p_source_hash text,p_submitted_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare snap jsonb;scope uuid;req jsonb;row private.payroll_reimbursement_evidence;actor uuid:=private.payroll_actor_id();
begin
 if auth.uid() is null or actor is null then raise exception 'Active signed-in account required.' using errcode='42501';end if;
 select scope_id into scope from public.payroll_time_packages where id=p_time_id;
 if not coalesce(private.payroll_nte_finance(scope),false) or actor=p_employee then raise exception 'Assigned Finance verifier required; you cannot verify your own allowance.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-gross:'||scope::text,0));
 snap:=private.payroll_gross_source_before_reimbursement(p_time_id);
 select value into req from jsonb_array_elements(private.payroll_reimbursement_requirements(snap)) where value->>'employeeId'=p_employee::text;
 select * into row from private.payroll_reimbursement_evidence where scope_id=scope and date_from=(snap->>'dateFrom')::date and date_to=(snap->>'dateTo')::date and employee_id=p_employee for update;
 if p_source_hash is distinct from md5(snap::text) or row.source_hash is distinct from p_source_hash or row.submitted_at is distinct from p_submitted_at or req is null or row.required_amount is distinct from (req->>'requiredAmount')::numeric then raise exception 'Evidence or payroll inputs changed. Refresh and review the latest link and amount.' using errcode='PT409';end if;
 if not (req->>'calculationReady')::boolean then raise exception 'Resolve this employee’s payroll calculation issues before verification.';end if;
 if row.supported_amount<row.required_amount then raise exception 'The supported total must meet the required cutoff allowance.';end if;
 if not private.payroll_receipt_link_valid(row.document_url) then raise exception 'A valid Drive or Sheets link is required.';end if;
 if row.verified_by is not null then return;end if;
 update private.payroll_reimbursement_evidence set verified_by=actor,verified_at=clock_timestamp() where id=row.id returning * into row;
 insert into private.payroll_reimbursement_evidence_audit(evidence_id,actor_id,action,record) values(row.id,actor,'finance_verified',to_jsonb(row));
end $$;

create or replace function private.payroll_gross_snapshot(p_time_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare snap jsonb;reqs jsonb;req jsonb;row private.payroll_reimbursement_evidence;evidence jsonb:='[]';hash text;
begin
 snap:=private.payroll_gross_source_before_reimbursement(p_time_id);hash:=md5(snap::text);reqs:=private.payroll_reimbursement_requirements(snap);
 if jsonb_array_length(reqs)=0 then return snap;end if;
 for req in select value from jsonb_array_elements(reqs) loop
  select * into row from private.payroll_reimbursement_evidence where scope_id=(snap->>'scopeId')::uuid and date_from=(snap->>'dateFrom')::date and date_to=(snap->>'dateTo')::date and employee_id=(req->>'employeeId')::uuid;
  if row.id is null or row.verified_by is null or row.source_hash<>hash or row.required_amount<>(req->>'requiredAmount')::numeric or row.supported_amount<row.required_amount then
   raise exception 'Reimbursable allowance for % requires PHP % supported by a Drive/Sheets link verified by Finance for this cutoff. Open Run Payroll → Reimbursable allowance receipts.',req->>'employeeName',req->>'requiredAmount';
  end if;
  evidence:=evidence||jsonb_build_array(to_jsonb(row));
 end loop;
 return snap||jsonb_build_object('reimbursementEvidence',evidence);
end $$;

create function public.get_payroll_reimbursement_workspace(p_time_id uuid) returns jsonb language sql stable security invoker set search_path='' return private.get_payroll_reimbursement_workspace(p_time_id);
create function public.save_payroll_reimbursement_evidence(p_time_id uuid,p_employee uuid,p_source_hash text,p_supported numeric,p_url text) returns uuid language sql security invoker set search_path='' return private.save_payroll_reimbursement_evidence(p_time_id,p_employee,p_source_hash,p_supported,p_url);
create function public.verify_payroll_reimbursement_evidence(p_time_id uuid,p_employee uuid,p_source_hash text,p_submitted_at timestamptz) returns void language sql security invoker set search_path='' return private.verify_payroll_reimbursement_evidence(p_time_id,p_employee,p_source_hash,p_submitted_at);

revoke all on function private.payroll_gross_source_before_reimbursement(uuid),private.payroll_reimbursement_requirements(jsonb),private.payroll_is_reimbursement_component(jsonb),private.payroll_receipt_link_valid(text) from public,anon,authenticated;
revoke all on function private.get_payroll_reimbursement_workspace(uuid),private.save_payroll_reimbursement_evidence(uuid,uuid,text,numeric,text),private.verify_payroll_reimbursement_evidence(uuid,uuid,text,timestamptz),public.get_payroll_reimbursement_workspace(uuid),public.save_payroll_reimbursement_evidence(uuid,uuid,text,numeric,text),public.verify_payroll_reimbursement_evidence(uuid,uuid,text,timestamptz) from public,anon;
grant execute on function private.get_payroll_reimbursement_workspace(uuid),private.save_payroll_reimbursement_evidence(uuid,uuid,text,numeric,text),private.verify_payroll_reimbursement_evidence(uuid,uuid,text,timestamptz),public.get_payroll_reimbursement_workspace(uuid),public.save_payroll_reimbursement_evidence(uuid,uuid,text,numeric,text),public.verify_payroll_reimbursement_evidence(uuid,uuid,text,timestamptz) to authenticated;

notify pgrst,'reload schema';
