-- Prepare existing approved inputs on the server. Unknown paid history is never invented.
create or replace function private.payroll_automatic_inputs(g jsonb, packages jsonb, context jsonb, saved jsonb, prior jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare e jsonb;i jsonb;p jsonb;l jsonb;t jsonb;old jsonb;pe jsonb;lines jsonb;emps jsonb:='[]';issues jsonb:='[]';fields jsonb;terms jsonb;monthly numeric;allowances numeric;tax text;ref text;k text;variable_pay boolean;
begin
 terms:=private.payroll_net_package_terms(g,packages);
 for e in select value from jsonb_array_elements(g->'employees') loop
  fields:='[]';select value into t from jsonb_array_elements(terms) where value->>'employeeId'=e->>'employeeId';
  select value into old from jsonb_array_elements(coalesce(saved->'employees','[]')) where value->>'employeeId'=e->>'employeeId';
  select value into pe from jsonb_array_elements(coalesce(prior->'employees','[]')) where value->>'employeeId'=e->>'employeeId';
  i:=coalesce(old,'{}')||jsonb_build_object('employeeId',e->>'employeeId','payBasis',t->>'payBasis','arrangementRef',t->>'arrangementRef','sourceRef',t->>'arrangementRef','deductions',coalesce(old->'deductions','[]'));
  if t->>'issue' is not null then fields:=fields||jsonb_build_array(jsonb_build_object('code','package','message',t->>'issue'));end if;
  if jsonb_array_length(t->'packages')=1 then
   select value into p from jsonb_array_elements(packages) where value->>'id'=t#>>'{packages,0,id}';
   if p->>'rate_type'='Monthly' then
    monthly:=(p->>'base_amount')::numeric;
    select coalesce(sum((c->>'amount')::numeric),0) into allowances from jsonb_array_elements(coalesce(p->'components','[]')) c where c->>'recurrence'='recurring' and coalesce(c->>'pagibig','included')<>'excluded';
    i:=i||jsonb_build_object('philhealthBase',round(monthly,2)::text,'pagibigBase',round(monthly+allowances,2)::text);
    -- First-cutoff allocation uses contractual monthly remuneration; cutoff two reconciles actual month totals.
    if context->>'cutoff'='1' and nullif(i->>'sssBase','') is null and t->>'payBasis'='gross' then
     select coalesce(sum((c->>'amount')::numeric),0) into allowances from jsonb_array_elements(coalesce(p->'components','[]')) c where c->>'recurrence'='recurring' and coalesce(c->>'sss','included')<>'excluded';
     i:=i||jsonb_build_object('sssBase',round(monthly+allowances,2)::text);
    end if;
   end if;
  end if;
  -- Coverage follows the employee-payroll package; explicit reviewed exemptions survive.
  foreach k in array array['sssCovered','philhealthCovered','pagibigCovered'] loop
   if jsonb_typeof(i->k) is distinct from 'boolean' then i:=i||jsonb_build_object(k,true);end if;
  end loop;
  lines:='[]';
  for l in select value from jsonb_array_elements(e->'lines') loop
   select value into p from jsonb_array_elements(packages) where value->>'id'=l->>'packageId';
   tax:=case when l ? 'component' then l#>>'{component,tax}' else p#>>'{treatment,tax}' end;
   ref:=coalesce(nullif(l#>>'{component,documentRef}',''),nullif(p#>>'{treatment,taxBasisRef}',''),p->>'source_ref');
   -- Standard salary, overtime and premiums are compensation; approved exemptions stay exempt.
   if l ? 'component' and coalesce(tax,'unreviewed')='unreviewed' then
    fields:=fields||jsonb_build_array(jsonb_build_object('code','benefit_tax','message','The approved benefit “'||(l->>'label')||'” has no tax classification. Correct that benefit record once.'));
   end if;
   lines:=lines||jsonb_build_array(jsonb_build_object('taxable',case when tax='excluded' then '0.00' else l->>'amount' end,'kind',case when l->>'kind' in('ot','offset') or l->>'label' like '%overtime%' then 'supplement' else 'regular' end,'exemptionRef',case when tax='excluded' then ref else '' end));
  end loop;
  i:=i||jsonb_build_object('taxLines',lines);
  if pe is not null and context->>'cutoff'='2' and t->>'payBasis'='gross' and nullif(i->>'sssBase','') is null and not exists(select 1 from jsonb_array_elements(packages) x where x->>'employee_id'=e->>'employeeId' and (x#>>'{treatment,sss}'='excluded' or exists(select 1 from jsonb_array_elements(coalesce(x->'components','[]')) c where c->>'sss'='excluded'))) then
   i:=i||jsonb_build_object('sssBase',round((pe->>'gross')::numeric+(e->>'gross')::numeric,2)::text);
  end if;
  if t->>'payBasis' in('net_tax','net_all') then
   i:=i||jsonb_build_object('netTarget',t->>'cutoffTarget','grossUpBasisRef','Approved package and statutory contribution basis');
   if coalesce((i->>'grossUpConfirmed')::boolean,false)=false then fields:=fields||jsonb_build_array(jsonb_build_object('code','gross_up','message','The package guarantees net pay. Its company-funded gross-up has no recorded statutory contribution treatment.'));end if;
  end if;
  if pe is not null then
   i:=i||jsonb_build_object('openingTaxable',pe#>>'{ytd,taxable}','openingWithheld',pe#>>'{ytd,withheld}','openingPeriods',pe#>>'{ytd,periods}','cumulativeAlready',coalesce(pe#>'{ytd,cumulative}','false'),'previousEmployer',false,'openingRef','Linked preceding payroll');
  end if;
  -- These are paid facts, not package values. A missing record must not be interpreted as zero.
  if pe is null and (nullif(i->>'openingTaxable','') is null or nullif(i->>'openingWithheld','') is null or nullif(i->>'openingPeriods','') is null or jsonb_typeof(i->'previousEmployer') is distinct from 'boolean' or jsonb_typeof(i->'cumulativeAlready') is distinct from 'boolean' or length(coalesce(i->>'openingRef',''))<3) then
   fields:=fields||jsonb_build_array(jsonb_build_object('code','prior_payroll','message','Earlier paid payroll is not recorded. Import the prior payroll taxable pay, tax withheld and contribution totals once; salary and cutoff dates are already loaded.'));
  end if;
  if context->>'cutoff'='2' and nullif(context->>'previousRunId','') is null and exists(select 1 from unnest(array['sssEE','sssER','mpfEE','mpfER','ecER','philhealthEE','philhealthER','pagibigEE','pagibigER']) key_name where nullif(i#>>array['openingContributions',key_name],'') is null) then
   fields:=fields||jsonb_build_array(jsonb_build_object('code','prior_contributions','message','The first cutoff contribution totals for this pay month are not recorded. Link or import that payroll so employee and employer contributions are not charged twice.'));
  end if;
  foreach k in array array['sssBase','philhealthBase','pagibigBase'] loop
   if nullif(i->>k,'') is null then fields:=fields||jsonb_build_array(jsonb_build_object('code',k,'message',case k when 'sssBase' then 'Monthly SSS remuneration is not recorded. It must include actual monthly pay and applicable variable earnings.' when 'philhealthBase' then 'This daily/hourly or changing package has no approved monthly PhilHealth salary basis.' else 'This daily/hourly or changing package has no approved monthly Pag-IBIG compensation basis.' end));end if;
  end loop;
  emps:=emps||jsonb_build_array(i);
  if jsonb_array_length(fields)>0 then issues:=issues||jsonb_build_array(jsonb_build_object('employeeId',e->>'employeeId','employeeName',e->>'employeeName','items',(select jsonb_agg(x) from (select distinct value x from jsonb_array_elements(fields)) z)));end if;
 end loop;
 return jsonb_build_object('inputs',coalesce(saved,'{}')||(context-'sourceRef')||jsonb_build_object('ruleset','PH-2026-09-06','employees',emps),'issues',issues,'ready',jsonb_array_length(issues)=0,'packageTerms',terms);
end $$;
revoke all on function private.payroll_automatic_inputs(jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;

create or replace function public.get_automatic_payroll_inputs(p_gross_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.payroll_gross_runs;v public.payroll_net_reviews;ctx jsonb;prior jsonb;prepared jsonb;rows jsonb:='[]';i jsonb;d jsonb;queue jsonb;issues jsonb;h public.hris_users;missing text[];
begin
 select * into g from public.payroll_gross_runs where id=p_gross_id;
 if g.id is null or not private.payroll_net_can_review(g.scope_id) or not private.payroll_gross_permission(g.scope_id,'view') then raise exception 'Scoped payroll calculation access required.' using errcode='42501';end if;
 if not (public.get_payroll_gross_run(g.id)->>'current')::boolean then raise exception 'Source records changed. Recalculate payroll.' using errcode='40001';end if;
 ctx:=private.payroll_net_context(g.id);
 select * into v from public.payroll_net_reviews where gross_run_id=g.id order by revision desc limit 1;
 select result into prior from public.payroll_net_runs where id=nullif(ctx->>'previousRunId','')::uuid;
 prepared:=private.payroll_automatic_inputs(g.result,g.source_snapshot->'packages',ctx,v.inputs,prior);
 queue:=public.get_payroll_nte_deduction_queue(g.id,(ctx->>'payDate')::date);issues:=prepared->'issues';
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
  if cardinality(missing)>0 then issues:=issues||jsonb_build_array(jsonb_build_object('employeeId',i->>'employeeId','employeeName',h.full_name,'items',jsonb_build_array(jsonb_build_object('code','employee_ids','message','Missing government IDs in the employee profile: '||array_to_string(missing,', ')||'. Update the employee profile once.'))));end if;
  rows:=rows||jsonb_build_array(i);
 end loop;
 prepared:=jsonb_set(prepared,'{inputs,employees}',rows)||jsonb_build_object('issues',issues,'ready',jsonb_array_length(issues)=0);
 return prepared;
end $$;
revoke all on function public.get_automatic_payroll_inputs(uuid) from public,anon;
grant execute on function public.get_automatic_payroll_inputs(uuid) to authenticated;

create or replace function public.calculate_automatic_payroll(p_gross_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prepared jsonb;run_id uuid;
begin
 prepared:=public.get_automatic_payroll_inputs(p_gross_id);
 if not (prepared->>'ready')::boolean then return prepared-'inputs';end if;
 perform public.save_payroll_net_review(p_gross_id,prepared->'inputs','Automatic preparation from approved payroll records');
 run_id:=public.prepare_payroll_net(p_gross_id,'Payroll calculated from approved records');
 return jsonb_build_object('ready',true,'issues','[]'::jsonb,'runId',run_id);
end $$;
revoke all on function public.calculate_automatic_payroll(uuid) from public,anon;
grant execute on function public.calculate_automatic_payroll(uuid) to authenticated;

-- Approving an unchanged version needs no invented decision reference.
alter table public.payroll_approval_actions drop constraint payroll_approval_actions_reason_check;
alter table public.payroll_approval_actions add constraint payroll_approval_actions_reason_check
 check(length(btrim(reason))<=1000 and (action='approve' or length(btrim(reason))>=3));

