-- End-to-end successful submission using temporary rest-day assignments for a small
-- existing BU. Missing employment dates are filled only within this rollback.
-- No employees, schedules, permissions, packages or source changes are committed.
begin;
set local lock_timeout='2s';set local statement_timeout='30s';
do $test$
#variable_conflict use_variable
declare actor uuid;other uuid;scope uuid;bu uuid;template_id uuid;day date;review jsonb;package_id uuid;rule_id uuid;count_before int;denied boolean;begin
select id into strict actor from auth.users where lower(email)='kay@thenextperience.com';
select auth_user_id into strict other from hris_users where auth_user_id is not null and auth_user_id<>actor and lower(status)='active' limit 1;
select s.id,s.business_unit_id into strict scope,bu from payroll_access_scopes s join hris_users h on h.business_unit_id=s.business_unit_id where s.kind='business_unit' and exists(select 1 from shift_templates t where t.business_unit_id=s.business_unit_id or t.business_unit_id is null) group by s.id order by count(*) limit 1;
select t.id into strict template_id from shift_templates t where t.business_unit_id=bu or t.business_unit_id is null limit 1;
select candidate::date into strict day from generate_series('2026-07-01'::date,'2026-08-01'::date,'1 day') candidate
where not exists(select 1 from shift_assignments a where a.business_unit_id=bu and a.date between candidate::date-1 and candidate::date+1)
and not exists(select 1 from ot_requests o join hris_users h on h.id=o.employee_id where h.business_unit_id=bu and o.date between candidate::date-1 and candidate::date+1)
and not exists(select 1 from leave_requests l join hris_users h on h.id=l.employee_id where h.business_unit_id=bu and l.start_date<=candidate::date and l.end_date>=candidate::date)
and not exists(select 1 from wfh_requests w join hris_users h on h.id=w.employee_id where h.business_unit_id=bu and w.date<=candidate::date and coalesce(w.end_date,w.date)>=candidate::date) limit 1;
perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
update hris_users h set date_hired=coalesce(h.date_hired,day),end_date=case when lower(h.status)<>'active' and h.end_date is null then day+1 else h.end_date end where h.business_unit_id=bu and not coalesce(h.is_duplicate,false);
insert into shift_assignments(employee_id,shift_template_id,date,business_unit_id)
select h.id,template_id,day,bu from hris_users h where h.business_unit_id=bu and not coalesce(h.is_duplicate,false) and h.date_hired::date<=day and (h.end_date is null or h.end_date::date>=day);
insert into payroll_access_grants(auth_user_id,scope_id,permission,granted_by,grant_reason) values(actor,scope,'finalize_timekeeping',other,'Rollback-only submission test'),(actor,scope,'authorize_hr',other,'Rollback-only rule test');
set local role authenticated;
rule_id:=public.save_payroll_time_rules(scope,day,day,jsonb_build_object('holidayCoverageConfirmed',true,'restTemplates',jsonb_build_array(template_id),'meals','{}'::jsonb),'Rollback-only explicit rest-day rule');
review:=public.preview_payroll_time(scope,day,day);
if (review#>>'{result,totalDays}')::int=0 or (review#>>'{result,blockedDays}')::int<>0 then raise exception 'Expected ready rest-day fixture: %',review->'result';end if;
package_id:=public.save_payroll_time_package(scope,day,day,review->>'sourceHash','Rollback-only successful submission');
perform public.submit_payroll_time_package(package_id);
if public.get_payroll_time_package(package_id)->>'status'<>'submitted' then raise exception 'Submission did not become visible';end if;
perform public.submit_payroll_time_package(package_id);
reset role;
if (select count(*) from payroll_time_audit where record_id=package_id and action='submitted_to_finance')<>1 then raise exception 'Submission retry duplicated the event';end if;
denied:=false;begin update payroll_time_packages set reason='overwrite submitted history' where id=package_id;exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'Submitted result was mutable';end if;
set local role authenticated;
rule_id:=public.save_payroll_time_rules(scope,day,day,jsonb_build_object('holidayCoverageConfirmed',false,'restTemplates',jsonb_build_array(template_id),'meals','{}'::jsonb),'Rollback-only source revision after submission');
if (public.get_payroll_time_package(package_id)->>'current')::boolean then raise exception 'Submitted version remained current after a source change';end if;
denied:=false;begin perform public.submit_payroll_time_package(package_id);exception when serialization_failure then denied:=true;end;
if not denied then raise exception 'Stale submitted version reused';end if;
reset role;
perform set_config('payroll_phase3.result','PASS: reviewed ready data → saved version → HR submission visible to authorized reader; retry once, immutable submitted record, changed-source invalidation; all fixtures roll back',true);
end $test$;
select current_setting('payroll_phase3.result') as result;
rollback;
