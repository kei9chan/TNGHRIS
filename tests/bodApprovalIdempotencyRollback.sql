begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
do $$declare r record;b1 record;b2 record;u record;rid uuid;rid2 uuid;vac uuid;result jsonb;before_events integer;begin
 select a.request_id,a.approver_user_id into r from public.time_request_approval_assignments a join public.leave_requests l on l.id=a.request_id join public.hris_users h on h.id=a.approver_user_id join public.hris_users e on e.id=l.employee_id where a.request_type='leave' and a.status='Pending' and a.is_bod and a.is_required and l.status='PendingBOD' and lower(h.status)='active' and h.auth_user_id is not null and e.employment_status='Regular' limit 1;
 if r.request_id is null then raise exception 'Pending BOD fixture needed';end if;
 rid:=r.request_id;select id,auth_user_id into b1 from public.hris_users where id=r.approver_user_id;
 select h.id,h.auth_user_id into b2 from public.hris_users h join public.user_roles ur on ur.user_id=h.id and ur.is_active where ur.role_id='Board of Director' and lower(h.status)='active' and h.auth_user_id is not null and h.id<>b1.id limit 1;
 select id into vac from public.leave_types where lower(name) like '%vacation%' limit 1;
 -- A valid routed vacation exception tests approval authority without modifying earned-offset rules.
 update public.leave_requests set leave_type_id=vac where id=rid;
 insert into public.time_request_approval_assignments(request_type,request_id,approver_user_id,is_bod,is_required) values('leave',rid,b2.id,true,true) on conflict(request_type,request_id,approver_user_id) do update set status='Pending',is_required=true,is_bod=true;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b1.auth_user_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 result:=public.process_time_request_approval('leave',rid,'approve','Rollback verification only');
 if result->>'status'<>'PendingBOD' then raise exception 'Request closed before required unique BOD approvals';end if;
 result:=public.process_time_request_approval('leave',rid,'approve','Repeat rollback verification');
 if not (result->>'alreadyDecided')::boolean or result->>'message'<>'Already approved by you' then raise exception 'Duplicate approval was not idempotent';end if;
 result:=public.get_time_approval_progress('leave',rid);
 if not (result->>'alreadyApproved')::boolean or (result->>'completed')::integer<1 then raise exception 'Approval progress missing';end if;
 execute 'reset role';
 if (select count(*) from private.time_approval_decisions where request_type='leave' and request_id=rid and approver_id=b1.id)<>1 then raise exception 'Duplicate decision recorded';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b2.auth_user_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 result:=public.process_time_request_approval('leave',rid,'approve','Second unique BOD rollback verification');
 execute 'reset role';
 if exists(select 1 from public.time_request_approval_assignments where request_type='leave' and request_id=rid and is_required and status<>'Approved') then
 if result->>'status'<>'PendingBOD' then raise exception 'Other required assignments bypassed';end if;
 elsif result->>'status'<>'Approved' then raise exception 'Final BOD approval not completed';end if;
 -- A separate request must remain independently approvable by the same BOD.
 rid2:=gen_random_uuid();
 insert into public.leave_requests(id,employee_id,employee_name,leave_type_id,start_date,end_date,duration_days,reason,status,approval_route,approval_context)
 select rid2,employee_id,employee_name,leave_type_id,start_date,end_date,duration_days,'Rollback fixture only','PendingBOD','BOD_REQUIRED',approval_context from public.leave_requests where id=rid;
 insert into public.time_request_approval_assignments(request_type,request_id,approver_user_id,is_bod,is_required) values('leave',rid2,b1.id,true,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b1.auth_user_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';result:=public.process_time_request_approval('leave',rid2,'approve','Different request rollback verification');execute 'reset role';
 if result->>'status'<>'Approved' then raise exception 'Different request blocked by earlier approval';end if;
 select id,auth_user_id into u from public.hris_users where lower(status)='active' and role='Employee' and auth_user_id is not null and id not in(b1.id,b2.id) limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u.auth_user_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin perform public.process_time_request_approval('leave',rid2,'approve','Unauthorized attempt');raise exception 'UNAUTHORIZED_APPROVAL_ALLOWED';exception when insufficient_privilege or invalid_parameter_value then null;end;
 execute 'reset role';
 begin delete from private.time_approval_decisions where request_id=rid;raise exception 'AUDIT_DELETE_ALLOWED';exception when others then if sqlerrm='AUDIT_DELETE_ALLOWED' then raise;end if;end;
end$$;
select 'PASS: required unique BOD approvals, duplicate-click idempotency, approval progress, sequential different requests, final status, unauthorized denial, immutable decisions; all writes rolled back' result;
rollback;
