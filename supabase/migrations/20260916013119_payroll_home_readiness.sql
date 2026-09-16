-- Read-only workspace summary. Existing engines, approval gates and records stay unchanged.
create schema payroll_workspace_private;
revoke all on schema payroll_workspace_private from public,anon;
grant usage on schema payroll_workspace_private to authenticated;
create function payroll_workspace_private.readiness(p_scope uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb; rows jsonb; result jsonb; pay_visible boolean; published_days integer; saved_pay integer; reviewed_pay integer;
begin
 if auth.uid() is null or not private.payroll_time_permission(p_scope,'view') then
 raise exception 'A scoped payroll duty and Timekeeping view permission are required.' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 then raise exception 'Select a cutoff of 1–31 days.' using errcode='22023'; end if;
 v:=public.preview_payroll_time(p_scope,p_from,p_to); rows:=coalesce(v#>'{result,rows}','[]');
 select coalesce(bool_and(private.payroll_package_permission((x->>'employeeId')::uuid,p_scope,'view')),false)
 into pay_visible from jsonb_array_elements(rows) x;
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
end $$;
create function public.get_payroll_home_readiness(p_scope uuid,p_from date,p_to date) returns jsonb
language sql stable security invoker set search_path='' as $$select payroll_workspace_private.readiness(p_scope,p_from,p_to)$$;
revoke all on function payroll_workspace_private.readiness(uuid,date,date),public.get_payroll_home_readiness(uuid,date,date) from public,anon;
grant execute on function payroll_workspace_private.readiness(uuid,date,date),public.get_payroll_home_readiness(uuid,date,date) to authenticated;
