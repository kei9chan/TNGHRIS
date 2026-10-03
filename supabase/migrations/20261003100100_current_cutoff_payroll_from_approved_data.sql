-- Use approved inputs for the selected cutoff; leave unknown history clearly marked.
create or replace function private.payroll_current_cutoff_inputs(g jsonb, packages jsonb, context jsonb, saved jsonb, prior jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare prepared jsonb;items jsonb:='[]';issues jsonb:='[]';notices jsonb:='[]';
 e jsonb;i jsonb;t jsonb;p jsonb;pe jsonb;old jsonb;monthly numeric;allowances numeric;variable_amount numeric;
 monthly_due jsonb;paid jsonb;k text;fields jsonb;target numeric;
begin
 prepared:=private.payroll_automatic_inputs(g,packages,context,saved,prior);
 for e in select value from jsonb_array_elements(g->'employees') loop
  select value into i from jsonb_array_elements(prepared#>'{inputs,employees}') where value->>'employeeId'=e->>'employeeId';
  select value into t from jsonb_array_elements(prepared->'packageTerms') where value->>'employeeId'=e->>'employeeId';
  select value into pe from jsonb_array_elements(coalesce(prior->'employees','[]')) where value->>'employeeId'=e->>'employeeId';
  select value into old from jsonb_array_elements(coalesce(saved->'employees','[]')) where value->>'employeeId'=e->>'employeeId';
  select value into p from jsonb_array_elements(packages) where value->>'id'=t#>>'{packages,0,id}';
  fields:='[]';
  -- Monthly fixed salary comes from the approved package. Variable earnings come
  -- from this cutoff's actual attendance and approved overtime.
  if p is not null and p->>'rate_type'='Monthly' then
   select coalesce(sum((l->>'amount')::numeric),0) into variable_amount from jsonb_array_elements(e->'lines') l
    where l->>'label' not in ('Calendar-prorated semi-monthly basic','Regular base / approved paid leave / grace','Employee-total rounding reconciliation')
      and not (l ? 'component');
   select coalesce(sum((c->>'amount')::numeric),0) into allowances from jsonb_array_elements(coalesce(p->'components','[]')) c
    where c->>'recurrence'='recurring' and coalesce(c->>'sss','included')<>'excluded';
   i:=i||jsonb_build_object('sssBase',round(greatest(0,(p->>'base_amount')::numeric+allowances+variable_amount),2)::text);
  elsif p is not null and p->>'rate_type' in ('Daily','Hourly') then
   select coalesce(sum((l->>'amount')::numeric),0) into monthly from jsonb_array_elements(e->'lines') l
    where l->>'label'='Regular base / approved paid leave / grace';
   monthly:=round(greatest(monthly*2,(p->>'base_amount')::numeric),2);
   i:=i||jsonb_build_object('philhealthBase',monthly::text,'pagibigBase',monthly::text,
     'sssBase',round(greatest(0,(e->>'gross')::numeric*2),2)::text);
   notices:=notices||jsonb_build_array(jsonb_build_object('employeeId',e->>'employeeId','employeeName',e->>'employeeName',
      'code','variable_month_basis','message','Monthly bases were projected from the approved daily/hourly package and this cutoff’s actual pay. Review monthly actuals before remittance.'));
  end if;
  if t->>'payBasis' in ('net_tax','net_all') then
   if t->>'cutoffTarget' is null or p#>>'{treatment,arrangementRef}' is null then
    fields:=fields||jsonb_build_array(jsonb_build_object('code','gross_up','message','The approved net agreement has no unambiguous cutoff target or agreement reference.'));
   else
    i:=i||jsonb_build_object('netTarget',t->>'cutoffTarget','grossUpBasisRef',p#>>'{treatment,arrangementRef}','grossUpConfirmed',true);
   end if;
  end if;
  if pe is null and nullif(old->>'openingRef','') is null then
   i:=i||jsonb_build_object('openingTaxable','0','openingWithheld','0','openingPeriods','0',
      'previousEmployer',false,'cumulativeAlready',false,'openingRef','Prior payroll settled outside HRIS; current-cutoff withholding only',
      'historyScope','current_cutoff_only');
   notices:=notices||jsonb_build_array(jsonb_build_object('employeeId',e->>'employeeId','employeeName',e->>'employeeName',
      'code','tax_history','message','Withholding is calculated for this cutoff. Earlier payroll was settled outside HRIS; reconcile annual tax separately.'));
  end if;
  if context->>'cutoff'='2' and pe is null then
   if nullif(context->>'previousRunId','') is null and
      nullif(i->>'sssBase','') is not null and nullif(i->>'philhealthBase','') is not null
      and nullif(i->>'pagibigBase','') is not null then
    monthly_due:=private.payroll_contributions_2026(i);paid:=coalesce(i->'openingContributions','{}'::jsonb);
    for k in select jsonb_object_keys(monthly_due) loop
     if nullif(paid->>k,'') is null then
      paid:=paid||jsonb_build_object(k,round((monthly_due->>k)::numeric *
       (context#>>array['allocation',case when k like 'sss%' or k like 'mpf%' or k='ecER' then 'sss' when k like 'philhealth%' then 'philhealth' else 'pagibig' end])::numeric,2)::text);
     end if;
    end loop;
    i:=i||jsonb_build_object('openingContributions',paid,'priorContributionSource','inferred_settled_first_cutoff');
    notices:=notices||jsonb_build_array(jsonb_build_object('employeeId',e->>'employeeId','employeeName',e->>'employeeName',
      'code','prior_contributions','message','Earlier cutoff treated as settled at the configured 50% allocation. Reconcile the assumed amount before government remittance.'));
   end if;
  end if;
  for k in select x->>'code' from jsonb_array_elements(coalesce((select q->'items' from jsonb_array_elements(prepared->'issues') q where q->>'employeeId'=e->>'employeeId'),'[]')) x loop
   if k not in ('prior_payroll','prior_contributions','sssBase','philhealthBase','pagibigBase','gross_up') then
    fields:=fields||(select jsonb_agg(x) from jsonb_array_elements((select q->'items' from jsonb_array_elements(prepared->'issues') q where q->>'employeeId'=e->>'employeeId')) x where x->>'code'=k);
   end if;
  end loop;
  foreach k in array array['sssBase','philhealthBase','pagibigBase'] loop
   if nullif(i->>k,'') is null then fields:=fields||jsonb_build_array(jsonb_build_object('code',k,'message','Approved package and current cutoff contain no usable contribution basis.'));end if;
  end loop;
  if jsonb_array_length(fields)>0 then issues:=issues||jsonb_build_array(jsonb_build_object('employeeId',e->>'employeeId','employeeName',e->>'employeeName','items',fields));end if;
  items:=items||jsonb_build_array(i);
 end loop;
 return prepared||jsonb_build_object('inputs',jsonb_set(prepared->'inputs','{employees}',items),
   'issues',issues,'notices',notices,'ready',jsonb_array_length(issues)=0);
end $$;

-- A live HR Manager task, scoped to employees in the latest calculated payroll.
-- Official identifiers remain blank until the employee profile is corrected.
create or replace function public.get_payroll_missing_government_ids()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.hris_users;outp jsonb;
begin
 select * into actor from public.hris_users where id=public.current_hris_user_id();
 if actor.role not in ('HR Manager','Admin') then raise exception 'HR Manager access required.' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('employeeId',h.id,'employeeName',h.full_name,'missing',
  array_remove(array[case when nullif(trim(h.tin),'') is null then 'TIN' end,
    case when nullif(trim(h.sss_no),'') is null then 'SSS' end,
    case when nullif(trim(h.philhealth_no),'') is null then 'PhilHealth' end,
    case when nullif(trim(h.pagibig_no),'') is null then 'Pag-IBIG' end],null)) order by h.full_name),'[]') into outp
 from public.hris_users h where exists (
  select 1 from public.payroll_gross_runs g cross join lateral jsonb_array_elements(g.result->'employees') e
  where e->>'employeeId'=h.id::text
    and g.id=(select g2.id from public.payroll_gross_runs g2 where g2.scope_id=g.scope_id order by g2.created_at desc limit 1)
 ) and (nullif(trim(h.tin),'') is null or nullif(trim(h.sss_no),'') is null
   or nullif(trim(h.philhealth_no),'') is null or nullif(trim(h.pagibig_no),'') is null);
 return outp;
end $$;
revoke all on function public.get_payroll_missing_government_ids() from public,anon;
grant execute on function public.get_payroll_missing_government_ids() to authenticated;
revoke all on function private.payroll_current_cutoff_inputs(jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
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

create or replace function public.get_automatic_payroll_inputs(p_gross_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.payroll_gross_runs;v public.payroll_net_reviews;ctx jsonb;prior jsonb;prepared jsonb;rows jsonb:='[]';i jsonb;d jsonb;queue jsonb;issues jsonb;notices jsonb;h public.hris_users;missing text[];
begin
 select * into g from public.payroll_gross_runs where id=p_gross_id;
 if g.id is null or not private.payroll_net_can_review(g.scope_id) or not private.payroll_gross_permission(g.scope_id,'view') then raise exception 'Scoped payroll calculation access required.' using errcode='42501';end if;
 if not (public.get_payroll_gross_run(g.id)->>'current')::boolean then raise exception 'Source records changed. Recalculate payroll.' using errcode='40001';end if;
 ctx:=private.payroll_net_context(g.id);
 select * into v from public.payroll_net_reviews where gross_run_id=g.id order by revision desc limit 1;
 select result into prior from public.payroll_net_runs where id=nullif(ctx->>'previousRunId','')::uuid;
 prepared:=private.payroll_current_cutoff_inputs(g.result,g.source_snapshot->'packages',ctx,v.inputs,prior);
 queue:=public.get_payroll_nte_deduction_queue(g.id,(ctx->>'payDate')::date);issues:=prepared->'issues';notices:=prepared->'notices';
 for i in select value from jsonb_array_elements(prepared#>'{inputs,employees}') loop
  for d in select value from jsonb_array_elements(queue) where value->>'employeeId'=i->>'employeeId' and value->>'scheduleStatus'='Scheduled' and (value->>'scheduledThisPayroll')::numeric>0 loop
   if d->>'workflowStatus'='Approved for Payroll' and (d->>'scheduledThisPayroll')::numeric<=(d->>'currentBalance')::numeric then
    i:=jsonb_set(i,'{deductions}',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(i->'deductions') x where x->>'sourceRef'<>'ATD:'||(d->>'resolutionId'))||jsonb_build_array(jsonb_build_object('label','NTE deduction · '||(d->>'nteNumber'),'sourceRef','ATD:'||(d->>'resolutionId'),'amount',d->>'scheduledThisPayroll','kind','voluntary','carryForward',false)));
   else
    issues:=issues||jsonb_build_array(jsonb_build_object('employeeId',i->>'employeeId','employeeName',d->>'employeeName','items',jsonb_build_array(jsonb_build_object('code','nte','message','Scheduled NTE deduction lacks final authority or exceeds its remaining balance. Review the existing NTE record.'))));
   end if;
  end loop;
  select * into h from public.hris_users where id=(i->>'employeeId')::uuid;
  missing:=array_remove(array[case when nullif(trim(h.tin),'') is null then 'TIN' end,case when i->>'sssCovered'='true' and nullif(trim(h.sss_no),'') is null then 'SSS' end,case when i->>'philhealthCovered'='true' and nullif(trim(h.philhealth_no),'') is null then 'PhilHealth' end,case when i->>'pagibigCovered'='true' and nullif(trim(h.pagibig_no),'') is null then 'Pag-IBIG' end],null);
  if cardinality(missing)>0 then notices:=notices||jsonb_build_array(jsonb_build_object('employeeId',i->>'employeeId','employeeName',h.full_name,'code','employee_ids','message','Missing government IDs: '||array_to_string(missing,', ')||'. HR Manager: update the profile before remittance. Draft calculation can proceed.'));end if;
  rows:=rows||jsonb_build_array(i);
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('employeeId',z.employee_id,'employeeName',z.employee_name,'items',z.items) order by z.employee_name),'[]') into issues from (select x->>'employeeId' employee_id,max(x->>'employeeName') employee_name,jsonb_agg(distinct item) items from jsonb_array_elements(issues) x cross join lateral jsonb_array_elements(x->'items') item group by x->>'employeeId') z;
 prepared:=jsonb_set(prepared,'{inputs,employees}',rows)||jsonb_build_object('issues',issues,'notices',notices,'ready',jsonb_array_length(issues)=0);
 return prepared;
end $$;
