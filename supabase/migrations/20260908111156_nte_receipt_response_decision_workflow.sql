-- Receipt and response records are separate from draft/approval timestamps.
create extension if not exists pg_cron with schema pg_catalog;
alter table public.ntes add column receipt_recorded_at timestamptz,add column response_stage text;
create table private.nte_receipts (
 nte_id uuid primary key references public.ntes(id), received_at timestamptz not null,
 recorded_at timestamptz not null default now(), recorded_by uuid not null references public.hris_users(id),
 method text not null check(method in ('Employee acknowledgment','Documented service')),
 proof text not null check(length(trim(proof))>0), deadline_exclusive timestamptz not null,
 closed_at timestamptz, non_submission_notice text, response_attachment text
);
create table private.nte_case_events (
 id bigint generated always as identity primary key, nte_id uuid not null references public.ntes(id),
 event text not null, actor uuid, occurred_at timestamptz not null default now(), details jsonb not null default '{}',
 dedupe_key text unique
);
alter table private.nte_receipts enable row level security;
alter table private.nte_case_events enable row level security;
revoke all on private.nte_receipts,private.nte_case_events from public,anon,authenticated;

create function private.nte_is_published(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ntes n where n.id=p_id and
 (n.status::text in ('Issued','Response Submitted','Hearing Scheduled','Waiver') or
 (n.status::text='Closed' and exists(select 1 from jsonb_array_elements(coalesce(n.workflow_history,'[]')) h where h->>'newStatus'='Issued'))));
$$;
create or replace function private.can_view_nte(p_nte_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.ntes n left join public.incident_reports ir on ir.id=n.incident_report_id
 where n.id=p_nte_id and ((n.recipient_employee_id=public.current_hris_user_id() and private.nte_is_published(n.id))
 or (n.recipient_employee_id<>public.current_hris_user_id() and (n.issued_by_user_id=public.current_hris_user_id()
 or ir.assigned_to_id=public.current_hris_user_id() or exists(select 1 from public.nte_approvals a where a.nte_id=n.id and a.approver_user_id=public.current_hris_user_id())
 or (private.can_issue_nte() and private.can_access_incident_for_nte(n.incident_report_id,n.recipient_employee_id))))));
$$;
create policy nte_recipient_publication_guard on public.ntes as restrictive for select to authenticated
 using (recipient_employee_id<>public.current_hris_user_id() or private.nte_is_published(id));
drop policy if exists ntes_recipient_update_own on public.ntes;
revoke all on public.ntes,public.resolutions from anon;
revoke delete,truncate,trigger,references on public.ntes from authenticated;

-- Involvement alone does not entitle a recipient to the confidential original IR.
create policy incident_subject_confidentiality on public.incident_reports as restrictive for select to authenticated
 using (not(public.current_hris_user_id()=any(involved_employee_ids)) or reported_by=public.current_hris_user_id());
create or replace function public.get_nte_incident_context(p_nte_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; n public.ntes;
begin
 if auth.uid() is null or not private.can_view_nte(p_nte_id) then raise exception 'NTE unavailable for this account' using errcode='42501'; end if;
 select * into n from public.ntes where id=p_nte_id;
 if n.recipient_employee_id=public.current_hris_user_id() then
  select jsonb_build_object('id',ir.id,'category',ir.category,'case_number',ir.case_number,'description','',
   'involved_employee_ids',jsonb_build_array(n.recipient_employee_id),'involved_employee_names',jsonb_build_array(n.recipient_name_snapshot),
   'chat_thread','[]'::jsonb,'nte_ids',jsonb_build_array(n.id),'status',ir.status) into result from public.incident_reports ir where id=n.incident_report_id;
 else select to_jsonb(ir) into result from public.incident_reports ir where id=n.incident_report_id; end if;
 return result;
end $$;

create function private.nte_event(p_id uuid,p_event text,p_details jsonb default '{}',p_key text default null) returns void language sql security definer set search_path='' as $$
 insert into private.nte_case_events(nte_id,event,actor,details,dedupe_key) values(p_id,p_event,public.current_hris_user_id(),p_details,p_key) on conflict(dedupe_key) do nothing;
$$;
create function private.nte_notify(p_id uuid,p_title text,p_message text,p_key text) returns void language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 select recipient_employee_id into recipient from public.ntes where id=p_id;
 insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key)
 values(recipient::text,'GENERAL',p_title,p_message,'/feedback/nte/'||p_id,p_id::text,p_key) on conflict do nothing;
end $$;
create function private.audit_nte_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare nid uuid;begin
 begin nid:=substring(new.link from '/feedback/nte/([0-9a-f-]{36})')::uuid;exception when invalid_text_representation then return new;end;
 if nid is not null and exists(select 1 from public.ntes where id=nid) then
  perform private.nte_event(nid,'Employee dashboard notification delivered',jsonb_build_object('notificationId',new.id,'recipient',new.user_id,'title',new.title,'message',new.message),'notification:'||new.id);
 end if;return new;
end $$;
create trigger audit_nte_notification after insert on public.notifications for each row execute function private.audit_nte_notification();
revoke all on function private.audit_nte_notification() from public,anon,authenticated;
create function private.nte_immutable() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Case audit records cannot be edited or deleted'; end $$;
create trigger immutable_case_events before update or delete on private.nte_case_events for each row execute function private.nte_immutable();

create function public.record_nte_receipt(p_nte_id uuid,p_received_at timestamptz default null,p_proof text default null) returns void language plpgsql security definer set search_path='' as $$
declare n public.ntes; actual timestamptz; deadline timestamptz; method text; issued timestamptz; actor uuid:=public.current_hris_user_id();
begin
 if auth.uid() is null or not private.can_view_nte(p_nte_id) then raise exception 'NTE unavailable' using errcode='42501'; end if;
 select * into n from public.ntes where id=p_nte_id for update;
 if not private.nte_is_published(n.id) or n.status::text='Closed' then raise exception 'Only an issued NTE may be acknowledged or served'; end if;
 if exists(select 1 from private.nte_receipts where nte_id=n.id) then return; end if;
 select max((h->>'timestamp')::timestamptz) into issued from jsonb_array_elements(coalesce(n.workflow_history,'[]')) h where h->>'newStatus'='Issued';
 if actor=n.recipient_employee_id then actual:=clock_timestamp();method:='Employee acknowledgment';p_proof:='Employee acknowledged receipt in HRIS';
 else
  if not private.can_issue_nte() then raise exception 'Only authorized HR/Admin may record service' using errcode='42501';end if;
  actual:=p_received_at;method:='Documented service';
  if actual is null or actual>clock_timestamp() or actual<coalesce(issued,n.created_at) or nullif(trim(p_proof),'') is null then raise exception 'Provide the actual service time and proof; future or pre-issuance receipt is invalid';end if;
 end if;
 deadline:=(((actual at time zone 'Asia/Manila')::date+6)::timestamp at time zone 'Asia/Manila');
 insert into private.nte_receipts(nte_id,received_at,recorded_by,method,proof,deadline_exclusive) values(n.id,actual,actor,method,p_proof,deadline);
 perform set_config('app.nte_response_rpc','on',true);
 update public.ntes set response_deadline=deadline-interval '1 millisecond',receipt_recorded_at=now(),response_stage='Awaiting Employee Explanation' where id=n.id;
 perform private.nte_event(n.id,'Receipt documented',jsonb_build_object('receivedAt',actual,'method',method,'proof',p_proof,'deadlineExclusive',deadline));
 perform private.nte_notify(n.id,'NTE received — written explanation requested','Please submit your explanation by '||to_char((deadline-interval '1 second') at time zone 'Asia/Manila','DD Mon YYYY HH24:MI')||' Philippine time. Acknowledgment is receipt, not admission.',n.id||':receipt');
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('nte-response-attachments','nte-response-attachments',false,5242880,array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) on conflict(id) do nothing;
create function private.nte_attachment_allowed(p_path text,p_write boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
declare nid uuid;
begin
 if auth.uid() is null then return false;end if;
 begin nid:=split_part(p_path,'/',1)::uuid;exception when invalid_text_representation then return false;end;
 if not private.can_view_nte(nid) then return false;end if;
 if not p_write then return exists(select 1 from private.nte_receipts where nte_id=nid and response_attachment=p_path)
 or exists(select 1 from public.ntes where id=nid and recipient_employee_id=public.current_hris_user_id());end if;
 return exists(select 1 from public.ntes n join private.nte_receipts r on r.nte_id=n.id where n.id=nid and n.recipient_employee_id=public.current_hris_user_id() and r.closed_at is null and now()<r.deadline_exclusive and nullif(trim(n.employee_response),'') is null);
end $$;
create policy nte_response_upload on storage.objects for insert to authenticated with check(bucket_id='nte-response-attachments' and private.nte_attachment_allowed(name,true));
create policy nte_response_read on storage.objects for select to authenticated using(bucket_id='nte-response-attachments' and private.nte_attachment_allowed(name,false));

create function public.submit_nte_explanation(p_nte_id uuid,p_explanation text,p_signature text,p_link text default null,p_attachment text default null) returns void language plpgsql security definer set search_path='' as $$
declare n public.ntes;r private.nte_receipts;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 select * into n from public.ntes where id=p_nte_id for update;
 if n.id is null or n.recipient_employee_id<>public.current_hris_user_id() or not private.nte_is_published(n.id) then raise exception 'Only the recipient may respond to this issued NTE' using errcode='42501';end if;
 select * into r from private.nte_receipts where nte_id=n.id for update;
 if r.nte_id is null then raise exception 'Acknowledge receipt before submitting';end if;
 if r.closed_at is not null or clock_timestamp()>=r.deadline_exclusive or nullif(trim(n.employee_response),'') is not null then raise exception 'The regular response window is closed or a response is already recorded. Contact HR for further submissions.';end if;
 if nullif(trim(p_explanation),'') is null or length(p_explanation)>50000 or p_signature !~ '^data:image/png;base64,' or p_signature is null or length(p_signature)>1000000 then raise exception 'Written explanation and a valid signature are required';end if;
 if nullif(trim(p_link),'') is not null and (p_link !~ '^https://' or length(p_link)>2048) then raise exception 'Use a valid HTTPS attachment link';end if;
 if p_attachment is not null and (split_part(p_attachment,'/',1)<>n.id::text or not exists(select 1 from storage.objects where bucket_id='nte-response-attachments' and name=p_attachment and (metadata->>'size')::bigint<=5242880)) then raise exception 'Upload a valid attachment no larger than 5 MB';end if;
 perform set_config('app.nte_response_rpc','on',true);
 update private.nte_receipts set response_attachment=p_attachment where nte_id=n.id;
 update public.ntes set employee_response=trim(p_explanation),employee_response_evidence_url=nullif(trim(p_link),''),employee_response_signature_url=p_signature,response_date=clock_timestamp(),status='Response Submitted',response_stage='Explanation received — response period open' where id=n.id;
 perform private.nte_event(n.id,'Employee explanation submitted',jsonb_build_object('explanation',trim(p_explanation),'link',p_link,'attachment',p_attachment));
 perform private.nte_notify(n.id,'Explanation received','Your written explanation has been recorded. No decision has been made.',n.id||':response');
end $$;

create function private.guard_nte_response_fields() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.receipt_recorded_at is distinct from old.receipt_recorded_at and coalesce(current_setting('app.nte_response_rpc',true),'')<>'on' then raise exception 'Use documented receipt workflow';end if;
 if private.nte_is_published(old.id) and (new.details,new.body,new.evidence_link,new.workflow_history) is distinct from (old.details,old.body,old.evidence_link,old.workflow_history) then raise exception 'Issued notices and their history are locked';end if;
 if new.status::text='Closed' and old.status::text<>'Closed' and exists(select 1 from private.nte_receipts where nte_id=old.id) and coalesce(current_setting('app.nod_rpc',true),'')<>'on' then raise exception 'Complete the authorized decision implementation before closing';end if;
 if tg_op='UPDATE' and (new.employee_response,new.employee_response_evidence_url,new.employee_response_signature_url,new.response_date) is distinct from (old.employee_response,old.employee_response_evidence_url,old.employee_response_signature_url,old.response_date)
 and coalesce(current_setting('app.nte_response_rpc',true),'')<>'on' then raise exception 'Use the protected employee response workflow' using errcode='42501';end if;
 if tg_op='UPDATE' and exists(select 1 from private.nte_receipts where nte_id=old.id) and new.response_deadline is distinct from old.response_deadline and coalesce(current_setting('app.nte_response_rpc',true),'')<>'on' then raise exception 'The receipt deadline is protected';end if;
 return new;
end $$;
create trigger guard_nte_response_fields before update on public.ntes for each row execute function private.guard_nte_response_fields();
create function private.audit_nte_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then perform private.nte_event(new.id,'NTE created',jsonb_build_object('status',new.status));
 elsif new.status is distinct from old.status then perform private.nte_event(new.id,'Status changed',jsonb_build_object('from',old.status,'to',new.status));end if;
 return new;
end $$;
create trigger audit_nte_change after insert or update on public.ntes for each row execute function private.audit_nte_change();

create function public.get_nte_response_workflow(p_nte_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not private.can_view_nte(p_nte_id) then raise exception 'NTE unavailable' using errcode='42501';end if;
 select jsonb_build_object('receipt',to_jsonb(r),'canRecordService',private.can_issue_nte() and n.recipient_employee_id<>public.current_hris_user_id(),
 'published',private.nte_is_published(n.id),'isRecipient',n.recipient_employee_id=public.current_hris_user_id(),
 'canRespond',r.nte_id is not null and r.closed_at is null and now()<r.deadline_exclusive and nullif(trim(n.employee_response),'') is null and n.recipient_employee_id=public.current_hris_user_id(),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from private.nte_case_events e where e.nte_id=n.id and (n.recipient_employee_id<>public.current_hris_user_id() or e.event in ('Receipt documented','Employee explanation submitted','Employee dashboard notification delivered','For Notice of Decision Drafting'))),'[]'::jsonb)) into result from public.ntes n left join private.nte_receipts r on r.nte_id=n.id where n.id=p_nte_id;
 return result;
end $$;

create function private.close_nte_response_windows() returns void language plpgsql security definer set search_path='' as $$
declare r record;notice text;
begin
 for r in select x.*,n.response_date,n.employee_response,(select max((h->>'timestamp')::timestamptz) from jsonb_array_elements(coalesce(n.workflow_history,'[]')) h where h->>'newStatus'='Issued') as issue_date from private.nte_receipts x join public.ntes n on n.id=x.nte_id where x.closed_at is null and n.status::text<>'Closed' order by x.nte_id for update of n,x skip locked loop
  if now()>=r.deadline_exclusive then
   if nullif(trim(r.employee_response),'') is null then
    notice:=format(E'NOTICE OF NON-SUBMISSION OF WRITTEN EXPLANATION\n\nYou were given until %s Philippine time to submit your written explanation regarding the Notice to Explain issued to you on %s and received by you on %s.\n\nAs no written explanation was received within the prescribed period, you shall be deemed to have waived your opportunity to submit a written explanation within that period.\n\nThe case will now be evaluated based on the Incident Report, available records, evidence, and all relevant circumstances. It is hereby submitted for management’s review and decision.\n\nNo disciplinary penalty has been imposed at this stage. You will be informed of the outcome once the review and approval process has been completed.',to_char((r.deadline_exclusive-interval '1 second') at time zone 'Asia/Manila','DD Mon YYYY HH24:MI'),to_char(r.issue_date at time zone 'Asia/Manila','DD Mon YYYY'),to_char(r.received_at at time zone 'Asia/Manila','DD Mon YYYY HH24:MI'));
    perform private.nte_notify(r.nte_id,'Notice of non-submission',notice,r.nte_id||':non-submission');
   else notice:=null;end if;
   update private.nte_receipts set closed_at=now(),non_submission_notice=notice where nte_id=r.nte_id;
   update public.ntes set response_stage=case when notice is not null then 'For Management Review and Decision — No Response' else 'For Management Review and Decision' end where id=r.nte_id;
   perform private.nte_event(r.nte_id,'For Notice of Decision Drafting',jsonb_build_object('noResponse',notice is not null),r.nte_id||':closed-window');
  elsif (now() at time zone 'Asia/Manila')::date=((r.deadline_exclusive-interval '1 second') at time zone 'Asia/Manila')::date and nullif(trim(r.employee_response),'') is null then
   perform private.nte_notify(r.nte_id,'NTE response due today','Your written explanation is due today at 11:59 PM Philippine time.',r.nte_id||':deadline-reminder');
  end if;
 end loop;
end $$;
-- The canonical resolution remains the Notice of Decision; this table holds implementation only.
alter table public.resolutions add column nte_id uuid references public.ntes(id), add column review_fields jsonb not null default '{}', add column document_reference text;
create unique index resolution_nte_unique on public.resolutions(nte_id) where nte_id is not null;
create table private.nte_implementation (
 resolution_id uuid primary key references public.resolutions(id), status text not null default 'Decision Issued',
 schedule_status text not null default 'TBA', scheduled_dates date[] not null default '{}', actual_dates date[] not null default '{}', return_to_work date,
 atd jsonb, employee_signed_at timestamptz, employee_signature text, hr_verified_at timestamptz, hr_verified_by uuid, finance_approved_at timestamptz, finance_approved_by uuid,
 decision_service_at timestamptz,decision_service_proof text
);
alter table private.nte_implementation enable row level security;
revoke all on private.nte_implementation from public,anon,authenticated;
revoke insert,update,delete,truncate,trigger,references on public.resolutions from authenticated;
drop policy if exists "Enable read access for all users" on public.resolutions;
drop policy if exists "Enable insert for authenticated users only" on public.resolutions;
drop policy if exists "Enable update for authenticated users only" on public.resolutions;
create policy resolution_case_reader on public.resolutions for select to authenticated using(
 exists(select 1 from public.ntes n where n.incident_report_id=resolutions.incident_report_id and n.recipient_employee_id=resolutions.employee_id and private.can_view_nte(n.id)
 and (resolutions.employee_id<>public.current_hris_user_id() or resolutions.status in ('Issued','Pending Acknowledgement','Acknowledged'))));

create function private.prepare_nod_drafts() returns void language plpgsql security definer set search_path='' as $$
declare r record;new_id uuid;steps jsonb;
begin
 for r in select n.* from public.ntes n join private.nte_receipts x on x.nte_id=n.id where x.closed_at is not null and n.status::text<>'Closed' and not exists(select 1 from public.resolutions d where d.nte_id=n.id or (d.nte_id is null and d.incident_report_id=n.incident_report_id and d.employee_id=n.recipient_employee_id)) for update of n skip locked loop
  select jsonb_agg(jsonb_build_object('userId',a.approver_user_id,'userName',h.full_name,'status','Pending') order by a.assigned_at,a.id) into steps from public.nte_approvals a join public.hris_users h on h.id=a.approver_user_id where a.nte_id=r.id and a.is_required and a.status='Approved';
  insert into public.resolutions(nte_id,incident_report_id,employee_id,resolution_type,details,closed_by_user_id,status,approver_steps)
  values(r.id,r.incident_report_id,r.recipient_employee_id,'Undetermined','',r.issued_by_user_id,'Draft',coalesce(steps,'[]')) returning id into new_id;
  perform private.nte_event(r.id,'Notice of Decision draft created',jsonb_build_object('resolutionId',new_id),r.id||':nod-draft');
 end loop;
end $$;

create function public.get_nod_workflow(p_nte_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d public.resolutions;actor uuid:=public.current_hris_user_id();is_employee boolean;
begin
 if auth.uid() is null or not private.can_view_nte(p_nte_id) then raise exception 'Case unavailable' using errcode='42501';end if;
 select actor=recipient_employee_id into is_employee from public.ntes where id=p_nte_id;
 select * into d from public.resolutions where nte_id=p_nte_id;
 if is_employee and d.status not in ('Issued','Pending Acknowledgement','Acknowledged') then return jsonb_build_object('decision',null,'canReview',false);end if;
 return jsonb_build_object('decision',to_jsonb(d),'implementation',(select to_jsonb(i)||jsonb_build_object('suspensionProgress',case when i.status='Fully Served' then 'Fully Served' when i.schedule_status='TBA' then 'Pending Schedule' when (select min(x) from unnest(i.scheduled_dates) x)<=(now() at time zone 'Asia/Manila')::date then 'Ongoing' else 'Scheduled' end) from private.nte_implementation i where resolution_id=d.id),
 'canReview',not is_employee and private.can_issue_nte(),'isEmployee',is_employee,
 'canApprove',not is_employee and d.status='Pending Approval' and exists(select 1 from jsonb_array_elements(d.approver_steps) a where a->>'userId'=actor::text and a->>'status'='Pending'),
 'canFinance',false);
end $$;

create function public.act_on_nod(p_nte_id uuid,p_action text,p_data jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
declare n public.ntes;d public.resolutions;i private.nte_implementation;actor uuid:=public.current_hris_user_id();field text;step jsonb;new_steps jsonb:='[]';dates date[];today date:=(now() at time zone 'Asia/Manila')::date;
begin
 if auth.uid() is null or not private.can_view_nte(p_nte_id) then raise exception 'Case unavailable' using errcode='42501';end if;
 select * into n from public.ntes where id=p_nte_id for update;
 select * into d from public.resolutions where nte_id=n.id for update;
 if d.id is null then raise exception 'Decision drafting opens after the response deadline';end if;
 select * into i from private.nte_implementation where resolution_id=d.id for update;
 perform set_config('app.nod_rpc','on',true);
 if p_action in ('save','submit') then
  if actor=n.recipient_employee_id or not private.can_issue_nte() or d.status not in ('Draft','Rejected') then raise exception 'Only the designated HR/Admin reviewer may edit a draft' using errcode='42501';end if;
  if p_action='submit' then
   foreach field in array array['facts','evidence','explanation','findings','policy','circumstances','reasons','effectiveDate'] loop
    if nullif(trim(p_data->>field),'') is null then raise exception 'Complete the decision field: %',field;end if;
   end loop;
   if p_data->>'decision' not in ('CaseDismissed','Verbal Warning','Written Warning','Suspension','Salary Deduction','Termination') then raise exception 'Select the proposed decision';end if;
   if not exists(select 1 from jsonb_array_elements(d.approver_steps) a join public.user_roles ur on ur.user_id=(a->>'userId')::uuid where ur.role_id='Board of Director' and ur.is_active)
    or exists(select 1 from jsonb_array_elements(d.approver_steps) a join public.hris_users h on h.id=(a->>'userId')::uuid where lower(h.status)<>'active' or h.id=n.recipient_employee_id) then raise exception 'A valid active approving hierarchy including BOD is required';end if;
   if p_data->>'decision'='Suspension' then
    if coalesce((p_data->>'days')::integer,0)<1 or coalesce(p_data->>'scheduleStatus','') not in ('TBA','Scheduled') then raise exception 'Provide suspension days and Scheduled or TBA';end if;
    if p_data->>'scheduleStatus'='Scheduled' then
     select array_agg(distinct value::date order by value::date) into dates from jsonb_array_elements_text(coalesce(p_data->'dates','[]'));
     if coalesce(cardinality(dates),0)<>(p_data->>'days')::integer or dates[1]<greatest(today,(p_data->>'effectiveDate')::date) then raise exception 'Provide unique suspension dates on or after effectivity';end if;
    end if;
   end if;
   if p_data->>'decision'='Salary Deduction' then
    if coalesce(p_data->>'total','') !~ '^[0-9]+(\.[0-9]{1,2})?$' or coalesce(p_data->>'perCutoff','') !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Use PHP amounts with at most two decimal places';end if;
    if nullif(trim(p_data->>'legalBasis'),'') is null or coalesce((p_data->>'total')::numeric,0)<=0 or coalesce((p_data->>'perCutoff')::numeric,0)<=0 or coalesce((p_data->>'installments')::integer,0)<1
     or nullif(p_data->>'firstDate','') is null or nullif(p_data->>'finalDate','') is null then raise exception 'Complete the legally permissible deduction basis, amounts, installments and dates';end if;
    if (p_data->>'finalDate')::date<(p_data->>'firstDate')::date or ceil((p_data->>'total')::numeric/(p_data->>'perCutoff')::numeric)<>(p_data->>'installments')::integer then raise exception 'Deduction dates or installments do not match';end if;
   end if;
  end if;
  select jsonb_agg(a||jsonb_build_object('status','Pending') order by ord) into new_steps from jsonb_array_elements(d.approver_steps) with ordinality x(a,ord);
  update public.resolutions set review_fields=p_data,details=coalesce(p_data->>'reasons',''),resolution_type=coalesce(p_data->>'decision','Undetermined'),suspension_days=nullif(p_data->>'days','')::integer,
   status=case when p_action='submit' then 'Pending Approval' else 'Draft' end,approver_steps=coalesce(new_steps,'[]'),updated_at=now() where id=d.id;
  if p_action='submit' then
   for step in select value from jsonb_array_elements(d.approver_steps) loop
    insert into public.notifications(user_id,type,title,message,link,related_entity_id) values(step->>'userId','GENERAL','Notice of Decision approval required','Review the proposed decision. No penalty has been imposed.','/feedback/nte/'||n.id,d.id::text);
   end loop;
  end if;
 elsif p_action in ('approve','reject') then
  if actor=n.recipient_employee_id or d.status<>'Pending Approval' or not exists(select 1 from jsonb_array_elements(d.approver_steps) a where a->>'userId'=actor::text and a->>'status'='Pending') then raise exception 'This approval is not assigned to you' using errcode='42501';end if;
  if p_action='reject' and nullif(trim(p_data->>'reason'),'') is null then raise exception 'A rejection reason is required';end if;
  for step in select value from jsonb_array_elements(d.approver_steps) loop
   new_steps:=new_steps||jsonb_build_array(case when step->>'userId'=actor::text then step||jsonb_build_object('status',case when p_action='approve' then 'Approved' else 'Rejected' end,'timestamp',now(),'comments',p_data->>'reason') else step end);
  end loop;
  update public.resolutions set approver_steps=new_steps,status=case when p_action='reject' then 'Rejected' else status end,updated_at=now() where id=d.id;
  if p_action='approve' and not exists(select 1 from jsonb_array_elements(new_steps) a where a->>'status'<>'Approved') then
   update public.resolutions set status='Pending Acknowledgement',sent_to_employee_at=now(),decision_date=now(),document_reference='NOD-'||coalesce(n.nte_number,n.id::text) where id=d.id;
   select coalesce(array_agg(value::date),'{}') into dates from jsonb_array_elements_text(coalesce(d.review_fields->'dates','[]'));
   if d.resolution_type='Suspension' and d.review_fields->>'scheduleStatus'='Scheduled' and (select min(x) from unnest(dates) x)<greatest(today,(d.review_fields->>'effectiveDate')::date) then raise exception 'Suspension schedule has passed; return for review before approval';end if;
   insert into private.nte_implementation(resolution_id,status,schedule_status,scheduled_dates) values(d.id,case d.resolution_type when 'Suspension' then 'Decision Issued — Suspension Pending Implementation' when 'Salary Deduction' then 'Decision Issued — ATD Pending' else 'Decision Issued' end,coalesce(d.review_fields->>'scheduleStatus','TBA'),dates);
   perform private.nte_notify(n.id,'Notice of Decision issued','Your approved Notice of Decision is available. Please review and acknowledge receipt. Receipt is not consent to a salary deduction.',d.id||':issued');
   update public.ntes set response_stage=case d.resolution_type when 'Suspension' then 'Decision Issued — Suspension Pending Implementation' when 'Salary Deduction' then 'Decision Issued — ATD Pending' else 'Decision Issued' end where id=n.id;
  end if;
 elsif p_action='acknowledge' then
  if actor<>n.recipient_employee_id or d.status<>'Pending Acknowledgement' then raise exception 'Only the employee may acknowledge the issued decision' using errcode='42501';end if;
  if coalesce(p_data->>'signature','') !~ '^data:image/png;base64,' or length(p_data->>'signature')>1000000 then raise exception 'Sign to acknowledge receipt';end if;
  update public.resolutions set status='Acknowledged',employee_acknowledged_at=now(),employee_acknowledgement_signature_url=p_data->>'signature' where id=d.id;
  if d.resolution_type='Salary Deduction' then
   update private.nte_implementation set atd=d.review_fields||jsonb_build_object('reference','ATD-'||d.document_reference,'employeeName',n.recipient_name_snapshot,'employeeId',n.recipient_employee_id,'employeeNumber',(select h.employee_id from public.hris_users h where h.id=n.recipient_employee_id),'generatedAt',now()) where resolution_id=d.id;
  end if;
 elsif p_action='sign_atd' then
  if actor<>n.recipient_employee_id or i.atd is null or i.employee_signed_at is not null then raise exception 'ATD is not available for signature' using errcode='42501';end if;
  if coalesce(p_data->>'signature','') !~ '^data:image/png;base64,' or length(p_data->>'signature')>1000000 or p_data->>'consent'<>'I authorize the stated deduction' then raise exception 'Separate express authorization and signature are required';end if;
  update private.nte_implementation set employee_signed_at=now(),employee_signature=p_data->>'signature',status='ATD signed — HR verification pending' where resolution_id=d.id;
 elsif p_action='verify_atd' then
  if actor=n.recipient_employee_id or not private.can_issue_nte() or i.employee_signed_at is null or i.hr_verified_at is not null or nullif(trim(p_data->>'reason'),'') is null then raise exception 'HR must verify the signed ATD and its permissible legal basis' using errcode='42501';end if;
  update private.nte_implementation set hr_verified_at=now(),hr_verified_by=actor,status='ATD verified — Finance approval pending' where resolution_id=d.id;
 elsif p_action='decision_service' then
  if actor=n.recipient_employee_id or not private.can_issue_nte() or i.resolution_id is null or i.decision_service_at is not null or nullif(trim(p_data->>'proof'),'') is null
   or nullif(p_data->>'receivedAt','') is null or (p_data->>'receivedAt')::timestamptz<d.sent_to_employee_at or (p_data->>'receivedAt')::timestamptz>now() then raise exception 'Provide valid proof and actual service time for the issued decision';end if;
  update private.nte_implementation set decision_service_at=(p_data->>'receivedAt')::timestamptz,decision_service_proof=p_data->>'proof' where resolution_id=d.id;
 elsif p_action in ('schedule','served','complete') then
  if actor=n.recipient_employee_id or not private.can_issue_nte() or i.resolution_id is null then raise exception 'Only authorized HR/Admin may record implementation' using errcode='42501';end if;
  if p_action='complete' then
   if d.resolution_type in ('Suspension','Salary Deduction') then raise exception 'Complete the specific penalty implementation workflow';end if;
   if (d.employee_acknowledged_at is null and i.decision_service_at is null) or nullif(d.review_fields->>'effectiveDate','') is null or today<(d.review_fields->>'effectiveDate')::date or nullif(trim(p_data->>'reason'),'') is null then raise exception 'Receipt, authorized effectivity and implementation evidence are required';end if;
   update private.nte_implementation set status='Completed' where resolution_id=d.id;
   update public.ntes set status='Closed' where id=n.id;
  else
   if d.resolution_type<>'Suspension' then raise exception 'This is not a suspension';end if;
   select array_agg(distinct value::date order by value::date) into dates from jsonb_array_elements_text(p_data->'dates');
   if cardinality(dates) is null or cardinality(dates)<>d.suspension_days then raise exception 'Record exactly the approved number of suspension days';end if;
   if p_action='schedule' then
    if i.schedule_status='Scheduled' then raise exception 'An issued schedule is locked; use an approved correction process';end if;
    if dates[1]<greatest(today,(d.review_fields->>'effectiveDate')::date) then raise exception 'Schedule cannot precede today or approved effectivity';end if;
    update private.nte_implementation set scheduled_dates=dates,schedule_status='Scheduled',status='Scheduled' where resolution_id=d.id;
    perform private.nte_notify(n.id,'Suspension schedule issued','Your approved suspension dates: '||array_to_string(dates,', '),d.id||':schedule');
   else
    if (d.employee_acknowledged_at is null and i.decision_service_at is null) or i.schedule_status<>'Scheduled' or not dates<@i.scheduled_dates or dates[cardinality(dates)]>today or nullif(trim(p_data->>'reason'),'') is null or nullif(p_data->>'returnToWork','') is null or (p_data->>'returnToWork')::date<=dates[cardinality(dates)] then raise exception 'Confirm decision service, scheduled dates actually served, evidence and return-to-work date';end if;
    update private.nte_implementation set actual_dates=dates,return_to_work=(p_data->>'returnToWork')::date,status='Fully Served' where resolution_id=d.id;
    update public.ntes set status='Closed' where id=n.id;
   end if;
  end if;
 else raise exception 'Unknown decision action';end if;
 perform private.nte_event(n.id,'Notice of Decision: '||p_action,p_data-'signature'||jsonb_build_object('resolutionId',d.id));
end $$;

create function public.get_my_nte_deadline_queue() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x) from (select n.id,n.nte_number,n.recipient_name_snapshot as employee,r.deadline_exclusive,r.received_at,r.closed_at,r.non_submission_notice is not null as no_response,
 case when n.status::text='Closed' then 'Case Closed' when i.status is not null then i.status when r.closed_at is not null then 'For Notice of Decision Drafting' when r.received_at is null then 'Awaiting documented receipt' when n.response_date is not null then 'Explanation received' else 'Awaiting Employee Explanation' end as stage
 from public.ntes n left join private.nte_receipts r on r.nte_id=n.id left join public.resolutions d on d.nte_id=n.id left join private.nte_implementation i on i.resolution_id=d.id
 where private.can_view_nte(n.id) and private.nte_is_published(n.id) and n.status::text<>'Closed' order by r.deadline_exclusive nulls last,n.id limit 100)x),'[]'::jsonb);
end $$;
select cron.schedule('nte-response-deadlines','* * * * *','select private.close_nte_response_windows(); select private.prepare_nod_drafts();');
revoke all on function private.prepare_nod_drafts() from public,anon,authenticated;
revoke all on function public.get_nod_workflow(uuid),public.act_on_nod(uuid,text,jsonb),public.get_my_nte_deadline_queue() from public,anon;
grant execute on function public.get_nod_workflow(uuid),public.act_on_nod(uuid,text,jsonb),public.get_my_nte_deadline_queue() to authenticated;

revoke all on function public.record_nte_receipt(uuid,timestamptz,text),public.submit_nte_explanation(uuid,text,text,text,text),public.get_nte_response_workflow(uuid) from public,anon;
grant execute on function public.record_nte_receipt(uuid,timestamptz,text),public.submit_nte_explanation(uuid,text,text,text,text),public.get_nte_response_workflow(uuid) to authenticated;
revoke all on function private.nte_event(uuid,text,jsonb,text),private.nte_notify(uuid,text,text,text),private.close_nte_response_windows(),private.audit_nte_change(),private.guard_nte_response_fields(),private.nte_immutable() from public,anon,authenticated;
notify pgrst,'reload schema';
