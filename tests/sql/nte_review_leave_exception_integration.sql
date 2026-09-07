begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();e uuid:=gen_random_uuid();ir uuid:=gen_random_uuid();n uuid:=gen_random_uuid();x uuid;v jsonb;row_n public.ntes;lr uuid:=gen_random_uuid();lt uuid;denied boolean:=false;
begin
 foreach x in array array[a,b,e] loop
 insert into auth.users(id,email) values(x,x||'@example.invalid');
 insert into public.hris_users(id,auth_user_id,email,first_name,last_name,full_name,role,status,employment_status) values(x,x,x||'@example.invalid','Isolated','Fixture','Isolated Fixture',case when x=e then 'Employee' else 'Board of Director' end,'Active','Regular');
 insert into public.user_roles(user_id,role_id,is_active,scope_type) values(x,case when x=e then 'Employee' else 'Board of Director' end,true,case when x=e then 'SELF' else 'GLOBAL' end) on conflict(user_id,role_id) do update set is_active=true;
 end loop;
 insert into public.incident_reports(id,category,description,date_time,involved_employee_ids,involved_employee_names,reported_by,case_number) values(ir,'Test','Isolated rollback fixture',now(),array[e],array['Fixture'],e,-999999);
 perform set_config('app.nte_workflow_rpc','on',true);
 insert into public.ntes(id,incident_report_id,recipients,recipient_names,recipient_employee_id,status,nte_number,issued_by_user_id) values(n,ir,array[e],array['Fixture'],e,'Draft','TEST-'||n,a);
 insert into public.nte_approvals(nte_id,approver_user_id,approver_employee_id,selection_role_id,role_snapshot,is_bod_role,is_required,status,selected_by,selection_source) values(n,a,a,'Board of Director','Board of Director',true,true,'Pending',a,'manual'),(n,b,b,'Board of Director','Board of Director',true,true,'Pending',a,'manual');
 update public.ntes set status='PendingApproval' where id=n;
 perform set_config('request.jwt.claim.sub',a::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 v:=public.get_nte_incident_context(n);if v->>'id'<>ir::text then raise exception 'Wrong case context';end if;
 row_n:=public.act_on_nte_approval(n,'approve',null);if row_n.status<>'PendingApproval' then raise exception 'Premature issuance';end if;
 begin perform public.act_on_nte_approval(n,'approve',null);exception when sqlstate '22023' then denied:=true;end;if not denied then raise exception 'Duplicate approval allowed';end if;
 perform set_config('request.jwt.claim.sub',b::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
 row_n:=public.act_on_nte_approval(n,'approve',null);if row_n.status<>'Issued' then raise exception 'Existing issuance transition failed';end if;
 if (select count(*) from public.nte_approvals where nte_id=n and status='Approved')<>2 then raise exception 'Decision count mismatch';end if;
 if (select count(*) from public.notifications where related_entity_id=n::text and type='NTE_ISSUED')<>1 then raise exception 'Issuance notification count mismatch';end if;
 select id into lt from public.leave_types where name='Vacation Leave' limit 1;
 insert into public.leave_requests(id,employee_id,employee_name,leave_type_id,start_date,end_date,duration_days,status,approval_route) values(lr,e,'Isolated Fixture',lt,'2026-10-09','2026-10-12',4,'PendingBOD','BOD_REQUIRED');
 delete from public.time_request_approval_assignments where request_id=lr;
 insert into public.time_request_approval_assignments(request_type,request_id,approver_user_id,is_bod,is_required,status) values('leave',lr,b,true,true,'Pending');
 v:=public.process_time_request_approval('leave',lr,'approve','Synthetic BOD excess approval');
 if v->>'status'<>'Approved' or private.confirmed_leave_balance(e,'vacation',(now() at time zone 'Asia/Manila')::date)<>-4 then raise exception 'Assigned BOD leave exception failed';end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);perform set_config('request.jwt.claims','{}',true);denied:=false;
 begin perform public.get_nte_incident_context(n);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Unassigned access allowed';end if;
 perform set_config('nte_fixture.result','PASS: assigned BOD context, two approvals, duplicate rejection, single in-app issuance, BOD excess leave debit, unauthorized denial. Synthetic records rolled back.',true);
end $$;
select current_setting('nte_fixture.result') result;
rollback;
