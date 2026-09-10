-- Run as migration administrator. All request, delivery, audit and punch writes roll back.
begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
do $$
declare e record;m record;other_user record;r uuid;k uuid:=gen_random_uuid();payload jsonb;before_count integer;day0 date;sch jsonb;claims text;sid uuid;aid uuid;events jsonb;
begin
 select h.id,h.auth_user_id,private.punch_direct_manager(h.id) manager into e from public.hris_users h
 where lower(h.status)='active' and h.auth_user_id is not null and private.punch_direct_manager(h.id) is not null
 order by (h.business_unit_id is distinct from (select business_unit_id from public.hris_users where id=private.punch_direct_manager(h.id))) desc limit 1;
 if e.id is null then raise exception 'No manager fixture available';end if;
 select id,auth_user_id into m from public.hris_users where id=e.manager;
 select h.id,h.auth_user_id into other_user from public.hris_users h where lower(h.status)='active' and h.auth_user_id is not null and h.id not in(e.id,m.id) and not attendance_issues.hr_recipient(h.id) and h.role='Employee' limit 1;
 claims:=jsonb_build_object('sub',e.auth_user_id,'role','authenticated')::text;
 perform set_config('request.jwt.claims',claims,true);
 day0:=(clock_timestamp() at time zone 'Asia/Manila')::date+10;
 payload:=jsonb_build_object('kind','absence','date',day0,'category','Other','explanation','Rollback test only','confirmed',true);
 r:=public.submit_attendance_issue(payload,k);
 if public.submit_attendance_issue(payload,k)<>r then raise exception 'Idempotency failed';end if;
 if (select manager_id from attendance_issues.requests where id=r)<>m.id then raise exception 'Direct-manager routing failed';end if;
 if not (private.attendance_day(e.id,day0)->>'requiresClock')::boolean then raise exception 'Pending request altered clock requirement';end if;
 if (public.get_attendance_issues(r)->'rows'->0->>'canReview')::boolean then raise exception 'Employee can approve own report';end if;
 begin perform public.review_attendance_issue(r,'approve','Self approval attempt',1);raise exception 'Self approval was allowed';exception when insufficient_privilege then null;end;
 if other_user.id is not null then
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_user.auth_user_id,'role','authenticated')::text,true);
 if jsonb_array_length(public.get_attendance_issues(r)->'rows')<>0 then raise exception 'Unrelated employee can read report';end if;
 begin perform public.review_attendance_issue(r,'approve','Unauthorized attempt',1);raise exception 'Unauthorized approval allowed';exception when insufficient_privilege then null;end;
 end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',m.auth_user_id,'role','authenticated')::text,true);
 if not (public.get_attendance_issues(r)->'rows'->0->>'canReview')::boolean then raise exception 'Direct manager cannot review';end if;
 perform public.review_attendance_issue(r,'details','Please confirm details',1);
 perform set_config('request.jwt.claims',claims,true);
 perform public.submit_attendance_issue(payload||'{"explanation":"Updated rollback test"}',gen_random_uuid(),r,2);
 perform public.review_attendance_issue(r,'withdraw','Withdrawal test',3);
 begin update attendance_issues.audit set action='tampered' where request_id=r;raise exception 'Audit mutation succeeded';exception when others then if sqlerrm='Audit mutation succeeded' then raise;end if;end;
 -- Create a transaction-only publication on a day with no attendance session.
 select h.id,h.auth_user_id,private.punch_direct_manager(h.id) manager,current_date-2 as workday into e
 from public.hris_users h where h.auth_user_id is not null and h.business_unit_id is not null and private.punch_direct_manager(h.id) is not null and lower(h.status)='active'
 and not exists(select 1 from public.attendance_clock_sessions s where s.employee_id=h.id and s.work_date=current_date-2) limit 1;
 if e.id is null then raise exception 'Schedule fixture employee required';end if;
 select id,auth_user_id into m from public.hris_users where id=e.manager;
 claims:=jsonb_build_object('sub',e.auth_user_id,'role','authenticated')::text;day0:=e.workday;
 insert into public.payroll_schedule_publications(employee_id,business_unit_id,effective_from,effective_to,version,source_hash,snapshot,approval_required,published_by,reference)
 select e.id,h.business_unit_id,date_trunc('week',day0)::date,date_trunc('week',day0)::date+6,coalesce((select max(version)+1 from public.payroll_schedule_publications where employee_id=e.id),1),md5(private.payroll_schedule_draft(e.id,date_trunc('week',day0)::date)::text),jsonb_build_array(jsonb_build_object('date',day0,'kind','work','start','09:00','end','18:00','endDayOffset',0,'name','Rollback fixture')),false,m.id,'Rollback fixture only' from public.hris_users h where h.id=e.id;
 sch:=private.attendance_schedule(e.id,day0);
 perform set_config('request.jwt.claims',claims,true);
 r:=public.submit_attendance_issue(jsonb_build_object('kind','absence','date',day0,'category','Other','explanation','Absence rollback test','confirmed',true),gen_random_uuid());
 perform set_config('request.jwt.claims',jsonb_build_object('sub',m.auth_user_id,'role','authenticated')::text,true);
 perform public.review_attendance_issue(r,'approve','Manager approval test',1);
 if (private.attendance_day(e.id,day0)->>'requiresClock')::boolean then raise exception 'Approved absence still requires clock';end if;
 if (private.attendance_review_facts(e.id,day0)->>'eligible')::boolean then raise exception 'Approved absence classified unexplained';end if;
 if private.attendance_schedule(e.id,day0)<>sch then raise exception 'Original schedule changed';end if;
 -- Roll back the fixture request state within this outer test transaction.
 update attendance_issues.requests set status='cancelled' where id=r;
 perform set_config('request.jwt.claims',claims,true);
 r:=public.submit_attendance_issue(jsonb_build_object('kind','punch','date',day0,'time',day0||'T08:00:00+08:00','punch','CLOCK_IN','category','Other','explanation','Punch rollback test'),gen_random_uuid());
 perform set_config('request.jwt.claims',jsonb_build_object('sub',m.auth_user_id,'role','authenticated')::text,true);
 perform public.review_attendance_issue(r,'approve','Manager punch approval',1);
 select id into sid from public.attendance_clock_sessions where employee_id=e.id and work_date=day0;
 if (select state from public.attendance_clock_sessions where id=sid)<>'working' then raise exception 'Corrected punch state incorrect';end if;
 if jsonb_array_length(private.attendance_session_events(sid))<>1 then raise exception 'Correction evidence missing';end if;
 -- Later normal punches must remain visible after a mid-day correction.
 insert into public.attendance_clock_events(session_id,employee_id,action,occurred_at,request_id,revision,created_by) values(sid,e.id,'CLOCK_OUT',(day0||'T17:00:00+08:00')::timestamptz,gen_random_uuid(),2,e.id);
 if jsonb_array_length(private.attendance_session_events(sid))<>2 then raise exception 'Later raw punch hidden by correction';end if;
 if private.attendance_schedule(e.id,day0)<>sch then raise exception 'Punch correction changed schedule';end if;
end $$;
select 'PASS: routing, self/other denial, idempotency, details/resubmission, withdrawal, immutable audit, absence overlay, original schedules, correction and subsequent raw punches' result;
rollback;
