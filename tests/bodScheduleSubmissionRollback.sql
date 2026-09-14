begin;
do $$
declare e public.hris_users;b public.hris_users;other_bod public.hris_users;n public.hris_users;
 w date:=date_trunc('week',now() at time zone 'Asia/Manila')::date+49;
 preset uuid;entries jsonb;submission_id uuid;id2 uuid;before_hash text;v integer;pubs integer;did uuid;
begin
 select h.* into e from public.hris_users h where schedule_compliance.bod_manager(h.id) is not null
 and h.auth_user_id is not null and not private.workflow_user_has_role(h.id,'Board of Director')
 and exists(select 1 from public.shift_templates t where t.business_unit_id=h.business_unit_id and t.schedule_kind='work' and t.break_minutes=60 and t.start_time<t.end_time and t.end_time-t.start_time>interval '1 hour') limit 1;
 if e.id is null then raise exception 'No eligible fixture';end if;
 select * into b from public.hris_users where id=schedule_compliance.bod_manager(e.id);
 select * into other_bod from public.hris_users where id<>b.id and auth_user_id is not null and private.workflow_user_has_role(id,'Board of Director') limit 1;
 select t.id into preset from public.shift_templates t where t.business_unit_id=e.business_unit_id and t.schedule_kind='work' and t.break_minutes=60 and t.start_time<t.end_time and t.end_time-t.start_time>interval '1 hour' limit 1;
 select jsonb_agg(jsonb_build_object('date',d::date,'templateId',preset)) into entries from generate_series(w,w+6,'1 day') d;
 perform set_config('request.jwt.claim.sub',e.auth_user_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',e.auth_user_id,'role','authenticated')::text,true);
 if not (public.get_bod_schedule_workflow(w)->>'eligible')::boolean then raise exception 'Employee eligibility failed';end if;
 before_hash:=md5(private.payroll_schedule_draft(e.id,w)::text);
 submission_id:=public.submit_my_bod_schedule(w,entries,'Rollback test only');
 id2:=public.submit_my_bod_schedule(w,entries,'Rollback test only');
 if submission_id<>id2 or (select version from schedule_compliance.submissions where submissions.id=submission_id)<>1 then raise exception 'Duplicate submission';end if;
 if before_hash<>md5(private.payroll_schedule_draft(e.id,w)::text) then raise exception 'Pending submission changed assignments';end if;
 begin
 perform public.review_bod_schedule_submission(submission_id,1,true,'Forbidden self approval');
 raise exception 'Self approval unexpectedly allowed';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',other_bod.auth_user_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_bod.auth_user_id,'role','authenticated')::text,true);
 begin
 perform public.review_bod_schedule_submission(submission_id,1,true,'Forbidden other BOD');
 raise exception 'Unassigned BOD unexpectedly allowed';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',b.auth_user_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b.auth_user_id,'role','authenticated')::text,true);
 if not (public.get_bod_schedule_workflow(w)->>'isBod')::boolean then raise exception 'BOD role not detected';end if;
 if not exists(select 1 from jsonb_array_elements(public.get_bod_schedule_workflow(w)->'pending') x where x->>'id'=submission_id::text) then raise exception 'Assigned BOD queue missing submission';end if;
 perform public.review_bod_schedule_submission(submission_id,1,true,'Approved rollback test');
 select count(*) into pubs from public.payroll_schedule_publications where employee_id=e.id and effective_from=w;
 perform public.review_bod_schedule_submission(submission_id,1,true,'Repeated approval');
 if pubs<>(select count(*) from public.payroll_schedule_publications where employee_id=e.id and effective_from=w) then raise exception 'Duplicate publication';end if;
 if (select count(*) from public.shift_assignments where employee_id=e.id and date between w and w+6)<>7 then raise exception 'Approved assignments missing or duplicated';end if;
 if exists(select 1 from jsonb_array_elements(public.get_bod_schedule_workflow(w)->'pending') x where x->>'id'=submission_id::text) then raise exception 'Approved submission remains pending';end if;
 -- Rejection keeps the source unchanged; a revised submission can include rest days.
 perform set_config('request.jwt.claim.sub',e.auth_user_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',e.auth_user_id,'role','authenticated')::text,true);
 w:=w+7;
 select jsonb_agg(jsonb_build_object('date',d::date,'templateId',null,'restDay',true)) into entries from generate_series(w,w+6,'1 day') d;
 before_hash:=md5(private.payroll_schedule_draft(e.id,w)::text);
 submission_id:=public.submit_my_bod_schedule(w,entries,'Proposed rest days');
 perform set_config('request.jwt.claim.sub',b.auth_user_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b.auth_user_id,'role','authenticated')::text,true);
 perform public.review_bod_schedule_submission(submission_id,1,false,'Please revise the proposed week');
 if before_hash<>md5(private.payroll_schedule_draft(e.id,w)::text) then raise exception 'Rejected submission changed assignments';end if;
 perform set_config('request.jwt.claim.sub',e.auth_user_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',e.auth_user_id,'role','authenticated')::text,true);
 id2:=public.submit_my_bod_schedule(w,entries,'Revised proposal after discussion');
 if id2<>submission_id or (select version from schedule_compliance.submissions where submissions.id=submission_id)<>2 then raise exception 'Resubmission version incorrect';end if;
 perform set_config('request.jwt.claim.sub',b.auth_user_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b.auth_user_id,'role','authenticated')::text,true);
 begin
 perform public.review_bod_schedule_submission(submission_id,1,true,'Stale review must fail');
 raise exception 'Stale review unexpectedly allowed';
 exception when raise_exception then
 if sqlerrm not like 'Refresh the submission%' then raise;end if;end;
 perform public.review_bod_schedule_submission(submission_id,2,true,'Approved revised rest week');
 if (select count(*) from jsonb_array_elements(private.payroll_schedule_draft(e.id,w)) x where x->>'statusTag'='rest')<>7 then raise exception 'Approved rest days not published';end if;
 -- Future queued schedule emails must be suppressed before any provider call.
 insert into schedule_compliance.deliveries(event_key,manager_id,week,recipient_id,event)
 values('rollback-bod-mail-'||gen_random_uuid(),b.id,w,b.id,'test') returning deliveries.id into did;
 if (select status from schedule_compliance.deliveries where deliveries.id=did)<>'skipped' or public.schedule_email_recipient_allowed(did) then raise exception 'BOD schedule email was not suppressed';end if;
 select h.* into n from public.hris_users h where lower(status)='active' and auth_user_id is not null and schedule_compliance.bod_manager(h.id) is null and not private.workflow_user_has_role(h.id,'Board of Director') limit 1;
 perform set_config('request.jwt.claim.sub',n.auth_user_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',n.auth_user_id,'role','authenticated')::text,true);
 begin
 perform public.submit_my_bod_schedule(w,entries,'Forbidden non BOD report');
 raise exception 'Non-BOD direct report unexpectedly allowed';
 exception when insufficient_privilege then null;end;
end $$;
select 'PASS: eligibility, manager routing, no pending writes, no self/unassigned approval, publication, retry safety, BOD email suppression, non-BOD exclusion; all changes rolled back' as result;
rollback;
