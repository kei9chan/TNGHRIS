-- Phase 6: immutable special-pay reviews. No payment, loan posting or HRIS writer.
create table public.payroll_special_runs (
 id uuid primary key default gen_random_uuid(),
 scope_id uuid not null references public.payroll_access_scopes(id),
 employee_id uuid not null references public.hris_users(id),
 kind text not null check(kind in('correction','supplement','thirteenth','final')),
 case_key text not null check(length(case_key) between 3 and 160),
 version integer not null, previous_id uuid references public.payroll_special_runs(id),
 source_net_id uuid references public.payroll_net_runs(id),
 date_from date not null,date_to date not null,pay_date date not null,
 inputs jsonb not null,source_snapshot jsonb not null,source_hash text not null,
 result jsonb not null,engine_version text not null default 'special-ph-2026-v1',
 gross_amount numeric(24,2) not null,deduction_amount numeric(24,2) not null,net_amount numeric(24,2) not null,
 reason text not null check(length(trim(reason)) between 3 and 1000),
 created_by uuid not null references public.hris_users(id),created_at timestamptz not null default now(),
 check(date_from<=date_to and pay_date>=date_to),check(gross_amount-deduction_amount=net_amount),
 unique(employee_id,case_key,version),unique(employee_id,case_key,source_hash)
);
create table public.payroll_special_reviews (
 id uuid primary key default gen_random_uuid(),run_id uuid not null unique references public.payroll_special_runs(id),
 source_hash text not null,source_ref text not null check(length(trim(source_ref)) between 3 and 1000),
 reviewed_by uuid not null references public.hris_users(id),reviewed_at timestamptz not null default now()
);
create index payroll_special_employee on public.payroll_special_runs(employee_id,created_at desc);
alter table public.payroll_special_runs enable row level security;
alter table public.payroll_special_reviews enable row level security;
revoke all on public.payroll_special_runs,public.payroll_special_reviews from public,anon,authenticated;
create trigger payroll_special_runs_immutable before update or delete on public.payroll_special_runs for each row execute function private.payroll_audit_immutable();
create trigger payroll_special_reviews_immutable before update or delete on public.payroll_special_reviews for each row execute function private.payroll_audit_immutable();

create function private.payroll_annual_tax_2023(n numeric) returns numeric
language sql immutable set search_path='' as $$
 select round(case when n>8000000 then 2202500+(n-8000000)*.35
 when n>2000000 then 402500+(n-2000000)*.30 when n>800000 then 102500+(n-800000)*.25
 when n>400000 then 22500+(n-400000)*.20 when n>250000 then (n-250000)*.15 else 0 end,2)
$$;

-- All inputs are reviewed decimal strings. Settled means ACTUAL settled amounts,
-- never an earlier shadow calculation. Negative corrections remain review-only.
create function private.calculate_payroll_special_v1(p jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text:=p->>'kind';l jsonb;lines jsonb:='[]';basic numeric:=0;bonus numeric:=0;due numeric;
 a numeric;s numeric;t numeric;gross numeric:=0;ded numeric:=0;mandatory numeric:=0;employer numeric:=0;taxable numeric:=0;tax numeric;
 used numeric;prior numeric;prev numeric;withheld numeric;seen text[]:='{}';key text;method text:=p->>'taxMethod';
begin
 if k is null or k not in('correction','supplement','thirteenth','final') then raise exception 'Choose a supported special-pay case.';end if;
 if length(trim(coalesce(p->>'sourceRef','')))<3 or length(trim(coalesce(p->>'settlementRef','')))<3 or length(trim(coalesce(p->>'taxRef','')))<3
 or p->>'reviewedCoverage' is distinct from 'true' then raise exception 'Confirm complete earnings, payments, deductions, tax coverage and source references.';end if;
 if jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines')>100 then raise exception 'Provide a reviewed line list (at most 100).';end if;
 for l in select value from jsonb_array_elements(p->'lines') loop
 key:=lower(trim(coalesce(l->>'sourceKey','')));
 if length(key)<3 or key=any(seen) or length(trim(coalesce(l->>'sourceRef','')))<3 or length(trim(coalesce(l->>'label','')))<2 then raise exception 'Each line needs a distinct earning/deduction source key, label and approval reference.';end if;seen:=array_append(seen,key);
 a:=private.payroll_net_money(l,'amount');s:=private.payroll_net_money(l,'settled');due:=a-s;t:=private.payroll_net_money(l,'taxable',true);
 if l->>'category' is null or l->>'category' not in('other','basic','leave','loan','accountability','mandatory') then raise exception 'Choose a supported category; 13th-month and income tax are calculated separately.';end if;
 if l->>'category' in('loan','accountability','mandatory') and l->>'kind' not in('deduction','employer') then raise exception 'Loan, accountability and mandatory entries must be deductions or employer costs.';end if;
 if l->>'kind' is null or l->>'kind' not in('earning','deduction','employer') then raise exception 'Classify each line.';end if;
 if l->>'kind'='earning' then
 if t<least(0,due) or t>greatest(0,due) then raise exception 'Taxable amount must be within the signed remaining earning.';end if;
 if t<>due and length(trim(coalesce(l->>'taxRef','')))<3 then raise exception 'Exempt portions require reviewed treatment/limit evidence.';end if;
 gross:=gross+due;taxable:=taxable+t;
 elsif l->>'kind'='deduction' then
 if t<>0 then raise exception 'Deduction lines do not contain taxable earnings; review taxable income net of eligible mandatory contributions separately.';end if;
 ded:=ded+due;if l->>'category'='mandatory' then mandatory:=mandatory+due;end if;
 else if t<>0 then raise exception 'Employer costs are separate from employee tax.';end if;employer:=employer+due;end if;
 if l->>'category'='leave' and (k<>'final' or length(trim(coalesce(p->>'leaveRef','')))<3) then raise exception 'Leave conversion requires final-pay policy and approved balance/rate evidence.';end if;
 if l->>'category' in('loan','accountability') and length(trim(coalesce(p->>'accountabilityRef','')))<3 then raise exception 'Review current balances, lawful deduction authority and earlier recoveries.';end if;
 lines:=lines||jsonb_build_array(l||jsonb_build_object('remaining',due));
 end loop;
 if k in('thirteenth','final') then
 if length(trim(coalesce(p->>'eligibilityRef','')))<3 or jsonb_typeof(p->'basicPeriods') is distinct from 'array' or jsonb_array_length(p->'basicPeriods') not between 1 and 60 then raise exception 'Review eligibility and actual basic salary earned by period, including any zero periods.';end if;
 seen:='{}';
 for l in select value from jsonb_array_elements(p->'basicPeriods') loop
 key:=l->>'period';
 if key is null or key!~ '^2026-(0[1-9]|1[0-2])(-[12])?$' or key=any(seen) or length(trim(coalesce(l->>'sourceRef','')))<3 then raise exception 'Use unique 2026-MM or 2026-MM-1/2 basic-earnings periods and source references.';end if;
 if exists(select 1 from unnest(seen) v where left(v,7)=left(key,7) and (length(v)=7 or length(key)=7)) then raise exception 'Do not combine monthly and cutoff totals for the same month.';end if;
 if left(key,7)>left(p->>'dateTo',7) then raise exception 'Basic earnings cannot extend beyond the reviewed period.';end if;
 seen:=array_append(seen,key);basic:=basic+private.payroll_net_money(l,'amount');
 end loop;
 bonus:=round(basic/12,2);s:=private.payroll_net_money(p,'bonusSettled');
 if s>bonus then raise exception 'Prior 13th-month payments exceed entitlement; use a separately reviewed correction.';end if;
 due:=bonus-s;used:=private.payroll_net_money(p,'benefitsUsed');
 if used<least(s,90000) then raise exception 'Benefit exemption usage must include earlier 13th-month payments; reconcile the annual limit.';end if;
 t:=greatest(0,due-greatest(0,90000-used));gross:=gross+due;taxable:=taxable+t;
 lines:=lines||jsonb_build_array(jsonb_build_object('label','13th-month balance','kind','earning','sourceKey','13th:'||left(p->>'dateTo',4),'amount',bonus,'settled',s,'remaining',due,'taxable',t,'sourceRef',p->>'eligibilityRef','taxRef',p->>'taxRef'));
 end if;
 -- Taxable adjustment is limited to reviewed employee mandatory contributions.
 a:=private.payroll_net_money(p,'taxableContributionAdjustment',true);
 if a<least(0,mandatory) or a>greatest(0,mandatory) or (a<>0 and length(trim(coalesce(p->>'contributionRef','')))<3) then raise exception 'Reconcile the taxable contribution adjustment to employee mandatory deductions and its source.';end if;
 taxable:=taxable-a;
 if k='final' and method<>'annual' then raise exception 'Final pay requires annualized withholding.';end if;
 if method='annual' then
 if k<>'final' and substring(p->>'payDate',6,2)<>'12' then raise exception 'Year-end annualization requires December; separation uses the final-pay case.';end if;
 prior:=private.payroll_net_money(p,'priorTaxable');prev:=private.payroll_net_money(p,'previousEmployerTaxable');
 withheld:=private.payroll_net_money(p,'priorWithheld')+private.payroll_net_money(p,'previousEmployerWithheld');
 if prior+prev+taxable<0 then raise exception 'Annual taxable income cannot be negative.';end if;
 tax:=private.payroll_annual_tax_2023(prior+prev+taxable)-withheld;
 elsif method='reviewed_adjustment' and k in('correction','supplement','thirteenth') then
 tax:=private.payroll_net_money(p,'reviewedTax',true);
 else raise exception 'Choose annualization or a source-backed Finance withholding calculation; unsupported tax cases cannot proceed.';end if;
 ded:=ded+tax;
 return jsonb_build_object('gross',gross,'deductions',ded,'net',gross-ded,'employer',employer,'tax',tax,'taxableChange',taxable,'annualBasic',basic,'thirteenthEntitlement',bonus,'lines',lines,'taxMethod',method,'priorTaxable',prior,'previousEmployerTaxable',prev,'priorWithheld',withheld,'reviewOnly',true,'negativeBalance',gross-ded<0,'paid',false);
end $$;

create function private.payroll_special_snapshot(p_employee uuid,p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare h public.hris_users;scope uuid:=private.payroll_employee_bu_scope(p_employee);n public.payroll_net_runs;net_source jsonb;doc jsonb;
begin
 if not private.payroll_gross_permission(scope,'view') or not private.payroll_package_permission(p_employee,scope,'view') then raise exception 'Existing salary access and scoped payroll duty required.' using errcode='42501';end if;
 select * into h from public.hris_users where id=p_employee;
 if (p->>'dateFrom')::date is null or (p->>'dateTo')::date is null or (p->>'payDate')::date is null
 or (p->>'dateFrom')::date>(p->>'dateTo')::date or (p->>'payDate')::date<(p->>'dateTo')::date
 or extract(year from (p->>'dateFrom')::date)<>2026 or extract(year from (p->>'payDate')::date)<>2026 then raise exception 'This reviewed rule set covers 2026 only; check period and payday.';end if;
 if p->>'kind'='final' and (h.end_date is null or h.end_date<>(p->>'dateTo')::date or length(trim(coalesce(p->>'offboardingRef','')))<3 or length(trim(coalesce(p->>'leaveRef','')))<3 or length(trim(coalesce(p->>'accountabilityRef','')))<3) then raise exception 'Final pay must match the HRIS end date and reference reviewed offboarding, leave and accountabilities (including confirmed none).';end if;
 if nullif(p->>'sourceNetId','') is not null then
 select * into n from public.payroll_net_runs where id=(p->>'sourceNetId')::uuid;
 if n.id is null or n.scope_id<>scope or not exists(select 1 from jsonb_array_elements(n.result->'employees') e where e->>'employeeId'=p_employee::text) then raise exception 'Source payroll is outside this employee and business unit.' using errcode='42501';end if;
 -- Original results may be stale: corrections intentionally preserve their original hash.
 net_source:=jsonb_build_object('id',n.id,'hash',n.source_hash,'employee',(select e from jsonb_array_elements(n.result->'employees') e where e->>'employeeId'=p_employee::text));
 end if;
 if nullif(p->>'documentId','') is not null then
 select jsonb_build_object('id',id,'version',version_number,'updatedAt',updated_at,'status',status,'archivedAt',archived_at) into doc from public.user_documents where id=(p->>'documentId')::uuid and user_id=p_employee;
 if doc is null then raise exception 'Choose this employee’s existing supporting document.';end if;
 end if;
 return jsonb_build_object('inputs',p,'employee',jsonb_build_object('id',h.id,'name',h.full_name,'scope',scope,'endDate',h.end_date,'status',h.employment_status,'hired',h.date_hired),'salaryHash',private.payroll_source_hash(p_employee),'sourceNet',net_source,'document',doc,
 'loans',(select coalesce(jsonb_agg(to_jsonb(l) order by l.account_ref),'[]') from (select distinct on(account_ref) id,account_ref,as_of,balance,revision from public.payroll_loan_ledger where employee_id=p_employee order by account_ref,revision desc) l),
 'checklists',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'updatedAt',updated_at) order by id),'[]') from public.onboarding_checklists where employee_id=p_employee));
end $$;

create function public.get_payroll_special_context(p_employee_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare scope uuid;h public.hris_users;
begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS login required.' using errcode='42501';end if;
 if p_employee_id is null then
 return jsonb_build_object('employees',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name,'endDate',u.end_date,'businessUnit',u.business_unit) order by u.full_name),'[]') from public.hris_users u where private.payroll_gross_permission(private.payroll_employee_bu_scope(u.id),'view') and private.payroll_package_permission(u.id,private.payroll_employee_bu_scope(u.id),'view')));
 end if;
 scope:=private.payroll_employee_bu_scope(p_employee_id);
 if not private.payroll_gross_permission(scope,'view') or not private.payroll_package_permission(p_employee_id,scope,'view') then raise exception 'Employee outside authorized salary scope.' using errcode='42501';end if;
 select * into h from public.hris_users where id=p_employee_id;
 return jsonb_build_object('canPrepare',private.payroll_gross_permission(scope,'prepare') and p_employee_id<>private.payroll_actor_id(),
 'canCalculate',public.check_payroll_operation('prepare_pr',scope,'calculate'),'canReview',private.payroll_net_can_review(scope) and p_employee_id<>private.payroll_actor_id(),
 'endDate',h.end_date,'runs',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'key',case_key,'version',version,'dateTo',date_to) order by created_at desc),'[]') from public.payroll_special_runs where employee_id=p_employee_id),
 'netRuns',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'from',date_from,'to',date_to,'version',version) order by created_at desc),'[]') from public.payroll_net_runs where scope_id=scope and exists(select 1 from jsonb_array_elements(result->'employees') e where e->>'employeeId'=p_employee_id::text)),
 'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',coalesce(title,file_name),'status',status) order by created_at desc),'[]') from public.user_documents where user_id=p_employee_id and archived_at is null));
end $$;

create function public.prepare_payroll_special(p_employee_id uuid,p_inputs jsonb,p_reason text,p_expected_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare scope uuid:=private.payroll_employee_bu_scope(p_employee_id);snap jsonb;calc jsonb;hash text;key text;old public.payroll_special_runs;found_id uuid;
begin
 if not private.payroll_gross_permission(scope,'prepare') or not private.payroll_package_permission(p_employee_id,scope,'view') or p_employee_id=private.payroll_actor_id()
 or not public.check_payroll_operation('prepare_pr',scope,'calculate') then raise exception 'Scoped preparer with existing salary access and BU/parent shadow mode required; own special pay must be prepared by someone else.' using errcode='42501';end if;
 if length(trim(coalesce(p_inputs->>'caseRef','')))<3 then raise exception 'A stable correction/entitlement case reference is required.';end if;
 if octet_length(p_inputs::text)>200000 then raise exception 'Review file is too large.';end if;
 key:=case when p_inputs->>'kind' in('thirteenth','final') then (p_inputs->>'kind')||':'||left(p_inputs->>'dateTo',4) else (p_inputs->>'kind')||':'||lower(trim(p_inputs->>'caseRef')) end;
 perform pg_advisory_xact_lock(hashtextextended('payroll-special:'||p_employee_id::text,0));
 snap:=private.payroll_special_snapshot(p_employee_id,p_inputs);calc:=private.calculate_payroll_special_v1(p_inputs);hash:=md5(snap::text);
 select * into old from public.payroll_special_runs where employee_id=p_employee_id and case_key=key order by version desc limit 1;
 if old.source_hash=hash then return old.id;end if;
 if old.id is distinct from p_expected_id then raise exception 'This case changed or already exists. Open the latest version before revising.';end if;
 if p_inputs->>'kind' in('thirteenth','final') and (calc->>'thirteenthEntitlement')::numeric>private.payroll_net_money(p_inputs,'bonusSettled') and exists(
 select 1 from (select distinct on(case_key) * from public.payroll_special_runs where employee_id=p_employee_id and kind in('thirteenth','final') and case_key<>key and extract(year from date_to)=2026 order by case_key,version desc) r
 where (r.result->>'thirteenthEntitlement')::numeric>private.payroll_net_money(r.inputs,'bonusSettled')) then raise exception 'Another case already reserves an unpaid 13th-month balance. Reconcile its actual settlement before preparing a second entitlement.';end if;
 -- A source item belongs to one correction/supplement case. Revisions use the same case key.
 if exists(select 1 from public.payroll_special_runs r cross join lateral jsonb_array_elements(r.inputs->'lines') a
 join jsonb_array_elements(p_inputs->'lines') b on lower(trim(a->>'sourceKey'))=lower(trim(b->>'sourceKey'))
 where r.employee_id=p_employee_id and r.case_key<>key and a->>'sourceKey' is not null) then raise exception 'A source item is already reserved in another special-pay case. Reconcile that case before reusing it.';end if;
 insert into public.payroll_special_runs(scope_id,employee_id,kind,case_key,version,previous_id,source_net_id,date_from,date_to,pay_date,inputs,source_snapshot,source_hash,result,gross_amount,deduction_amount,net_amount,reason,created_by)
 values(scope,p_employee_id,p_inputs->>'kind',key,coalesce(old.version,0)+1,old.id,nullif(p_inputs->>'sourceNetId','')::uuid,(p_inputs->>'dateFrom')::date,(p_inputs->>'dateTo')::date,(p_inputs->>'payDate')::date,p_inputs,snap,hash,calc,(calc->>'gross')::numeric,(calc->>'deductions')::numeric,(calc->>'net')::numeric,p_reason,private.payroll_actor_id()) returning id into found_id;
 return found_id;
end $$;

create function public.get_payroll_special_run(p_run_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.payroll_special_runs;snap jsonb;fresh boolean:=false;why text;v public.payroll_special_reviews;
begin
 select * into r from public.payroll_special_runs where id=p_run_id;
 if r.id is null or not private.payroll_gross_permission(r.scope_id,'view') or not private.payroll_package_permission(r.employee_id,r.scope_id,'view') then raise exception 'Special-pay record outside authorized salary scope.' using errcode='42501';end if;
 begin snap:=private.payroll_special_snapshot(r.employee_id,r.inputs);fresh:=md5(snap::text)=r.source_hash and not exists(select 1 from public.payroll_special_runs where employee_id=r.employee_id and case_key=r.case_key and version>r.version);
 exception when raise_exception then why:=sqlerrm;end;
 select * into v from public.payroll_special_reviews where run_id=r.id;
 return to_jsonb(r)-'source_snapshot'||jsonb_build_object('current',fresh,'staleReason',why,'review',case when v.id is null then null else jsonb_build_object('reference',v.source_ref,'at',v.reviewed_at,'by',v.reviewed_by) end);
end $$;
create function public.review_payroll_special(p_run_id uuid,p_source_ref text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.payroll_special_runs;actor uuid:=private.payroll_actor_id();v uuid;
begin
 select * into r from public.payroll_special_runs where id=p_run_id;
 if r.id is null or not private.payroll_net_can_review(r.scope_id) or not private.payroll_package_permission(r.employee_id,r.scope_id,'view') or actor in(r.created_by,r.employee_id) then raise exception 'Independent scoped Finance reviewer required; neither the preparer nor the payee may review this version.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-special:'||r.employee_id::text,0));
 if (public.get_payroll_special_run(r.id)->>'current') is distinct from 'true' then raise exception 'Inputs changed. Prepare and review the latest version.';end if;
 if r.net_amount<0 then raise exception 'Negative balance requires a documented recovery/correction process; it cannot be cleared for payroll.';end if;
 insert into public.payroll_special_reviews(run_id,source_hash,source_ref,reviewed_by) values(r.id,r.source_hash,p_source_ref,actor) on conflict(run_id) do nothing returning id into v;
 return coalesce(v,(select id from public.payroll_special_reviews where run_id=r.id));
end $$;
revoke all on function private.payroll_annual_tax_2023(numeric),private.calculate_payroll_special_v1(jsonb),private.payroll_special_snapshot(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.get_payroll_special_context(uuid),public.prepare_payroll_special(uuid,jsonb,text,uuid),public.get_payroll_special_run(uuid),public.review_payroll_special(uuid,text) from public,anon,authenticated;
grant execute on function public.get_payroll_special_context(uuid),public.prepare_payroll_special(uuid,jsonb,text,uuid),public.get_payroll_special_run(uuid),public.review_payroll_special(uuid,text) to authenticated;
notify pgrst,'reload schema';
