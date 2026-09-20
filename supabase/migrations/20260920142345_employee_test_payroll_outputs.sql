-- Employee-scoped, immutable draft outputs. No official payroll or release writes.
create table payroll_scenario_private.employee_output_snapshots (
 id uuid primary key default gen_random_uuid(),
 seed_run_id text not null references payroll_scenario_private.runs(seed_run_id),
 employee_id uuid not null,
 input_hash text not null,
 payload jsonb not null,
 created_by uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(seed_run_id,employee_id,input_hash)
);
alter table payroll_scenario_private.employee_output_snapshots enable row level security;
revoke all on payroll_scenario_private.employee_output_snapshots from public,anon,authenticated;

create function public.employee_test_payroll_output(p_scope uuid,p_from date,p_to date,p_employee uuid,p_save boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r payroll_scenario_private.runs;e jsonb;g jsonb;ni jsonb;ns jsonb;nr jsonb;pk jsonb;payload jsonb;h text;s payroll_scenario_private.employee_output_snapshots;inserted uuid;
begin
 if auth.uid() is null or not coalesce(private.payroll_gross_permission(p_scope,'view'),false)
 or not coalesce(private.payroll_package_permission(p_employee,p_scope,'view'),false) then
 raise exception 'Employee compensation and payroll scope access required' using errcode='42501';end if;
 if p_save and not coalesce(private.payroll_gross_permission(p_scope,'prepare') or private.payroll_gross_permission(p_scope,'rules') or private.payroll_has_access('manage_access',p_scope),false) then
 raise exception 'Scoped payroll preparation access required' using errcode='42501';end if;
 select * into strict r from payroll_scenario_private.runs where scope_id=p_scope and date_from=p_from and date_to=p_to and is_test for share;
 select value into e from jsonb_array_elements(r.snapshot->'employees') where value->>'id'=p_employee::text;
 if e is null then raise exception 'Employee is not in this payroll run';end if;
 select value into g from jsonb_array_elements(r.snapshot#>'{demo,scenarioGross,employees}') where value->>'employeeId'=p_employee::text;
 if g->>'gross' is null or jsonb_array_length(coalesce(g->'issues','[]'))>0
 or not exists(select 1 from jsonb_array_elements(r.snapshot#>'{demo,timeResult,rows}') d where d->>'employeeId'=p_employee::text)
 or exists(select 1 from jsonb_array_elements(r.snapshot#>'{demo,timeResult,rows}') d where d->>'employeeId'=p_employee::text and jsonb_array_length(coalesce(d->'issues','[]'))>0)
 or exists(select 1 from payroll_scenario_private.corrections c where c.seed_run_id=r.seed_run_id and c.employee_id=p_employee and c.status in ('Saved','Pending approval','Approved','Needs attention','Recalculation failed','Rejected'))
 then raise exception 'Resolve and recalculate this employee attendance before reviewing pay';end if;
 ns:=r.snapshot#>'{demo,comparisonNetInput}';
 select value into ni from jsonb_array_elements(ns#>'{review,employees}') where value->>'employeeId'=p_employee::text;
 select jsonb_agg(value) into pk from jsonb_array_elements(ns->'packages') where value->>'employee_id'=p_employee::text;
 if ni is null or pk is null then raise exception 'Pay package or contribution inputs missing';end if;
 -- Reuse configured test inputs, but recalculate tax/net from corrected scenario earnings.
 ni:=ni||jsonb_build_object('taxLines',(select coalesce(jsonb_agg(jsonb_build_object('taxable',x->>'amount','kind','regular')),'[]') from jsonb_array_elements(g->'lines') x));
 ns:=ns||jsonb_build_object('gross',jsonb_build_object('employees',jsonb_build_array(g)),'packages',pk,'loans','[]'::jsonb,'review',(ns->'review')||jsonb_build_object('employees',jsonb_build_array(ni)));
 nr:=private.calculate_payroll_net_v1(ns);
 if nr->>'ready' is distinct from 'true' or jsonb_array_length(nr->'employees')<>1 then raise exception 'Net-pay inputs need review: %',nr->'issues';end if;
 h:=md5(jsonb_build_array('employee-output-v1',ns,nr,e,r.date_from,r.date_to,r.pay_date)::text);
 payload:=(nr->'employees'->0)||jsonb_build_object('employeeName',e->>'name','employeeCode',e->>'code','businessUnit','Bakebe - SM Aura','from',p_from,'to',p_to,'payDate',r.pay_date,'lines',g->'lines','test',true,'status','Draft - not released','calculationVersion',nr->>'engineVersion','snapshotHash',h,'assumptions',r.snapshot#>'{demo,assumptions}','governmentStatus','TEST worksheet only - not submission-ready');
 if p_save then
 insert into payroll_scenario_private.employee_output_snapshots(seed_run_id,employee_id,input_hash,payload,created_by) values(r.seed_run_id,p_employee,h,payload,auth.uid()) on conflict(seed_run_id,employee_id,input_hash) do nothing returning id into inserted;
 if inserted is not null then insert into payroll_scenario_private.completion_audit(seed_run_id,actor_id,action,detail) values(r.seed_run_id,auth.uid(),'GENERATE_EMPLOYEE_DRAFT',jsonb_build_object('employeeId',p_employee,'snapshotId',inserted,'snapshotHash',h,'calculationVersion',nr->>'engineVersion','testOnly',true));end if;
 end if;
 select * into s from payroll_scenario_private.employee_output_snapshots where seed_run_id=r.seed_run_id and employee_id=p_employee and input_hash=h;
 return jsonb_build_object('payload',coalesce(s.payload,payload),'snapshotId',s.id,'generatedAt',s.created_at,'canGenerate',coalesce(private.payroll_gross_permission(p_scope,'prepare') or private.payroll_gross_permission(p_scope,'rules') or private.payroll_has_access('manage_access',p_scope),false));
end $$;
revoke all on function public.employee_test_payroll_output(uuid,date,date,uuid,boolean) from public,anon,authenticated;
grant execute on function public.employee_test_payroll_output(uuid,date,date,uuid,boolean) to authenticated;
notify pgrst,'reload schema';
