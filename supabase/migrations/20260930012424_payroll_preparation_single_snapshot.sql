-- One server snapshot for Prepare; unchanged permission and calculation rules.
CREATE OR REPLACE FUNCTION public.preview_payroll_time(p_scope_id uuid, p_date_from date, p_date_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare review jsonb;enriched jsonb;begin
 if not private.payroll_time_permission(p_scope_id,'view') then raise exception 'A scoped timekeeping/payroll duty and existing Timekeeping access are required.' using errcode='42501';end if;
 review:=private.payroll_time_review(p_scope_id,p_date_from,p_date_to);review:=review||jsonb_build_object('result',private.payroll_time_evidence(review->'result',review->'source'));
 -- Evaluate compensation access once per employee, not once per cutoff day.
 with employee_days as materialized (
  select (r->>'employeeId')::uuid employee_id,min((r->>'date')::date) first_day
  from jsonb_array_elements(review#>'{result,rows}') r group by 1
 ), employee_pay as materialized (
  select e.employee_id,e.first_day,
   private.payroll_package_permission(e.employee_id,p_scope_id,'view') and not exists(
    select 1 from public.payroll_pay_packages p where p.employee_id=e.employee_id and p.scope_id=p_scope_id
     and p.stream='employee_payroll' and p.status='approved' and p.effective_from<=e.first_day
   ) missing_pay from employee_days e
 )
 select coalesce(jsonb_agg(r||jsonb_build_object('employeeCode',h.employee_id,
  'issues',(select coalesce(jsonb_agg(to_jsonb(case when issue='Employee profile information incomplete' then 'Timekeeping setup needed — employment start date missing' else issue end)),'[]'::jsonb)
    from jsonb_array_elements_text(coalesce(r->'issues','[]')) issue)
    ||case when e.missing_pay and (r->>'date')::date=e.first_day then jsonb_build_array('Approved salary source missing') else '[]'::jsonb end,
  'ready',coalesce((r->>'ready')::boolean,false) and not (e.missing_pay and (r->>'date')::date=e.first_day)) order by r->>'employeeName',r->>'date'),'[]'::jsonb) into enriched
 from jsonb_array_elements(review#>'{result,rows}') r
 join employee_pay e on e.employee_id=(r->>'employeeId')::uuid
 join public.hris_users h on h.id=e.employee_id;
 review:=jsonb_set(review,'{result,rows}',enriched);review:=jsonb_set(review,'{result,blockedDays}',to_jsonb((select count(*) from jsonb_array_elements(enriched) as item(value) where not (item.value->>'ready')::boolean)));
 return (review-'source')||jsonb_build_object('holidays',review#>'{source,holidays}','rules',review#>'{source,rules}','templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'start',t.start_time,'end',t.end_time) order by t.name) from public.shift_templates t join public.payroll_access_scopes s on (s.business_unit_id=t.business_unit_id or t.business_unit_id is null) where s.id=p_scope_id and private.schedule_preset_visible(t.created_by)),'[]'),'packages',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'status',p.status,'createdAt',p.created_at,'submittedAt',p.submitted_at,'reason',p.reason,'previousId',p.previous_id,'current',p.source_hash=review->>'sourceHash','blockedDays',p.result->'blockedDays') order by p.version desc) from public.payroll_time_packages p where p.scope_id=p_scope_id and p.date_from=p_date_from and p.date_to=p_date_to),'[]'));
end $function$;

CREATE OR REPLACE FUNCTION payroll_workspace_private.readiness_from_preview(p_scope uuid, p_from date, p_to date, v jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rows jsonb; result jsonb; pay_visible boolean; published_days integer; saved_pay integer; reviewed_pay integer;
begin
 if auth.uid() is null or not private.payroll_time_permission(p_scope,'view') then
 raise exception 'A scoped payroll duty and Timekeeping view permission are required.' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 then raise exception 'Select a cutoff of 1–31 days.' using errcode='22023'; end if;
 rows:=coalesce(v#>'{result,rows}','[]');
 select coalesce(bool_and(private.payroll_package_permission(e.id,p_scope,'view')),false)
 into pay_visible from (select distinct (x->>'employeeId')::uuid id from jsonb_array_elements(rows) x) e;
 select count(*) into published_days from jsonb_array_elements(rows) x
 where exists(select 1 from public.payroll_schedule_publications p where p.employee_id=(x->>'employeeId')::uuid
 and (x->>'date')::date between p.effective_from and p.effective_to
 and (not p.approval_required or exists(select 1 from public.payroll_schedule_overrides o where o.publication_id=p.id and o.decision='approve'))
 and p.version=(select max(n.version) from public.payroll_schedule_publications n where n.employee_id=p.employee_id and n.effective_from=p.effective_from and (not n.approval_required or exists(select 1 from public.payroll_schedule_overrides o where o.publication_id=n.id and o.decision='approve')))
 and exists(select 1 from jsonb_array_elements(p.snapshot) e where e->>'date'=x->>'date'));
 if pay_visible then
 with employees as (select (x->>'employeeId')::uuid id,min((x->>'date')::date) first_day from jsonb_array_elements(rows) x group by 1)
 select count(*) filter(where exists(select 1 from public.payroll_pay_packages p where p.employee_id=e.id and p.scope_id=p_scope and p.stream='employee_payroll' and p.effective_from<=p_to and p.status in ('draft','approved'))),
 count(*) filter(where exists(select 1 from public.payroll_pay_packages p where p.employee_id=e.id and p.scope_id=p_scope and p.stream='employee_payroll' and p.status='approved' and p.effective_from<=e.first_day))
 into saved_pay,reviewed_pay from employees e;
 end if;
 select jsonb_build_object('employees',(select count(distinct x->>'employeeId') from jsonb_array_elements(rows) x),
 'totalDays',v#>'{result,totalDays}','blockedDays',v#>'{result,blockedDays}',
 'publishedDays',published_days,'payVisible',pay_visible,'savedPayEmployees',saved_pay,'reviewedPayEmployees',reviewed_pay,
 'savedVersions',(select count(*) from jsonb_array_elements(coalesce(v->'packages','[]')) p),
 'submittedVersions',(select count(*) from jsonb_array_elements(coalesce(v->'packages','[]')) p where p->>'status'='submitted' and (p->>'current')::boolean),
 'issues',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from (select issue,count(*) as days from jsonb_array_elements(rows) x cross join lateral jsonb_array_elements_text(coalesce(x->'issues','[]')) issue group by issue order by count(*) desc limit 10) i),
 'mode',(select processing_mode from public.payroll_access_scopes where id=p_scope),
 'canFinalize',private.payroll_time_permission(p_scope,'finalize'),'checkedAt',statement_timestamp()) into result;
 return result;
end $function$;


-- Internal helper accepts only a server-built preview. Never expose caller-supplied readiness evidence.
revoke all on function payroll_workspace_private.readiness_from_preview(uuid,date,date,jsonb) from public,anon,authenticated;
create or replace function payroll_workspace_private.readiness(p_scope uuid,p_from date,p_to date) returns jsonb
language sql stable security definer set search_path='' as $$
 select payroll_workspace_private.readiness_from_preview(p_scope,p_from,p_to,public.preview_payroll_time(p_scope,p_from,p_to))
$$;
create function public.get_payroll_preparation(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v jsonb;begin
 if auth.uid() is null or not private.payroll_time_permission(p_scope,'view') then
  raise exception 'A scoped payroll duty and Timekeeping view permission are required.' using errcode='42501';
 end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 then
  raise exception 'Select a cutoff of 1–31 days.' using errcode='22023';
 end if;
 v:=public.preview_payroll_time(p_scope,p_from,p_to);
 return jsonb_build_object('time',v,'readiness',payroll_workspace_private.readiness_from_preview(p_scope,p_from,p_to,v));
end $$;
revoke all on function public.get_payroll_preparation(uuid,date,date) from public,anon;
grant execute on function public.get_payroll_preparation(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
