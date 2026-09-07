begin;
-- Run inside BEGIN / ROLLBACK with database/caseDiscussionNotifications.sql loaded.
do $$
declare h uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();e uuid:=gen_random_uuid();r uuid:=gen_random_uuid();ir uuid:=gen_random_uuid();n uuid:=gen_random_uuid();x uuid;thread jsonb;
begin
 foreach x in array array[h,a,b,e,r] loop
 insert into auth.users(id,email) values(x,x||'@example.invalid');
 insert into public.hris_users(id,auth_user_id,email,first_name,last_name,full_name,role,status) values(x,x,x||'@example.invalid','Isolated','Fixture','Isolated discussion fixture',case when x in(h,a) then 'HR Staff' when x=b then 'Board of Director' else 'Employee' end,'Active');
 insert into public.user_roles(user_id,role_id,is_active,scope_type) values(x,case when x in(h,a) then 'HR Staff' when x=b then 'Board of Director' else 'Employee' end,true,'GLOBAL');
 end loop;
 insert into public.incident_reports(id,category,description,date_time,involved_employee_ids,involved_employee_names,reported_by,case_number,assigned_to_id,chat_thread) values(ir,'Test','Isolated rollback fixture',now(),array[e],array['Fixture'],r,-999998,a,'[]');
 perform set_config('app.nte_workflow','on',true);
 insert into public.ntes(id,incident_report_id,recipients,recipient_names,recipient_employee_id,status,nte_number,issued_by_user_id) values(n,ir,array[e],array['Fixture'],e,'Draft',-999998,h);
 insert into public.nte_approvals(nte_id,approver_user_id,approver_employee_id,selection_role_id,role_snapshot,is_bod_role,is_required,status,selected_by,selection_source) values(n,b,b,'Board of Director','Board of Director',true,true,'Pending',h,'manual');
 perform set_config('request.jwt.claim.sub',h::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',h,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 thread:=jsonb_build_array(jsonb_build_object('id','fixture-message','userId',h,'text','Private fixture text','timestamp',now()));
 update public.incident_reports set chat_thread=thread where id=ir;
 execute 'reset role';
 if(select count(*) from public.notifications where related_entity_id=ir::text and type='CASE_DISCUSSION_MESSAGE')<>2 then raise exception 'Expected only handler and BOD';end if;
 if exists(select 1 from public.notifications where related_entity_id=ir::text and type='CASE_DISCUSSION_MESSAGE' and (user_id not in(a::text,b::text) or message like '%Private fixture%')) then raise exception 'Privacy failure';end if;
 if not exists(select 1 from public.notifications where related_entity_id=ir::text and user_id=b::text and link='/feedback/nte/'||n) then raise exception 'Wrong NTE link';end if;
 execute 'set local role authenticated';
 update public.incident_reports set chat_thread=thread where id=ir;
 execute 'reset role';
 if(select count(*) from public.notifications where related_entity_id=ir::text and type='CASE_DISCUSSION_MESSAGE')<>2 then raise exception 'Duplicate alert';end if;
 update public.incident_reports set chat_thread='[]' where id=ir;
 update public.incident_reports set chat_thread=thread where id=ir;
 if(select count(*) from public.notifications where related_entity_id=ir::text and type='CASE_DISCUSSION_MESSAGE')<>2 then raise exception 'Replayed message duplicated alert';end if;
 update public.hris_users set status='Inactive' where id=b;
 update public.incident_reports set chat_thread=thread||jsonb_build_array(jsonb_build_object('id','fixture-second','userId',h,'text','Second fixture')) where id=ir;
 if(select count(*) from public.notifications where related_entity_id=ir::text and type='CASE_DISCUSSION_MESSAGE')<>3 then raise exception 'Inactive approver not excluded';end if;
 perform set_config('request.jwt.claim.sub',e::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',e,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 if exists(select 1 from public.notifications where related_entity_id=ir::text and type='CASE_DISCUSSION_MESSAGE') then raise exception 'Employee can read internal alerts';end if;
 execute 'reset role';
 perform set_config('discussion_fixture.result','PASS: authenticated HR message save; handler and NTE approver alerts; sender/reporter/employee excluded; private content omitted; canonical NTE link; duplicate suppression; notification RLS. All rolled back.',true);
end $$;
select current_setting('discussion_fixture.result') result;

rollback;
