begin;
set local statement_timeout='30s';
do $$declare fixture record; payload jsonb; a jsonb;b jsonb;c jsonb;k uuid:=gen_random_uuid();rid uuid;n integer;begin
 select l.*,h.auth_user_id into fixture from public.leave_requests l join public.hris_users h on h.id=l.employee_id where l.duplicate_of is null and h.auth_user_id is not null and lower(h.status)='active' and l.status='PendingBOD' limit 1;
 if fixture.id is null then raise exception 'Active employee leave fixture required';end if;
 payload:=jsonb_build_object('leave_type_id',fixture.leave_type_id,'start_date',fixture.start_date,'end_date',fixture.end_date,'duration_days',fixture.duration_days,'reason','Rollback verification '||k,'status','Pending');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',fixture.auth_user_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 a:=public.submit_leave_request(k,payload,null);
 b:=public.submit_leave_request(k,payload,null);
 c:=public.submit_leave_request(gen_random_uuid(),payload,null);
 if a#>>'{request,id}'<>b#>>'{request,id}' or a#>>'{request,id}'<>c#>>'{request,id}' or (b->>'created')::boolean or (c->>'created')::boolean then raise exception 'Submission retry duplicated';end if;
 begin perform public.submit_leave_request(k,payload||'{"reason":"Different reason"}'::jsonb,null);raise exception 'Token reuse allowed';exception when others then if sqlerrm='Token reuse allowed' then raise;end if;end;
 execute 'reset role';rid:=(a#>>'{request,id}')::uuid;
 select count(*) into n from public.time_request_approval_assignments where request_type='leave' and request_id=fixture.id;
 perform private.assign_time_request_approvers('leave',fixture.id,false);
 perform private.assign_time_request_approvers('leave',fixture.id,false);
 if (select count(*) from public.time_request_approval_assignments where request_type='leave' and request_id=fixture.id)<>n then raise exception 'Approval chain duplicated';end if;
 begin
 insert into public.leave_requests(employee_id,employee_name,leave_type_id,start_date,end_date,duration_days,reason,status)
 select employee_id,employee_name,leave_type_id,start_date,end_date,duration_days,reason,status from public.leave_requests where id=rid;
 raise exception 'Direct duplicate insert allowed';exception when unique_violation then null;end;
end$$;
select 'PASS: authenticated submit, same-token retry, fresh-token duplicate return, changed payload rejection, chain idempotency, direct DB duplicate prevention' result;
rollback;
