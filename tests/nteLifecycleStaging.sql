-- STAGING ONLY. Isolated fixture records and all changes are rolled back.
begin;
do $$
declare employee uuid:='a1000000-0000-0000-0000-000000000001';other_employee uuid:='a1000000-0000-0000-0000-000000000002';admin_id uuid;admin_auth uuid;ir uuid;nte uuid;r jsonb;blocked boolean;d uuid;review jsonb;today date:=(now() at time zone 'Asia/Manila')::date;
begin
 select h.id,h.auth_user_id into admin_id,admin_auth from public.hris_users h join public.user_roles ur on ur.user_id=h.id where ur.role_id='Admin' and ur.is_active limit 1;
 insert into public.incident_reports(category,description,date_time,involved_employee_ids,involved_employee_names,reported_by,assigned_to_id)
 values('TEST ONLY','CONFIDENTIAL ORIGINAL IR',now()-interval '10 days',array[employee],array['Isolated Test Employee'],admin_id,admin_id) returning id into ir;
 insert into public.ntes(incident_report_id,issued_by_user_id,recipients,recipient_names,recipient_employee_id,details,status,created_at)
 values(ir,admin_id,array[employee],array['Isolated Test Employee'],employee,'Test allegation','Draft',now()-interval '10 days') returning id into nte;
 perform set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000001',true);
 if private.can_view_nte(nte) then raise exception 'FAIL: employee can view draft';end if;
 blocked:=false;begin perform public.record_nte_receipt(nte);exception when others then blocked:=true;end;
 if not blocked then raise exception 'FAIL: receipt before issuance';end if;
 -- Fixture transitions avoid inventing an approval by a real person.
 update public.ntes set status='Rejected' where id=nte;
 insert into public.ntes(incident_report_id,issued_by_user_id,recipients,recipient_names,recipient_employee_id,details,status,created_at,workflow_history)
 values(ir,admin_id,array[employee],array['Isolated Test Employee'],employee,'Test allegation','Issued',now()-interval '10 days',jsonb_build_array(jsonb_build_object('newStatus','Issued','timestamp',now()-interval '9 days'))) returning id into nte;
 perform public.record_nte_receipt(nte);
 r:=public.get_nte_response_workflow(nte);
 if not(r->>'canRespond')::boolean then raise exception 'FAIL: recipient cannot respond after receipt';end if;
 if (r#>>'{receipt,deadline_exclusive}')::timestamptz<>((((now() at time zone 'Asia/Manila')::date+6)::timestamp) at time zone 'Asia/Manila') then raise exception 'FAIL: five calendar day end-of-day deadline';end if;
 if public.get_nte_incident_context(nte)->>'description'<>' ' and public.get_nte_incident_context(nte)->>'description'<>'' then raise exception 'FAIL: original IR leaked';end if;
 perform public.submit_nte_explanation(nte,'Isolated test explanation','data:image/png;base64,TEST','https://example.com/test.pdf');
 blocked:=false;begin perform public.submit_nte_explanation(nte,'Duplicate','data:image/png;base64,TEST');exception when others then blocked:=true;end;
 if not blocked then raise exception 'FAIL: duplicate explanation accepted';end if;
 perform set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000002',true);
 blocked:=false;begin perform public.get_nte_response_workflow(nte);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'FAIL: different employee can read';end if;
 perform set_config('request.jwt.claim.sub',admin_auth::text,true);
 -- Move only this staging fixture beyond its deadline to exercise cron idempotency.
 update private.nte_receipts set deadline_exclusive=now()-interval '1 second' where nte_id=nte;
 perform private.close_nte_response_windows();perform private.prepare_nod_drafts();perform private.close_nte_response_windows();perform private.prepare_nod_drafts();
 select id into d from public.resolutions where nte_id=nte;
 if d is null or (select count(*) from public.resolutions where nte_id=nte)<>1 then raise exception 'FAIL: automatic draft missing or duplicated';end if;
 if (select non_submission_notice from private.nte_receipts where nte_id=nte) is not null then raise exception 'FAIL: submitted explanation marked non-submission';end if;
 if (select resolution_type from public.resolutions where id=d)<>'Undetermined' then raise exception 'FAIL: automatic penalty';end if;
 blocked:=false;begin update private.nte_case_events set event='tamper' where nte_id=nte;exception when others then blocked:=true;end;
 if not blocked then raise exception 'FAIL: audit was mutable';end if;
 update public.resolutions set approver_steps=jsonb_build_array(jsonb_build_object('userId',admin_id,'userName','Staging approver','status','Pending')) where id=d;
 review:=jsonb_build_object('facts','Test facts','evidence','Test evidence','explanation','Explanation recorded','findings','Test findings','policy','Test policy','circumstances','None','reasons','Test review only','effectiveDate',today,'decision','Suspension','days','1','scheduleStatus','TBA');
 perform public.act_on_nod(nte,'submit',review);
 perform public.act_on_nod(nte,'approve');
 if (select status from private.nte_implementation where resolution_id=d)<>'Decision Issued — Suspension Pending Implementation' then raise exception 'FAIL: TBA status';end if;
 perform set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000001',true);
 perform public.act_on_nod(nte,'acknowledge',jsonb_build_object('signature','data:image/png;base64,TEST'));
 if (select status::text from public.ntes where id=nte)='Closed' then raise exception 'FAIL: acknowledgment auto-closed suspension';end if;
 blocked:=false;begin perform public.act_on_nod(nte,'save',review);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'FAIL: employee edits final decision';end if;
 perform set_config('request.jwt.claim.sub',admin_auth::text,true);
 blocked:=false;begin perform public.act_on_nod(nte,'complete','{"reason":"test"}');exception when others then blocked:=true;end;
 if not blocked then raise exception 'FAIL: TBA completed without service';end if;
 perform public.act_on_nod(nte,'schedule',jsonb_build_object('dates',jsonb_build_array(today)));
 perform public.act_on_nod(nte,'served',jsonb_build_object('dates',jsonb_build_array(today),'reason','Isolated staging service confirmation','returnToWork',today+1));
 if (select status::text from public.ntes where id=nte)<>'Closed' then raise exception 'FAIL: fully served case not closed';end if;

 -- A separate no-response/deduction case, with no production data.
 insert into public.ntes(incident_report_id,issued_by_user_id,recipients,recipient_names,recipient_employee_id,details,status,created_at,workflow_history)
 values(ir,admin_id,array[employee],array['Isolated Test Employee'],employee,'Test non-response allegation','Issued',now()-interval '10 days',jsonb_build_array(jsonb_build_object('newStatus','Issued','timestamp',now()-interval '9 days'))) returning id into nte;
 perform public.record_nte_receipt(nte,now()-interval '8 days','Isolated staging service evidence');
 perform private.close_nte_response_windows();perform private.prepare_nod_drafts();
 select id into d from public.resolutions where nte_id=nte;
 if d is null then raise exception 'FAIL: second case draft';end if;
 if (select non_submission_notice from private.nte_receipts where nte_id=nte) is null then raise exception 'FAIL: non-submission notice missing';end if;
 update public.resolutions set approver_steps=jsonb_build_array(jsonb_build_object('userId',admin_id,'userName','Staging approver','status','Pending')) where id=d;
 review:=review||jsonb_build_object('decision','Salary Deduction','legalBasis','Staging test only','total','100','perCutoff','50','installments','2','firstDate',today,'finalDate',today+30);
 perform public.act_on_nod(nte,'submit',review);perform public.act_on_nod(nte,'approve');
 perform set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000001',true);
 blocked:=false;begin perform public.act_on_nod(nte,'sign_atd','{"consent":"I authorize the stated deduction","signature":"data:image/png;base64,TEST"}');exception when others then blocked:=true;end;
 if not blocked then raise exception 'FAIL: ATD before NOD acknowledgment';end if;
 perform public.act_on_nod(nte,'acknowledge','{"signature":"data:image/png;base64,TEST"}');
 if (select employee_signed_at from private.nte_implementation where resolution_id=d) is not null then raise exception 'FAIL: acknowledgment became deduction consent';end if;
 perform public.act_on_nod(nte,'sign_atd','{"consent":"I authorize the stated deduction","signature":"data:image/png;base64,TEST"}');
 perform set_config('request.jwt.claim.sub',admin_auth::text,true);
 perform public.act_on_nod(nte,'verify_atd','{"reason":"Isolated test signature and basis verification"}');
 if (select hr_verified_at from private.nte_implementation where resolution_id=d) is null then raise exception 'FAIL: HR verification missing';end if;
 raise notice 'PASS: draft access, receipt, five-day deadline, redacted IR, response, duplicate, IDOR, cron and immutable audit';
end $$;
rollback;
