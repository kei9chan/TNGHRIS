
-- Net guarantees use documented cutoff targets before loans/other deductions.
-- Final monthly statutory bases are reviewed explicitly, including gross-up treatment.
create or replace function private.validate_payroll_net_arrangement(e jsonb, i jsonb, packages jsonb)
returns void language plpgsql immutable set search_path='' as $fn$
declare modes text[];basis text:=coalesce(nullif(i->>'payBasis',''),'gross');k text;
begin
 select array_agg(distinct coalesce(x#>>'{treatment,payBasis}','gross')) into modes
 from jsonb_array_elements(coalesce(packages,'[]')) x
 where exists(select 1 from jsonb_array_elements(e->'lines') l where l->>'packageId'=x->>'id');
 if cardinality(modes)>1 then raise exception 'Different gross/net arrangements within one cutoff require a reviewed split calculation.';end if;
 if basis not in ('gross','net_tax','net_all') or coalesce(modes[1],'gross')<>basis then
 raise exception 'Finance salary arrangement must match the approved pay package. Custom or mixed arrangements require individual review.';end if;
 if basis<>'gross' then
 if exists(select 1 from jsonb_array_elements(packages) x where x->>'stream'<>'employee_payroll' and exists(select 1 from jsonb_array_elements(e->'lines') l where l->>'packageId'=x->>'id')) then
 raise exception 'Consultant net fees need the separate reviewed withholding calculation, not employee payroll.';end if;
 if coalesce(i->>'netTarget','') !~ '^[0-9]+([.][0-9]{1,2})?$' or (i->>'netTarget')::numeric<=0 or (i->>'netTarget')::numeric>999999999 then raise exception 'Enter the approved net target for this cutoff (positive PHP, maximum 2 decimals).';end if;
 for k in select unnest(array['arrangementRef','grossUpBasisRef']) loop
 if length(trim(coalesce(i->>k,'')))<3 then raise exception 'Net pay needs agreement/cutoff allocation and final statutory-base review references.';end if;end loop;
 if i->>'grossUpConfirmed' is distinct from 'true' then raise exception 'Confirm the final monthly contribution bases include the applicable treatment of company-funded gross-up. Unsupported FBT cases need separate review.';end if;
 end if;
end $fn$;
revoke all on function private.validate_payroll_net_arrangement(jsonb,jsonb,jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.validate_payroll_package()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

 if coalesce(new.treatment->>'payBasis','gross') not in ('gross','net_tax','net_all','custom_review') then raise exception 'Invalid gross/net salary arrangement.';end if;
 if coalesce(new.treatment->>'payBasis','gross')<>'gross' then
 if length(trim(coalesce(new.treatment->>'arrangementRef','')))<3 then raise exception 'Approved arrangement document required.';end if;
 if new.treatment->>'payBasis' in ('net_tax','net_all') and
 (coalesce(new.treatment->>'netTarget','') !~ '^[0-9]+([.][0-9]{1,2})?$' or (new.treatment->>'netTarget')::numeric<=0) then raise exception 'Positive agreed net amount required, maximum 2 decimals.';end if;
 end if;
 if new.treatment ? 'taxRequest' and new.treatment->>'taxRequest' not in ('Standard - Finance reviews','Exemption requested - evidence required','Custom - needs review') then raise exception 'Invalid tax request.';end if;
 if new.treatment->>'taxRequest' in ('Exemption requested - evidence required','Custom - needs review') and length(trim(coalesce(new.treatment->>'taxBasisRef','')))<3 then raise exception 'Tax exemption/custom treatment needs its legal and source basis.';end if;
 if new.status='approved' and new.stream='professional_fee' and coalesce(new.treatment->>'payBasis','gross')<>'gross' then raise exception 'Consultant net arrangements require the separate withholding review; do not approve as employee net payroll.';end if;
 if new.status='approved' and new.treatment->>'payBasis'='custom_review' then raise exception 'Resolve custom terms into a supported reviewed arrangement before approval.';end if;
 return new;
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
 if l->>'packageId' is not null and (treatment is null or treatment='unreviewed') then raise exception 'HR must review the pay-package tax treatment before Finance calculates net pay.';end if;
 if treatment='included' and (a->>'taxable')::numeric<>(l->>'amount')::numeric then raise exception 'Taxable line conflicts with approved pay-package treatment.';end if;
 if treatment='excluded' and (a->>'taxable')::numeric<>0 then raise exception 'Exempt line conflicts with approved pay-package treatment.';end if;
 end loop;
 if jsonb_typeof(i->'deductions') is distinct from 'array' or jsonb_array_length(i->'deductions')>30 then raise exception 'Review authorized deductions (an explicit empty list means none).';end if;
 end loop;
end $function$
;
CREATE OR REPLACE FUNCTION private.payroll_net_snapshot(p_gross_id uuid, p_depth integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 return jsonb_build_object('engineVersion','net-ph-2026-v1','grossId',g.id,'grossHash',g.source_hash,'gross',g.result,'reviewId',v.id,'review',v.inputs,'reviewRef',v.source_ref,'loans',loans,'statutoryFingerprint',ids,'prior',prior_info,'confirmedPolicy',(select to_jsonb(z) from public.payroll_confirmed_policy z)) || case when exists(select 1 from jsonb_array_elements(g.source_snapshot->'packages') pkg where coalesce(pkg#>>'{treatment,payBasis}','gross')<>'gross') then jsonb_build_object('engineVersion','net-ph-2026-v2','packages',g.source_snapshot->'packages') else '{}'::jsonb end;
end $function$
;
CREATE OR REPLACE FUNCTION private.calculate_payroll_net_v1(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare original_gross numeric;topup numeric;next_topup numeric;regular_before_topup numeric;net_basis text;target_net numeric;iteration int; protected numeric;voluntary_budget numeric;percent numeric;confirmed boolean:=coalesce((p#>>'{review,payDate}')::date >= (p#>>'{confirmedPolicy,effective_from}')::date,false);cfg jsonb:=p->'review';emp jsonb;inp jsonb;prior jsonb;line jsonb;alloc jsonb;monthly jsonb;paid jsonb;shares jsonb;loans jsonb;deductions jsonb;
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
 perform private.validate_payroll_net_arrangement(emp,inp,p->'packages');
 net_basis:=coalesce(nullif(inp->>'payBasis',''),'gross');topup:=0;original_gross:=(emp->>'gross')::numeric;
 if confirmed then
 for item in select x from jsonb_array_elements(coalesce(p#>'{prior,result,employees}','[]')) pe cross join lateral jsonb_array_elements(coalesce(pe->'otherDeductions','[]')) x where pe->>'employeeId'=emp->>'employeeId' and coalesce((x->>'carryForward')::boolean,false) and coalesce((x->>'deferred')::numeric,0)>0 loop
 if exists(select 1 from jsonb_array_elements(coalesce(inp->'deductions','[]')) x where x->>'sourceRef'=item->>'sourceRef') then raise exception 'Prior deferred deduction is carried automatically; remove duplicate source reference';end if;
 inp:=jsonb_set(inp,'{deductions}',coalesce(inp->'deductions','[]')||jsonb_build_array(item||jsonb_build_object('amount',item->>'deferred','carriedFrom',p#>>'{prior,id}')));
 end loop;end if;
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

 regular_before_topup:=taxable_regular;
 target_net:=case when net_basis='gross' then 0 else (inp->>'netTarget')::numeric end;
 for iteration in 1..100 loop
 taxable_regular:=regular_before_topup+topup;
  cumulative:=coalesce((prior#>>'{ytd,cumulative}')::boolean,false) or inp->>'cumulativeAlready'='true' or inp->>'previousEmployer'='true'
 or (taxable_supp>0 and taxable_regular<=10417) or (taxable_supp>0 and taxable_supp>=taxable_regular);
 if cumulative then tax:=round(greatest(0,private.payroll_withholding_2023((ytd+taxable_regular+taxable_supp)/(periods+1))*(periods+1)-withheld),2);
 else tax:=round(private.payroll_withholding_2023(taxable_regular,taxable_supp),2);end if;

 if net_basis='gross' then exit;end if;
 next_topup:=greatest(0,round(target_net+tax+case when net_basis='net_all' then mandatory else 0 end-original_gross,2));
 if next_topup=topup then exit;end if;
 if iteration=100 then raise exception 'Net gross-up did not converge; Finance must reconcile this employee.';end if;
 topup:=next_topup;
 end loop;
 gross:=original_gross+topup;
 taxdetail:=jsonb_build_object('regular',taxable_regular::text,'supplement',taxable_supp::text,'exempt',exempt_total::text,'method',case when cumulative then 'cumulative_average' else 'regular_bracket_plus_supplement' end,'priorTaxable',ytd::text,'priorWithheld',withheld::text,'priorPeriods',periods,'amount',tax::text);
 net:=gross-mandatory-tax;other:=0;loans:='[]';deductions:='[]';
 if net<0 then raise exception 'Statutory deductions exceed gross. Reconcile the employee before calculation.';end if;
 protected:=0;voluntary_budget:=net;
 if confirmed then
 percent:=coalesce(nullif(inp->>'voluntaryPercent','')::numeric,20);
 if percent<0 or percent>100 or (percent>20 and (length(trim(coalesce(inp->>'higherDeductionAuthorization','')))<3 or length(trim(coalesce(inp->>'higherDeductionLegalBasis','')))<3)) then raise exception 'Deductions over 20 percent require written employee authorization and reviewed legal basis';end if;
 protected:=net*(1-percent/100);
 -- Court/legal deductions precede voluntary collections and need an explicit legal reference.
 for item in select value from jsonb_array_elements(coalesce(inp->'deductions','[]')) where value->>'kind'='legal' loop
 amount:=private.payroll_net_money(item,'amount');
 if length(trim(coalesce(item->>'sourceRef','')))<3 then raise exception 'Legal deduction authority required';end if;
 take:=trunc(least(amount,net,voluntary_budget),2);net:=net-take;other:=other+take;voluntary_budget:=voluntary_budget-take;
 deductions:=deductions||jsonb_build_array(item||jsonb_build_object('amount',take::text,'requested',amount::text,'deferred',(amount-take)::text));end loop;
 voluntary_budget:=greatest(0,net-protected);
 end if;
 for loan in select value from jsonb_array_elements(coalesce(p->'loans','[]')) where value->>'employee_id'=emp->>'employeeId' order by value->>'account_ref' loop
 before:=(loan->>'available')::numeric;amount:=least((loan->>'installment')::numeric,before);
 if not confirmed and amount>net and cfg->>'insufficientNet'='block' then raise exception 'Insufficient net for authorized loan %. Approved deferral policy or reconciliation required.',loan->>'account_ref';end if;
 if length(trim(coalesce(loan->>'source_ref','')))<3 then raise exception 'Loan legal basis / written authorization required';end if;
 take:=trunc(least(amount,net,voluntary_budget),2);net:=net-take;other:=other+take;voluntary_budget:=voluntary_budget-take;
 loans:=loans||jsonb_build_array(jsonb_build_object('ledgerId',loan->>'id','account',loan->>'account_ref','balance',before::text,'installment',loan->>'installment','amount',take::text,'deferred',(amount-take)::text,'projectedBalance',(before-take)::text,'sourceRef',loan->>'source_ref'));
 end loop;
 for item in select value from jsonb_array_elements(coalesce(inp->'deductions','[]')) where not confirmed or coalesce(value->>'kind','voluntary')<>'legal' loop
 amount:=private.payroll_net_money(item,'amount');
 if length(trim(coalesce(item->>'sourceRef','')))<3 or length(trim(coalesce(item->>'label','')))<1 then raise exception 'Every additional deduction needs a name and employee authorization/source reference.';end if;
 if not confirmed and amount>net and cfg->>'insufficientNet'='block' then raise exception 'Insufficient net for %. Approved deferral policy or reconciliation required.',item->>'label';end if;
 take:=trunc(least(amount,net,voluntary_budget),2);net:=net-take;other:=other+take;voluntary_budget:=voluntary_budget-take;
 deductions:=deductions||jsonb_build_array(item||jsonb_build_object('amount',take::text,'requested',amount::text,'deferred',(amount-take)::text));
 end loop;
 outp:=outp||jsonb_build_array(jsonb_build_object('employeeId',emp->>'employeeId','employeeName',emp->>'employeeName','payBasis',net_basis,'sourceGross',original_gross::text,'companyTopUp',topup::text,'netTarget',target_net::text,'employerTotalCost',(gross+employer)::text,'grossUpBasisRef',inp->>'grossUpBasisRef','gross',gross::text,'mandatory',mandatory::text,'tax',tax::text,'other',other::text,'deductions',(mandatory+tax+other)::text,'net',net::text,'employer',employer::text,'contributions',sharelines,'monthlyPaid',shares,'taxExplanation',taxdetail,'loans',loans,'otherDeductions',deductions,'ytd',jsonb_build_object('taxable',(ytd+taxable_regular+taxable_supp)::text,'withheld',(withheld+tax)::text,'periods',periods+1,'cumulative',cumulative)));
 total_g:=total_g+gross;total_d:=total_d+mandatory+tax+other;total_n:=total_n+net;total_er:=total_er+employer;
 exception when others then issues:=issues||jsonb_build_array(jsonb_build_object('employeeId',emp->>'employeeId','employeeName',emp->>'employeeName','message',sqlerrm));end;
 end loop;
 return jsonb_build_object('engineVersion','net-ph-2026-v2','ready',jsonb_array_length(issues)=0,'issues',issues,'employees',outp,'gross',total_g::text,'deductions',total_d::text,'net',total_n::text,'employer',total_er::text,'employerTotalCost',(total_g+total_er)::text,'shadow',true);
end $function$
;

