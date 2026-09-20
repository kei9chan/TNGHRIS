-- Isolated completion workflow for the authorized Bakebe SM Aura payroll demo.
-- Draft outputs, approvals, and releases stay outside official payroll, payment,
-- attendance, balance, notification, and released-payslip tables.

create table payroll_scenario_private.output_batches (
 seed_run_id text primary key references payroll_scenario_private.runs(seed_run_id),
 snapshot_hash text not null,
 frozen_snapshot jsonb not null,
 status text not null check(status in ('Generating','Ready','Needs review','Failed','Released')),
 failure_message text,
 generated_by uuid,
 generated_at timestamptz,
 released_by uuid,
 released_at timestamptz,
 updated_at timestamptz not null default clock_timestamp()
);
alter table payroll_scenario_private.output_batches enable row level security;
revoke all on payroll_scenario_private.output_batches from public,anon,authenticated;

create table payroll_scenario_private.outputs (
 id uuid primary key default gen_random_uuid(),
 seed_run_id text not null references payroll_scenario_private.runs(seed_run_id),
 output_key text not null,
 output_type text not null check(output_type in ('payslip','government_report')),
 employee_id uuid,
 report_code text,
 status text not null check(status in ('Ready','Needs review','Failed','Released')),
 payload jsonb not null,
 error_message text,
 generated_at timestamptz not null default clock_timestamp(),
 released_at timestamptz,
 unique(seed_run_id,output_key),
 check((output_type='payslip' and employee_id is not null and report_code is null) or (output_type='government_report' and employee_id is null and report_code is not null))
);
create index test_payroll_outputs_employee on payroll_scenario_private.outputs(employee_id,seed_run_id) where output_type='payslip';
alter table payroll_scenario_private.outputs enable row level security;
revoke all on payroll_scenario_private.outputs from public,anon,authenticated;

create table payroll_scenario_private.completion_approvals (
 seed_run_id text not null references payroll_scenario_private.runs(seed_run_id),
 step smallint not null check(step between 1 and 6),
 status text not null check(status in ('Approved','Rejected','Needs attention')),
 actor_id uuid,
 reason text,
 occurred_at timestamptz not null default clock_timestamp(),
 primary key(seed_run_id,step)
);
alter table payroll_scenario_private.completion_approvals enable row level security;
revoke all on payroll_scenario_private.completion_approvals from public,anon,authenticated;

create table payroll_scenario_private.completion_audit (
 id uuid primary key default gen_random_uuid(),
 seed_run_id text not null references payroll_scenario_private.runs(seed_run_id),
 actor_id uuid,
 action text not null,
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default clock_timestamp()
);
create index test_payroll_completion_audit_run on payroll_scenario_private.completion_audit(seed_run_id,created_at desc);
alter table payroll_scenario_private.completion_audit enable row level security;
revoke all on payroll_scenario_private.completion_audit from public,anon,authenticated;

create function payroll_scenario_private.unresolved_count(p_seed text) returns integer
language sql stable security definer set search_path='' as $$
 select
  (select count(*)::int from jsonb_array_elements(coalesce(r.snapshot#>'{demo,timeResult,rows}','[]'::jsonb)) x
   where jsonb_array_length(coalesce(x->'issues','[]'::jsonb))>0
   and not exists(select 1 from payroll_scenario_private.corrections c where c.seed_run_id=r.seed_run_id and c.employee_id=(x->>'employeeId')::uuid and c.work_date=(x->>'date')::date and c.status='Ready after correction'))
  +
  (select count(*)::int from jsonb_array_elements(coalesce(r.snapshot->'employees','[]'::jsonb)) e
   where not exists(select 1 from jsonb_array_elements(coalesce(r.snapshot->'packages','[]'::jsonb)) p where p->>'employee_id'=e->>'id'))
 from payroll_scenario_private.runs r where r.seed_run_id=p_seed and r.is_test
$$;
revoke all on function payroll_scenario_private.unresolved_count(text) from public,anon,authenticated;

create function payroll_scenario_private.completion_role(p_step integer,p_scope uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(case
  when p_step in (1,2) then private.payroll_has_access('review_endorse',p_scope) and (private.workflow_user_has_role(public.current_hris_user_id(),'HR Staff') or private.workflow_user_has_role(public.current_hris_user_id(),'HR Manager'))
  when p_step=3 then private.payroll_has_access('authorize_hr',p_scope) and private.workflow_user_has_role(public.current_hris_user_id(),'HR Manager')
  when p_step=4 then private.payroll_has_access('authorize_finance',p_scope) and private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff')
  when p_step=5 then private.payroll_has_access('approve_bod',p_scope) and private.workflow_user_has_role(public.current_hris_user_id(),'Board of Director')
  when p_step=6 then (private.payroll_has_access('authorize_finance',p_scope) or private.payroll_gross_permission(p_scope,'prepare')) and private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff')
  else false end,false)
$$;
revoke all on function payroll_scenario_private.completion_role(integer,uuid) from public,anon,authenticated;

create function payroll_scenario_private.completion_state(p_seed text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r payroll_scenario_private.runs;b payroll_scenario_private.output_batches;unresolved integer;employee_count integer;gross numeric;net numeric;current_step integer;labels text[]:=array['HR validation','HR endorsement','HR Manager authorization','Finance authorization','BOD final approval','Finance disbursement'];approvals jsonb:='[]'::jsonb;i integer;a payroll_scenario_private.completion_approvals;all_approved boolean;
begin
 select * into strict r from payroll_scenario_private.runs where seed_run_id=p_seed and is_test;
 if not coalesce(private.payroll_gross_permission(r.scope_id,'view'),false) then raise exception 'Scoped payroll and compensation access required' using errcode='42501';end if;
 unresolved:=payroll_scenario_private.unresolved_count(p_seed);
 employee_count:=jsonb_array_length(coalesce(r.snapshot->'employees','[]'::jsonb));
 gross:=coalesce((r.snapshot#>>'{demo,comparisonNet,gross}')::numeric,0);net:=coalesce((r.snapshot#>>'{demo,comparisonNet,net}')::numeric,0);
 select * into b from payroll_scenario_private.output_batches where seed_run_id=p_seed;
 select min(x) into current_step from generate_series(1,6) x where not exists(select 1 from payroll_scenario_private.completion_approvals ca where ca.seed_run_id=p_seed and ca.step=x and ca.status='Approved');
 all_approved:=current_step is null;current_step:=coalesce(current_step,6);
 for i in 1..6 loop
  select * into a from payroll_scenario_private.completion_approvals where seed_run_id=p_seed and step=i;
  approvals:=approvals||jsonb_build_array(jsonb_build_object('step',i,'label',labels[i],'status',case when a.status='Approved' then 'Approved' when a.status in ('Rejected','Needs attention') then a.status when i=current_step and b.seed_run_id is not null and b.status in ('Ready','Released') then 'Ready' else 'Waiting' end,'actorId',a.actor_id,'reason',a.reason,'occurredAt',a.occurred_at,'canAct',i=current_step and b.status='Ready' and payroll_scenario_private.completion_role(i,r.scope_id)));
 end loop;
 return jsonb_build_object(
  'seedRunId',r.seed_run_id,'status',case when b.status='Released' then 'Released' when b.status='Failed' then 'Output generation failed' when b.status in ('Ready','Needs review') then 'Outputs generated' when unresolved=0 and r.snapshot#>>'{demo,comparisonNet,ready}'='true' then 'Ready for output generation' else 'Review attendance' end,
  'gross',gross,'net',net,'employees',employee_count,'unresolvedIssues',unresolved,
  'canGenerate',unresolved=0 and r.snapshot#>>'{demo,comparisonNet,ready}'='true' and coalesce(private.payroll_gross_permission(r.scope_id,'prepare') or private.payroll_gross_permission(r.scope_id,'rules') or private.payroll_has_access('manage_access',r.scope_id),false),
  'batch',case when b.seed_run_id is null then null else jsonb_build_object('status',b.status,'failureMessage',b.failure_message,'generatedAt',b.generated_at,'releasedAt',b.released_at,'snapshotHash',b.snapshot_hash) end,
  'payslips',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'employeeId',o.employee_id,'status',o.status,'payload',o.payload,'errorMessage',o.error_message) order by o.payload->>'employeeName'),'[]') from payroll_scenario_private.outputs o where o.seed_run_id=p_seed and o.output_type='payslip'),
  'governmentReports',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'code',o.report_code,'status',o.status,'payload',o.payload,'errorMessage',o.error_message) order by o.output_key),'[]') from payroll_scenario_private.outputs o where o.seed_run_id=p_seed and o.output_type='government_report'),
  'approvals',approvals,'approvalStarted',exists(select 1 from payroll_scenario_private.completion_audit x where x.seed_run_id=p_seed and x.action='START_APPROVAL'),'allApprovalsComplete',all_approved,
  'canRelease',all_approved and b.status='Ready' and unresolved=0 and coalesce(private.payroll_gross_permission(r.scope_id,'prepare') or private.payroll_has_access('manage_access',r.scope_id),false),
  'audit',(select coalesce(jsonb_agg(jsonb_build_object('action',x.action,'detail',x.detail,'createdAt',x.created_at) order by x.created_at desc),'[]') from payroll_scenario_private.completion_audit x where x.seed_run_id=p_seed)
 );
end $$;
revoke all on function payroll_scenario_private.completion_state(text) from public,anon,authenticated;

create function public.get_test_payroll_completion(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r payroll_scenario_private.runs;begin
 select * into r from payroll_scenario_private.runs where scope_id=p_scope and date_from=p_from and date_to=p_to and is_test;
 if not found then return null;end if;
 return payroll_scenario_private.completion_state(r.seed_run_id);
end $$;
revoke all on function public.get_test_payroll_completion(uuid,date,date) from public,anon,authenticated;
grant execute on function public.get_test_payroll_completion(uuid,date,date) to authenticated;

create function public.generate_test_payroll_outputs(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r payroll_scenario_private.runs;b payroll_scenario_private.output_batches;demo jsonb;e jsonb;employee jsonb;gross_row jsonb;code text;report_name text;hash text;employee_count integer;unresolved integer;
begin
 if not coalesce(private.payroll_gross_permission(p_scope,'prepare') or private.payroll_gross_permission(p_scope,'rules') or private.payroll_has_access('manage_access',p_scope),false) then raise exception 'Scoped payroll preparation access required' using errcode='42501';end if;
 select * into strict r from payroll_scenario_private.runs where scope_id=p_scope and date_from=p_from and date_to=p_to and is_test for update;
 unresolved:=payroll_scenario_private.unresolved_count(r.seed_run_id);demo:=r.snapshot->'demo';
 if unresolved<>0 or demo#>>'{comparisonNet,ready}'<>'true' then raise exception 'Resolve all attendance and pay-package issues before generating outputs';end if;
 hash:=coalesce(demo->>'inputHash',md5(demo::text));
 insert into payroll_scenario_private.output_batches(seed_run_id,snapshot_hash,frozen_snapshot,status,generated_by)
 values(r.seed_run_id,hash,jsonb_build_object('run',to_jsonb(r)-'snapshot','calculation',demo,'employees',r.snapshot->'employees','packages',r.snapshot->'packages'),'Generating',auth.uid())
 on conflict(seed_run_id) do nothing;
 select * into b from payroll_scenario_private.output_batches where seed_run_id=r.seed_run_id for update;
 if b.status='Released' then return payroll_scenario_private.completion_state(r.seed_run_id);end if;
 if b.snapshot_hash<>hash then raise exception 'The frozen payroll snapshot differs from the current calculation. Review the saved output batch before continuing.';end if;
 begin
  employee_count:=jsonb_array_length(coalesce(b.frozen_snapshot->'employees','[]'::jsonb));
  for e in select value from jsonb_array_elements(b.frozen_snapshot#>'{calculation,comparisonNet,employees}') loop
   select value into employee from jsonb_array_elements(b.frozen_snapshot->'employees') where value->>'id'=e->>'employeeId';
   select value into gross_row from jsonb_array_elements(b.frozen_snapshot#>'{calculation,comparisonGross,employees}') where value->>'employeeId'=e->>'employeeId';
   insert into payroll_scenario_private.outputs(seed_run_id,output_key,output_type,employee_id,status,payload,error_message,generated_at)
   values(r.seed_run_id,'payslip:'||(e->>'employeeId'),'payslip',(e->>'employeeId')::uuid,'Ready',jsonb_build_object('test',true,'employeeName',employee->>'name','employeeCode',employee->>'code','businessUnit','Bakebe – SM Aura','from',r.date_from,'to',r.date_to,'payDate',r.pay_date,'gross',e->>'gross','deductions',e->>'deductions','net',e->>'net','tax',e->>'tax','lines',coalesce(gross_row->'lines','[]'::jsonb),'privateUntilRelease',true),null,clock_timestamp())
   on conflict(seed_run_id,output_key) do update set status='Ready',payload=excluded.payload,error_message=null,generated_at=clock_timestamp(),released_at=null;
  end loop;
  foreach code in array array['SSS_R3','PHILHEALTH_RF1','PAGIBIG_MCRF','BIR_2316'] loop
   report_name:=case code when 'SSS_R3' then 'SSS R3' when 'PHILHEALTH_RF1' then 'PhilHealth RF-1' when 'PAGIBIG_MCRF' then 'Pag-IBIG MCRF' else 'BIR 2316' end;
   insert into payroll_scenario_private.outputs(seed_run_id,output_key,output_type,report_code,status,payload,error_message,generated_at)
   values(r.seed_run_id,'report:'||code,'government_report',code,'Ready',jsonb_build_object('test',true,'code',code,'name',report_name,'businessUnit','Bakebe – SM Aura','from',r.date_from,'to',r.date_to,'payDate',r.pay_date,'employeeCount',employee_count,'gross',b.frozen_snapshot#>>'{calculation,comparisonNet,gross}','net',b.frozen_snapshot#>>'{calculation,comparisonNet,net}','submissionStatus','Prepared for review and export only; not submitted to the government.'),null,clock_timestamp())
   on conflict(seed_run_id,output_key) do update set status='Ready',payload=excluded.payload,error_message=null,generated_at=clock_timestamp(),released_at=null;
  end loop;
  update payroll_scenario_private.output_batches set status='Ready',failure_message=null,generated_by=auth.uid(),generated_at=clock_timestamp(),updated_at=clock_timestamp() where seed_run_id=r.seed_run_id;
  insert into payroll_scenario_private.completion_audit(seed_run_id,actor_id,action,detail) values(r.seed_run_id,auth.uid(),'GENERATE_OUTPUTS',jsonb_build_object('snapshotHash',hash,'payslips',employee_count,'reports',4));
 exception when others then
  update payroll_scenario_private.output_batches set status='Failed',failure_message=left(sqlerrm,500),updated_at=clock_timestamp() where seed_run_id=r.seed_run_id;
  insert into payroll_scenario_private.completion_audit(seed_run_id,actor_id,action,detail) values(r.seed_run_id,auth.uid(),'GENERATION_FAILED',jsonb_build_object('reason',left(sqlerrm,500)));
 end;
 return payroll_scenario_private.completion_state(r.seed_run_id);
end $$;
revoke all on function public.generate_test_payroll_outputs(uuid,date,date) from public,anon,authenticated;
grant execute on function public.generate_test_payroll_outputs(uuid,date,date) to authenticated;

create function public.start_test_payroll_approval(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r payroll_scenario_private.runs;b payroll_scenario_private.output_batches;
begin
 if not coalesce(private.payroll_gross_permission(p_scope,'prepare') or private.payroll_gross_permission(p_scope,'rules') or private.payroll_has_access('manage_access',p_scope),false) then raise exception 'Scoped payroll preparation access required' using errcode='42501';end if;
 select * into strict r from payroll_scenario_private.runs where scope_id=p_scope and date_from=p_from and date_to=p_to and is_test;
 select * into strict b from payroll_scenario_private.output_batches where seed_run_id=r.seed_run_id and status='Ready';
 if payroll_scenario_private.unresolved_count(r.seed_run_id)<>0 then raise exception 'Resolve all issues before continuing to approval';end if;
 if not exists(select 1 from payroll_scenario_private.completion_audit x where x.seed_run_id=r.seed_run_id and x.action='START_APPROVAL') then
  insert into payroll_scenario_private.completion_audit(seed_run_id,actor_id,action,detail) values(r.seed_run_id,auth.uid(),'START_APPROVAL',jsonb_build_object('snapshotHash',b.snapshot_hash));
 end if;
 return payroll_scenario_private.completion_state(r.seed_run_id);
end $$;
revoke all on function public.start_test_payroll_approval(uuid,date,date) from public,anon,authenticated;
grant execute on function public.start_test_payroll_approval(uuid,date,date) to authenticated;

create function public.act_test_payroll_completion(p_scope uuid,p_from date,p_to date,p_step integer,p_action text,p_reason text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r payroll_scenario_private.runs;b payroll_scenario_private.output_batches;current_step integer;prior payroll_scenario_private.completion_approvals;new_status text;
begin
 select * into strict r from payroll_scenario_private.runs where scope_id=p_scope and date_from=p_from and date_to=p_to and is_test;
 select * into strict b from payroll_scenario_private.output_batches where seed_run_id=r.seed_run_id and status='Ready';
 if not exists(select 1 from payroll_scenario_private.completion_audit x where x.seed_run_id=r.seed_run_id and x.action='START_APPROVAL') then raise exception 'Continue to approval before recording a decision';end if;
 perform pg_advisory_xact_lock(hashtextextended('test-payroll-completion:'||r.seed_run_id,0));
 select min(x) into current_step from generate_series(1,6) x where not exists(select 1 from payroll_scenario_private.completion_approvals a where a.seed_run_id=r.seed_run_id and a.step=x and a.status='Approved');
 if current_step is null or p_step<>current_step or not payroll_scenario_private.completion_role(p_step,p_scope) then raise exception 'This approval stage is not currently available to your authorized role' using errcode='42501';end if;
 if p_action not in ('approve','reject') then raise exception 'Choose approve or reject';end if;
 if p_action='reject' and length(btrim(coalesce(p_reason,'')))<3 then raise exception 'A rejection reason is required';end if;
 select * into prior from payroll_scenario_private.completion_approvals where seed_run_id=r.seed_run_id and step=p_step;
 new_status:=case when p_action='approve' then 'Approved' else 'Rejected' end;
 insert into payroll_scenario_private.completion_approvals(seed_run_id,step,status,actor_id,reason) values(r.seed_run_id,p_step,new_status,auth.uid(),nullif(btrim(p_reason),''))
 on conflict(seed_run_id,step) do update set status=excluded.status,actor_id=excluded.actor_id,reason=excluded.reason,occurred_at=clock_timestamp();
 insert into payroll_scenario_private.completion_audit(seed_run_id,actor_id,action,detail) values(r.seed_run_id,auth.uid(),upper(p_action)||'_STEP',jsonb_build_object('step',p_step,'previousStatus',prior.status,'reason',p_reason));
 return payroll_scenario_private.completion_state(r.seed_run_id);
end $$;
revoke all on function public.act_test_payroll_completion(uuid,date,date,integer,text,text) from public,anon,authenticated;
grant execute on function public.act_test_payroll_completion(uuid,date,date,integer,text,text) to authenticated;

create function public.release_test_payroll_outputs(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r payroll_scenario_private.runs;b payroll_scenario_private.output_batches;
begin
 if not coalesce(private.payroll_gross_permission(p_scope,'prepare') or private.payroll_has_access('manage_access',p_scope),false) then raise exception 'Scoped payroll release access required' using errcode='42501';end if;
 select * into strict r from payroll_scenario_private.runs where scope_id=p_scope and date_from=p_from and date_to=p_to and is_test;
 perform pg_advisory_xact_lock(hashtextextended('test-payroll-completion:'||r.seed_run_id,0));
 select * into strict b from payroll_scenario_private.output_batches where seed_run_id=r.seed_run_id for update;
 if b.status='Released' then return payroll_scenario_private.completion_state(r.seed_run_id);end if;
 if b.status<>'Ready' or payroll_scenario_private.unresolved_count(r.seed_run_id)<>0 or exists(select 1 from generate_series(1,6) x where not exists(select 1 from payroll_scenario_private.completion_approvals a where a.seed_run_id=r.seed_run_id and a.step=x and a.status='Approved')) then raise exception 'Outputs, attendance, approvals, and test payment-release confirmation must all be complete before release';end if;
 update payroll_scenario_private.output_batches set status='Released',released_by=auth.uid(),released_at=clock_timestamp(),updated_at=clock_timestamp() where seed_run_id=r.seed_run_id;
 update payroll_scenario_private.outputs set status='Released',released_at=clock_timestamp() where seed_run_id=r.seed_run_id and status='Ready';
 insert into payroll_scenario_private.completion_audit(seed_run_id,actor_id,action,detail) values(r.seed_run_id,auth.uid(),'RELEASE_AND_DISTRIBUTE',jsonb_build_object('testOnly',true,'officialPaymentChanged',false));
 return payroll_scenario_private.completion_state(r.seed_run_id);
end $$;
revoke all on function public.release_test_payroll_outputs(uuid,date,date) from public,anon,authenticated;
grant execute on function public.release_test_payroll_outputs(uuid,date,date) to authenticated;

create function public.list_my_released_test_payslips() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();begin
 if actor is null then raise exception 'Active HRIS login required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'test',true,'payload',o.payload,'releasedAt',o.released_at) order by o.released_at desc),'[]') from payroll_scenario_private.outputs o join payroll_scenario_private.output_batches b on b.seed_run_id=o.seed_run_id where o.output_type='payslip' and o.employee_id=actor and o.status='Released' and b.status='Released');
end $$;
revoke all on function public.list_my_released_test_payslips() from public,anon,authenticated;
grant execute on function public.list_my_released_test_payslips() to authenticated;

create function public.get_my_released_test_payslip(p_output uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();payload jsonb;begin
 if actor is null then raise exception 'Active HRIS login required' using errcode='42501';end if;
 select o.payload||jsonb_build_object('id',o.id,'releasedAt',o.released_at) into payload from payroll_scenario_private.outputs o join payroll_scenario_private.output_batches b on b.seed_run_id=o.seed_run_id where o.id=p_output and o.output_type='payslip' and o.employee_id=actor and o.status='Released' and b.status='Released';
 if payload is null then raise exception 'Released test payslip unavailable for this account' using errcode='42501';end if;
 return payload;
end $$;
revoke all on function public.get_my_released_test_payslip(uuid) from public,anon,authenticated;
grant execute on function public.get_my_released_test_payslip(uuid) to authenticated;

create function payroll_scenario_private.lock_frozen_corrections() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from payroll_scenario_private.output_batches b where b.seed_run_id=new.seed_run_id) then raise exception 'Payroll snapshot is frozen. Attendance corrections are locked after output generation.';end if;
 return new;
end $$;
revoke all on function payroll_scenario_private.lock_frozen_corrections() from public,anon,authenticated;
create trigger lock_test_payroll_corrections before insert or update on payroll_scenario_private.corrections for each row execute function payroll_scenario_private.lock_frozen_corrections();

notify pgrst,'reload schema';
