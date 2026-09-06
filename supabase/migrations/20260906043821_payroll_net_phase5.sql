-- Phase 5: isolated, immutable shadow net pay. No HRIS writers, roles or live gates change.
create table public.payroll_net_reviews (
 id uuid primary key default gen_random_uuid(), revision bigint generated always as identity unique,
 gross_run_id uuid not null references public.payroll_gross_runs(id),
 scope_id uuid not null references public.payroll_access_scopes(id),
 inputs jsonb not null, source_ref text not null check(length(trim(source_ref)) between 3 and 1000),
 approved_by uuid not null references public.hris_users(id), approved_at timestamptz not null default now()
);
create table public.payroll_loan_ledger (
 id uuid primary key default gen_random_uuid(), revision bigint generated always as identity unique,
 employee_id uuid not null references public.hris_users(id), scope_id uuid not null references public.payroll_access_scopes(id),
 account_ref text not null check(length(trim(account_ref)) between 3 and 100),
 as_of date not null, balance numeric(20,2) not null check(balance>=0),
 installment numeric(20,2) not null check(installment>0),
 previous_id uuid references public.payroll_loan_ledger(id),
 source_ref text not null check(length(trim(source_ref)) between 3 and 1000),
 authorized_by uuid not null references public.hris_users(id), recorded_at timestamptz not null default now()
);
create table public.payroll_net_runs (
 id uuid primary key default gen_random_uuid(), scope_id uuid not null references public.payroll_access_scopes(id),
 gross_run_id uuid not null references public.payroll_gross_runs(id), review_id uuid not null references public.payroll_net_reviews(id),
 date_from date not null, date_to date not null, version integer not null,
 previous_id uuid references public.payroll_net_runs(id), source_hash text not null,
 source_snapshot jsonb not null, result jsonb not null, engine_version text not null default 'net-ph-2026-v1',
 gross_amount numeric(24,2) not null, deduction_amount numeric(24,2) not null, net_amount numeric(24,2) not null,
 employer_amount numeric(24,2) not null, reason text not null check(length(trim(reason)) between 3 and 1000),
 created_by uuid not null references public.hris_users(id), created_at timestamptz not null default now(),
 check(gross_amount-deduction_amount=net_amount and net_amount>=0),
 unique(scope_id,date_from,date_to,version), unique(gross_run_id,source_hash)
);
create index payroll_net_review_gross on public.payroll_net_reviews(gross_run_id,revision desc);
create index payroll_loan_employee on public.payroll_loan_ledger(employee_id,account_ref,as_of desc,revision desc);
create index payroll_net_scope on public.payroll_net_runs(scope_id,date_from,date_to,version desc);
alter table public.payroll_net_reviews enable row level security;
alter table public.payroll_loan_ledger enable row level security;
alter table public.payroll_net_runs enable row level security;
revoke all on public.payroll_net_reviews,public.payroll_loan_ledger,public.payroll_net_runs from public,anon,authenticated;
create trigger payroll_net_reviews_immutable before update or delete on public.payroll_net_reviews for each row execute function private.payroll_audit_immutable();
create trigger payroll_loan_ledger_immutable before update or delete on public.payroll_loan_ledger for each row execute function private.payroll_audit_immutable();
create trigger payroll_net_runs_immutable before update or delete on public.payroll_net_runs for each row execute function private.payroll_audit_immutable();

create function private.payroll_net_money(p jsonb,p_key text,p_signed boolean default false) returns numeric
language plpgsql immutable set search_path='' as $$
declare n numeric;v text:=p->>p_key;
begin
 if v is null or v !~ (case when p_signed then '^-?[0-9]{1,12}(\.[0-9]{1,2})?$' else '^[0-9]{1,12}(\.[0-9]{1,2})?$' end) then raise exception 'Enter a reviewed decimal amount (up to two decimals) for %.',p_key;end if;
 n:=v::numeric;return n;
end $$;
create function private.payroll_net_review_validate(p_gross_id uuid,p jsonb) returns void
language plpgsql stable security definer set search_path='' as $$
declare r public.payroll_gross_runs;e jsonb;i jsonb;l jsonb;a jsonb;pkg jsonb;k text;treatment text;n int;pay_date date;
begin
 select * into r from public.payroll_gross_runs where id=p_gross_id;
 if r.id is null or not private.payroll_net_can_review(r.scope_id) then raise exception 'Scoped Finance authorization and existing compensation access required.' using errcode='42501';end if;
 if not (public.get_payroll_gross_run(r.id)->>'current')::boolean then raise exception 'Gross inputs changed. Prepare the current gross version first.';end if;
 if jsonb_typeof(p->'employees') is distinct from 'array' or jsonb_array_length(p->'employees')<>jsonb_array_length(r.result->'employees') then raise exception 'Review every employee in this gross run exactly once.';end if;
 if exists(select 1 from jsonb_array_elements(p->'employees') x group by x->>'employeeId' having count(*)>1) then raise exception 'Duplicate employee review.';end if;
 if p->>'ruleset' is distinct from 'PH-2026-09-06' or p->>'cutoff' is null or p->>'cutoff' not in('1','2') or p->>'insufficientNet' is null or p->>'insufficientNet' not in('block','defer_authorized') then raise exception 'Confirm reviewed rules, cutoff and insufficient-net policy.';end if;
 pay_date:=(p->>'payDate')::date;
 if pay_date is null or pay_date not between date '2026-01-06' and date '2026-12-31' or (p->>'contributionMonth')::date is distinct from date_trunc('month',pay_date)::date then raise exception 'Enter a reviewed 2026 payday and its contribution month.';end if;
 if pay_date<r.date_to or pay_date>r.date_to+45 then raise exception 'Payday must follow the cutoff within 45 days; reconcile a different payroll calendar.';end if;
 if length(trim(coalesce(p->>'policyRef','')))<3 then raise exception 'Approved contribution allocation, payday and insufficient-net policy reference required.';end if;
 for k in select unnest(array['sss','philhealth','pagibig']) loop
 if private.payroll_net_money(p->'allocation',k) not in(0,.5,1) then raise exception 'First-cutoff allocation must be 0, 0.5 or 1.';end if;end loop;
 for e in select value from jsonb_array_elements(r.result->'employees') loop
 select value into i from jsonb_array_elements(p->'employees') where value->>'employeeId'=e->>'employeeId';
 if i is null then raise exception 'Missing Finance review for %.',e->>'employeeName';end if;
 if (e->>'employeeId')::uuid=private.payroll_actor_id() then raise exception 'Another authorized Finance reviewer must review your own pay.' using errcode='42501';end if;
 if not private.payroll_package_permission((e->>'employeeId')::uuid,r.scope_id,'view') then raise exception 'Employee outside existing salary scope.' using errcode='42501';end if;
 if length(trim(coalesce(i->>'sourceRef','')))<3 or length(trim(coalesce(i->>'openingRef','')))<3 then raise exception 'Contribution/benefit treatment and reviewed YTD/opening-balance references required for %.',e->>'employeeName';end if;
 for k in select unnest(array['sssBase','philhealthBase','pagibigBase','openingTaxable','openingWithheld']) loop perform private.payroll_net_money(i,k);end loop;
 if (i->>'openingPeriods') is null or (i->>'openingPeriods') !~ '^([0-9]|1[0-9]|2[0-3])$' then raise exception 'Prior semi-monthly periods must be 0–23.';end if;
 for k in select unnest(array['sssCovered','philhealthCovered','pagibigCovered','previousEmployer','cumulativeAlready']) loop
 if jsonb_typeof(i->k) is distinct from 'boolean' then raise exception 'Explicit review required for %.',k;end if;end loop;
 if (i->>'sssCovered'='false' or i->>'philhealthCovered'='false' or i->>'pagibigCovered'='false') and length(trim(coalesce(i->>'coverageRef','')))<3 then raise exception 'Statutory coverage exclusion requires its reviewed authority.';end if;
 if jsonb_typeof(i->'taxLines') is distinct from 'array' or jsonb_array_length(i->'taxLines')<>jsonb_array_length(e->'lines') then raise exception 'Review every gross line for %.',e->>'employeeName';end if;
 for n in 0..jsonb_array_length(e->'lines')-1 loop
 l:=e->'lines'->n;a:=i->'taxLines'->n;
 perform private.payroll_net_money(a,'taxable',true);
 if a->>'kind' is null or a->>'kind' not in('regular','supplement') then raise exception 'Classify each gross line as regular or supplementary compensation.';end if;
 select value into pkg from jsonb_array_elements(r.source_snapshot->'packages') where value->>'id'=l->>'packageId';
 treatment:=case when l ? 'component' then l#>>'{component,tax}' else pkg#>>'{treatment,tax}' end;
 -- A rounding reconciliation is not a new salary component; its allocation still needs review.
 if l->>'packageId' is not null and (treatment is null or treatment='unreviewed') then raise exception 'HR must review the pay-package tax treatment before Finance calculates net pay.';end if;
 if treatment='included' and (a->>'taxable')::numeric<>(l->>'amount')::numeric then raise exception 'Taxable line conflicts with approved pay-package treatment.';end if;
 if treatment='excluded' and (a->>'taxable')::numeric<>0 then raise exception 'Exempt line conflicts with approved pay-package treatment.';end if;
 end loop;
 if jsonb_typeof(i->'deductions') is distinct from 'array' or jsonb_array_length(i->'deductions')>30 then raise exception 'Review authorized deductions (an explicit empty list means none).';end if;
 end loop;
end $$;

create function public.record_payroll_loan_balance(p_employee_id uuid,p_account_ref text,p_as_of date,p_balance text,p_installment text,p_source_ref text) returns uuid
language plpgsql security definer set search_path='' as $$
declare scope uuid:=private.payroll_employee_bu_scope(p_employee_id);old public.payroll_loan_ledger;new_id uuid;bal numeric;inst numeric;
begin
 if not private.payroll_net_can_review(scope) or not private.payroll_package_permission(p_employee_id,scope,'view') or p_employee_id=private.payroll_actor_id() then raise exception 'Scoped Finance reviewer with existing salary permission required; own-loan changes prohibited.' using errcode='42501';end if;
 if p_as_of is null or p_as_of>(now() at time zone 'Asia/Manila')::date then raise exception 'Enter the actual opening/reconciliation date, not a future assumed balance.';end if;
 bal:=private.payroll_net_money(jsonb_build_object('balance',p_balance),'balance');inst:=private.payroll_net_money(jsonb_build_object('installment',p_installment),'installment');
 perform pg_advisory_xact_lock(hashtextextended('payroll-loan:'||p_employee_id::text||':'||trim(p_account_ref),0));
 select * into old from public.payroll_loan_ledger where employee_id=p_employee_id and account_ref=trim(p_account_ref) order by revision desc limit 1;
 if old.id is not null and old.as_of>p_as_of then raise exception 'Reconcile from the latest recorded balance date; historical corrections require review.';end if;
 if old.id is not null and old.as_of=p_as_of and old.balance=bal and old.installment=inst and old.source_ref=p_source_ref then return old.id;end if;
 insert into public.payroll_loan_ledger(employee_id,scope_id,account_ref,as_of,balance,installment,previous_id,source_ref,authorized_by)
 values(p_employee_id,scope,trim(p_account_ref),p_as_of,bal,inst,old.id,p_source_ref,private.payroll_actor_id()) returning id into new_id;
 return new_id;
end $$;

-- Recursive prior-version check is bounded and follows strictly earlier, contiguous cutoffs.
create function private.payroll_net_snapshot(p_gross_id uuid,p_depth integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare g public.payroll_gross_runs;v public.payroll_net_reviews;prev public.payroll_net_runs;cursor_run public.payroll_net_runs;
 gross_view jsonb;ps jsonb;loan public.payroll_loan_ledger;loans jsonb:='[]';ids jsonb:='[]';e jsonb;h public.hris_users;used numeric;pay_date date;prior_info jsonb;n int;
begin
 if p_depth>24 then raise exception 'Payroll lineage exceeds the reviewed tax-year chain.';end if;
 select * into g from public.payroll_gross_runs where id=p_gross_id;
 gross_view:=public.get_payroll_gross_run(p_gross_id);
 if not coalesce((gross_view->>'current')::boolean,false) then raise exception 'Gross inputs are out of date. Recalculate gross pay.' using errcode='40001';end if;
 if exists(select 1 from public.payroll_gross_runs where scope_id=g.scope_id and date_from=g.date_from and date_to=g.date_to and version>g.version) then raise exception 'Use the latest gross-pay version.' using errcode='40001';end if;
 select * into v from public.payroll_net_reviews where gross_run_id=g.id order by revision desc limit 1;
 if v.id is null then raise exception 'Finance must record the contribution, tax and opening-balance review.';end if;
 pay_date:=(v.inputs->>'payDate')::date;
 if exists(select 1 from public.payroll_net_runs r where r.scope_id=g.scope_id
 and r.source_snapshot#>>'{review,contributionMonth}'=v.inputs->>'contributionMonth' and r.source_snapshot#>>'{review,cutoff}'=v.inputs->>'cutoff'
 and (r.date_from<>g.date_from or r.date_to<>g.date_to)) then raise exception 'Another cutoff already occupies this contribution-month slot. Reconcile the mapping before proceeding.';end if;
 if v.inputs->>'cutoff'='2' and nullif(v.inputs->>'previousRunId','') is null and exists(select 1 from public.payroll_net_runs r where r.scope_id=g.scope_id and r.source_snapshot#>>'{review,contributionMonth}'=v.inputs->>'contributionMonth' and r.source_snapshot#>>'{review,cutoff}'='1') then raise exception 'Link the recorded first cutoff instead of importing a second opening for this month.';end if;
 if nullif(v.inputs->>'previousRunId','') is not null then
 select * into prev from public.payroll_net_runs where id=(v.inputs->>'previousRunId')::uuid;
 if prev.id is null or prev.scope_id<>g.scope_id or prev.date_to+1<>g.date_from or (prev.source_snapshot#>>'{review,payDate}')::date>=pay_date
 or extract(year from (prev.source_snapshot#>>'{review,payDate}')::date)<>extract(year from pay_date) then raise exception 'Prior net review must be the immediately preceding cutoff in the same BU and tax year.';end if;
 if exists(select 1 from public.payroll_net_runs where scope_id=prev.scope_id and date_from=prev.date_from and date_to=prev.date_to and version>prev.version) then raise exception 'Prior net review has been replaced. Select its latest version.' using errcode='40001';end if;
 ps:=private.payroll_net_snapshot(prev.gross_run_id,p_depth+1);
 if md5(ps::text)<>prev.source_hash then raise exception 'Prior net review sources changed. Recalculate it before this cutoff.' using errcode='40001';end if;
 if (prev.source_snapshot#>>'{review,contributionMonth}'=v.inputs->>'contributionMonth') then
 if prev.source_snapshot#>>'{review,cutoff}'<>'1' or v.inputs->>'cutoff'<>'2' then raise exception 'A contribution month has exactly a first and second cutoff.';end if;
 else
 if prev.source_snapshot#>>'{review,cutoff}'<>'2' or v.inputs->>'cutoff'<>'1' or (prev.source_snapshot#>>'{review,contributionMonth}')::date+interval '1 month'<>(v.inputs->>'contributionMonth')::date then raise exception 'Review the contribution-month sequence.';end if;end if;
 prior_info:=jsonb_build_object('id',prev.id,'hash',prev.source_hash,'contributionMonth',prev.source_snapshot#>>'{review,contributionMonth}','result',prev.result);
 end if;
 for e in select value from jsonb_array_elements(g.result->'employees') loop
 select * into h from public.hris_users where id=(e->>'employeeId')::uuid;
 if not private.payroll_package_permission(h.id,g.scope_id,'view') then raise exception 'Employee outside existing salary scope.' using errcode='42501';end if;
 ids:=ids||jsonb_build_array(jsonb_build_object('employeeId',h.id,'fingerprint',md5(jsonb_build_array(h.sss_no,h.philhealth_no,h.pagibig_no,h.tin)::text)));
 if nullif(trim(h.tin),'') is null then raise exception 'Review the employee TIN in the existing HRIS record: %.',e->>'employeeName';end if;
 if exists(select 1 from jsonb_array_elements(v.inputs->'employees') i where i->>'employeeId'=h.id::text and
 ((i->>'sssCovered'='true' and nullif(trim(h.sss_no),'') is null) or (i->>'philhealthCovered'='true' and nullif(trim(h.philhealth_no),'') is null) or (i->>'pagibigCovered'='true' and nullif(trim(h.pagibig_no),'') is null))) then raise exception 'Missing statutory membership number in HRIS for %.',e->>'employeeName';end if;
 for loan in select distinct on(account_ref) * from public.payroll_loan_ledger where employee_id=h.id and as_of<=pay_date order by account_ref,as_of desc,revision desc loop
 if not private.payroll_net_can_review(loan.scope_id) and not private.payroll_gross_permission(loan.scope_id,'view') then raise exception 'Loan record outside payroll scope.' using errcode='42501';end if;
 used:=0;cursor_run:=prev;n:=0;
 while cursor_run.id is not null and (cursor_run.source_snapshot#>>'{review,payDate}')::date>=loan.as_of loop
 n:=n+1;if n>24 then raise exception 'Loan projection chain exceeds the reviewed year.';end if;
 select used+coalesce(sum((l->>'amount')::numeric),0) into used from jsonb_array_elements(cursor_run.result->'employees') x cross join lateral jsonb_array_elements(x->'loans') l where x->>'employeeId'=h.id::text and l->>'account'=loan.account_ref;
 select * into cursor_run from public.payroll_net_runs where id=nullif(cursor_run.source_snapshot#>>'{review,previousRunId}','')::uuid;
 end loop;
 if used>loan.balance then raise exception 'Loan projections exceed the reconciled balance. Review the opening date and previous cutoff.';end if;
 loans:=loans||jsonb_build_array(to_jsonb(loan)||jsonb_build_object('available',(loan.balance-used)::text));
 end loop;
 end loop;
 if v.inputs->'statutoryFingerprint' is distinct from ids then raise exception 'Statutory employee data changed since Finance review. Review again.' using errcode='40001';end if;
 return jsonb_build_object('engineVersion','net-ph-2026-v1','grossId',g.id,'grossHash',g.source_hash,'gross',g.result,'reviewId',v.id,'review',v.inputs,'reviewRef',v.source_ref,'loans',loans,'statutoryFingerprint',ids,'prior',prior_info);
end $$;

create function public.save_payroll_net_review(p_gross_id uuid,p_inputs jsonb,p_source_ref text) returns uuid
language plpgsql security definer set search_path='' as $$
declare g public.payroll_gross_runs;new_id uuid;fingerprint jsonb;payload jsonb;
begin
 perform private.payroll_net_review_validate(p_gross_id,p_inputs);
 select * into g from public.payroll_gross_runs where id=p_gross_id;
 perform pg_advisory_xact_lock(hashtextextended('payroll-net:'||g.scope_id::text,0));
 select jsonb_agg(jsonb_build_object('employeeId',h.id,'fingerprint',md5(jsonb_build_array(h.sss_no,h.philhealth_no,h.pagibig_no,h.tin)::text)) order by e.ordinality)
 into fingerprint from jsonb_array_elements(g.result->'employees') with ordinality e(value,ordinality) join public.hris_users h on h.id=(e.value->>'employeeId')::uuid;
 payload:=(p_inputs-'statutoryFingerprint')||jsonb_build_object('statutoryFingerprint',fingerprint);
 select id into new_id from public.payroll_net_reviews where gross_run_id=g.id and inputs=payload and source_ref=p_source_ref order by revision desc limit 1;
 if new_id is not null and new_id=(select id from public.payroll_net_reviews where gross_run_id=g.id order by revision desc limit 1) then return new_id;end if;
 insert into public.payroll_net_reviews(gross_run_id,scope_id,inputs,source_ref,approved_by) values(g.id,g.scope_id,payload,p_source_ref,private.payroll_actor_id()) returning id into new_id;
 return new_id;
end $$;

create function public.prepare_payroll_net(p_gross_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare g public.payroll_gross_runs;snap jsonb;calc jsonb;hash text;old public.payroll_net_runs;new_id uuid;
begin
 select * into g from public.payroll_gross_runs where id=p_gross_id;
 if g.id is null or not private.payroll_gross_permission(g.scope_id,'prepare') or not public.check_payroll_operation('prepare_pr',g.scope_id,'calculate') then raise exception 'Scoped preparer, existing salary access and shadow enabled for BU and parent scope required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-net:'||g.scope_id::text,0));
 snap:=private.payroll_net_snapshot(g.id);hash:=md5(snap::text);
 select id into new_id from public.payroll_net_runs where gross_run_id=g.id and source_hash=hash;
 if new_id is not null then return new_id;end if;
 calc:=private.calculate_payroll_net_v1(snap);
 if not (calc->>'ready')::boolean then raise exception 'Resolve net-pay blockers: %',calc->'issues';end if;
 select * into old from public.payroll_net_runs where scope_id=g.scope_id and date_from=g.date_from and date_to=g.date_to order by version desc limit 1;
 insert into public.payroll_net_runs(scope_id,gross_run_id,review_id,date_from,date_to,version,previous_id,source_hash,source_snapshot,result,gross_amount,deduction_amount,net_amount,employer_amount,reason,created_by)
 values(g.scope_id,g.id,(snap->>'reviewId')::uuid,g.date_from,g.date_to,coalesce(old.version,0)+1,old.id,hash,snap,calc,(calc->>'gross')::numeric,(calc->>'deductions')::numeric,(calc->>'net')::numeric,(calc->>'employer')::numeric,p_reason,private.payroll_actor_id()) returning id into new_id;
 return new_id;
end $$;

create function public.get_payroll_net_run(p_run_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.payroll_net_runs;snap jsonb;fresh boolean:=false;why text;
begin
 select * into r from public.payroll_net_runs where id=p_run_id;
 if r.id is null or not private.payroll_gross_permission(r.scope_id,'view') then raise exception 'Existing salary access and scoped payroll duty required.' using errcode='42501';end if;
 if exists(select 1 from jsonb_array_elements(r.result->'employees') e where not private.payroll_package_permission((e->>'employeeId')::uuid,r.scope_id,'view')) then raise exception 'Saved employee outside current salary scope.' using errcode='42501';end if;
 begin snap:=private.payroll_net_snapshot(r.gross_run_id);fresh:=md5(snap::text)=r.source_hash;
 exception when serialization_failure or raise_exception then why:=sqlerrm;end;
 return jsonb_build_object('id',r.id,'version',r.version,'previousId',r.previous_id,'grossId',r.gross_run_id,'current',fresh,'staleReason',why,'from',r.date_from,'to',r.date_to,'payDate',r.source_snapshot#>>'{review,payDate}','contributionMonth',r.source_snapshot#>>'{review,contributionMonth}','cutoff',r.source_snapshot#>>'{review,cutoff}','sourceHash',r.source_hash,'reviewRef',r.source_snapshot->>'reviewRef','result',r.result,'reason',r.reason);
end $$;
create function public.get_payroll_net_workspace(p_gross_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare g public.payroll_gross_runs;gross_view jsonb;v public.payroll_net_reviews;
begin
 gross_view:=public.get_payroll_gross_run(p_gross_id);select * into g from public.payroll_gross_runs where id=p_gross_id;
 select * into v from public.payroll_net_reviews where gross_run_id=g.id order by revision desc limit 1;
 return jsonb_build_object('gross',gross_view,'canReview',private.payroll_net_can_review(g.scope_id),'review',case when v.id is null then null else jsonb_build_object('id',v.id,'inputs',v.inputs-'statutoryFingerprint','sourceRef',v.source_ref,'approvedAt',v.approved_at) end,
 'loans',(select coalesce(jsonb_agg(to_jsonb(l) order by l.employee_id,l.account_ref,l.revision desc),'[]') from public.payroll_loan_ledger l where exists(select 1 from jsonb_array_elements(g.result->'employees') e where e->>'employeeId'=l.employee_id::text) and private.payroll_gross_permission(l.scope_id,'view')),
 'runs',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'version',r.version,'grossId',r.gross_run_id,'from',r.date_from,'to',r.date_to,'payDate',r.source_snapshot#>>'{review,payDate}') order by r.date_from desc,r.version desc),'[]') from public.payroll_net_runs r where r.scope_id=g.scope_id));
end $$;
create function private.payroll_net_can_review(p_scope uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.payroll_gross_permission(p_scope,'view') and private.payroll_has_access('authorize_finance',p_scope)
 and public.has_sensitive_permission('salary_compensation','edit')
$$;
-- BIR RR 11-2018 Annex E, semi-monthly, effective 2023 onwards.
-- Return unrounded tax so cumulative-average rounding occurs at the final deduction.
create function private.payroll_withholding_2023(p_regular numeric,p_supplement numeric default 0) returns numeric
language sql immutable set search_path='' as $$
 select case when p_regular>=333333 then 91770.70+(p_regular-333333+p_supplement)*.35
 when p_regular>=83333 then 16770.70+(p_regular-83333+p_supplement)*.30
 when p_regular>=33333 then 4270.70+(p_regular-33333+p_supplement)*.25
 when p_regular>=16667 then 937.50+(p_regular-16667+p_supplement)*.20
 when p_regular>10417 then (p_regular-10417+p_supplement)*.15 else 0 end
$$;
create function private.payroll_contributions_2026(p jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare s numeric:=private.payroll_net_money(p,'sssBase');h numeric:=private.payroll_net_money(p,'philhealthBase');
 g numeric:=private.payroll_net_money(p,'pagibigBase');msc numeric;ph numeric;outp jsonb;
begin
 -- Each base is Finance's reviewed MONTHLY basis, not this cutoff's gross.
 msc:=least(35000,greatest(5000,floor((s+250)/500)*500));ph:=round(least(100000,greatest(10000,h))*.05,2);
 outp:=jsonb_build_object('sssEE',least(msc,20000)*.05,'sssER',least(msc,20000)*.10,
 'mpfEE',greatest(msc-20000,0)*.05,'mpfER',greatest(msc-20000,0)*.10,'ecER',case when msc>=15000 then 30 else 10 end,
 'philhealthEE',round(ph/2,2),'philhealthER',ph-round(ph/2,2),
 'pagibigEE',round(least(g,10000)*case when g<=1500 then .01 else .02 end,2),'pagibigER',round(least(g,10000)*.02,2));
 if p->>'sssCovered'='false' then outp:=outp||'{"sssEE":0,"sssER":0,"mpfEE":0,"mpfER":0,"ecER":0}'::jsonb;end if;
 if p->>'philhealthCovered'='false' then outp:=outp||'{"philhealthEE":0,"philhealthER":0}'::jsonb;end if;
 if p->>'pagibigCovered'='false' then outp:=outp||'{"pagibigEE":0,"pagibigER":0}'::jsonb;end if;
 return outp;
end $$;

-- Pure calculation over an authorized immutable snapshot; never reads/writes a loan balance.
create function private.calculate_payroll_net_v1(p jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare cfg jsonb:=p->'review';emp jsonb;inp jsonb;prior jsonb;line jsonb;alloc jsonb;monthly jsonb;paid jsonb;shares jsonb;loans jsonb;deductions jsonb;
 taxable_regular numeric;taxable_supp numeric;exempt_total numeric;gross numeric;mandatory numeric;employer numeric;tax numeric;net numeric;other numeric;amount numeric;basis numeric;ratio numeric;due numeric;before numeric;take numeric;
 ytd numeric;withheld numeric;periods int;cumulative boolean;k text;item jsonb;loan jsonb;issues jsonb:='[]';outp jsonb:='[]';total_g numeric:=0;total_d numeric:=0;total_n numeric:=0;total_er numeric:=0;i int;sharelines jsonb;taxdetail jsonb;
begin
 if cfg->>'ruleset' is distinct from 'PH-2026-09-06' or (cfg->>'payDate')::date not between date '2026-01-06' and date '2026-12-31' then raise exception 'This reviewed rule set covers payments January 6–December 31, 2026 only. Review the applicable rules for other dates.';end if;
 if (cfg->>'contributionMonth')::date<>date_trunc('month',(cfg->>'payDate')::date)::date then raise exception 'Contribution month must be the explicitly reviewed payment month. Other allocation requires review.';end if;
 if cfg->>'cutoff' not in('1','2') or cfg->>'insufficientNet' not in('block','defer_authorized') then raise exception 'Confirm cutoff allocation and insufficient-net policy.';end if;
 for emp in select value from jsonb_array_elements(p#>'{gross,employees}') loop
 begin
 select value into inp from jsonb_array_elements(cfg->'employees') where value->>'employeeId'=emp->>'employeeId';
 if inp is null then raise exception 'Finance review missing.';end if;
 gross:=(emp->>'gross')::numeric;taxable_regular:=0;taxable_supp:=0;exempt_total:=0;
 if jsonb_array_length(inp->'taxLines')<>jsonb_array_length(emp->'lines') then raise exception 'Review the tax treatment of every gross explanation line.';end if;
 for i in 0..jsonb_array_length(emp->'lines')-1 loop
 line:=emp->'lines'->i;alloc:=inp->'taxLines'->i;amount:=(line->>'amount')::numeric;basis:=private.payroll_net_money(alloc,'taxable',true);
 if basis<least(0,amount) or basis>greatest(0,amount) or alloc->>'kind' not in('regular','supplement') then raise exception 'Tax allocation must reconcile to gross line %.',i+1;end if;
 if basis<>amount and length(trim(coalesce(alloc->>'exemptionRef','')))<3 then raise exception 'Tax-exempt portion of line % needs the reviewed legal/source reference and benefit-limit reconciliation.',i+1;end if;
 if alloc->>'kind'='regular' then taxable_regular:=taxable_regular+basis;else taxable_supp:=taxable_supp+basis;end if;
 exempt_total:=exempt_total+amount-basis;
 end loop;
 if taxable_regular<0 or taxable_supp<0 or exempt_total<0 then raise exception 'Negative compensation allocation requires a linked correction, not a regular payroll run.';end if;
 monthly:=private.payroll_contributions_2026(inp);shares:='{}';sharelines:='[]';mandatory:=0;employer:=0;
 prior:=null;
 select value into prior from jsonb_array_elements(coalesce(p#>'{prior,result,employees}','[]')) where value->>'employeeId'=emp->>'employeeId';
 paid:=case when cfg->>'cutoff'='1' then '{}'::jsonb when p#>>'{prior,contributionMonth}'=cfg->>'contributionMonth' and prior is not null then prior->'monthlyPaid' else inp->'openingContributions' end;
 if cfg->>'cutoff'='2' and paid is null then raise exception 'Second cutoff needs the first cutoff version or reviewed imported month-to-date employee AND employer contributions.';end if;
 for k in select jsonb_object_keys(monthly) loop
 due:=(monthly->>k)::numeric;before:=case when cfg->>'cutoff'='1' then 0 else private.payroll_net_money(paid,k) end;
 ratio:=private.payroll_net_money(cfg->'allocation',case when k like 'sss%' or k like 'mpf%' or k='ecER' then 'sss' when k like 'philhealth%' then 'philhealth' else 'pagibig' end);
 if ratio not in(0,.5,1) then raise exception 'Choose first-cutoff allocation 0, 0.5 or 1 for each contribution.';end if;
 if before>due then raise exception 'Prior % exceeds the reviewed monthly due. Reconcile the earlier cutoff before proceeding.',k;end if;
 take:=case when cfg->>'cutoff'='1' then round(due*ratio,2) else due-before end;
 shares:=shares||jsonb_build_object(k,(before+take)::text);
 sharelines:=sharelines||jsonb_build_array(jsonb_build_object('label',k,'monthly',due::text,'prior',before::text,'amount',take::text));
 if k like '%EE' then mandatory:=mandatory+take;else employer:=employer+take;end if;
 end loop;
 -- Mandatory employee shares are deducted once from taxable compensation; never loans/ER shares.
 taxable_regular:=greatest(0,taxable_regular-mandatory);taxable_supp:=greatest(0,taxable_supp-greatest(0,mandatory-((gross-exempt_total)-taxable_supp)));
 ytd:=case when prior is not null then (prior#>>'{ytd,taxable}')::numeric else private.payroll_net_money(inp,'openingTaxable') end;
 withheld:=case when prior is not null then (prior#>>'{ytd,withheld}')::numeric else private.payroll_net_money(inp,'openingWithheld') end;
 periods:=case when prior is not null then (prior#>>'{ytd,periods}')::int else (inp->>'openingPeriods')::int end;
 if periods is null or periods<0 or periods>23 then raise exception 'Review the number of prior semi-monthly payroll periods (0–23).';end if;
 cumulative:=coalesce((prior#>>'{ytd,cumulative}')::boolean,false) or inp->>'cumulativeAlready'='true' or inp->>'previousEmployer'='true'
 or (taxable_supp>0 and taxable_regular<=10417) or (taxable_supp>0 and taxable_supp>=taxable_regular);
 if cumulative then tax:=round(greatest(0,private.payroll_withholding_2023((ytd+taxable_regular+taxable_supp)/(periods+1))*(periods+1)-withheld),2);
 else tax:=round(private.payroll_withholding_2023(taxable_regular,taxable_supp),2);end if;
 taxdetail:=jsonb_build_object('regular',taxable_regular::text,'supplement',taxable_supp::text,'exempt',exempt_total::text,'method',case when cumulative then 'cumulative_average' else 'regular_bracket_plus_supplement' end,'priorTaxable',ytd::text,'priorWithheld',withheld::text,'priorPeriods',periods,'amount',tax::text);
 net:=gross-mandatory-tax;other:=0;loans:='[]';deductions:='[]';
 if net<0 then raise exception 'Statutory deductions exceed gross. Reconcile the employee before calculation.';end if;
 for loan in select value from jsonb_array_elements(coalesce(p->'loans','[]')) where value->>'employee_id'=emp->>'employeeId' order by value->>'account_ref' loop
 before:=(loan->>'available')::numeric;amount:=least((loan->>'installment')::numeric,before);
 if amount>net and cfg->>'insufficientNet'='block' then raise exception 'Insufficient net for authorized loan %. Approved deferral policy or reconciliation required.',loan->>'account_ref';end if;
 take:=least(amount,net);net:=net-take;other:=other+take;
 loans:=loans||jsonb_build_array(jsonb_build_object('ledgerId',loan->>'id','account',loan->>'account_ref','balance',before::text,'installment',loan->>'installment','amount',take::text,'deferred',(amount-take)::text,'projectedBalance',(before-take)::text,'sourceRef',loan->>'source_ref'));
 end loop;
 for item in select value from jsonb_array_elements(coalesce(inp->'deductions','[]')) loop
 amount:=private.payroll_net_money(item,'amount');
 if length(trim(coalesce(item->>'sourceRef','')))<3 or length(trim(coalesce(item->>'label','')))<1 then raise exception 'Every additional deduction needs a name and employee authorization/source reference.';end if;
 if amount>net and cfg->>'insufficientNet'='block' then raise exception 'Insufficient net for %. Approved deferral policy or reconciliation required.',item->>'label';end if;
 take:=least(amount,net);net:=net-take;other:=other+take;
 deductions:=deductions||jsonb_build_array(item||jsonb_build_object('amount',take::text,'requested',amount::text,'deferred',(amount-take)::text));
 end loop;
 outp:=outp||jsonb_build_array(jsonb_build_object('employeeId',emp->>'employeeId','employeeName',emp->>'employeeName','gross',gross::text,'mandatory',mandatory::text,'tax',tax::text,'other',other::text,'deductions',(mandatory+tax+other)::text,'net',net::text,'employer',employer::text,'contributions',sharelines,'monthlyPaid',shares,'taxExplanation',taxdetail,'loans',loans,'otherDeductions',deductions,'ytd',jsonb_build_object('taxable',(ytd+taxable_regular+taxable_supp)::text,'withheld',(withheld+tax)::text,'periods',periods+1,'cumulative',cumulative)));
 total_g:=total_g+gross;total_d:=total_d+mandatory+tax+other;total_n:=total_n+net;total_er:=total_er+employer;
 exception when others then issues:=issues||jsonb_build_array(jsonb_build_object('employeeId',emp->>'employeeId','employeeName',emp->>'employeeName','message',sqlerrm));end;
 end loop;
 return jsonb_build_object('engineVersion','net-ph-2026-v1','ready',jsonb_array_length(issues)=0,'issues',issues,'employees',outp,'gross',total_g::text,'deductions',total_d::text,'net',total_n::text,'employer',total_er::text,'shadow',true);
end $$;
-- Grants are installed last, after all definitions. The private API remains owner-only.
revoke all on function private.payroll_net_money(jsonb,text,boolean),private.payroll_net_can_review(uuid),private.payroll_withholding_2023(numeric,numeric),private.payroll_contributions_2026(jsonb),private.calculate_payroll_net_v1(jsonb),private.payroll_net_review_validate(uuid,jsonb),private.payroll_net_snapshot(uuid,integer) from public,anon,authenticated;
revoke all on function public.record_payroll_loan_balance(uuid,text,date,text,text,text),public.save_payroll_net_review(uuid,jsonb,text),public.prepare_payroll_net(uuid,text),public.get_payroll_net_run(uuid),public.get_payroll_net_workspace(uuid) from public,anon,authenticated;
grant execute on function public.record_payroll_loan_balance(uuid,text,date,text,text,text),public.save_payroll_net_review(uuid,jsonb,text),public.prepare_payroll_net(uuid,text),public.get_payroll_net_run(uuid),public.get_payroll_net_workspace(uuid) to authenticated;
revoke all on sequence public.payroll_net_reviews_revision_seq,public.payroll_loan_ledger_revision_seq from public,anon,authenticated;
