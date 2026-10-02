-- Salary arrangements come from the exact approved packages used by this gross version.
-- Company instruction: half of each monthly contribution on each cutoff; existing second-cutoff reconciliation is retained.
create or replace function private.payroll_net_package_terms(result jsonb, packages jsonb)
returns jsonb language plpgsql immutable set search_path='' as $fn$
declare e jsonb;used jsonb;modes text[];outp jsonb:='[]';refs text;issue text;
begin
 for e in select value from jsonb_array_elements(result->'employees') loop
  select coalesce(jsonb_agg(p order by p->>'effective_from'),'[]'),
   array_agg(distinct coalesce(p#>>'{treatment,payBasis}','gross')),
   string_agg(distinct coalesce(nullif(p#>>'{treatment,arrangementRef}',''),p->>'source_ref'),' / ')
  into used,modes,refs from jsonb_array_elements(packages) p
  where exists(select 1 from jsonb_array_elements(e->'lines') l where l->>'packageId'=p->>'id');
  issue:=case when cardinality(modes)>1 then 'Approved packages change the gross/net arrangement during this cutoff. Correct the package effective dates or arrange a reviewed split calculation; Finance cannot replace the approved terms.'
    when coalesce(cardinality(modes),0)=0 then 'No approved package is linked to these earnings.'
    when modes[1] not in ('gross','net_tax','net_all') then 'The approved package contains custom terms requiring review.' else null end;
  outp:=outp||jsonb_build_array(jsonb_build_object('employeeId',e->>'employeeId','employeeName',e->>'employeeName',
   'payBasis',case when cardinality(modes)=1 then modes[1] else 'mixed' end,'arrangementRef',refs,'issue',issue,
   'packages',(select coalesce(jsonb_agg(jsonb_build_object('id',p->>'id','effectiveFrom',p->>'effective_from','rateType',p->>'rate_type','baseAmount',p->>'base_amount','payBasis',coalesce(p#>>'{treatment,payBasis}','gross'),'netTarget',p#>>'{treatment,netTarget}','sourceRef',p->>'source_ref')),'[]') from jsonb_array_elements(used) p),
   'taxLines',(select coalesce(jsonb_agg(jsonb_build_object('treatment',case when l ? 'component' then l#>>'{component,tax}' else p#>>'{treatment,tax}' end,'sourceRef',coalesce(l#>>'{component,documentRef}',p#>>'{treatment,taxBasisRef}'), 'isOvertime',l->>'kind'='ot') order by n),'[]')
    from jsonb_array_elements(e->'lines') with ordinality lines(l,n) left join lateral (select value p from jsonb_array_elements(packages) where value->>'id'=l->>'packageId' limit 1) pkg on true)));
 end loop;
 return outp;
end $fn$;
revoke all on function private.payroll_net_package_terms(jsonb,jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_payroll_net_workspace(p_gross_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g public.payroll_gross_runs;gross_view jsonb;v public.payroll_net_reviews;
begin
 gross_view:=public.get_payroll_gross_run(p_gross_id);select * into g from public.payroll_gross_runs where id=p_gross_id;
 select * into v from public.payroll_net_reviews where gross_run_id=g.id order by revision desc limit 1;
 return jsonb_build_object('packageTerms',private.payroll_net_package_terms(g.result,g.source_snapshot->'packages'),'gross',gross_view,'canReview',private.payroll_net_can_review(g.scope_id),'review',case when v.id is null then null else jsonb_build_object('id',v.id,'inputs',v.inputs-'statutoryFingerprint','sourceRef',v.source_ref,'approvedAt',v.approved_at) end,
 'loans',(select coalesce(jsonb_agg(to_jsonb(l) order by l.employee_id,l.account_ref,l.revision desc),'[]') from public.payroll_loan_ledger l where exists(select 1 from jsonb_array_elements(g.result->'employees') e where e->>'employeeId'=l.employee_id::text) and private.payroll_gross_permission(l.scope_id,'view')),
 'runs',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'version',r.version,'grossId',r.gross_run_id,'from',r.date_from,'to',r.date_to,'payDate',r.source_snapshot#>>'{review,payDate}') order by r.date_from desc,r.version desc),'[]') from public.payroll_net_runs r where r.scope_id=g.scope_id));
end $function$
;
CREATE OR REPLACE FUNCTION public.save_payroll_net_review(p_gross_id uuid, p_inputs jsonb, p_source_ref text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g public.payroll_gross_runs;new_id uuid;fingerprint jsonb;payload jsonb;prior_inputs jsonb;terms jsonb;item jsonb;term jsonb;canonical jsonb:='[]';
begin
 select * into g from public.payroll_gross_runs where id=p_gross_id;
 if g.id is null or not private.payroll_net_can_review(g.scope_id) then raise exception 'Scoped Finance authorization required.' using errcode='42501';end if;
 terms:=private.payroll_net_package_terms(g.result,g.source_snapshot->'packages');
 for item in select value from jsonb_array_elements(p_inputs->'employees') loop
  select value into term from jsonb_array_elements(terms) where value->>'employeeId'=item->>'employeeId';
  if nullif(term->>'issue','') is not null then raise exception '%: %',term->>'employeeName',term->>'issue';end if;
  canonical:=canonical||jsonb_build_array(item||jsonb_build_object('payBasis',term->>'payBasis','arrangementRef',term->>'arrangementRef'));
 end loop;
 p_inputs:=p_inputs||jsonb_build_object('employees',canonical,'allocation',jsonb_build_object('sss','0.5','philhealth','0.5','pagibig','0.5'));
 perform pg_advisory_xact_lock(hashtextextended('payroll-net:'||g.scope_id::text,0));
 select inputs into prior_inputs from public.payroll_net_reviews where gross_run_id=g.id order by revision desc limit 1;
 p_inputs:=private.payroll_net_review_for_actor(p_inputs,prior_inputs,public.current_hris_user_id()::text);
 perform private.payroll_net_review_validate(p_gross_id,p_inputs);
 select jsonb_agg(jsonb_build_object('employeeId',h.id,'fingerprint',md5(jsonb_build_array(h.sss_no,h.philhealth_no,h.pagibig_no,h.tin)::text)) order by e.ordinality)
 into fingerprint from jsonb_array_elements(g.result->'employees') with ordinality e(value,ordinality) join public.hris_users h on h.id=(e.value->>'employeeId')::uuid;
 payload:=(p_inputs-'statutoryFingerprint')||jsonb_build_object('statutoryFingerprint',fingerprint);
 select id into new_id from public.payroll_net_reviews where gross_run_id=g.id and inputs=payload and source_ref=p_source_ref order by revision desc limit 1;
 if new_id is not null and new_id=(select id from public.payroll_net_reviews where gross_run_id=g.id order by revision desc limit 1) then return new_id;end if;
 insert into public.payroll_net_reviews(gross_run_id,scope_id,inputs,source_ref,approved_by) values(g.id,g.scope_id,payload,p_source_ref,public.current_hris_user_id()) returning id into new_id;
 return new_id;
end $function$
;
CREATE OR REPLACE FUNCTION private.payroll_net_review_validate(p_gross_id uuid, p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.payroll_gross_runs;e jsonb;i jsonb;l jsonb;a jsonb;pkg jsonb;k text;treatment text;n int;pay_date date;
begin
 select * into r from public.payroll_gross_runs where id=p_gross_id;
 if r.id is null or not private.payroll_net_can_review(r.scope_id) then raise exception 'Scoped Finance authorization and existing compensation access required.' using errcode='42501';end if;
 if not (public.get_payroll_gross_run(r.id)->>'current')::boolean then raise exception 'Gross inputs changed. Prepare the current gross version first.';end if;
 if jsonb_typeof(p->'employees') is distinct from 'array' or jsonb_array_length(p->'employees') not between greatest(0,jsonb_array_length(r.result->'employees')-1) and jsonb_array_length(r.result->'employees') then raise exception 'Review every employee in this gross run exactly once.';end if;
 if exists(select 1 from jsonb_array_elements(p->'employees') x group by x->>'employeeId' having count(*)>1) then raise exception 'Duplicate employee review.';end if;
 if exists(select 1 from jsonb_array_elements(p->'employees') x where not exists(select 1 from jsonb_array_elements(r.result->'employees') y where y->>'employeeId'=x->>'employeeId')) then raise exception 'Unknown employee in Finance review.';end if;
 if p->>'ruleset' is distinct from 'PH-2026-09-06' or p->>'cutoff' is null or p->>'cutoff' not in('1','2') or p->>'insufficientNet' is null or p->>'insufficientNet' not in('block','defer_authorized') then raise exception 'Confirm reviewed rules, cutoff and insufficient-net policy.';end if;
 pay_date:=(p->>'payDate')::date;
 if pay_date is null or pay_date not between date '2026-01-06' and date '2026-12-31' or (p->>'contributionMonth')::date is distinct from date_trunc('month',pay_date)::date then raise exception 'Enter a reviewed 2026 payday and its contribution month.';end if;
 if pay_date<r.date_to or pay_date>r.date_to+45 then raise exception 'Payday must follow the cutoff within 45 days; reconcile a different payroll calendar.';end if;
 if length(trim(coalesce(p->>'policyRef','')))<3 then raise exception 'Approved contribution allocation, payday and insufficient-net policy reference required.';end if;
 for k in select unnest(array['sss','philhealth','pagibig']) loop
 if private.payroll_net_money(p->'allocation',k) not in(0,.5,1) then raise exception 'First-cutoff allocation must be 0, 0.5 or 1.';end if;end loop;
 for e in select value from jsonb_array_elements(r.result->'employees') loop
 select value into i from jsonb_array_elements(p->'employees') where value->>'employeeId'=e->>'employeeId';
 if i is null then if (e->>'employeeId')::uuid=public.current_hris_user_id() then continue;else raise exception 'Missing Finance review for %.',e->>'employeeName';end if;end if;
 if (e->>'employeeId')::uuid=public.current_hris_user_id() and (p#>>array['employeeApprovals',e->>'employeeId'] is null or p#>>array['employeeApprovals',e->>'employeeId']=public.current_hris_user_id()::text) then raise exception 'Another authorized Finance reviewer must review your own pay.' using errcode='42501';end if;
 if not private.payroll_package_permission((e->>'employeeId')::uuid,r.scope_id,'view') then raise exception 'Employee outside existing salary scope.' using errcode='42501';end if;
 perform private.validate_payroll_net_arrangement(e,i,r.source_snapshot->'packages');
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
 -- Finance may classify an unspecified tax treatment here; explicit approved inclusion/exclusion remains binding.
 if treatment='included' and (a->>'taxable')::numeric<>(l->>'amount')::numeric then raise exception 'Taxable line conflicts with approved pay-package treatment.';end if;
 if treatment='excluded' and (a->>'taxable')::numeric<>0 then raise exception 'Exempt line conflicts with approved pay-package treatment.';end if;
 end loop;
 if jsonb_typeof(i->'deductions') is distinct from 'array' or jsonb_array_length(i->'deductions')>30 then raise exception 'Review authorized deductions (an explicit empty list means none).';end if;
 end loop;
end $function$
;
