-- Essential server flows only. Synthetic fixtures and their audit rows are all rolled back.
begin;set local lock_timeout='2s';set local statement_timeout='45s';
do $$declare emp uuid:=gen_random_uuid();ea uuid:=gen_random_uuid();hr uuid:=gen_random_uuid();ha uuid:=gen_random_uuid();fin uuid:=gen_random_uuid();fa uuid:=gen_random_uuid();other uuid:=gen_random_uuid();oa uuid:=gen_random_uuid();bu uuid:=gen_random_uuid();scope uuid;sp uuid;run uuid;dis uuid;sl uuid;issue uuid;req uuid:=gen_random_uuid();v jsonb;denied boolean;adj uuid;sp2 uuid;run2 uuid;dis2 uuid;sl2 uuid;expected_payload jsonb;path text;begin
 insert into public.business_units(id,name) values(bu,'Rollback payroll self service');
 select id into scope from public.payroll_access_scopes where business_unit_id=bu and kind='business_unit';
 if scope is null then insert into public.payroll_access_scopes(name,kind,business_unit_id) values('Rollback payroll self service','business_unit',bu) returning id into scope;end if;
 insert into auth.users(id,email) values(ea,ea||'@example.invalid'),(ha,ha||'@example.invalid'),(fa,fa||'@example.invalid'),(oa,oa||'@example.invalid');
 insert into public.hris_users(id,auth_user_id,email,first_name,last_name,full_name,status,role,business_unit_id,business_unit,employee_id) values
 (emp,ea,ea||'@example.invalid','Fixture','Employee','Fixture Employee','Active','Employee',bu,'Rollback payroll self service','TEST-PAY'),
 (hr,ha,ha||'@example.invalid','Fixture','HR','Fixture HR','Active','HR Manager',bu,'Rollback payroll self service','TEST-HR'),
 (fin,fa,fa||'@example.invalid','Fixture','Finance','Fixture Finance','Active','Finance Staff',bu,'Rollback payroll self service','TEST-FIN'),
 (other,oa,oa||'@example.invalid','Fixture','Manager','Fixture Manager','Active','Business Unit Manager',bu,'Rollback payroll self service','TEST-OTHER');
 insert into public.user_roles(user_id,role_id,is_active) values(emp,'Employee',true),(hr,'HR Manager',true),(hr,'Admin',true),(fin,'Finance Staff',true),(fin,'Admin',true),(other,'Business Unit Manager',true);
 insert into public.payroll_access_grants(auth_user_id,scope_id,permission,granted_by,grant_reason) values(ha,scope,'review_endorse',ha,'Rollback fixture'),(fa,scope,'authorize_finance',ha,'Rollback fixture');
 insert into public.payroll_special_runs(scope_id,employee_id,kind,case_key,version,date_from,date_to,pay_date,inputs,source_snapshot,source_hash,result,gross_amount,deduction_amount,net_amount,reason,created_by)
 values(scope,emp,'supplement','rollback-original',1,current_date-15,current_date,current_date,'{}','{}','original','{}',1000,100,900,'Rollback fixture',fin) returning id into sp;
 insert into public.payroll_approval_runs(scope_id,special_run_id,source_hash,source_snapshot,settlement_key,submitted_by,submission_ref,correction_contact,mode)
 values(scope,sp,'original',jsonb_build_object('version',1),'rollback-original',fin,'Rollback fixture','Payroll team','live') returning id into run;
 insert into public.payroll_disbursements(run_id,settlement_key,scope_id,reference,amount,paid_on,recorded_by) values(run,'rollback-original',scope,'Rollback original',900,current_date,fin) returning id into dis;
 expected_payload:=jsonb_build_object('employeeName','Fixture Employee','from',current_date-15,'to',current_date,'payDate',current_date,'gross','1000','deductions','100','net','900','tax','100','version','1','contact','Payroll team','lines',jsonb_build_array(jsonb_build_object('label','Regular pay','date',current_date,'quantity','8','rate','125','amount','1000')),'contributions','[]'::jsonb,'loans','[]'::jsonb,'otherDeductions','[]'::jsonb);
 insert into public.payroll_released_payslips(run_id,disbursement_id,employee_id,payload) values(run,dis,emp,expected_payload) returning id into sl;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ea,'role','authenticated')::text,true);set local role authenticated;
 v:=public.get_payroll_self_service_payslip(sl);if v->>'net'<>'900' or v->>'employeeNumber'<>'TEST-PAY' or v#>>'{lines,0,rate}'<>'125' then raise exception 'Frozen details missing';end if;
 if jsonb_array_length(public.list_payroll_self_service_payslips())<>1 then raise exception 'Own payslip list incorrect';end if;
 issue:=public.submit_payroll_issue(sl,'Missing overtime','lines:0',current_date,'Worked extra approved hours','Review OT',req);
 if issue<>public.submit_payroll_issue(sl,'Missing overtime','lines:0',current_date,'Worked extra approved hours','Review OT',req) then raise exception 'Duplicate submission';end if;
 denied:=false;begin perform public.act_payroll_issue(issue,1,'Resolved','Self approved','');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Self approval allowed';end if;
 path:=issue||'/'||gen_random_uuid()||'.pdf';
 insert into storage.objects(bucket_id,name) values('payroll-issue-support',path);
 perform public.attach_payroll_issue_file(issue,path,'Fixture.pdf');
 if not public.payroll_issue_file_access(path,false) then raise exception 'Own file inaccessible';end if;
 denied:=false;begin perform count(*) from public.payroll_issue_events;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Direct audit/internal notes access allowed';end if;
 reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',oa,'role','authenticated')::text,true);set local role authenticated;
 denied:=false;begin perform public.get_payroll_self_service_payslip(sl);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Other employee payslip access allowed';end if;
 denied:=false;begin perform public.get_payroll_issue(issue);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Other employee issue access allowed';end if;
 denied:=false;begin perform public.submit_payroll_issue(sl,'Other payroll issue','whole',null,'Attempt another employee issue','',gen_random_uuid());exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Other employee submission allowed';end if;
 if public.payroll_issue_file_access(path,false) or public.payroll_issue_file_access(path,true) or jsonb_array_length(public.list_payroll_issues(true))<>0 then raise exception 'Manager salary detail leaked';end if;
 reset role;perform set_config('request.jwt.claims',jsonb_build_object('sub',ha,'role','authenticated')::text,true);set local role authenticated;
 if jsonb_array_length(public.list_payroll_issues(true))<>1 then raise exception 'HR scoped queue missing';end if;
 perform public.act_payroll_issue(issue,1,'HR Review','HR is reviewing','Private HR note');
 perform public.act_payroll_issue(issue,2,'Needs Information','Please provide approved hours','');
 reset role;perform set_config('request.jwt.claims',jsonb_build_object('sub',ea,'role','authenticated')::text,true);set local role authenticated;
 v:=public.get_payroll_issue(issue);if v::text like '%Private HR note%' or v::text like '%internal_note%' then raise exception 'Internal note leaked to employee';end if;
 perform public.act_payroll_issue(issue,3,'reply','Attached approved hours','');
 reset role;perform set_config('request.jwt.claims',jsonb_build_object('sub',ha,'role','authenticated')::text,true);set local role authenticated;
 perform public.act_payroll_issue(issue,4,'Finance Verification','Hours verified; Finance to check','HR internal');
 denied:=false;begin perform public.act_payroll_issue(issue,5,'Resolved','HR cannot resolve','');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'HR bypassed Finance';end if;
 reset role;perform set_config('request.jwt.claims',jsonb_build_object('sub',fa,'role','authenticated')::text,true);set local role authenticated;
 adj:=public.prepare_payroll_issue_adjustment(issue,'Additional approved overtime');
 denied:=false;begin perform public.act_payroll_issue(issue,5,'Resolved','Correction pending','');exception when raise_exception then denied:=true;end;if not denied then raise exception 'Unreleased correction resolved';end if;
 denied:=false;begin perform public.link_payroll_issue_correction(issue,adj,sl,'revised');exception when raise_exception then denied:=true;end;if not denied then raise exception 'Original reused as correction';end if;
 reset role;
 -- Separately released correction fixture; no engine computation, authorization or payment is performed by the dispute RPC.
 insert into public.payroll_special_runs(scope_id,employee_id,kind,case_key,version,date_from,date_to,pay_date,inputs,source_snapshot,source_hash,result,gross_amount,deduction_amount,net_amount,reason,created_by)
 values(scope,emp,'correction','rollback-correction',1,current_date-15,current_date,current_date,'{}','{}','correction','{}',1100,100,1000,'Rollback correction',fin) returning id into sp2;
 insert into public.payroll_approval_runs(scope_id,special_run_id,source_hash,source_snapshot,settlement_key,submitted_by,submission_ref,correction_contact,mode)
 values(scope,sp2,'correction',jsonb_build_object('version',2),'rollback-correction',fin,'Adjustment '||adj,'Payroll team','live') returning id into run2;
 insert into public.payroll_approval_actions(run_id,step,action,actor_id,reason) select run2,n,'approve',case when n=5 then hr else fin end,'Rollback approval evidence' from generate_series(0,5) n;
 insert into public.payroll_disbursements(run_id,settlement_key,scope_id,reference,amount,paid_on,recorded_by) values(run2,'rollback-correction',scope,'Rollback correction',1000,current_date,fin) returning id into dis2;
 insert into public.payroll_released_payslips(run_id,disbursement_id,employee_id,payload,released_at) values(run2,dis2,emp,expected_payload||jsonb_build_object('version','2','gross','1100','net','1000'),clock_timestamp()) returning id into sl2;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',fa,'role','authenticated')::text,true);set local role authenticated;
 if jsonb_array_length(public.list_payroll_issue_correction_candidates(issue))<>1 then raise exception 'Released correction not selectable';end if;
 perform public.link_payroll_issue_correction(issue,adj,sl2,'revised');
 perform public.act_payroll_issue(issue,5,'Resolved','Corrected payslip released','Finance internal note');
 reset role;perform set_config('request.jwt.claims',jsonb_build_object('sub',ea,'role','authenticated')::text,true);set local role authenticated;
 v:=public.get_payroll_issue(issue);if v->>'status'<>'Resolved' or v::text like '%Finance internal note%' or v#>>'{correction,corrected_payslip_id}'<>sl2::text then raise exception 'Employee resolution incorrect';end if;
 if public.get_payroll_self_service_payslip(sl2)->>'correctionKind'<>'revised' then raise exception 'Revised label missing';end if;
 if public.get_payroll_self_service_payslip(sl)->>'net'<>'900' then raise exception 'Original snapshot changed';end if;
 reset role;
 if (select payload from public.payroll_released_payslips where id=sl)<>expected_payload then raise exception 'Original payroll mutated';end if;
 raise notice 'PASS: own snapshot, item details, duplicate request, scoped HR/Finance, needs information, internal privacy, attachment authorization, correction gate, revised link, original preservation';
end $$;
rollback;
