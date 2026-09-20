begin;
do $$
declare
 s uuid;bu uuid;employee uuid;generator uuid;hr uuid;finance uuid;generator_auth uuid;hr_auth uuid;finance_auth uuid;employee_auth uuid;
 ir uuid:=gen_random_uuid();nte uuid:=gen_random_uuid();resolution uuid:=gen_random_uuid();debt uuid;ctx jsonb;first_date date:='2026-10-05';
 failed boolean;regular numeric;final_amount numeric;
begin
 select id,business_unit_id into s,bu from public.payroll_access_scopes where kind='business_unit' and business_unit_id is not null limit 1;
 select id,auth_user_id into employee,employee_auth from public.hris_users where business_unit_id=bu and auth_user_id is not null and lower(status)='active' limit 1;
 select id,auth_user_id into generator,generator_auth from public.hris_users where auth_user_id is not null and lower(status)='active' and id<>employee limit 1;
 select id,auth_user_id into hr,hr_auth from public.hris_users where auth_user_id is not null and lower(status)='active' and id not in(employee,generator) limit 1;
 select id,auth_user_id into finance,finance_auth from public.hris_users where auth_user_id is not null and lower(status)='active' and id not in(employee,generator,hr) limit 1;
 if s is null or employee is null or generator is null or hr is null or finance is null then raise exception 'Phase 2 fixture prerequisites unavailable';end if;

 insert into public.user_roles(user_id,role_id,is_active) values(generator,'Finance Staff',true),(finance,'Finance Staff',true),(hr,'HR Staff',true) on conflict do nothing;
 insert into public.payroll_access_grants(auth_user_id,scope_id,permission,granted_by,grant_reason)
 select x.auth_id,s,x.permission,generator_auth,'Rollback-only Phase 2 verification' from (values(generator_auth,'authorize_finance'),(finance_auth,'authorize_finance'),(hr_auth,'review_endorse'))x(auth_id,permission)
 where not exists(select 1 from public.payroll_access_grants g where g.auth_user_id=x.auth_id and g.scope_id=s and g.permission=x.permission and g.revoked_at is null);

 insert into public.incident_reports(id,category,description,date_time,reported_by,involved_employee_ids,involved_employee_names)
 values(ir,'Other','Rollback-only NTE deduction verification',now(),generator,array[employee],array['Test employee']);
 insert into public.ntes(id,incident_report_id,issued_by_user_id,recipients,recipient_names,status,nte_number,recipient_employee_id,recipient_name_snapshot,workflow_history)
 values(nte,ir,generator,array[employee],array['Test employee'],'Issued','TEST-NTE-'||substr(nte::text,1,8),employee,'Test employee',jsonb_build_array(jsonb_build_object('newStatus','Issued','timestamp',now())));
 insert into public.resolutions(id,nte_id,incident_report_id,employee_id,resolution_type,details,closed_by_user_id,status,decision_date,sent_to_employee_at,employee_acknowledged_at,review_fields,document_reference)
 values(resolution,nte,ir,employee,'Salary Deduction','Approved loss recovery basis',generator,'Acknowledged',now(),now(),now(),jsonb_build_object('total','10000','effectiveDate','2026-10-01','legalBasis','Signed employment deduction authority required'),'NOD-TEST');
 insert into private.nte_implementation(resolution_id,status) values(resolution,'Decision Issued — ATD Pending');

 -- 3. ATD generation is impossible before NOD acknowledgment.
 update public.resolutions set status='Pending Acknowledgement',employee_acknowledged_at=null where id=resolution;
 perform set_config('request.jwt.claim.sub',generator_auth::text,true);failed:=false;
 begin perform public.generate_nte_authority_to_deduct(nte,'months',3,first_date,'Test months schedule');exception when others then failed:=position('employee-acknowledged' in sqlerrm)>0;end;
 if not failed then raise exception 'ATD was generated before NOD acknowledgment';end if;
 update public.resolutions set status='Acknowledged',employee_acknowledged_at=now() where id=resolution;

 -- 1 and 6. Month term expands to six exact cutoffs and adjusts the final installment.
 ctx:=public.generate_nte_authority_to_deduct(nte,'months',3,first_date,'Test months schedule');debt:=(ctx->>'id')::uuid;
 select installment into regular from public.payroll_debts where id=debt;
 select scheduled_amount into final_amount from public.payroll_debt_schedule where debt_id=debt order by sequence_no desc limit 1;
 if (select count(*) from public.payroll_debt_schedule where debt_id=debt)<>6 or regular<>1666.67 or final_amount<>1666.65 or (select sum(scheduled_amount) from public.payroll_debt_schedule where debt_id=debt)<>10000 then raise exception 'Month schedule arithmetic failed';end if;
 perform public.attach_nte_atd_document(nte,'generated',debt||'/1/ATD-test.pdf','ATD-test.pdf');

 -- 4. Unsigned ATD cannot enter payroll.
 failed:=false;begin perform private.validate_atd_deduction(employee,'ATD:'||resolution,regular,first_date);exception when others then failed:=position('employee signature' in sqlerrm)>0;end;
 if not failed then raise exception 'Unsigned ATD entered payroll';end if;

 perform set_config('request.jwt.claim.sub',employee_auth::text,true);
 perform public.act_on_nte_deduction(nte,'digital_sign','Employee signed current ATD',jsonb_build_object('consent','I authorize the stated deduction','signature','data:image/png;base64,AAAA'));
 failed:=false;begin perform private.validate_atd_deduction(employee,'ATD:'||resolution,regular,first_date);exception when others then failed:=position('HR verification' in sqlerrm)>0;end;
 if not failed then raise exception 'Unverified ATD entered payroll';end if;

 -- 5. HR verification and an independent Finance approval are required.
 perform set_config('request.jwt.claim.sub',hr_auth::text,true);perform public.act_on_nte_deduction(nte,'verify','Signature and legal basis verified','{}');
 perform set_config('request.jwt.claim.sub',finance_auth::text,true);perform public.act_on_nte_deduction(nte,'finance_approve','Independent Finance approval','{}');
 perform private.validate_atd_deduction(employee,'ATD:'||resolution,regular,first_date);

 -- 7. Wrong-employee and excessive/post-zero deductions are rejected.
 failed:=false;begin perform private.validate_atd_deduction(hr,'ATD:'||resolution,regular,first_date);exception when others then failed:=position('does not belong' in sqlerrm)>0;end;if not failed then raise exception 'Wrong employee was accepted';end if;
 failed:=false;begin perform private.validate_atd_deduction(employee,'ATD:'||resolution,10001,first_date);exception when others then failed:=position('excessive' in sqlerrm)>0;end;if not failed then raise exception 'Excessive deduction was accepted';end if;
 update public.payroll_debts set current_balance=0 where id=debt;
 failed:=false;begin perform private.validate_atd_deduction(employee,'ATD:'||resolution,1,first_date);exception when others then failed:=position('excessive' in sqlerrm)>0;end;if not failed then raise exception 'Post-zero deduction was accepted';end if;
 update public.payroll_debts set current_balance=10000 where id=debt;

 -- 2 and 8. Changing to cutoff repayment creates a new version and immutable audit trail.
 perform set_config('request.jwt.claim.sub',generator_auth::text,true);perform public.generate_nte_authority_to_deduct(nte,'cutoffs',3,first_date,'Revised to three payroll cutoffs');
 if (select current_atd_version from public.payroll_debts where id=debt)<>2 or (select status from public.payroll_nte_atd_versions where debt_id=debt and version_no=1)<>'Invalidated' or not exists(select 1 from public.payroll_nte_deduction_audit where debt_id=debt and action='Authority to Deduct revised') then raise exception 'ATD versioning or audit failed';end if;
 if (select count(*) from public.payroll_debt_schedule where debt_id=debt)<>3 or (select sum(scheduled_amount) from public.payroll_debt_schedule where debt_id=debt)<>10000 then raise exception 'Cutoff schedule arithmetic failed';end if;

 -- Duplicate posting control is structural and cannot be bypassed.
 if not exists(select 1 from pg_constraint where conrelid='public.payroll_debt_postings'::regclass and contype='u' and pg_get_constraintdef(oid) like '%debt_id, payroll_date%') then raise exception 'Duplicate cutoff control missing';end if;
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='payroll_debt_locked') then raise exception 'Locked-payroll guard missing';end if;

 raise notice 'PASS: 9 focused Phase 2 database checks passed; transaction will roll back.';
end$$;
rollback;
