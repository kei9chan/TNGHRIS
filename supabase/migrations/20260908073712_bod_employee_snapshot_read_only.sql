-- Read-only BOD projection. No table grants or existing policies are changed.
create or replace function private.bod_snapshot_assert() returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or public.current_hris_user_id() is null
 or not public.has_active_role('Board of Director') then
 raise exception 'Employee Snapshot requires an active BOD role.' using errcode='42501'; end if;
end $$;
revoke all on function private.bod_snapshot_assert() from public,anon,authenticated;

create or replace function private.bod_snapshot_pay(p_employee uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare packs jsonb; h public.hris_users; total numeric; unit text; tax text; shares text; conflict boolean; modes integer;
begin
 perform private.bod_snapshot_assert();
 select * into h from public.hris_users where id=p_employee and not coalesce(is_duplicate,false);
 with latest as (
 select p.*, dense_rank() over(partition by engagement_key order by effective_from desc) rk
 from public.payroll_pay_packages p where employee_id=p_employee and status='approved'
 and effective_from<=(now() at time zone 'Asia/Manila')::date
 ), selected as (select * from latest where rk=1)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'stream',stream,'engagement',engagement_key,'effectiveFrom',effective_from,'unit',rate_type,
 'base',base_amount,'components',components,'payBasis',treatment->>'payBasis','netTarget',treatment->>'netTarget') order by engagement_key,id),'[]'),
 count(*)<>count(distinct engagement_key) into packs,conflict from selected;
 if jsonb_array_length(packs)=0 then
 return jsonb_build_object('state','missing','amount',null,'unit',null,'tax','Not configured','shares','Not configured','packages',packs,
 'reason','No current approved pay package. HRIS reference rate is not an approved total package.',
 'referenceAmount',h.rate_amount,'referenceUnit',h.rate_type); end if;
 select count(distinct x->>'unit'),min(x->>'unit') into modes,unit from jsonb_array_elements(packs) x;
 if not conflict and modes=1 then
 select sum((x->>'base')::numeric+coalesce((select sum((c->>'amount')::numeric) from jsonb_array_elements(x->'components') c where c->>'recurrence'='recurring'),0)) into total from jsonb_array_elements(packs) x;
 end if;
 select case when bool_and(coalesce(x->>'payBasis','')='gross') then 'Gross'
 when bool_and(coalesce(x->>'payBasis','') in ('net_tax','net_all')) then 'Net of tax' else 'Not configured' end,
 case when bool_and(coalesce(x->>'payBasis','') in ('gross','net_tax')) then 'Employee share deducted from pay'
 when bool_and(coalesce(x->>'payBasis','')='net_all') then 'Company shoulders employee share'
 when bool_and(coalesce(x->>'payBasis','') in ('gross','net_tax','net_all')) then 'Split arrangement' else 'Not configured' end
 into tax,shares from jsonb_array_elements(packs) x;
 -- Do not present contractor withholding as employment income tax.
 if exists(select 1 from jsonb_array_elements(packs) x where x->>'stream'='professional_fee') then
 shares:='Split arrangement'; if jsonb_array_length(packs)=1 then shares:='Not applicable — consultant';end if;
 tax:='Not configured';end if;
 return jsonb_build_object('state',case when conflict then 'conflict' else 'available' end,'amount',case when conflict then null else total end,
 'unit',case when modes=1 then unit else 'Split arrangement' end,'tax',tax,'shares',shares,'packages',packs,
 'reason',case when conflict then 'Conflicting approved packages share an engagement and effective date. Review salary history.'
 when modes>1 then 'Different payment units: amounts are shown separately, not added together.'
 else 'Approved base plus recurring components, before variable pay. Agreed net targets are shown separately.' end);
end $$;
revoke all on function private.bod_snapshot_pay(uuid) from public,anon,authenticated;

create or replace function private.bod_snapshot_evaluation(p_employee uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare ev public.evaluations; result numeric;
begin
 perform private.bod_snapshot_assert();
 select e.* into ev from public.evaluations e where e.status='Completed' and
 exists(select 1 from public.evaluation_submissions s where s.evaluation_id=e.id and s.subject_employee_id=p_employee)
 order by coalesce(e.updated_at,e.created_at) desc,e.id limit 1;
 if ev.id is null then return jsonb_build_object('state','missing','score',null,'reason','No finalized evaluation recorded');end if;
 -- Same individual-before-group weighting and normalization as EvaluationResult.
 with submission as (
 select s.*, (select avg((v->>'score')::numeric) from jsonb_array_elements(s.scores) v where v->>'score' ~ '^[0-9]+([.][0-9]+)?$') avg_score,
 (select c.id from public.evaluation_evaluators c join public.hris_users r on r.id=s.rater_id
 where c.evaluation_id=ev.id and ((c.type='Individual' and c.user_id=s.rater_id) or
 (c.type='Group' and (not coalesce(c.exclude_subject,false) or s.rater_id<>p_employee)
 and (c.business_unit_id is null or c.business_unit_id=r.business_unit_id)
 and (c.department_id is null or c.department_id=r.department_id)))
 order by (c.type='Individual') desc,c.id limit 1) config_id
 from public.evaluation_submissions s where s.evaluation_id=ev.id and s.subject_employee_id=p_employee
 ), grouped as (select c.id,c.weight,avg(s.avg_score) score from submission s join public.evaluation_evaluators c on c.id=s.config_id
 where s.avg_score is not null group by c.id,c.weight)
 select sum(score*weight)/nullif(sum(weight),0) into result from grouped;
 return jsonb_build_object('state',case when result is null then 'unavailable' else 'available' end,'id',ev.id,'name',ev.name,
 'score',round(result,2),'scale',5,'period',ev.due_date,'updatedAt',ev.updated_at,'label',null,'summary',null,
 'reason',case when result is null then 'Finalized evaluation has no usable weighted ratings.' else 'Weighted rating from finalized evaluation. No official summary or rating label is stored.' end);
end $$;
revoke all on function private.bod_snapshot_evaluation(uuid) from public,anon,authenticated;

create or replace function private.bod_snapshot_cases(p_employee uuid,p_detail boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare answer jsonb;
begin
 perform private.bod_snapshot_assert();
 with notices as (
 select n.*,i.category,
 (select min(v->>'timestamp') from jsonb_array_elements(coalesce(n.workflow_history,'[]')) v where v->>'newStatus'='Issued') issued_at,
 r.resolution_type,r.details outcome_detail,r.status resolution_status,r.decision_date,
 (n.status::text in ('Issued','Response Submitted','Waiver','Hearing Scheduled') or
 exists(select 1 from jsonb_array_elements(coalesce(n.workflow_history,'[]')) v where v->>'newStatus'='Issued') or
 (n.status::text='Closed' and (n.response_date is not null or r.id is not null))) was_issued
 from public.ntes n left join public.incident_reports i on i.id=n.incident_report_id
 left join lateral(select * from public.resolutions r where r.incident_report_id=n.incident_report_id and r.employee_id=p_employee
 and r.status in ('Approved','Issued','Pending Acknowledgement','Acknowledged') order by r.decision_date desc nulls last,r.id limit 1) r on true
 where n.recipient_employee_id=p_employee or (n.recipient_employee_id is null and p_employee=any(n.recipients))
 ), issued as (select * from notices where was_issued), latest as (
 select id,issued_at,created_at,category,status,details,resolution_type,outcome_detail,resolution_status,decision_date
 from issued order by coalesce(issued_at,created_at::text) desc,id limit 3)
 select jsonb_build_object('state','available','open',(select count(*) from issued where status::text<>'Closed'),
 'closed',(select count(*) from issued where status::text='Closed'),'unissued',(select count(*) from notices where not was_issued),
 'items',case when p_detail then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'issuedAt',issued_at,'recordedAt',created_at,
 'subject',coalesce(category,'Notice to explain'),'rawStatus',status,'summary',left(regexp_replace(coalesce(details,''),'<[^>]*>','','g'),500),
 'status',case when status::text='Closed' and resolution_type='CaseDismissed' then 'Closed — no violation found'
 when status::text='Closed' and resolution_type is not null then 'Closed — '||resolution_type||' issued'
 when status::text='Closed' then 'Closed — outcome not recorded'
 when resolution_type is not null then 'Finalized finding — '||case when resolution_type='CaseDismissed' then 'no violation found' else resolution_type end
 when status::text='Issued' then 'Awaiting explanation — no finding yet' else 'Under review — decision pending' end,
 'outcome',case when resolution_type is not null then left(regexp_replace(outcome_detail,'<[^>]*>','','g'),500) else null end,
 'decisionDate',decision_date) order by coalesce(issued_at,created_at::text) desc,id),'[]') from latest) else '[]'::jsonb end) into answer;
 return answer;
end $$;
revoke all on function private.bod_snapshot_cases(uuid,boolean) from public,anon,authenticated;

create or replace function private.bod_employee_snapshot(p_employee uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare h public.hris_users; identity jsonb; pay jsonb; evaluation jsonb; cases jsonb; attendance jsonb; cost jsonb; r public.payroll_net_runs; calc jsonb; item jsonb;
begin
 perform private.bod_snapshot_assert();
 select * into h from public.hris_users where id=p_employee and not coalesce(is_duplicate,false);
 if h.id is null then raise exception 'Employee not found.' using errcode='P0002';end if;
 identity:=jsonb_build_object('id',h.id,'name',h.full_name,'code',h.employee_id,'position',h.position,'department',h.department,
 'businessUnit',h.business_unit,'businessUnitId',h.business_unit_id,'status',h.status,'employmentStatus',h.employment_status,
 'hired',h.date_hired,'endDate',h.end_date,'reportsTo',coalesce((select full_name from public.hris_users where id::text=h.reports_to),h.reports_to),
 'asOf',(now() at time zone 'Asia/Manila')::date);
 pay:=private.bod_snapshot_pay(p_employee);
 begin evaluation:=private.bod_snapshot_evaluation(p_employee); exception when others then evaluation:=jsonb_build_object('state','error','reason','Evaluation data could not be loaded.');end;
 begin cases:=private.bod_snapshot_cases(p_employee,true); exception when others then cases:=jsonb_build_object('state','error','reason','Case data could not be loaded. Counts are unavailable.');end;
 -- Never infer absence from raw punches, missing schedules or clock exemptions.
 attendance:=jsonb_build_object('state','unavailable','reason','Attendance summary unavailable: no complete finalized calendar-month summary with explicit unexcused-absence classification.','period',to_char(date_trunc('month',now() at time zone 'Asia/Manila')-interval '1 month','YYYY-MM'));
 begin
 with latest as (select t.* from public.payroll_time_packages t where t.status='submitted' and t.date_to<(now() at time zone 'Asia/Manila')::date
 and exists(select 1 from jsonb_array_elements(t.result->'rows') e where e->>'employeeId'=p_employee::text)
 order by t.date_to desc,t.version desc,t.id limit 1), rows as (
 select t.date_from,t.date_to,e from latest t cross join lateral jsonb_array_elements(t.result->'rows') e where e->>'employeeId'=p_employee::text)
 select jsonb_build_object('state','partial','from',min(date_from),'to',max(date_to),
 'late',count(*) filter(where coalesce(e->>'requiresClock','true')='true' and (e->>'lateMinutes')::numeric>0),
 'approvedLeave',count(*) filter(where e->>'approvedFullLeave'='true'),
 'exceptions',count(*) filter(where jsonb_array_length(coalesce(e->'issues','[]'))>0),'unexcusedAbsences',null,
 'reason','Finalized timekeeping cutoff. Unexcused absences are not separately classified; exempt/no-punch employees are not inferred absent.')
 into item from rows having count(*)>0 and bool_and(e->>'ready'='true');
 if item is not null then attendance:=item;end if;
 exception when others then attendance:=jsonb_build_object('state','error','reason','Finalized attendance data could not be loaded.');end;
 cost:=jsonb_build_object('state','unavailable','amount',null,'reason',case when pay->>'state'<>'available' then 'A current approved package is required.' else 'A reviewed monthly forecast with paid-day/hour assumptions, statutory bases and employer accrual settings is not configured. Cutoff results are not monthly estimates.' end);
 -- Reuse the production engine, never reimplement rates. Historical actuals remain separately labeled.
 begin
 select n.* into r from public.payroll_net_runs n where exists(select 1 from jsonb_array_elements(n.result->'employees') e where e->>'employeeId'=p_employee::text)
 and exists(select 1 from public.payroll_approval_runs a join public.payroll_disbursements d on d.run_id=a.id where a.net_run_id=n.id)
 order by n.date_to desc,n.version desc,n.id limit 1;
 if r.id is not null then
 calc:=private.calculate_payroll_net_v1(r.source_snapshot);
 select e into item from jsonb_array_elements(calc->'employees') e where e->>'employeeId'=p_employee::text;
 cost:=cost||jsonb_build_object('recorded',jsonb_build_object('from',r.date_from,'to',r.date_to,'gross',item->'gross','employer',item->'employer',
 'total',(item->>'gross')::numeric+(item->>'employer')::numeric,'topUp',item->'companyTopUp','tax',item->'tax','employeeShares',item->'mandatory',
 'payBasis',item->'payBasis','label','Latest disbursed cutoff — includes actual variable pay; not a monthly estimate'));
 end if;
 exception when others then cost:=cost||jsonb_build_object('recordedError','Historical payroll cost could not be verified with the existing engine.');end;
 return jsonb_build_object('identity',identity,'pay',pay,'cost',cost,'evaluation',evaluation,'attendance',attendance,'cases',cases,
 'serviceCharge',jsonb_build_object('state','unconfigured','eligibility','Not configured','reason','No authoritative service-charge eligibility or separately classified finalized payout source is configured. No payout does not mean ineligible.'),
 'updatedAt',now());
end $$;
revoke all on function private.bod_employee_snapshot(uuid) from public,anon;
grant execute on function private.bod_employee_snapshot(uuid) to authenticated;
create or replace function public.get_bod_employee_snapshot(p_employee_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.bod_employee_snapshot(p_employee_id) $$;
revoke all on function public.get_bod_employee_snapshot(uuid) from public,anon;
grant execute on function public.get_bod_employee_snapshot(uuid) to authenticated;

create or replace function private.bod_employee_directory(p jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare answer jsonb; lim integer:=25; off integer; sorting text:=coalesce(p->>'sort','name');
begin
 perform private.bod_snapshot_assert();
 if length(coalesce(p->>'q',''))>100 or coalesce(p->>'offset','0')!~ '^[0-9]{1,6}$' then raise exception 'Invalid search.';end if;
 off:=coalesce(p->>'offset','0')::integer;
 if sorting not in ('name','salary','cost','tenure','hire','score_high','score_low','nte') then raise exception 'Invalid sort.';end if;
 with candidates as materialized (
 select u.id,u.full_name name,u.employee_id code,u.position,u.department,u.business_unit,u.business_unit_id,u.employment_status,u.status,u.date_hired,u.end_date,
 private.bod_snapshot_pay(u.id) pay,private.bod_snapshot_evaluation(u.id) evaluation,private.bod_snapshot_cases(u.id,false) cases
 from public.hris_users u where not coalesce(u.is_duplicate,false)
 and (coalesce(p->>'q','')='' or strpos(lower(coalesce(u.full_name,'')),lower(p->>'q'))>0 or strpos(lower(coalesce(u.employee_id,'')),lower(p->>'q'))>0)
 and (coalesce(p->>'bu','')='' or u.business_unit_id::text=p->>'bu')
 and (coalesce(p->>'department','')='' or u.department=p->>'department')
 and (coalesce(p->>'status','')='' or lower(u.status)=lower(p->>'status'))
 and (coalesce(p->>'employment','')='' or u.employment_status=p->>'employment')
 and (coalesce(p->>'type','')='' or u.rate_type=p->>'type')
 ), ordered as (
 select *,row_number() over(order by
 case when sorting='salary' and pay->>'unit'='Monthly' then (pay->>'amount')::numeric end desc nulls last,
 case when sorting='tenure' and date_hired is not null and (lower(status)='active' or end_date is not null) then least(coalesce(end_date,current_date),current_date)-date_hired end desc nulls last,
 case when sorting='hire' then date_hired end desc nulls last,
 case when sorting='score_high' then (evaluation->>'score')::numeric end desc nulls last,
 case when sorting='score_low' then (evaluation->>'score')::numeric end asc nulls last,
 case when sorting='nte' then (cases->>'open')::integer end desc nulls last,
 lower(name),id) ordinal from candidates
 ), page as (select * from ordered order by ordinal limit lim offset off)
 select jsonb_build_object('total',(select count(*) from candidates),'offset',off,'limit',lim,'updatedAt',now(),
 'items',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'position',position,'department',department,'businessUnit',business_unit,
 'businessUnitId',business_unit_id,'status',status,'employmentStatus',employment_status,'hired',date_hired,'endDate',end_date,'asOf',(now() at time zone 'Asia/Manila')::date,
 'ordinal',ordinal,'pay',pay-'packages','evaluation',evaluation-'summary','openNtes',cases->'open','cost',null,'serviceCharge','Not configured') order by ordinal),'[]') from page),
 'sortNote',case when sorting='salary' then 'Comparable monthly packages first; daily/hourly/split units are not converted to monthly salaries.' when sorting='cost' then 'Monthly cost estimates are not configured; name order is used for unavailable values.' else null end) into answer;
 return answer;
end $$;
revoke all on function private.bod_employee_directory(jsonb) from public,anon;
grant execute on function private.bod_employee_directory(jsonb) to authenticated;
create or replace function public.get_bod_employee_directory(p_filters jsonb default '{}') returns jsonb
language sql stable security invoker set search_path='' as $$ select private.bod_employee_directory(p_filters) $$;
revoke all on function public.get_bod_employee_directory(jsonb) from public,anon;
grant execute on function public.get_bod_employee_directory(jsonb) to authenticated;

create or replace function private.bod_employee_filters() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.bod_snapshot_assert();
 return jsonb_build_object('businessUnits',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') from public.business_units),
 'departments',(select coalesce(jsonb_agg(x order by x),'[]') from (select distinct department x from public.hris_users where department is not null) d),
 'employment',(select coalesce(jsonb_agg(x order by x),'[]') from (select distinct employment_status x from public.hris_users where employment_status is not null) d),
 'types',(select coalesce(jsonb_agg(x order by x),'[]') from (select distinct rate_type x from public.hris_users where rate_type is not null) d));
end $$;
revoke all on function private.bod_employee_filters() from public,anon;
grant execute on function private.bod_employee_filters() to authenticated;
create or replace function public.get_bod_employee_filters() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.bod_employee_filters() $$;
revoke all on function public.get_bod_employee_filters() from public,anon;
grant execute on function public.get_bod_employee_filters() to authenticated;
notify pgrst,'reload schema';
