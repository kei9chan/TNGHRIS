-- Run after the three focused migrations, inside BEGIN ... ROLLBACK.
-- No passwords, bearer links, survey answers or employee records are returned.
set local lock_timeout='3s';set local statement_timeout='45s';
do $$declare
 hr uuid;hauth uuid;emp uuid:=gen_random_uuid();eauth uuid:=gen_random_uuid();bu uuid:=gen_random_uuid();tpl uuid:=gen_random_uuid();
 checklist uuid:=gen_random_uuid();ctpl uuid:=gen_random_uuid();task text:=gen_random_uuid()::text;document uuid:=gen_random_uuid();
 d date:=(now() at time zone 'Asia/Manila')::date;before_schedule jsonb;result jsonb;grant_result jsonb;denied boolean;
 survey uuid;report jsonb;ids uuid[];unit text;resignation uuid:=gen_random_uuid();
begin
 select h.id,h.auth_user_id into strict hr,hauth from public.hris_users h join public.user_roles r on r.user_id=h.id
 where r.role_id='Admin' and r.is_active and lower(h.status)='active' and h.auth_user_id is not null limit 1;
 insert into public.business_units(id,name) values(bu,'Rollback focused enhancements');
 insert into auth.users(id,email) values(eauth,'focused-'||eauth||'@example.invalid');
 insert into public.hris_users(id,auth_user_id,email,first_name,last_name,full_name,status,role,business_unit_id,date_hired,reports_to)
 values(emp,eauth,'focused-'||emp||'@example.invalid','Rollback','Employee','Rollback Employee','Active','Employee',bu,d-60,hr::text);
 insert into public.user_roles(user_id,role_id,is_active) values(emp,'Employee',true);
 insert into public.shift_templates(id,name,start_time,end_time,break_minutes,grace_period_minutes,business_unit_id,color,schedule_kind,end_day_offset,created_by)
 values(tpl,'Rollback normal work','09:00','18:00',60,5,bu,'blue','work',0,hr);
 insert into public.shift_assignments(employee_id,shift_template_id,date,business_unit_id,created_by) values(emp,tpl,d,bu,hr);
 before_schedule:=private.payroll_schedule_draft(emp,date_trunc('week',d)::date);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',hauth,'role','authenticated')::text,true);set local role authenticated;
 perform public.set_schedule_day_status(emp,d,'suspended','Rollback suspension reason');reset role;
 if not private.is_schedule_suspended(emp,d) then raise exception 'Suspension not saved';end if;
 if private.payroll_schedule_draft(emp,date_trunc('week',d)::date)<>before_schedule then raise exception 'Suspension changed payroll schedule';end if;
 if private.attendance_schedule(emp,d)->'entries'->0->>'name'<>'Suspended' then raise exception 'Employee schedule missing suspension label';end if;
 if (private.attendance_day(emp,d)->>'requiresClock')::boolean then raise exception 'Suspension still requires clocking';end if;
 if (private.attendance_review_facts(emp,d)->>'eligible')::boolean then raise exception 'Suspension eligible for attendance violation';end if;
 set local role authenticated;result:=public.get_suspension_status_report(d,d);reset role;
 if not exists(select 1 from jsonb_array_elements(result) r where r->>'employee_id'=emp::text and r->>'reason'='Rollback suspension reason') then raise exception 'Suspension reporting lost reason or row';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',eauth,'role','authenticated')::text,true);set local role authenticated;
 perform public.assert_hris_account_active();
 if public.get_my_hris_bootstrap()->>'status'<>'Active' then raise exception 'Active account bootstrap failed';end if;
 denied:=false;begin perform public.set_schedule_day_status(emp,d,null,'Unauthorized change');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Employee changed suspension';end if;reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',hauth,'role','authenticated')::text,true);set local role authenticated;
 perform public.set_schedule_day_status(emp,d,null,'Rollback restoration');reset role;
 if private.payroll_schedule_draft(emp,date_trunc('week',d)::date)<>before_schedule then raise exception 'Normal schedule changed';end if;
 -- Existing checklist is the sole task source for restricted access.
 insert into public.onboarding_checklist_templates(id,name,target_role,template_type,tasks) values(ctpl,'Rollback clearance','Employee','Offboarding','[]');
 insert into public.onboarding_checklists(id,employee_id,template_id,start_date,status,tasks) values(checklist,emp,ctpl,d,'InProgress',jsonb_build_array(jsonb_build_object('id',task,'employeeId',emp,'ownerUserId',emp,'name','Clearance document','taskType','Upload Document','status','Pending')));
 set local role authenticated;perform public.set_employee_end_date(emp,d,'Rollback employment deactivation');reset role;
 insert into public.resignations(id,employee_id,last_working_day,reason,status,offboarding_checklist_id) values(resignation,emp,d,'Rollback clearance','Processing',checklist);
 if not exists(select 1 from auth.users where id=eauth and banned_until>now()) then raise exception 'Inactive account not banned';end if;
 if not exists(select 1 from public.shift_assignments where employee_id=emp) then raise exception 'Employee history lost';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',eauth,'role','authenticated')::text,true);set local role authenticated;
 if public.current_hris_user_id() is not null then raise exception 'Inactive identity retains regular access';end if;
 denied:=false;begin perform public.assert_hris_account_active();exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Stale inactive JWT bypassed request guard';end if;
 if public.hris_storage_account_active() then raise exception 'Inactive storage access retained';end if;
 denied:=false;begin perform public.manage_offboarding_access(checklist,now()+interval '1 day','Unauthorized grant');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Employee granted own offboarding access';end if;reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',hauth,'role','authenticated')::text,true);set local role authenticated;
 grant_result:=public.manage_offboarding_access(checklist,now()+interval '1 day','Rollback limited access');reset role;
 perform set_config('request.jwt.claims','{"role":"anon"}',true);set local role anon;
 result:=public.offboarding_portal(grant_result->>'token');
 if jsonb_array_length(result->'tasks')<>1 then raise exception 'Own offboarding tasks unavailable';end if;
 denied:=false;begin perform public.offboarding_portal(grant_result->>'token','another-task','Wrong task');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-task submission allowed';end if;
 result:=public.upload_offboarding_document(grant_result->>'token',task,document,'clearance.txt','aGVsbG8=');
 perform public.upload_offboarding_document(grant_result->>'token',task,document,'clearance.txt','aGVsbG8=');
 if result->'tasks'->0->>'status'<>'Pending Approval' then raise exception 'Submission bypassed HR clearance';end if;
 denied:=false;begin perform public.get_my_hris_bootstrap();exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Offboarding capability provided normal account access';end if;reset role;
 if (select count(*) from offboarding_access.documents where id=document)<>1 then raise exception 'Duplicate upload';end if;
 if not exists(select 1 from auth.users where id=eauth and banned_until>now()) then raise exception 'Offboarding unbanned regular login';end if;
 update offboarding_access.grants set expires_at=now()-interval '1 second' where checklist_id=checklist;
 set local role anon;denied:=false;begin perform public.offboarding_portal(grant_result->>'token');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Expired access remained usable';end if;reset role;
 perform offboarding_access.expire_grants();
 if not exists(select 1 from offboarding_access.grants where checklist_id=checklist and revoked_at is not null) then raise exception 'Expiry not recorded';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',hauth,'role','authenticated')::text,true);set local role authenticated;
 grant_result:=public.manage_offboarding_access(checklist,now()+interval '1 day','Rollback completion check');reset role;
 update public.onboarding_checklists set tasks=(select jsonb_agg(t||jsonb_build_object('status','Completed')) from jsonb_array_elements(tasks) t) where id=checklist;
 set local role authenticated;perform public.complete_offboarding_clearance(resignation);perform public.complete_offboarding_clearance(resignation);reset role;
 perform set_config('request.jwt.claims','{"role":"anon"}',true);set local role anon;
 denied:=false;begin perform public.offboarding_portal(grant_result->>'token');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Completed offboarding retained access';end if;reset role;
 -- Filter a published report by its saved BU snapshot; no response contents leave SQL.
 select s.id,h.auth_user_id into strict survey,hauth from public.pulse_surveys s
 join public.hris_users h on h.id=s.created_by_user_id join pulse_audience_private.publications p on p.survey_id=s.id
 where lower(h.status)='active' and h.auth_user_id is not null and exists(select 1 from pulse_audience_private.recipients r where r.survey_id=s.id) limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',hauth,'role','authenticated')::text,true);
 set local role authenticated;report:=public.get_pulse_compliance(survey);
 unit:=report->'rows'->0->>'businessUnit';
 select array_agg((r->>'id')::uuid) into ids from jsonb_array_elements(report->'rows') r where r->>'businessUnit' is not distinct from unit;
 result:=public.export_pulse_compliance(survey,ids,jsonb_build_object('businessUnit',unit));
 if jsonb_array_length(result->'rows')<>cardinality(ids) or not(result?'results') then raise exception 'Filtered export details/results mismatch';end if;
 denied:=false;begin perform public.export_pulse_compliance(survey,array[emp],jsonb_build_object('businessUnit',unit));exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unassigned employee included in export';end if;reset role;
end $$;
select 'PASS: suspension/payroll preservation, active/inactive access, restricted offboarding/expiry/completion/upload retry, filtered export and authorization checks. Transaction rolled back.' as result;
