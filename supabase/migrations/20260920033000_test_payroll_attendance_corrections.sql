-- Corrections remain inside the isolated payroll scenario schema. They never update
-- official punches, schedules, leave, approvals, balances, or payment records.
create table payroll_scenario_private.corrections (
 seed_run_id text not null references payroll_scenario_private.runs(seed_run_id),
 employee_id uuid not null,
 work_date date not null,
 issue_type text not null,
 original_value jsonb not null,
 corrected_value jsonb not null,
 reason text not null check(length(btrim(reason)) >= 3),
 status text not null check(status in ('Saved','Pending approval','Approved','Rejected','Ready after correction','Recalculation failed')),
 created_by uuid,
 created_at timestamptz not null default clock_timestamp(),
 updated_by uuid,
 updated_at timestamptz not null default clock_timestamp(),
 approved_by uuid,
 approved_at timestamptz,
 recalculated_at timestamptz,
 failure_message text,
 primary key(seed_run_id,employee_id,work_date)
);
alter table payroll_scenario_private.corrections enable row level security;
revoke all on payroll_scenario_private.corrections from public,anon,authenticated;

create table payroll_scenario_private.correction_audit (
 id uuid primary key default gen_random_uuid(),
 seed_run_id text not null references payroll_scenario_private.runs(seed_run_id),
 employee_id uuid not null,
 work_date date not null,
 actor_id uuid,
 action text not null,
 previous_value jsonb,
 new_value jsonb,
 reason text,
 created_at timestamptz not null default clock_timestamp()
);
alter table payroll_scenario_private.correction_audit enable row level security;
revoke all on payroll_scenario_private.correction_audit from public,anon,authenticated;

create function payroll_scenario_private.effective_source(p_seed text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r payroll_scenario_private.runs; src jsonb; c payroll_scenario_private.corrections; v jsonb; arr jsonb; ev jsonb; shift_row jsonb;
begin
 select * into strict r from payroll_scenario_private.runs where seed_run_id=p_seed and is_test;
 src:=r.snapshot->'source';
 for c in select * from payroll_scenario_private.corrections where seed_run_id=p_seed and status in ('Saved','Approved','Ready after correction') order by work_date,employee_id loop
  v:=c.corrected_value;
  select value into shift_row from jsonb_array_elements(src->'shifts') where value->>'employeeId'=c.employee_id::text and value->>'date'=c.work_date::text limit 1;
  select coalesce(jsonb_agg(value),'[]'::jsonb) into arr from jsonb_array_elements(src->'events')
   where not (value->>'employeeId'=c.employee_id::text and ((value->>'timestamp')::timestamptz at time zone 'Asia/Manila')::date=c.work_date);
  foreach ev in array array[
   jsonb_build_object('type','CLOCK_IN','time',v->>'clockIn'),
   jsonb_build_object('type','START_BREAK','time',v->>'breakStart'),
   jsonb_build_object('type','END_BREAK','time',v->>'breakEnd'),
   jsonb_build_object('type','CLOCK_OUT','time',v->>'clockOut')
  ] loop
   if nullif(ev->>'time','') is not null then
    arr:=arr||jsonb_build_array(jsonb_build_object('id','correction:'||p_seed||':'||c.employee_id||':'||c.work_date||':'||(ev->>'type'),'employeeId',c.employee_id,'timestamp',c.work_date||'T'||(ev->>'time')||':00+08:00','type',ev->>'type','source','Saved isolated test correction','isTest',true));
   end if;
  end loop;
  src:=jsonb_set(src,'{events}',arr);
  if nullif(v->>'scheduleKind','') is not null then
   select coalesce(jsonb_agg(value),'[]'::jsonb) into arr from jsonb_array_elements(src->'shifts') where not (value->>'employeeId'=c.employee_id::text and value->>'date'=c.work_date::text);
   shift_row:=coalesce(shift_row,'{}'::jsonb)||jsonb_build_object('id','correction:'||p_seed||':'||c.employee_id||':'||c.work_date||':shift','employeeId',c.employee_id,'date',c.work_date,'kind',v->>'scheduleKind','name',case when v->>'scheduleKind'='rest' then 'Rest Day' else 'Corrected test schedule' end,'published',true,'publicationStatus','Published for test only','start',coalesce(nullif(v->>'scheduleStart',''),'09:00'),'end',coalesce(nullif(v->>'scheduleEnd',''),'18:00'),'endDayOffset',0,'breakMinutes',60,'paidMinutes',480,'flexible',false);
   src:=jsonb_set(src,'{shifts}',arr||jsonb_build_array(shift_row));
  end if;
 end loop;
 return src;
end $$;
revoke all on function payroll_scenario_private.effective_source(text) from public,anon,authenticated;

create function payroll_scenario_private.correction_snapshot(p_seed text,p_employee uuid,p_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r payroll_scenario_private.runs; shift_row jsonb; events jsonb;
begin
 select * into strict r from payroll_scenario_private.runs where seed_run_id=p_seed and is_test;
 select value into shift_row from jsonb_array_elements(r.snapshot#>'{source,shifts}') where value->>'employeeId'=p_employee::text and value->>'date'=p_date::text limit 1;
 select coalesce(jsonb_object_agg(case value->>'type' when 'CLOCK_IN' then 'clockIn' when 'START_BREAK' then 'breakStart' when 'END_BREAK' then 'breakEnd' when 'CLOCK_OUT' then 'clockOut' end,to_char((value->>'timestamp')::timestamptz at time zone 'Asia/Manila','HH24:MI')) filter(where value->>'type' in ('CLOCK_IN','START_BREAK','END_BREAK','CLOCK_OUT')),'{}'::jsonb) into events
 from jsonb_array_elements(r.snapshot#>'{source,events}') where value->>'employeeId'=p_employee::text and ((value->>'timestamp')::timestamptz at time zone 'Asia/Manila')::date=p_date;
 return events||jsonb_build_object('scheduleKind',coalesce(shift_row->>'kind',''),'scheduleStart',coalesce(shift_row->>'start',''),'scheduleEnd',coalesce(shift_row->>'end',''));
end $$;
revoke all on function payroll_scenario_private.correction_snapshot(text,uuid,date) from public,anon,authenticated;

create function public.save_test_payroll_correction(p_scope uuid,p_from date,p_to date,p_employee uuid,p_date date,p_issue text,p_values jsonb,p_reason text,p_submit_for_approval boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r payroll_scenario_private.runs; old payroll_scenario_private.corrections; original jsonb; saved payroll_scenario_private.corrections; new_status text;
begin
 if not coalesce(private.payroll_gross_permission(p_scope,'prepare') or private.payroll_gross_permission(p_scope,'rules') or private.payroll_has_access('manage_access',p_scope),false) then raise exception 'Scoped payroll correction access required' using errcode='42501';end if;
 select * into strict r from payroll_scenario_private.runs where scope_id=p_scope and date_from=p_from and date_to=p_to and is_test for update;
 if p_date<r.date_from or p_date>r.date_to then raise exception 'Correction date is outside this payroll period';end if;
 if not exists(select 1 from jsonb_array_elements(r.snapshot->'employees') e where (e->>'id')::uuid=p_employee) then raise exception 'Employee is not included in this test run';end if;
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Correction reason is required';end if;
 if not coalesce(private.payroll_package_permission(p_employee,p_scope,'view'),false) then raise exception 'Employee compensation access required' using errcode='42501';end if;
 original:=payroll_scenario_private.correction_snapshot(r.seed_run_id,p_employee,p_date);
 select * into old from payroll_scenario_private.corrections where seed_run_id=r.seed_run_id and employee_id=p_employee and work_date=p_date;
 new_status:=case when p_submit_for_approval then 'Pending approval' else 'Saved' end;
 insert into payroll_scenario_private.corrections(seed_run_id,employee_id,work_date,issue_type,original_value,corrected_value,reason,status,created_by,updated_by)
 values(r.seed_run_id,p_employee,p_date,coalesce(nullif(btrim(p_issue),''),'Attendance issue'),original,p_values,btrim(p_reason),new_status,auth.uid(),auth.uid())
 on conflict(seed_run_id,employee_id,work_date) do update set issue_type=excluded.issue_type,corrected_value=excluded.corrected_value,reason=excluded.reason,status=excluded.status,updated_by=auth.uid(),updated_at=clock_timestamp(),approved_by=null,approved_at=null,recalculated_at=null,failure_message=null
 returning * into saved;
 insert into payroll_scenario_private.correction_audit(seed_run_id,employee_id,work_date,actor_id,action,previous_value,new_value,reason) values(r.seed_run_id,p_employee,p_date,auth.uid(),case when p_submit_for_approval then 'SUBMIT_FOR_APPROVAL' else 'SAVE' end,to_jsonb(old),to_jsonb(saved),btrim(p_reason));
 return to_jsonb(saved)-array['created_by','updated_by','approved_by'];
end $$;
revoke all on function public.save_test_payroll_correction(uuid,date,date,uuid,date,text,jsonb,text,boolean) from public,anon;
grant execute on function public.save_test_payroll_correction(uuid,date,date,uuid,date,text,jsonb,text,boolean) to authenticated;

create function public.approve_test_payroll_correction(p_scope uuid,p_from date,p_to date,p_employee uuid,p_date date,p_reason text default 'Approved for isolated test payroll') returns jsonb
language plpgsql security definer set search_path='' as $$
declare r payroll_scenario_private.runs; old payroll_scenario_private.corrections; saved payroll_scenario_private.corrections;
begin
 if not coalesce(private.payroll_gross_permission(p_scope,'rules') or private.payroll_has_access('manage_access',p_scope),false) then raise exception 'Payroll rule or administration access required to approve' using errcode='42501';end if;
 select * into strict r from payroll_scenario_private.runs where scope_id=p_scope and date_from=p_from and date_to=p_to and is_test;
 select * into strict old from payroll_scenario_private.corrections where seed_run_id=r.seed_run_id and employee_id=p_employee and work_date=p_date and status='Pending approval' for update;
 update payroll_scenario_private.corrections set status='Approved',approved_by=auth.uid(),approved_at=clock_timestamp(),updated_by=auth.uid(),updated_at=clock_timestamp(),failure_message=null where seed_run_id=r.seed_run_id and employee_id=p_employee and work_date=p_date returning * into saved;
 insert into payroll_scenario_private.correction_audit(seed_run_id,employee_id,work_date,actor_id,action,previous_value,new_value,reason) values(r.seed_run_id,p_employee,p_date,auth.uid(),'APPROVE',to_jsonb(old),to_jsonb(saved),p_reason);
 return to_jsonb(saved)-array['created_by','updated_by','approved_by'];
end $$;
revoke all on function public.approve_test_payroll_correction(uuid,date,date,uuid,date,text) from public,anon;
grant execute on function public.approve_test_payroll_correction(uuid,date,date,uuid,date,text) to authenticated;

create function public.mark_test_payroll_recalculation_failed(p_scope uuid,p_from date,p_to date,p_employee uuid,p_date date,p_message text) returns void
language plpgsql security definer set search_path='' as $$
declare r payroll_scenario_private.runs; old payroll_scenario_private.corrections; saved payroll_scenario_private.corrections;
begin
 if not coalesce(private.payroll_gross_permission(p_scope,'prepare') or private.payroll_gross_permission(p_scope,'rules') or private.payroll_has_access('manage_access',p_scope),false) then raise exception 'Scoped payroll correction access required' using errcode='42501';end if;
 select * into strict r from payroll_scenario_private.runs where scope_id=p_scope and date_from=p_from and date_to=p_to and is_test;
 select * into strict old from payroll_scenario_private.corrections where seed_run_id=r.seed_run_id and employee_id=p_employee and work_date=p_date for update;
 update payroll_scenario_private.corrections set status='Recalculation failed',failure_message=left(coalesce(p_message,'Recalculation failed'),500),updated_at=clock_timestamp() where seed_run_id=r.seed_run_id and employee_id=p_employee and work_date=p_date returning * into saved;
 insert into payroll_scenario_private.correction_audit(seed_run_id,employee_id,work_date,actor_id,action,previous_value,new_value,reason) values(r.seed_run_id,p_employee,p_date,auth.uid(),'RECALCULATION_FAILED',to_jsonb(old),to_jsonb(saved),left(coalesce(p_message,'Recalculation failed'),500));
end $$;
revoke all on function public.mark_test_payroll_recalculation_failed(uuid,date,date,uuid,date,text) from public,anon;
grant execute on function public.mark_test_payroll_recalculation_failed(uuid,date,date,uuid,date,text) to authenticated;

do $$ declare ddl text;begin
 ddl:=pg_get_functiondef('payroll_scenario_private.calculate_mock_run(text)'::regprocedure);
 ddl:=replace(ddl,'''authorized-demo-v2'',r.snapshot->''source'',r.snapshot->''packages''','''authorized-demo-v3'',payroll_scenario_private.effective_source(p_seed),r.snapshot->''packages''');
 ddl:=replace(ddl,'src:=r.snapshot->''source'';','src:=payroll_scenario_private.effective_source(p_seed);');
 ddl:=replace(ddl,'''version'',''authorized-demo-v2''','''version'',''authorized-demo-v3''');
 ddl:=replace(ddl,'update payroll_scenario_private.runs set snapshot=snapshot||jsonb_build_object(''demo'',result) where seed_run_id=p_seed;','update payroll_scenario_private.runs set snapshot=snapshot||jsonb_build_object(''demo'',result) where seed_run_id=p_seed; update payroll_scenario_private.corrections set status=''Ready after correction'',recalculated_at=clock_timestamp(),failure_message=null where seed_run_id=p_seed and status in (''Saved'',''Approved'');');
 execute ddl;
end $$;

create or replace function public.get_payroll_scenario_run(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r payroll_scenario_private.runs; e jsonb; corrections jsonb; audit jsonb;
begin
 if not coalesce(private.payroll_gross_permission(p_scope,'view'),false) then raise exception 'Scoped payroll and compensation access required' using errcode='42501';end if;
 select * into r from payroll_scenario_private.runs where scope_id=p_scope and date_from=p_from and date_to=p_to;
 if not found then return null;end if;
 for e in select value from jsonb_array_elements(r.snapshot->'employees') loop
  if not coalesce(private.payroll_package_permission((e->>'id')::uuid,p_scope,'view'),false) then raise exception 'Employee compensation access required' using errcode='42501';end if;
 end loop;
 select coalesce(jsonb_agg(to_jsonb(c)-array['created_by','updated_by','approved_by'] order by c.work_date,c.employee_id),'[]') into corrections from payroll_scenario_private.corrections c where c.seed_run_id=r.seed_run_id;
 select coalesce(jsonb_agg(jsonb_build_object('employeeId',a.employee_id,'workDate',a.work_date,'action',a.action,'reason',a.reason,'createdAt',a.created_at) order by a.created_at desc),'[]') into audit from payroll_scenario_private.correction_audit a where a.seed_run_id=r.seed_run_id;
 return to_jsonb(r)||jsonb_build_object('snapshot',r.snapshot-array['initialSnapshot','beforeMockSnapshot'],'corrections',corrections,'correctionAudit',audit,'canCalculateTest',coalesce(private.payroll_gross_permission(p_scope,'prepare') or private.payroll_gross_permission(p_scope,'rules') or private.payroll_has_access('manage_access',p_scope),false),'canApproveTestCorrections',coalesce(private.payroll_gross_permission(p_scope,'rules') or private.payroll_has_access('manage_access',p_scope),false));
end $$;
revoke all on function public.get_payroll_scenario_run(uuid,date,date) from public,anon;
grant execute on function public.get_payroll_scenario_run(uuid,date,date) to authenticated;

notify pgrst,'reload schema';
