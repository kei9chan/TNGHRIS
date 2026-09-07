begin;
do $test$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();h uuid:=gen_random_uuid();c uuid:=gen_random_uuid();app uuid:=gen_random_uuid();o uuid:=gen_random_uuid();r uuid:=gen_random_uuid();x uuid;v jsonb;denied boolean:=false;
begin
foreach x in array array[a,b,h] loop
 insert into auth.users(id,email) values(x,x||'@example.invalid');
 insert into public.hris_users(id,auth_user_id,email,first_name,last_name,full_name,role,status) values(x,x,x||'@example.invalid','Isolated','Fixture','Isolated Offer Fixture',case when x=h then 'HR Manager' else 'Board of Director' end,'Active');
 insert into public.user_roles(user_id,role_id,is_active,scope_type) values(x,case when x=h then 'HR Manager' else 'Board of Director' end,true,'GLOBAL') on conflict(user_id,role_id) do update set is_active=true;
end loop;
insert into public.job_candidates(id,first_name,last_name,email,source) values(c,'Isolated','Fixture',c||'@example.invalid','Referral');
insert into public.job_applications(id,candidate_id) values(app,c);
insert into public.job_offers(id,application_id,offer_number,base_pay,start_date,employment_type) values(o,app,'TEST-'||o,100,'2026-10-01','Probationary');
insert into public.job_offer_approval_requests(id,offer_id,application_id,candidate_id,requester_user_id,approval_stage) values(r,o,app,c,h,'HR_MANAGER');
insert into public.job_offer_approval_assignments(request_id,approver_user_id,approver_role,approval_stage) values(r,h,'HR Manager','HR_MANAGER');
perform set_config('request.jwt.claim.sub',h::text,true);
v:=public.process_job_offer_approval(r,'approve',null);
if v->>'status'<>'Pending Approval' then raise exception 'HR prematurely completed offer';end if;
if not exists(select 1 from public.job_offer_approval_assignments where request_id=r and approver_user_id=a and status='Pending') then raise exception 'BOD missing after HR';end if;
perform set_config('request.jwt.claim.sub',a::text,true);
if not exists(select 1 from public.get_my_pending_offer_approval_ids() where request_id=r) then raise exception 'Dashboard missing assigned offer';end if;
v:=public.process_job_offer_approval(r,'approve',null);
if v->>'status'<>'Pending Approval' then raise exception 'One BOD completed offer';end if;
begin perform public.process_job_offer_approval(r,'approve',null);exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'Duplicate allowed';end if;
perform set_config('request.jwt.claim.sub',b::text,true);
if not exists(select 1 from public.get_my_pending_offer_approval_ids() where request_id=r) then raise exception 'Second BOD queue disappeared';end if;
v:=public.process_job_offer_approval(r,'approve',null);
if v->>'status'<>'Approved' then raise exception 'Two BOD did not complete';end if;
if (select count(*) from public.job_offer_approval_history where request_id=r and action='APPROVE' and approval_stage='BOD_GM')<>2 then raise exception 'History mismatch';end if;
perform set_config('offer_test.result','PASS: HR handoff, assigned dashboard lookup, first BOD pending, duplicate denied, second BOD completion, decision history. Rolled back.',true);
end $test$;
select current_setting('offer_test.result') result;
rollback;

