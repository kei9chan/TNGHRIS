-- Internal comparison evidence only. Existing calculators, approvals and payment gates are unchanged.
create schema if not exists payroll_calculation_private;
revoke all on schema payroll_calculation_private from public,anon;
grant usage on schema payroll_calculation_private to authenticated;
create table payroll_calculation_private.comparisons (
 id uuid primary key default gen_random_uuid(),
 net_run_id uuid not null references public.payroll_net_runs(id),
 source_hash text not null, source_rows jsonb not null, input jsonb not null, results jsonb not null,
 input_hash text not null, created_by uuid not null references public.hris_users(id),
 created_at timestamptz not null default clock_timestamp(),
 unique(net_run_id,input_hash)
);
alter table payroll_calculation_private.comparisons enable row level security;
revoke all on payroll_calculation_private.comparisons from public,anon,authenticated;
create index calculation_comparison_actor on payroll_calculation_private.comparisons(created_by);
create trigger immutable before update or delete on payroll_calculation_private.comparisons
 for each row execute function private.payroll_audit_immutable();

-- This is a review projection, never an alternative calculator or source of pay amounts.
create function payroll_calculation_private.workspace(p_scope uuid,p_from date,p_to date,p_gross uuid,p_net uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare g public.payroll_gross_runs;n public.payroll_net_runs;t public.payroll_time_packages;v public.payroll_net_reviews;
 gv jsonb;nv jsonb;emp jsonb;inp jsonb;dayrow jsonb;pkg jsonb;pkgs jsonb;employees jsonb:='[]';missing jsonb;refs jsonb;
 blockers jsonb:='[]';issues jsonb;d date;can_prepare boolean;previous jsonb;
begin
 if auth.uid() is null or not coalesce(private.payroll_gross_permission(p_scope,'view'),false) then raise exception 'Scoped payroll salary access required.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 then raise exception 'Choose a valid cutoff of 1–31 days.';end if;
 if p_gross is not null then
  select * into g from public.payroll_gross_runs where id=p_gross and scope_id=p_scope and date_from=p_from and date_to=p_to;
  if g.id is null then raise exception 'Gross version does not belong to this BU and cutoff.' using errcode='42501';end if;
 else select * into g from public.payroll_gross_runs where scope_id=p_scope and date_from=p_from and date_to=p_to order by version desc limit 1;end if;
 if p_net is not null then
  select * into n from public.payroll_net_runs where id=p_net and scope_id=p_scope and date_from=p_from and date_to=p_to and gross_run_id=g.id;
  if n.id is null then raise exception 'Net version does not belong to this gross version, BU and cutoff.' using errcode='42501';end if;
 else select * into n from public.payroll_net_runs where gross_run_id=g.id order by version desc limit 1;end if;
 if g.id is not null then
  if n.id is null then gv:=public.get_payroll_gross_run(g.id);end if;select * into t from public.payroll_time_packages where id=g.time_package_id;
  pkgs:=g.source_snapshot->'packages';
  if n.id is null and not coalesce((gv->>'current')::boolean,false) then blockers:=blockers||jsonb_build_array('Gross sources need review: '||coalesce(gv->>'staleReason','saved inputs changed'));end if;
  select * into v from public.payroll_net_reviews where gross_run_id=g.id order by revision desc limit 1;
 else
  select * into t from public.payroll_time_packages where scope_id=p_scope and date_from=p_from and date_to=p_to and status='submitted' order by version desc limit 1;
  blockers:=blockers||jsonb_build_array('No gross-pay version saved for this cutoff. Owner: Finance preparer.');
 end if;
 if t.id is null then blockers:=blockers||jsonb_build_array('No HR-submitted timekeeping version. Resolve Timekeeping Review first. Isolated historical test imports do not become live attendance.');end if;
 if n.id is not null then nv:=public.get_payroll_net_run(n.id);
  -- Net freshness already verifies the linked gross/time sources; do not run them twice.
  gv:=jsonb_build_object('current',case when (nv->>'current')::boolean then true else null end);
  -- Present the exact reviewed inputs used by this immutable net version.
  select * into v from public.payroll_net_reviews where id=n.review_id;
  if not coalesce((nv->>'current')::boolean,false) then blockers:=blockers||jsonb_build_array('Take-home sources need review: '||coalesce(nv->>'staleReason','saved inputs changed'));end if;
 else blockers:=blockers||jsonb_build_array('No take-home-pay version saved. Finance must review deductions and opening balances.');end if;
 for emp in select value from jsonb_array_elements(coalesce(t.source_snapshot->'employees','[]')) loop
  if not coalesce(private.payroll_package_permission((emp->>'id')::uuid,p_scope,'view'),false) or not coalesce(public.can_access_hris_user((emp->>'id')::uuid),false) then raise exception 'Saved employee outside current salary scope.' using errcode='42501';end if;
  missing:='[]';refs:='[]';issues:='[]';
  for dayrow in select value from jsonb_array_elements(t.result->'rows') where value->>'employeeId'=emp->>'id' loop
   d:=(dayrow->>'date')::date;
   if g.id is not null then
    select value into pkg from jsonb_array_elements(pkgs) where value->>'employee_id'=emp->>'id' and value->>'engagement_key'='employee'
     and (value->>'effective_from')::date<=d and (nullif(value->>'effective_until','') is null or (value->>'effective_until')::date>d)
     order by (value->>'effective_from')::date desc limit 1;
   else
    select to_jsonb(p) into pkg from public.payroll_pay_packages p where p.employee_id=(emp->>'id')::uuid and p.status='approved'
     and p.stream='employee_payroll' and p.engagement_key='employee' and p.effective_from<=d order by p.effective_from desc limit 1;
   end if;
   if pkg is null then missing:=missing||jsonb_build_array(d);else
    if not coalesce(private.payroll_package_permission((emp->>'id')::uuid,(pkg->>'scope_id')::uuid,'view'),false) then raise exception 'Pay-package group access required.' using errcode='42501';end if;
    if not refs @> jsonb_build_array(pkg->>'source_ref') then refs:=refs||jsonb_build_array(pkg->>'source_ref');end if;
    if coalesce(pkg#>>'{treatment,proration}','unreviewed') not in('included','rule_defined') then issues:=issues||jsonb_build_array(d||': Salary proration treatment needs HR / Finance review.');end if;
   end if;
  end loop;
  if jsonb_array_length(missing)>0 then issues:=issues||jsonb_build_array('Missing approved historical salary for '||jsonb_array_length(missing)||' employee-days. Current salary is not a replacement.');end if;
  select value into inp from jsonb_array_elements(coalesce(v.inputs->'employees','[]')) where value->>'employeeId'=emp->>'id';
  if inp is null or jsonb_typeof(inp->'deductions') is distinct from 'array' or length(trim(coalesce(inp->>'sourceRef','')))<3 then
   issues:=issues||jsonb_build_array('Missing reviewed historical deduction information. Finance must document deductions, including a confirmed empty list when none apply.');end if;
  if inp is null or length(trim(coalesce(inp->>'openingRef','')))<3 or nullif(trim(inp->>'openingTaxable'),'') is null or nullif(trim(inp->>'openingWithheld'),'') is null or nullif(trim(inp->>'openingPeriods'),'') is null then
   issues:=issues||jsonb_build_array('Missing historical opening balances / source reference. Finance must confirm YTD, tax, contributions and loan openings; blank does not mean zero.');end if;
  if v.inputs->>'cutoff'='2' and nullif(v.inputs->>'previousRunId','') is null and (coalesce(jsonb_typeof(inp->'openingContributions'),'null')<>'object' or inp->'openingContributions'='{}'::jsonb) then
   issues:=issues||jsonb_build_array('Second cutoff has no linked first cutoff or reviewed month-to-date contribution openings.');end if;
  employees:=employees||jsonb_build_array(jsonb_build_object('employeeId',emp->>'id','employeeName',emp->>'name','missingSalaryDates',missing,'salarySources',refs,'deductionSource',inp->>'sourceRef','openingSource',inp->>'openingRef','issues',issues));
 end loop;
 -- The existing engine validates freshness, contiguous cutoffs and opening carry-forward.
 select jsonb_build_object('id',p.id,'from',p.date_from,'to',p.date_to,'version',p.version) into previous from public.payroll_net_runs p
 where p.scope_id=p_scope and p.date_to+1=p_from order by p.version desc limit 1;
 can_prepare:=coalesce(private.payroll_gross_permission(p_scope,'prepare'),false) and coalesce(private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff'),false);
 return jsonb_build_object('scopeId',p_scope,'from',p_from,'to',p_to,'mode',(select processing_mode from public.payroll_access_scopes where id=p_scope),
 'grossId',g.id,'netId',n.id,'grossCurrent',(gv->>'current')::boolean,'netCurrent',(nv->>'current')::boolean,'canCompare',can_prepare,
 'blockers',blockers,'employees',employees,'previousCutoff',previous,'linkedPreviousNet',n.source_snapshot#>>'{prior,id}',
 'grossRuns',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'version',r.version) order by r.version desc),'[]') from public.payroll_gross_runs r where r.scope_id=p_scope and r.date_from=p_from and r.date_to=p_to),
 'netRuns',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'version',r.version) order by r.version desc),'[]') from public.payroll_net_runs r where r.gross_run_id=g.id),
 'adjacentCutoffs',(select coalesce(jsonb_agg(x),'[]') from (select r.date_from as "from",r.date_to as "to",max(r.version) as version from public.payroll_gross_runs r where r.scope_id=p_scope and (r.date_from=p_to+1 or r.date_to=p_from-1) group by r.date_from,r.date_to order by r.date_from)x));
end $$;

create function payroll_calculation_private.comparison(p_net uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare n public.payroll_net_runs;viewed jsonb;rows jsonb;source jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 viewed:=public.get_payroll_net_run(p_net); -- Rechecks both scoped duty AND every employee's salary access.
 select * into n from public.payroll_net_runs where id=p_net;
 select jsonb_build_object('employees',jsonb_agg(e||jsonb_build_object('lines',coalesce(g->'lines','[]')||case when coalesce((e->>'companyTopUp')::numeric,0)<>0 then jsonb_build_array(jsonb_build_object('label','Company-funded gross-up','amount',e->>'companyTopUp')) else '[]'::jsonb end))) into source
 from jsonb_array_elements(n.result->'employees') e join jsonb_array_elements(n.source_snapshot#>'{gross,employees}') g on g->>'employeeId'=e->>'employeeId';
 rows:=private.payroll_comparison_rows(source);
 return jsonb_build_object('template',jsonb_build_object('runId',n.id,'sourceHash',n.source_hash,'from',n.date_from,'to',n.date_to,'rows',rows),
 'current',(viewed->>'current')::boolean,'staleReason',viewed->>'staleReason',
 'canSave',coalesce(private.payroll_gross_permission(n.scope_id,'prepare'),false) and coalesce(private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff'),false),
 'revisions',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'createdAt',c.created_at,'sourceRef',c.input->>'sourceRef','coverageRef',c.input->>'coverageRef','rows',c.results) order by c.created_at desc),'[]') from payroll_calculation_private.comparisons c where c.net_run_id=n.id));
end $$;
create function payroll_calculation_private.save_comparison(p_net uuid,p_hash text,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare w jsonb;t jsonb;v jsonb;h text;result_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('calculation-comparison:'||p_net::text,0));
 w:=payroll_calculation_private.comparison(p_net);t:=w->'template';
 if not coalesce((w->>'canSave')::boolean,false) then raise exception 'Scoped Finance preparer and salary access required.' using errcode='42501';end if;
 if not coalesce((w->>'current')::boolean,false) then raise exception 'Calculation sources changed. Recalculate before saving a comparison.' using errcode='40001';end if;
 if t->>'sourceHash' is distinct from p_hash then raise exception 'Workbook belongs to another calculation. Download its current template.' using errcode='40001';end if;
 v:=private.payroll_compare_values(t->'rows',p_input);h:=md5(p_input::text);
 select id into result_id from payroll_calculation_private.comparisons where net_run_id=p_net and input_hash=h;
 if result_id is not null then return result_id;end if;
 insert into payroll_calculation_private.comparisons(net_run_id,source_hash,source_rows,input,results,input_hash,created_by)
 values(p_net,p_hash,t->'rows',p_input,v,h,public.current_hris_user_id()) returning id into result_id;
 return result_id;
end $$;
create function public.get_payroll_calculation_workspace(p_scope uuid,p_from date,p_to date,p_gross uuid default null,p_net uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$select payroll_calculation_private.workspace(p_scope,p_from,p_to,p_gross,p_net)$$;
create function public.get_payroll_calculation_comparison(p_net uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select payroll_calculation_private.comparison(p_net)$$;
create function public.save_payroll_calculation_comparison(p_net uuid,p_hash text,p_input jsonb) returns uuid
language sql security invoker set search_path='' as $$select payroll_calculation_private.save_comparison(p_net,p_hash,p_input)$$;
revoke all on function payroll_calculation_private.workspace(uuid,date,date,uuid,uuid),payroll_calculation_private.comparison(uuid),payroll_calculation_private.save_comparison(uuid,text,jsonb),public.get_payroll_calculation_workspace(uuid,date,date,uuid,uuid),public.get_payroll_calculation_comparison(uuid),public.save_payroll_calculation_comparison(uuid,text,jsonb) from public,anon;
grant execute on function payroll_calculation_private.workspace(uuid,date,date,uuid,uuid),payroll_calculation_private.comparison(uuid),payroll_calculation_private.save_comparison(uuid,text,jsonb),public.get_payroll_calculation_workspace(uuid,date,date,uuid,uuid),public.get_payroll_calculation_comparison(uuid),public.save_payroll_calculation_comparison(uuid,text,jsonb) to authenticated;
