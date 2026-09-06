-- Production-safe verification transaction: no fixtures or source changes commit.
-- Run only as the database administrator. Assertions use authenticated RPCs.
begin;
set local lock_timeout='2s'; set local statement_timeout='20s';
do $test$
declare author_auth uuid; reviewer_auth uuid; target_auth uuid; target_id uuid; reviewer_employee uuid;
 scope_a uuid; scope_b uuid; today date:=(now() at time zone 'Asia/Manila')::date;
 original_snapshot text; u public.hris_users; ctx jsonb; payload jsonb; components jsonb:='[]';
 initial_id uuid; future_id uuid; invalid_id uuid; correction_id uuid; denied boolean; first_hash text; bank_hash text;
begin
 select a.id into strict author_auth from auth.users a where lower(a.email)='kay@thenextperience.com';
 select h.id,h.auth_user_id into strict reviewer_employee,reviewer_auth from public.hris_users h
 where h.auth_user_id is not null and h.auth_user_id<>author_auth and lower(h.status)='active' and not coalesce(h.is_duplicate,false)
 and exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=h.id and ur.is_active and r.is_active and r.id='HR Manager') order by h.id limit 1;
 select * into strict u from public.hris_users h where h.auth_user_id is not null and h.auth_user_id not in(author_auth,reviewer_auth)
 and h.rate_type='Monthly' and h.rate_amount>0 and coalesce(h.salary_basic,0)=0 and lower(h.status)='active' and not coalesce(h.is_duplicate,false)
 and nullif(btrim(h.bank_name),'') is not null and nullif(btrim(h.bank_account_number),'') is not null
 and h.business_unit_id is not null and not exists(select 1 from public.payroll_pay_packages p where p.employee_id=h.id) order by h.id limit 1;
 target_id:=u.id;target_auth:=u.auth_user_id;scope_a:=private.payroll_employee_bu_scope(u.id);
 select id into strict scope_b from public.payroll_access_scopes where kind='business_unit' and id<>scope_a limit 1;
 original_snapshot:=md5(to_jsonb(u)::text);
 insert into public.payroll_access_grants(auth_user_id,scope_id,permission,granted_by,grant_reason)
 values(author_auth,scope_a,'prepare_pr',reviewer_auth,'Rollback-only test fixture'),(reviewer_auth,scope_a,'authorize_hr',author_auth,'Rollback-only test fixture');
 if coalesce(u.salary_deminimis,0)>0 then components:=components||jsonb_build_array(jsonb_build_object('name','De minimis','amount',u.salary_deminimis::text,'legacyField','deminimis','recurrence','recurring')); end if;
 if coalesce(u.salary_reimbursable,0)>0 then components:=components||jsonb_build_array(jsonb_build_object('name','Reimbursable','amount',u.salary_reimbursable::text,'legacyField','reimbursable','recurrence','recurring')); end if;
 components:=components||jsonb_build_array(jsonb_build_object('name','De minimis example: no implied exemption','amount','123.456789','legacyField','','recurrence','one_time','payableDate',(today+12)::text,'tax','unreviewed'));

 perform set_config('request.jwt.claims',jsonb_build_object('sub',target_auth,'role','authenticated')::text,true);
 set local role authenticated;
 denied:=false;begin perform public.get_payroll_pay_packages(reviewer_employee);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unassigned user could view another salary';end if;
 denied:=false;begin insert into public.payroll_pay_audit(scope_id,action,reason) values(scope_a,'test','forbidden');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Direct client table write was allowed';end if;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',author_auth,'role','authenticated')::text,true);
 ctx:=public.get_payroll_pay_packages(target_id);first_hash:=ctx->>'sourceHash';
 if not (ctx->>'canEdit')::boolean then raise exception 'Author permission fixture unavailable';end if;
 if (ctx#>>'{sources,0,baseAmount}')::numeric<>u.rate_amount then raise exception 'Preview used zero legacy salary instead of the actual rate';end if;
 payload:=jsonb_build_object('effectiveFrom',(today-30)::text,'rateType','Monthly','baseAmount',u.rate_amount,'components',components,'sourceRef','Rollback-only source verification','reason','Rollback-only initial snapshot');
 denied:=false;begin perform public.save_payroll_pay_package(target_id,scope_b,payload,first_hash);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-BU draft was allowed';end if;
 initial_id:=public.save_payroll_pay_package(target_id,scope_a,payload,first_hash);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer_auth,'role','authenticated')::text,true);
 perform public.review_payroll_pay_package(initial_id,true,'Rollback-only approval');
 reset role;
 if (select md5(to_jsonb(h)::text) from public.hris_users h where h.id=target_id)<>original_snapshot then raise exception 'Approval altered the HRIS salary writer';end if;
 if not exists(select 1 from public.payroll_pay_packages p,jsonb_array_elements(p.components) c where p.id=initial_id and (c->>'amount')::numeric=123.456789 and c->>'tax'='unreviewed') then raise exception 'Component precision or explicit unreviewed treatment was lost';end if;
 denied:=false;begin update public.payroll_pay_packages set base_amount=1 where id=initial_id;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Approved package was mutable';end if;

 set local role authenticated;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',author_auth,'role','authenticated')::text,true);
 ctx:=public.get_payroll_pay_packages(target_id);
 invalid_id:=public.save_payroll_pay_package(target_id,scope_a,payload||jsonb_build_object('effectiveFrom',today::text,'baseAmount',u.rate_amount+1),ctx->>'sourceHash');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer_auth,'role','authenticated')::text,true);
 denied:=false;begin perform public.review_payroll_pay_package(invalid_id,true,'Rollback-only invalid source');exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Independent base-salary writer was allowed';end if;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',author_auth,'role','authenticated')::text,true);
 ctx:=public.get_payroll_pay_packages(target_id);
 future_id:=public.save_payroll_pay_package(target_id,scope_a,payload||jsonb_build_object('effectiveFrom',(today+10)::text),ctx->>'sourceHash');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer_auth,'role','authenticated')::text,true);
 perform public.review_payroll_pay_package(future_id,true,'Rollback-only future package');
 ctx:=public.get_payroll_pay_packages(target_id);
 if not exists(select 1 from jsonb_array_elements(ctx->'packages') p where p->>'id'=initial_id::text and (p->>'effective_until')::date=today+10) then raise exception 'Effective boundaries overlap or are missing';end if;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',author_auth,'role','authenticated')::text,true);
 ctx:=public.get_payroll_pay_packages(target_id);
 correction_id:=public.save_payroll_pay_package(target_id,scope_a,payload,ctx->>'sourceHash');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer_auth,'role','authenticated')::text,true);
 denied:=false;begin perform public.review_payroll_pay_package(correction_id,true,'Rollback-only duplicate date');exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Two approved base rates for one effective date were allowed';end if;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',author_auth,'role','authenticated')::text,true);
 ctx:=public.get_payroll_pay_packages(target_id);
 correction_id:=public.save_payroll_pay_package(target_id,scope_a,payload||jsonb_build_object('replacesId',initial_id),ctx->>'sourceHash');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer_auth,'role','authenticated')::text,true);
 perform public.review_payroll_pay_package(correction_id,true,'Rollback-only linked correction');
 reset role;
 if (select status from public.payroll_pay_packages where id=initial_id)<>'superseded' then raise exception 'Correction discarded history';end if;
 if (select count(*) from public.payroll_pay_packages where employee_id=target_id and status='approved')<>2 then raise exception 'Unexpected approved version count';end if;

 -- Change the existing source only inside this rollback transaction, to prove drift
 -- is detected without intercepting or replacing its existing writer.
 update public.hris_users set salary_basic=rate_amount+2 where id=target_id;
 set local role authenticated;
 ctx:=public.get_payroll_pay_packages(target_id);
 if (ctx->>'sourceMatches')::boolean then raise exception 'Conflicting HRIS salary fields were not flagged';end if;
 reset role;
 update public.hris_users set salary_basic=u.salary_basic where id=target_id;
 update public.hris_users set rate_amount=rate_amount+1 where id=target_id;
 set local role authenticated;
 ctx:=public.get_payroll_pay_packages(target_id);
 if (ctx->>'sourceMatches')::boolean then raise exception 'Changed HRIS source was not flagged';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',author_auth,'role','authenticated')::text,true);
 denied:=false;begin perform public.save_payroll_pay_package(target_id,scope_a,payload,first_hash);exception when serialization_failure then denied:=true;end;
 if not denied then raise exception 'Stale import preview was accepted';end if;
 if public.check_payroll_operation('prepare_pr',scope_a,'calculate') then raise exception 'Payroll processing was enabled';end if;
 reset role;
 bank_hash:=private.payroll_bank_hash(target_id);
 set local role authenticated;
 denied:=false;begin perform public.verify_payroll_payment_details(target_id,bank_hash,'Rollback-only bank source');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Bank verification allowed without Finance duty';end if;
 reset role;
 insert into public.payroll_access_grants(auth_user_id,scope_id,permission,granted_by,grant_reason)
 values(author_auth,scope_a,'authorize_finance',reviewer_auth,'Rollback-only bank verification fixture');
 set local role authenticated;
 perform public.verify_payroll_payment_details(target_id,bank_hash,'Rollback-only bank source');
 ctx:=public.get_payroll_pay_packages(target_id);
 if not (ctx#>>'{bank,verified}')::boolean then raise exception 'Bank verification was not recorded';end if;
 if ctx#>>'{bank,accountLast4}'<>right(u.bank_account_number,4) or length(ctx#>>'{bank,accountLast4}')>4 then raise exception 'Bank masking failed';end if;
 reset role;
 update public.hris_users set bank_account_number=bank_account_number||'0' where id=target_id;
 set local role authenticated;
 ctx:=public.get_payroll_pay_packages(target_id);
 if (ctx#>>'{bank,verified}')::boolean then raise exception 'Changed bank details retained verification';end if;
 denied:=false;begin perform public.verify_payroll_payment_details(target_id,bank_hash,'Rollback-only stale bank source');exception when serialization_failure then denied:=true;end;
 if not denied then raise exception 'Stale bank verification accepted';end if;
 reset role;
 perform set_config('payroll_phase2.result','PASS: source preview, scope denial, table-write denial, source enforcement/conflict detection, component precision/treatment, immutable history, future dates, overlap prevention, linked correction, stale preview, bank permission/masking/verification invalidation and processing off',true);
end $test$;
select current_setting('payroll_phase2.result') as result;
rollback;
