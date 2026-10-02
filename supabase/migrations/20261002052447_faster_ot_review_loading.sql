-- Keep live routing and version checks for pending decisions; history is read-only.
CREATE OR REPLACE FUNCTION public.get_ot_week_review(p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g record;rows jsonb;summary jsonb;outcome jsonb:='[]';actor uuid:=public.current_hris_user_id();r public.ot_requests;entry jsonb;blocked text; global_access boolean; manager_name text; needs_routing boolean; historical jsonb; threshold integer;
begin
 if auth.uid() is null or cardinality(p_ids)>500 then raise exception 'Authenticated review of up to 500 requests required.' using errcode='42501';end if;
 global_access:=coalesce((private.ot_reporting_scope()->>'global')::boolean,false);
 threshold:=round(coalesce((private.conditional_time_approval_config()->>'weekly_total_hours')::numeric,50)*60)::integer;
 for g in select distinct employee_id,date_trunc('week',date)::date week_start from public.ot_requests where id=any(p_ids) and (global_access or employee_id=actor or private.can_read_ot_report(employee_id,business_unit_id) or private.is_active_time_request_approver(actor,'overtime',id)) loop
  -- Final decisions do not need seven schedule rebuilds just to display history.
  select exists(select 1 from public.ot_requests q where q.employee_id=g.employee_id and q.date between g.week_start and g.week_start+6
   and (q.status::text in('Submitted','PendingGM','PendingBOD') or(q.status::text='Approved' and q.final_approved_minutes is null and q.approved_hours is null))) into needs_routing;
  if needs_routing then summary:=private.ot_week_summary(g.employee_id,g.week_start);
  else
   select approval_context into historical from public.ot_requests q where q.employee_id=g.employee_id and q.date between g.week_start and g.week_start+6 and q.status::text='Approved' order by q.approved_at desc nulls last,q.id limit 1;
   select jsonb_build_object('weekStart',g.week_start,'weekEnd',g.week_start+6,'reviewOnly',true,
    'regularMinutes',historical->'regularMinutes','approvedMinutes',coalesce(sum(coalesce(q.final_approved_minutes,round(q.approved_hours*60)::integer))filter(where q.status::text='Approved'),0),
    'reviewedMinutes',0,'unreviewedMinutes',0,'projectedMinutes',null,'thresholdMinutes',threshold,
    'baselineSource','Saved final approvals','baselineMissing',false,'quantitiesMissing',false,'requiresBod',false)
   into summary from public.ot_requests q where q.employee_id=g.employee_id and q.date between g.week_start and g.week_start+6;
  end if;
  select full_name into manager_name from public.hris_users where id=private.resolve_ot_manager(g.employee_id);
  rows:='[]';
  for r in select * from public.ot_requests where employee_id=g.employee_id and date between g.week_start and g.week_start+6 and (global_access or employee_id=actor or private.can_read_ot_report(employee_id,business_unit_id) or private.is_active_time_request_approver(actor,'overtime',id)) order by date,start_time,id loop
   blocked:=private.ot_review_problem(r);
   entry:=to_jsonb(r)||jsonb_build_object('requestedMinutes',private.ot_requested_minutes(r),'reviewedMinutes',coalesce(r.manager_confirmed_minutes,case when r.status::text='PendingBOD' then round(r.approved_hours*60)::integer end),'finalMinutes',coalesce(r.final_approved_minutes,case when r.status::text='Approved' then round(r.approved_hours*60)::integer end),'canDecide',case when r.status::text in('Submitted','PendingGM','PendingBOD') then private.ot_can_decide(r) else false end,'blocked',blocked,'canSend',case when r.status::text in('Submitted','PendingGM','Draft') or (r.status::text='Approved' and r.final_approved_minutes is null and r.approved_hours is null) then private.can_send_payroll_ot(r) else false end,'managerName',manager_name,'handoff',(select jsonb_build_object('state',h.state,'note',h.note,'returnNote',h.return_note,'senderName',u.full_name) from private.payroll_ot_handoffs h join public.hris_users u on u.id=h.sender_id where h.request_id=r.id));
   rows:=rows||jsonb_build_array(entry);
  end loop;
  outcome:=outcome||jsonb_build_array(jsonb_build_object('employeeId',g.employee_id,'employee',(select jsonb_build_object('name',u.full_name,'position',u.position,'businessUnit',b.name,'businessUnitId',u.business_unit_id) from public.hris_users u left join public.business_units b on b.id=u.business_unit_id where u.id=g.employee_id),'summary',summary,'requests',rows,'version',md5(rows::text||summary::text),'canConfirmBaseline',case when needs_routing then actor<>g.employee_id and private.is_business_unit_ot_manager(actor,g.employee_id) else false end));
 end loop;
 return outcome;
end $function$
;
revoke all on function public.get_ot_week_review(uuid[]) from public,anon;
grant execute on function public.get_ot_week_review(uuid[]) to authenticated;
