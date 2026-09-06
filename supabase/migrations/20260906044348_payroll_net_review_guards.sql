-- Finance reviewers can review a whole BU without ever approving their own row.
-- An unchanged own row may retain another reviewer's approval; otherwise it stays pending.
create function private.payroll_net_review_for_actor(p jsonb,old jsonb,actor text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare rows jsonb:='[]';approvals jsonb:='{}';e jsonb;own_old jsonb;same_config boolean;
begin
 same_config:=(p-'employees'-'statutoryFingerprint'-'employeeApprovals')=(old-'employees'-'statutoryFingerprint'-'employeeApprovals');
 select value into own_old from jsonb_array_elements(coalesce(old->'employees','[]')) where value->>'employeeId'=actor;
 for e in select value from jsonb_array_elements(p->'employees') loop
 if e->>'employeeId'<>actor then rows:=rows||jsonb_build_array(e);approvals:=approvals||jsonb_build_object(e->>'employeeId',actor);
 elsif same_config and e=own_old and old#>>array['employeeApprovals',actor] is not null and old#>>array['employeeApprovals',actor]<>actor then
 rows:=rows||jsonb_build_array(own_old);approvals:=approvals||jsonb_build_object(actor,old#>>array['employeeApprovals',actor]);
 end if;
 end loop;
 return (p-'statutoryFingerprint'-'employeeApprovals')||jsonb_build_object('employees',rows,'employeeApprovals',approvals);
end $$;

create or replace function private.payroll_net_review_validate(p_gross_id uuid,p jsonb) returns void
language plpgsql stable security definer set search_path='' as $$
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
 if i is null then if (e->>'employeeId')::uuid=private.payroll_actor_id() then continue;else raise exception 'Missing Finance review for %.',e->>'employeeName';end if;end if;
 if (e->>'employeeId')::uuid=private.payroll_actor_id() and (p#>>array['employeeApprovals',e->>'employeeId'] is null or p#>>array['employeeApprovals',e->>'employeeId']=private.payroll_actor_id()::text) then raise exception 'Another authorized Finance reviewer must review your own pay.' using errcode='42501';end if;
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
create or replace function public.save_payroll_net_review(p_gross_id uuid,p_inputs jsonb,p_source_ref text) returns uuid
language plpgsql security definer set search_path='' as $$
declare g public.payroll_gross_runs;new_id uuid;fingerprint jsonb;payload jsonb;prior_inputs jsonb;
begin
 select * into g from public.payroll_gross_runs where id=p_gross_id;
 if g.id is null or not private.payroll_net_can_review(g.scope_id) then raise exception 'Scoped Finance authorization required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-net:'||g.scope_id::text,0));
 select inputs into prior_inputs from public.payroll_net_reviews where gross_run_id=g.id order by revision desc limit 1;
 p_inputs:=private.payroll_net_review_for_actor(p_inputs,prior_inputs,private.payroll_actor_id()::text);
 perform private.payroll_net_review_validate(p_gross_id,p_inputs);
 select jsonb_agg(jsonb_build_object('employeeId',h.id,'fingerprint',md5(jsonb_build_array(h.sss_no,h.philhealth_no,h.pagibig_no,h.tin)::text)) order by e.ordinality)
 into fingerprint from jsonb_array_elements(g.result->'employees') with ordinality e(value,ordinality) join public.hris_users h on h.id=(e.value->>'employeeId')::uuid;
 payload:=(p_inputs-'statutoryFingerprint')||jsonb_build_object('statutoryFingerprint',fingerprint);
 select id into new_id from public.payroll_net_reviews where gross_run_id=g.id and inputs=payload and source_ref=p_source_ref order by revision desc limit 1;
 if new_id is not null and new_id=(select id from public.payroll_net_reviews where gross_run_id=g.id order by revision desc limit 1) then return new_id;end if;
 insert into public.payroll_net_reviews(gross_run_id,scope_id,inputs,source_ref,approved_by) values(g.id,g.scope_id,payload,p_source_ref,private.payroll_actor_id()) returning id into new_id;
 return new_id;
end $$;
revoke all on function private.payroll_net_review_for_actor(jsonb,jsonb,text) from public,anon,authenticated;
