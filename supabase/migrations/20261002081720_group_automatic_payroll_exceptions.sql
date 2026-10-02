-- Combine all missing-record reasons under each employee.
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
 select coalesce(jsonb_agg(jsonb_build_object('employeeId',z.employee_id,'employeeName',z.employee_name,'items',z.items) order by z.employee_name),'[]') into issues from (select x->>'employeeId' employee_id,max(x->>'employeeName') employee_name,jsonb_agg(distinct item) items from jsonb_array_elements(issues) x cross join lateral jsonb_array_elements(x->'items') item group by x->>'employeeId') z;
 prepared:=jsonb_set(prepared,'{inputs,employees}',rows)||jsonb_build_object('issues',issues,'ready',jsonb_array_length(issues)=0);
 return prepared;
end $$;
revoke all on function public.get_automatic_payroll_inputs(uuid) from public,anon;
grant execute on function public.get_automatic_payroll_inputs(uuid) to authenticated;


