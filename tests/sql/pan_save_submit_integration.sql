begin;
do $test$
declare h uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); x uuid; r public.pans; denied boolean:=false;
begin
foreach x in array array[h,e,b] loop
 insert into auth.users(id,email) values(x,x||'@example.invalid');
 insert into public.hris_users(id,auth_user_id,email,first_name,last_name,full_name,role,status) values(x,x,x||'@example.invalid','Isolated','Fixture','Isolated PAN fixture',case when x=h then 'HR Staff' when x=b then 'Board of Director' else 'Employee' end,'Active');
 insert into public.user_roles(user_id,role_id,is_active,scope_type) values(x,case when x=h then 'HR Staff' when x=b then 'Board of Director' else 'Employee' end,true,'GLOBAL');
end loop;
perform set_config('request.jwt.claim.sub',h::text,true);
perform set_config('request.jwt.claims',jsonb_build_object('sub',h,'role','authenticated')::text,true);
execute 'set local role authenticated';
insert into public.pans(id,employee_id,employee_name,effective_date,status,created_by_user_id,action_taken,particulars,routing_steps,salary_from)
values(p,e,'Isolated PAN fixture','2026-09-07','Draft',h,'{"salaryIncrease":true}','{"from":{"salary":{"basic":18128,"deminimis":0,"reimbursable":0}},"to":{"salary":{"basic":20000,"deminimis":1000,"reimbursable":0}},"panTemplate":{"name":"Fixture","version":2}}','[]','{"basic":18128,"deminimis":0,"reimbursable":0}');
select * into r from public.pans where id=p;
if r.particulars#>>'{to,salary,basic}'<>'20000' or r.particulars#>>'{panTemplate,name}'<>'Fixture' then raise exception 'Draft did not round trip';end if;
begin perform public.submit_pan(p);exception when others then denied:=true;end;
if not denied or (select status::text from public.pans where id=p)<>'Draft' then raise exception 'Failed submission lost draft';end if;
update public.pans set routing_steps=jsonb_build_array(jsonb_build_object('userId',h,'role','Approver','status','Pending'),jsonb_build_object('userId',b,'role','Board of Director','status','Pending')) where id=p;
r:=public.submit_pan(p);
if r.status::text<>'Pending Approval' or r.routing_steps->0->>'status'<>'Pending' or r.routing_steps->1->>'status'<>'Waiting' then raise exception 'Routing failed';end if;
if not exists(select 1 from public.get_actionable_approval_tasks_for_actor(h) where request_type='pan' and request_id=p) then raise exception 'First approver missing';end if;
denied:=false;begin perform public.submit_pan(p);exception when others then denied:=true;end;if not denied then raise exception 'Duplicate submission allowed';end if;
r:=public.approve_pan(p,'Isolated HR decision');
perform set_config('request.jwt.claim.sub',b::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
if not exists(select 1 from public.get_actionable_approval_tasks_for_actor(b) where request_type='pan' and request_id=p) then raise exception 'BOD queue missing';end if;
r:=public.reject_pan(p,'Isolated rejection');if r.status::text<>'Declined' then raise exception 'Rejected status failed';end if;
perform set_config('request.jwt.claim.sub',h::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',h,'role','authenticated')::text,true);
update public.pans set status='Draft',notes='Revised fixture' where id=p;
r:=public.submit_pan(p);r:=public.approve_pan(p,'HR resubmission');
perform set_config('request.jwt.claim.sub',b::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
r:=public.approve_pan(p,'BOD fixture approval');if r.status::text<>'Pending Employee' then raise exception 'Approval completion failed';end if;
perform set_config('pan_fixture.result','PASS: authenticated RLS draft save/reopen, failed-send draft retention, sequential HR/BOD queues, duplicate rejection, reject/revise/resubmit, approval completion. All fixtures rolled back.',true);
end $test$;
select current_setting('pan_fixture.result') result;
rollback;
