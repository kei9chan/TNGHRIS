-- Ordered approval test. All cases/actions roll back.
-- Existing real HR, GM and BOD accounts are used without changing their roles.
begin;
set local lock_timeout='2s';set local statement_timeout='30s';
do $test$
#variable_conflict use_variable
declare hr uuid;gm uuid;gm_employee uuid;subject_auth uuid;bod uuid[];o public.ot_requests;scope uuid;src jsonb;case_id uuid;denied boolean;begin
select h.auth_user_id into strict hr from hris_users h where private.payroll_offset_role(h.auth_user_id,'HR Manager') limit 1;
select array_agg(distinct h.auth_user_id order by h.auth_user_id) into bod from hris_users h where private.payroll_offset_role(h.auth_user_id,'Board of Director');
if cardinality(bod)<2 then raise exception 'Two existing active BOD accounts are needed for this check';end if;
select h.id,h.auth_user_id into strict gm_employee,gm from hris_users h where private.payroll_offset_role(h.auth_user_id,'General Manager') and h.auth_user_id<>hr and not(h.auth_user_id=any(bod)) limit 1;
select r.* into strict o from ot_requests r join hris_users h on h.id=r.employee_id where r.ot_type='Offset' and r.status::text='Approved' and h.auth_user_id is not null and h.auth_user_id not in(hr,gm) and not(h.auth_user_id=any(bod)) and h.business_unit_id is not null limit 1;
scope:=private.payroll_employee_bu_scope(o.employee_id);src:=private.payroll_time_sources(scope,o.date,o.date);
insert into payroll_offset_cases(ot_request_id,employee_id,scope_id,source_hash,source_snapshot,eligible_minutes,created_by,reason) values(o.id,o.employee_id,scope,md5(src::text),src,60,hr,'Rollback-only ordered approval fixture') returning id into case_id;
select auth_user_id into subject_auth from hris_users where id=o.employee_id;
perform set_config('request.jwt.claims',jsonb_build_object('sub',subject_auth,'role','authenticated')::text,true);set local role authenticated;
denied:=false;begin perform public.review_payroll_offset_case(case_id,true,'Rollback-only self-approval');exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'Requester approved own offset';end if;
reset role;
perform set_config('request.jwt.claims',jsonb_build_object('sub',bod[1],'role','authenticated')::text,true);set local role authenticated;
denied:=false;begin perform public.review_payroll_offset_case(case_id,true,'Rollback-only early BOD');exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'BOD skipped HR stage';end if;
perform set_config('request.jwt.claims',jsonb_build_object('sub',hr,'role','authenticated')::text,true);
perform public.review_payroll_offset_case(case_id,true,'Rollback-only HR approval');
perform set_config('request.jwt.claims',jsonb_build_object('sub',bod[1],'role','authenticated')::text,true);
denied:=false;begin perform public.review_payroll_offset_case(case_id,true,'Rollback-only skipping GM');exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'BOD skipped GM stage';end if;
reset role;
perform set_config('request.jwt.claims',jsonb_build_object('sub',gm,'role','authenticated')::text,true);set local role authenticated;
perform public.review_payroll_offset_case(case_id,true,'Rollback-only GM approval');
perform set_config('request.jwt.claims',jsonb_build_object('sub',bod[1],'role','authenticated')::text,true);
perform public.review_payroll_offset_case(case_id,true,'Rollback-only first BOD');
denied:=false;begin perform public.review_payroll_offset_case(case_id,true,'Rollback-only repeated BOD');exception when unique_violation then denied:=true;end;
if not denied then raise exception 'Same BOD approved twice';end if;
reset role;
if private.payroll_offset_complete(case_id) then raise exception 'One BOD completed approval';end if;
perform set_config('request.jwt.claims',jsonb_build_object('sub',bod[2],'role','authenticated')::text,true);set local role authenticated;
perform public.review_payroll_offset_case(case_id,true,'Rollback-only second BOD');
reset role;
if not private.payroll_offset_complete(case_id) then raise exception 'Ordered two-BOD approval did not complete';end if;
denied:=false;begin update payroll_offset_actions set reason='overwrite' where payroll_offset_actions.case_id=case_id;exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'Offset action history was mutable';end if;
perform set_config('payroll_phase3.result','PASS: HR first, GM prerequisite, two distinct BOD approvals, repeated-BOD denial, immutable history; all temporary case/action records roll back; HRIS roles unchanged',true);
end $test$;
select current_setting('payroll_phase3.result') as result;
rollback;
