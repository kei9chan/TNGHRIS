begin;
do $$
declare hr record; reporter record; respondent record; other_user record; ir record;
 batch jsonb; again jsonb; nonce uuid:=gen_random_uuid(); due timestamptz:=clock_timestamp()+interval '2 days';
 qr uuid; qe uuid; mid uuid; v jsonb; snapshot jsonb; path text; rcount integer; decision uuid;
begin
 select h.id,h.auth_user_id into hr from public.hris_users h join public.user_roles ur on ur.user_id=h.id
 where ur.is_active and ur.role_id in ('HR Manager','Admin') and lower(h.status)='active' and h.auth_user_id is not null order by h.id limit 1;
 if hr.id is null then raise exception 'Missing HR fixture';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',hr.auth_user_id,'role','authenticated')::text,true);
 select r.id,r.reported_by,n.id nte_id,n.recipient_employee_id into ir
 from public.incident_reports r join public.ntes n on n.incident_report_id=r.id
 join public.hris_users a on a.id=r.reported_by join public.hris_users b on b.id=n.recipient_employee_id
 where case_correspondence.hr_admin(r.id) and private.nte_is_published(n.id) and n.status::text<>'Closed'
 and lower(a.status)='active' and lower(b.status)='active' and a.auth_user_id is not null and b.auth_user_id is not null
 and a.id<>b.id and a.id<>hr.id and b.id<>hr.id
 and not exists(select 1 from public.resolutions where incident_report_id=r.id)
 order by n.created_at desc limit 1;
 if ir.id is null then raise exception 'Missing issued NTE fixture with distinct linked reporter and respondent';end if;
 select to_jsonb(r) into snapshot from public.incident_reports r where id=ir.id;
 select id,auth_user_id into reporter from public.hris_users where id=ir.reported_by;
 select id,auth_user_id into respondent from public.hris_users where id=ir.recipient_employee_id;
 select id,auth_user_id into other_user from public.hris_users h where auth_user_id is not null and lower(status)='active'
 and id not in (hr.id,reporter.id,respondent.id)
 and not exists(select 1 from public.user_roles where user_id=h.id and is_active and role_id<>'Employee')
 and not exists(select 1 from case_correspondence.questions where case_id=ir.id and recipient=h.id) limit 1;
 if other_user.id is null then raise exception 'Missing unrelated employee fixture';end if;
 execute 'set local role authenticated';
 batch:=public.request_case_information(ir.id,ir.nte_id,'both','TEST: Please clarify the timeline',due,true,'HR_ONLY_SUPPLEMENT_MARKER',nonce);
 again:=public.request_case_information(ir.id,ir.nte_id,'both','TEST: Please clarify the timeline',due,true,'HR_ONLY_SUPPLEMENT_MARKER',nonce);
 if batch->>'requestId'<>again->>'requestId' or jsonb_array_length(batch->'questionIds')<>2 then raise exception 'Both/idempotency failed';end if;
 begin
  perform public.request_case_information(ir.id,ir.nte_id,'both','Changed question',due,true,'',nonce);
  raise exception 'REUSED_NONCE_ACCEPTED';
 exception when others then if sqlerrm='REUSED_NONCE_ACCEPTED' then raise;end if;end;
 v:=public.get_case_questions(ir.id);
 if v::text not like '%HR_ONLY_SUPPLEMENT_MARKER%' or not (v->>'pendingInformation')::boolean then raise exception 'HR request note/pending status missing';end if;
 execute 'reset role';
 select id into qr from case_correspondence.questions where request_id=(batch->>'requestId')::uuid and recipient=reporter.id and kind='reporter';
 select id into qe from case_correspondence.questions where request_id=(batch->>'requestId')::uuid and recipient=respondent.id and kind='respondent';
 if qr is null or qe is null then raise exception 'Recipient routing failed';end if;
 if (select count(*) from case_correspondence.deliveries where event_key in(qr::text||':question',qe::text||':question'))<>2 then raise exception 'Email queue missing';end if;
 if (select count(*) from public.notifications where dedupe_key in('case-correspondence:'||qr::text||':question','case-correspondence:'||qe::text||':question'))<>2 then raise exception 'HRIS notification missing';end if;
 -- Test actual NTE closure trigger, preserving the current status on rollback.
 begin update public.ntes set status='Closed' where id=ir.nte_id;raise exception 'PENDING_CLOSE_ALLOWED';
 exception when others then if sqlerrm not like 'Additional information is pending.%' then raise;end if;end;
 -- Decision guard is enforced on the table, not just the screen.
 begin
  insert into public.resolutions(incident_report_id,employee_id,nte_id,resolution_type,details,status,closed_by_user_id)
  values(ir.id,respondent.id,ir.nte_id,'CaseDismissed','Rollback only','Pending Approval',hr.id);
  raise exception 'PENDING_DECISION_ALLOWED';
 exception when others then if sqlerrm not like 'Additional information is pending.%' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reporter.auth_user_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 v:=public.get_case_questions(ir.id);
 if v::text like '%HR_ONLY_SUPPLEMENT_MARKER%' or exists(select 1 from jsonb_array_elements(v->'questions') q where q->>'id'=qe::text) then raise exception 'Reporter data leak';end if;
 begin perform public.save_case_reply(ir.id,qe,'Wrong recipient','[]','[]',false,'reply',gen_random_uuid());raise exception 'CROSS_REPLY_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform public.save_case_reply(ir.id,qr,'Missing required attachment','[]','[]',false,'reply',gen_random_uuid());raise exception 'MISSING_ATTACHMENT_ALLOWED';
 exception when others then if sqlerrm not like 'A supporting attachment is required%' then raise;end if;end;
 perform public.save_case_reply(ir.id,qr,'Reporter draft','[]','[]',true,'reply',gen_random_uuid());
 execute 'reset role';
 path:=ir.id::text||'/'||reporter.id::text||'/'||gen_random_uuid()::text||'.pdf';
 insert into storage.objects(bucket_id,name) values('case-correspondence',path);
 execute 'set local role authenticated';
 nonce:=gen_random_uuid();
 mid:=public.save_case_reply(ir.id,qr,'Reporter supplemental statement',jsonb_build_array(path),'[]',false,'reply',nonce);
 if public.save_case_reply(ir.id,qr,'Reporter supplemental statement',jsonb_build_array(path),'[]',false,'reply',nonce)<>mid then raise exception 'Reply retry duplicated';end if;
 execute 'reset role';
 if (select status from case_correspondence.cases where id=ir.id)<>'Awaiting Additional Information' then raise exception 'One reply cleared other pending recipient';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',respondent.auth_user_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 v:=public.get_case_questions(ir.id);
 if v::text like '%HR_ONLY_SUPPLEMENT_MARKER%' or v::text like '%Reporter supplemental statement%' then raise exception 'Respondent data leak';end if;
 if public.case_file_access(path,false) then raise exception 'Cross-recipient attachment access';end if;
 if not exists(select 1 from jsonb_array_elements(public.get_my_case_questions()) q where q->>'id'=qe::text) then raise exception 'Respondent action missing';end if;
 execute 'reset role';
 path:=ir.id::text||'/'||respondent.id::text||'/'||gen_random_uuid()::text||'.pdf';
 insert into storage.objects(bucket_id,name) values('case-correspondence',path);
 execute 'set local role authenticated';
 perform public.save_case_reply(ir.id,qe,'Respondent supplemental statement',jsonb_build_array(path),'[]',false,'reply',gen_random_uuid());
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_user.auth_user_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin perform public.get_case_questions(ir.id);raise exception 'UNRELATED_READ_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform public.request_case_information(ir.id,ir.nte_id,'reporter','Unauthorized',due,false,'',gen_random_uuid());raise exception 'UNAUTHORIZED_SEND_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform * from case_correspondence.requests;raise exception 'PRIVATE_TABLE_ALLOWED';exception when insufficient_privilege then null;end;
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',hr.auth_user_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 v:=public.get_case_questions(ir.id);
 if v::text not like '%Reporter supplemental statement%' or v::text not like '%Respondent supplemental statement%' then raise exception 'Official record incomplete';end if;
 perform public.review_case_correspondence(ir.id,qr,'reviewed','Reviewed reporter supplement');
 perform public.review_case_correspondence(ir.id,qe,'reviewed','Reviewed respondent supplement');
 -- Recipient-only options and optional attachments.
 batch:=public.request_case_information(ir.id,ir.nte_id,'reporter','Second clarification',due,false,'',gen_random_uuid());
 execute 'reset role';
 select id into qr from case_correspondence.questions where request_id=(batch->>'requestId')::uuid;
 update case_correspondence.questions set deadline=clock_timestamp()-interval '1 minute' where id=qr;
 perform case_correspondence.tick();perform case_correspondence.tick();
 if (select count(*) from case_correspondence.deliveries where event_key like qr::text||':%:reviewer-overdue')<>1 then raise exception 'Deadline notification missing/duplicated';end if;
 if not exists(select 1 from case_correspondence.deliveries where recipient=hr.id and event='Case Response Received' and case_id=ir.id) then raise exception 'HR response notification missing';end if;
 if (select to_jsonb(r) from public.incident_reports r where id=ir.id) is distinct from snapshot then raise exception 'Original IR changed';end if;
 begin update case_correspondence.messages set body='overwrite' where id=mid;raise exception 'IMMUTABILITY_FAILED';exception when others then if sqlerrm='IMMUTABILITY_FAILED' then raise;end if;end;
 begin update case_correspondence.requests set internal_note='overwrite' where id=(batch->>'requestId')::uuid;raise exception 'NOTE_IMMUTABILITY_FAILED';exception when others then if sqlerrm='NOTE_IMMUTABILITY_FAILED' then raise;end if;end;
end$$;
select 'PASS: both recipients, separate threads, private notes, required attachments, retries, official record, closure/decision guards, notifications and overdue deduplication; all test writes rolled back' result;
rollback;
