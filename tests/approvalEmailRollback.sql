-- Synthetic fixtures only; all data and audit side effects are rolled back. Never sends email.
begin;set local statement_timeout='60s';set local lock_timeout='2s';
do $$
declare ids uuid[]:='{}';auths uuid[]:='{}';role_names text[]:=array['Business Unit Manager','HR Manager','HR Staff','Employee','General Manager','Board of Director','Admin','Auditor'];
 i integer;j integer;u uuid;a uuid;employee uuid:=gen_random_uuid();ea uuid:=gen_random_uuid();r uuid;v jsonb;c integer;denied boolean;claims text;
begin
 insert into auth.users(id,email) values(ea,ea||'@example.invalid');
 insert into public.hris_users(id,auth_user_id,email,first_name,last_name,full_name,status,role) values(employee,ea,ea||'@example.invalid','Email','Fixture','Email Fixture','Active','Employee');
 for i in 1..8 loop
 u:=gen_random_uuid();a:=gen_random_uuid();ids:=array_append(ids,u);auths:=array_append(auths,a);
 insert into auth.users(id,email) values(a,a||'@example.invalid');
 insert into public.hris_users(id,auth_user_id,email,first_name,last_name,full_name,status,role) values(u,a,a||'@example.invalid','Email','Fixture','Email Fixture '||i,'Active',role_names[i]);
 insert into public.user_roles(user_id,role_id,is_active) select u,id,true from public.roles where id=role_names[i];
 end loop;
 insert into public.user_roles(user_id,role_id,is_active) values(ids[1],'HR Manager',true);
 -- Multiple roles do not create multiple requests. Waiting stages and observer roles do not count.
 for i in 1..6 loop
 insert into public.pans(employee_id,employee_name,effective_date,status,routing_steps)
 values(employee,'Email fixture',current_date,'Pending Approval',jsonb_build_array(jsonb_build_object('userId',ids[i],'status','Pending','order',1),jsonb_build_object('userId',ids[6],'status','Waiting','order',2))) returning id into r;
 perform set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);set local role service_role;
 v:=public.get_approval_email_recipient(ids[i]);
 if not exists(select 1 from jsonb_array_elements(v->'groups') g where g->>'type'='pan' and (g->>'count')::int=1) then raise exception 'Assigned role fixture % missing',i;end if;
 reset role;
 end loop;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);set local role service_role;
 if jsonb_array_length(public.get_approval_email_recipient(ids[7])->'groups')<>0 then raise exception 'Admin received unassigned work';end if;
 if jsonb_array_length(public.get_approval_email_recipient(ids[8])->'groups')<>0 then raise exception 'Read-only Auditor received work';end if;
 reset role;
 -- An assigned Auditor qualifies through the actual workflow, not a recipient-role allowlist.
 insert into public.pans(employee_id,employee_name,effective_date,status,routing_steps) values(employee,'Email fixture',current_date,'Pending Approval',jsonb_build_array(jsonb_build_object('userId',ids[8],'status','Pending','order',1))) returning id into r;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',auths[8],'role','authenticated')::text,true);set local role authenticated;
 select count(*) into c from public.get_my_actionable_approval_tasks() where request_id=r;
 if c<>1 then raise exception 'Assigned Auditor missing from shared dashboard projection';end if;
 select count(*) into c from public.get_actionable_approval_tasks_for_actor(ids[1]);
 if c<>0 then raise exception 'Another user task data exposed';end if;
 denied:=false;begin perform public.get_approval_email_admin();exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Auditor accessed email administration';end if;
 denied:=false;begin perform public.get_approval_email_recipient(ids[1]);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Client accessed service lookup';end if;
 denied:=false;begin perform 1 from public.approval_email_deliveries;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Client read delivery log';end if;
 reset role;
 update public.hris_users set status='Inactive' where id=ids[8];
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);set local role service_role;
 if public.get_approval_email_recipient(ids[8])->>'skip' is null then raise exception 'Inactive user not skipped';end if;
 reset role;
 -- Admin context is resolved by the database, never from a submitted recipient email.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',auths[7],'role','authenticated')::text,true);set local role authenticated;
 v:=public.get_approval_email_admin();if v->>'id'<>ids[7]::text then raise exception 'Wrong test recipient identity';end if;
 perform public.set_approval_email_enabled(false);
 reset role;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);set local role service_role;
 if public.start_approval_email_run() is not null then raise exception 'Disabled reminders started';end if;
 -- Test-delivery claims exercise concurrency/idempotency without the weekday clock constraint.
 v:=public.claim_approval_email('approval-test-'||ids[7],ids[7],(clock_timestamp() at time zone 'Asia/Manila')::date,'approval-test',auths[7]||'@example.invalid',0,'{"test":true}',null);
 if v is null then raise exception 'Initial claim missing';end if;
 if public.claim_approval_email('approval-test-'||ids[7],ids[7],(clock_timestamp() at time zone 'Asia/Manila')::date,'approval-test',auths[7]||'@example.invalid',0,'{"test":false}',null) is not null then raise exception 'Concurrent claim allowed';end if;
 update public.approval_email_deliveries set status='failed',lease_until=null where id=(v->>'id')::uuid;
 v:=public.claim_approval_email('approval-test-'||ids[7],ids[7],(clock_timestamp() at time zone 'Asia/Manila')::date,'approval-test',auths[7]||'@example.invalid',0,'{"test":false}',null);
 if v->'payload'<>'{"test":true}'::jsonb then raise exception 'Retry changed payload';end if;
 update public.approval_email_deliveries set status='sent',sent_at=clock_timestamp() where id=(v->>'id')::uuid;
 if public.claim_approval_email('approval-test-'||ids[7],ids[7],(clock_timestamp() at time zone 'Asia/Manila')::date,'approval-test',auths[7]||'@example.invalid',0,'{}',null) is not null then raise exception 'Successful email resent';end if;
 reset role;
end $$;
rollback;
