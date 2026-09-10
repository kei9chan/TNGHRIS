-- Additive, RPC-only correspondence. Original incident reports and NTE routing remain unchanged.
create schema case_correspondence;
revoke all on schema case_correspondence from public,anon,authenticated;
create table case_correspondence.cases(
 id uuid primary key references public.incident_reports(id), original jsonb not null,
 status text not null default 'HR Reviewing Response', created_at timestamptz not null default clock_timestamp()
);
create table case_correspondence.questions(
 id uuid primary key default gen_random_uuid(), case_id uuid not null references case_correspondence.cases(id),
 sender uuid not null references public.hris_users(id), recipient uuid not null references public.hris_users(id),
 kind text not null check(kind in ('complainant','manager')), body text not null check(length(btrim(body)) between 1 and 10000),
 details text not null default '', attachment_requested boolean not null default false,
 deadline timestamptz not null, state text not null default 'awaiting' check(state in('awaiting','received','reviewed','closed')),
 created_at timestamptz not null default clock_timestamp(), opened_at timestamptz, replied_at timestamptz,
 nonce uuid not null, unique(sender,nonce)
);
create table case_correspondence.messages(
 id uuid primary key default gen_random_uuid(), case_id uuid not null references case_correspondence.cases(id),
 question_id uuid references case_correspondence.questions(id), author uuid not null references public.hris_users(id),
 kind text not null check(kind in('reply','internal','comment')), draft boolean not null default false,
 body text not null check(length(body)<=10000), files jsonb not null default '[]', links jsonb not null default '[]',
 revision integer not null, created_at timestamptz not null default clock_timestamp(), nonce uuid not null,
 unique(author,nonce)
);
create table case_correspondence.audit(
 id uuid primary key default gen_random_uuid(), case_id uuid not null references case_correspondence.cases(id),
 actor uuid default public.current_hris_user_id(), actor_roles jsonb default '[]', action text not null,
 previous_value jsonb,new_value jsonb,created_at timestamptz not null default clock_timestamp()
);
create table case_correspondence.deliveries(
 id uuid primary key default gen_random_uuid(),case_id uuid not null references case_correspondence.cases(id),recipient uuid not null references public.hris_users(id),
 event text not null,event_key text not null unique,status text not null default 'queued',attempts integer not null default 0,
 next_attempt timestamptz not null default clock_timestamp(),lease_until timestamptz,token uuid,provider text,error text,
 created_at timestamptz not null default clock_timestamp()
);
create index on case_correspondence.questions(recipient,state,deadline);
create index on case_correspondence.messages(case_id,created_at);
create index on case_correspondence.messages(question_id,author,revision);
create index on case_correspondence.deliveries(status,next_attempt);
create function case_correspondence.active() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.hris_users where id=public.current_hris_user_id() and lower(status)='active');$$;
create function case_correspondence.manage(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case_correspondence.active() and private.can_access_incident_for_nte(p_id,null)
 and public.attendance_incident_readable(p_id)
 and exists(select 1 from public.incident_reports r where r.id=p_id and not(public.current_hris_user_id()=any(coalesce(r.involved_employee_ids,'{}'::uuid[]))))
 and ((private.can_issue_nte()) or (private.user_can_handle_incident_case(public.current_hris_user_id()) and public.has_feature_permission('IncidentReports','manage')));$$;
create function case_correspondence.oversight(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case_correspondence.manage(p_id) or (case_correspondence.active() and private.bod_can_view_incident(p_id) and public.attendance_incident_readable(p_id) and exists(select 1 from public.incident_reports where id=p_id and not(public.current_hris_user_id()=any(coalesce(involved_employee_ids,'{}'::uuid[])))));$$;
create function case_correspondence.readable(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case_correspondence.active() and (case_correspondence.oversight(p_id) or exists(select 1 from public.incident_reports where id=p_id and reported_by=public.current_hris_user_id()) or exists(select 1 from case_correspondence.questions where case_id=p_id and recipient=public.current_hris_user_id()));$$;
create function case_correspondence.log(p_id uuid,p_action text,p_old jsonb default null,p_new jsonb default null) returns void language sql security definer set search_path='' as $$
 insert into case_correspondence.audit(case_id,action,previous_value,new_value,actor_roles) values(p_id,p_action,p_old,p_new,coalesce((select jsonb_agg(role_id) from public.user_roles where user_id=public.current_hris_user_id() and is_active),'[]'));$$;
create function case_correspondence.immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Case correspondence history is immutable';end$$;
create trigger messages_immutable before update or delete on case_correspondence.messages for each row execute function case_correspondence.immutable();
create trigger audit_immutable before update or delete on case_correspondence.audit for each row execute function case_correspondence.immutable();
create function case_correspondence.guard_state() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'Case correspondence cannot be deleted';end if;
 if tg_table_name='cases' and (to_jsonb(new)->'original') is distinct from (to_jsonb(old)->'original') then raise exception 'Original report snapshot is immutable';end if;
 if tg_table_name='questions' and (to_jsonb(new)-array['state','deadline','opened_at','replied_at']) is distinct from (to_jsonb(old)-array['state','deadline','opened_at','replied_at']) then raise exception 'Published questions are immutable';end if;
 perform case_correspondence.log(case when tg_table_name='cases' then new.id else (to_jsonb(new)->>'case_id')::uuid end,tg_table_name||' updated',to_jsonb(old),to_jsonb(new));return new;
end$$;
create trigger cases_state_audit before update or delete on case_correspondence.cases for each row execute function case_correspondence.guard_state();
create trigger questions_state_audit before update or delete on case_correspondence.questions for each row execute function case_correspondence.guard_state();
create function case_correspondence.ensure_case(p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 insert into case_correspondence.cases(id,original) select id,jsonb_build_object('caseNumber',coalesce('TNGIR-'||lpad(case_number::text,5,'0'),id::text),'submittedAt',created_at,'category',category,'description',description,'location',location,'date',date_time,'complainantId',reported_by) from public.incident_reports where id=p_id on conflict do nothing;
end$$;
create function case_correspondence.notify(p_id uuid,p_user uuid,p_event text,p_key text) returns void language plpgsql security definer set search_path='' as $$declare did uuid;begin
 if p_user is null then return;end if;
 insert into case_correspondence.deliveries(case_id,recipient,event,event_key) values(p_id,p_user,p_event,p_key) on conflict(event_key) do nothing returning id into did;
 if did is null then return;end if;
 insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key) values(p_user::text,'info',p_event,'Open the secure case page to review this update.','/case-questions?case='||p_id,p_id::text,'case-correspondence:'||p_key) on conflict do nothing;
 perform case_correspondence.log(p_id,'notification queued',null,jsonb_build_object('recipient',p_user,'event',p_event,'delivery',did));
end$$;
create function public.get_case_questions(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); full_view boolean; r public.incident_reports; result jsonb; opened_question record;
begin
 if not case_correspondence.readable(p_id) then raise exception 'Case correspondence unavailable' using errcode='42501';end if;
 full_view:=case_correspondence.oversight(p_id);select * into r from public.incident_reports where id=p_id;
 for opened_question in select id from case_correspondence.questions where case_id=p_id and recipient=actor and opened_at is null for update loop update case_correspondence.questions set opened_at=clock_timestamp() where id=opened_question.id;end loop;
 select jsonb_build_object('id',p_id,'reference',coalesce('TNGIR-'||lpad(r.case_number::text,5,'0'),p_id::text),'canManage',case_correspondence.manage(p_id),'canComment',full_view,'isComplainant',r.reported_by=actor,'actorId',actor,
 'status',coalesce((select status from case_correspondence.cases where id=p_id),'HR Reviewing Response'),
 'original',case when full_view or r.reported_by=actor then coalesce((select original from case_correspondence.cases where id=p_id),jsonb_build_object('description',r.description,'category',r.category,'submittedAt',r.created_at)) else null end,
 'recipient',case when full_view then (select jsonb_build_object('id',id,'name',full_name) from public.hris_users where id=r.reported_by) else null end,
 'managers',case when case_correspondence.manage(p_id) then coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name)) from public.hris_users u where lower(u.status)='active' and u.id in (select private.resolve_direct_manager_id(e) from unnest(coalesce(r.involved_employee_ids,'{}'::uuid[])||array[r.reported_by]) e)),'[]') else '[]' end,
 'questions',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from (select q.*,s.full_name sender_name,u.full_name recipient_name from case_correspondence.questions q join public.hris_users s on s.id=q.sender join public.hris_users u on u.id=q.recipient where q.case_id=p_id and (full_view or q.recipient=actor)) t),'[]'),
 'messages',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from (select m.*,u.full_name author_name from case_correspondence.messages m join public.hris_users u on u.id=m.author where m.case_id=p_id and ((m.draft and m.author=actor) or (not m.draft and (full_view or (m.kind='reply' and exists(select 1 from case_correspondence.questions q where q.id=m.question_id and q.recipient=actor)))))) t),'[]'),
 'timeline',case when full_view then coalesce((select jsonb_agg(to_jsonb(t) order by created_at) from (select a.action,a.actor,a.actor_roles,a.created_at,a.previous_value,a.new_value from case_correspondence.audit a where a.case_id=p_id order by a.created_at desc limit 200) t),'[]') else '[]' end
 ) into result;return result;
end$$;
create function public.send_case_question(p_id uuid,p_body text,p_details text,p_deadline timestamptz,p_attachment boolean,p_manager uuid,p_nonce uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); recipient uuid; qid uuid; r public.incident_reports;
begin
 if not case_correspondence.manage(p_id) then raise exception 'Authorized case reviewer required' using errcode='42501';end if;
 select * into r from public.incident_reports where id=p_id for update;
 select id into qid from case_correspondence.questions where sender=actor and nonce=p_nonce;if qid is not null then return qid;end if;
 if p_deadline<=clock_timestamp() or p_deadline is null or length(btrim(p_body)) not between 1 and 10000 or p_body is null or length(coalesce(p_details,''))>10000 then raise exception 'Enter specific questions and a future response deadline';end if;
 recipient:=r.reported_by;
 if p_manager is not null then
 if not exists(select 1 from unnest(coalesce(r.involved_employee_ids,'{}'::uuid[])||array[r.reported_by]) e where private.resolve_direct_manager_id(e)=p_manager) then raise exception 'Select an active direct manager associated with this case' using errcode='42501';end if;recipient:=p_manager;end if;
 if recipient is null or recipient=actor or not exists(select 1 from public.hris_users where id=recipient and lower(status)='active') then raise exception 'An active recipient other than the reviewer is required';end if;
 perform case_correspondence.ensure_case(p_id);
 insert into case_correspondence.questions(case_id,sender,recipient,kind,body,details,deadline,attachment_requested,nonce) values(p_id,actor,recipient,case when p_manager is null then 'complainant' else 'manager' end,p_body,coalesce(p_details,''),p_deadline,coalesce(p_attachment,false),p_nonce) returning id into qid;
 update case_correspondence.cases set status=case when exists(select 1 from case_correspondence.messages where case_id=p_id and kind='reply' and not draft) then 'Additional Clarification Required' else 'Awaiting Complainant Response' end where id=p_id;
 perform case_correspondence.log(p_id,'question sent',null,(select to_jsonb(q) from case_correspondence.questions q where id=qid));
 perform case_correspondence.notify(p_id,recipient,'Action Required: Case Information Requested',qid::text||':question');return qid;
end$$;
create function public.case_file_access(p_path text,p_upload boolean default false) returns boolean language plpgsql stable security definer set search_path='' as $$
declare cid uuid; actor uuid:=public.current_hris_user_id();begin
 if not case_correspondence.active() or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg|webp)$' then return false;end if;
 cid:=split_part(p_path,'/',1)::uuid;
 if not case_correspondence.readable(cid) then return false;end if;
 if p_upload then return split_part(p_path,'/',2)=actor::text and (case_correspondence.oversight(cid) or exists(select 1 from case_correspondence.questions where case_id=cid and recipient=actor and state='awaiting'));end if;
 if split_part(p_path,'/',2)=actor::text then return true;end if;
 return exists(select 1 from case_correspondence.messages m where m.case_id=cid and not m.draft and m.files @> jsonb_build_array(p_path) and (case_correspondence.oversight(cid) or (m.kind='reply' and exists(select 1 from case_correspondence.questions q where q.id=m.question_id and q.recipient=actor))));
 exception when invalid_text_representation then return false;end$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('case-correspondence','case-correspondence',false,5242880,array['application/pdf','image/png','image/jpeg','image/webp']);
create policy case_correspondence_upload on storage.objects for insert to authenticated with check(bucket_id='case-correspondence' and public.case_file_access(name,true));
create policy case_correspondence_download on storage.objects for select to authenticated using(bucket_id='case-correspondence' and public.case_file_access(name,false));
create function public.save_case_reply(p_id uuid,p_question uuid,p_body text,p_files jsonb,p_links jsonb,p_draft boolean,p_kind text,p_nonce uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); q case_correspondence.questions; mid uuid; v text; rev integer;
begin
 if not case_correspondence.readable(p_id) then raise exception 'Case unavailable' using errcode='42501';end if;
 perform 1 from public.incident_reports where id=p_id for update;
 select id into mid from case_correspondence.messages where author=actor and nonce=p_nonce;if mid is not null then return mid;end if;
 if p_kind='reply' then
 select * into q from case_correspondence.questions where id=p_question and case_id=p_id for update;
 if q.id is null or q.recipient<>actor or q.state<>'awaiting' then raise exception 'Only the requested recipient may reply to an open question' using errcode='42501';end if;
 elsif p_kind in('internal','comment') then
 if not case_correspondence.oversight(p_id) or p_question is not null then raise exception 'Authorized private case access required' using errcode='42501';end if;
 else raise exception 'Invalid message type';end if;
 if p_body is null or length(p_body)>10000 or (not p_draft and btrim(p_body)='') or p_draft is null then raise exception 'Enter a response (maximum 10,000 characters)';end if;
 if jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files)>10 or jsonb_typeof(p_links)<>'array' or jsonb_array_length(p_links)>10 then raise exception 'Maximum 10 files and 10 links';end if;
 for v in select jsonb_array_elements_text(p_files) loop
 if split_part(v,'/',1)<>p_id::text or split_part(v,'/',2)<>actor::text or not public.case_file_access(v,false) or not exists(select 1 from storage.objects where bucket_id='case-correspondence' and name=v) then raise exception 'Attachment unavailable' using errcode='42501';end if;end loop;
 for v in select jsonb_array_elements_text(p_links) loop if v !~ '^https://[^[:space:]]+$' or length(v)>2048 then raise exception 'Supporting links must use HTTPS';end if;end loop;
 perform case_correspondence.ensure_case(p_id);
 select coalesce(max(revision),0)+1 into rev from case_correspondence.messages where case_id=p_id and question_id is not distinct from p_question and author=actor;
 insert into case_correspondence.messages(case_id,question_id,author,kind,draft,body,files,links,revision,nonce) values(p_id,p_question,actor,p_kind,p_draft,p_body,p_files,p_links,rev,p_nonce) returning id into mid;
 perform case_correspondence.log(p_id,case when p_draft then 'response draft saved' else p_kind||' submitted' end,null,(select to_jsonb(m) from case_correspondence.messages m where id=mid));
 if not p_draft and p_kind='reply' then
 update case_correspondence.questions set state='received',replied_at=clock_timestamp() where id=p_question;
 update case_correspondence.cases set status='Response Received' where id=p_id;
 perform case_correspondence.notify(p_id,q.sender,'Case Response Received',mid::text||':reply');
 end if;return mid;
end$$;
create function public.review_case_correspondence(p_id uuid,p_question uuid,p_action text,p_reason text,p_deadline timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
declare q case_correspondence.questions; recipient uuid;begin
 if not case_correspondence.manage(p_id) then raise exception 'Authorized case reviewer required' using errcode='42501';end if;
 if length(btrim(coalesce(p_reason,'')))=0 then raise exception 'Review reason required';end if;
 perform case_correspondence.ensure_case(p_id);perform 1 from case_correspondence.cases where id=p_id for update;
 if p_action='reviewed' then
 select * into q from case_correspondence.questions where id=p_question and case_id=p_id for update;
 if q.state<>'received' or q.id is null then raise exception 'A submitted response is required';end if;
 update case_correspondence.questions set state='reviewed' where id=p_question;
 update case_correspondence.cases set status='HR Reviewing Response' where id=p_id;
 elsif p_action='deadline' then
 if p_deadline is null or p_deadline<=clock_timestamp() then raise exception 'Future deadline required';end if;
 update case_correspondence.questions set deadline=p_deadline where id=p_question and case_id=p_id and state='awaiting' returning * into q;
 if q.id is null then raise exception 'Open question required';end if;
 perform case_correspondence.notify(p_id,q.recipient,'Case Response Deadline Updated',q.id::text||':deadline:'||p_deadline::text);
 elsif p_action in('Ready for Endorsement','Closed') then
 if exists(select 1 from case_correspondence.questions where case_id=p_id and state in('awaiting','received')) then raise exception 'Review or explicitly resolve all outstanding questions before continuing';end if;
 update case_correspondence.cases set status=p_action where id=p_id;
 select reported_by into recipient from public.incident_reports where id=p_id;
 perform case_correspondence.notify(p_id,recipient,'Case Review: '||p_action,p_id::text||':'||p_action||':'||clock_timestamp()::text);
 elsif p_action='resolve' then
 update case_correspondence.questions set state='closed' where id=p_question and case_id=p_id and state in('awaiting','received');
 else raise exception 'Unsupported review action';end if;
 perform case_correspondence.log(p_id,p_action,null,jsonb_build_object('reason',p_reason,'question',p_question,'deadline',p_deadline));
end$$;
create function public.get_my_case_questions() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select q.id,q.case_id,q.deadline,q.created_at,q.state,coalesce('TNGIR-'||lpad(r.case_number::text,5,'0'),q.case_id::text) reference from case_correspondence.questions q join public.incident_reports r on r.id=q.case_id where case_correspondence.active() and q.recipient=public.current_hris_user_id() and q.state='awaiting' order by q.deadline) t;$$;
-- A separate durable queue uses the existing authenticated email worker and retries.
create function public.claim_case_correspondence_email() returns jsonb language plpgsql security definer set search_path='' as $$declare d case_correspondence.deliveries; email text;begin
 select * into d from case_correspondence.deliveries where status in('queued','failed','sending') and attempts<8 and next_attempt<=clock_timestamp() and coalesce(lease_until,'-infinity')<clock_timestamp() order by created_at for update skip locked limit 1;
 if d.id is null then return null;end if;
 select u.email into email from public.hris_users u where u.id=d.recipient and lower(u.status)='active';
 if email is null then update case_correspondence.deliveries set status='skipped',error='Inactive recipient' where id=d.id;return jsonb_build_object('skipped',true);end if;
 update case_correspondence.deliveries set status='sending',attempts=attempts+1,token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes' where id=d.id returning * into d;
 return jsonb_build_object('id',d.id,'token',d.token,'payload',jsonb_build_object('email',email,'caseId',d.case_id,'event',d.event));end$$;
create function public.finish_case_correspondence_email(p_id uuid,p_token uuid,p_provider text,p_error text) returns void language plpgsql security definer set search_path='' as $$declare d case_correspondence.deliveries;begin
 update case_correspondence.deliveries set status=case when p_error is null and p_provider is not null then 'sent' else 'failed' end,provider=p_provider,error=left(p_error,1000),lease_until=null,next_attempt=clock_timestamp()+interval '5 minutes'*power(2,least(attempts,8)),token=null where id=p_id and token=p_token and status='sending' returning * into d;
 if d.id is not null then perform case_correspondence.log(d.case_id,'email '||d.status,null,jsonb_build_object('delivery',d.id,'recipient',d.recipient,'attempt',d.attempts,'provider',p_provider,'error',p_error));end if;end$$;
create function case_correspondence.tick() returns void language plpgsql security definer set search_path='' as $$declare q record;begin
 for q in select * from case_correspondence.questions where state='awaiting' and deadline<clock_timestamp()+interval '1 day' loop
 perform case_correspondence.notify(q.case_id,q.recipient,case when q.deadline<clock_timestamp() then 'Case Response Overdue' else 'Case Response Due Soon' end,q.id::text||':'||q.deadline::text||case when q.deadline<clock_timestamp() then ':overdue' else ':due' end);
 if q.deadline<clock_timestamp() then perform case_correspondence.notify(q.case_id,q.sender,'Case Response Overdue',q.id::text||':'||q.deadline::text||':reviewer-overdue');end if;end loop;
 if exists(select 1 from case_correspondence.deliveries where status in('queued','failed','sending') and attempts<8 and next_attempt<=clock_timestamp() and coalesce(lease_until,'-infinity')<clock_timestamp()) then
 perform net.http_post(url=>w.endpoint,headers=>jsonb_build_object('Content-Type','application/json','X-Attendance-Worker',w.token::text),body=>'{}'::jsonb,timeout_milliseconds=>1000) from attendance_issues.worker w;end if;
end$$;
create function case_correspondence.delivery_wake() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform net.http_post(url=>w.endpoint,headers=>jsonb_build_object('Content-Type','application/json','X-Attendance-Worker',w.token::text),body=>'{}'::jsonb,timeout_milliseconds=>1000) from attendance_issues.worker w;return null;end$$;
create trigger case_delivery_wake after insert on case_correspondence.deliveries for each statement execute function case_correspondence.delivery_wake();
select cron.schedule('case-correspondence-reminders','*/15 * * * *','select case_correspondence.tick()');
-- Lifecycle notifications contain no allegation, internal note, or NTE draft content.
create function case_correspondence.lifecycle() returns trigger language plpgsql security definer set search_path='' as $$declare cid uuid; recipient uuid; event text;begin
 cid:=(case when tg_table_name='ntes' then to_jsonb(new)->>'incident_report_id' else to_jsonb(new)->>'id' end)::uuid;
 if not exists(select 1 from case_correspondence.cases where id=cid) then return new;end if;
 if tg_table_name='ntes' then
 if tg_op='INSERT' then event:='NTE draft created';else if new.status is not distinct from old.status then return new;end if;event:='NTE status updated';end if;
 -- Reviewers receive updates; publication and employee receipt use the existing NTE workflow.
 for recipient in select distinct sender from case_correspondence.questions where case_id=cid loop perform case_correspondence.notify(cid,recipient,event,new.id::text||':'||event||':'||clock_timestamp()::text);end loop;
 else
 if new.status is not distinct from old.status and new.pipeline_stage is not distinct from old.pipeline_stage then return new;end if;
 event:='Case status updated';perform case_correspondence.notify(cid,new.reported_by,event,cid::text||':status:'||clock_timestamp()::text);
 end if;
 perform case_correspondence.log(cid,event,null,jsonb_build_object('id',new.id,'status',new.status));return new;end$$;
create trigger case_correspondence_incident_event after update of status,pipeline_stage on public.incident_reports for each row execute function case_correspondence.lifecycle();
create trigger case_correspondence_nte_event after insert or update of status on public.ntes for each row execute function case_correspondence.lifecycle();
do $$declare r record;begin
 for r in select tablename from pg_tables where schemaname='case_correspondence' loop execute format('alter table case_correspondence.%I enable row level security',r.tablename);end loop;
end$$;
revoke all on all tables in schema case_correspondence from public,anon,authenticated;
revoke all on all functions in schema case_correspondence from public,anon,authenticated;
revoke all on function public.get_case_questions(uuid),public.send_case_question(uuid,text,text,timestamptz,boolean,uuid,uuid),public.case_file_access(text,boolean),public.save_case_reply(uuid,uuid,text,jsonb,jsonb,boolean,text,uuid),public.review_case_correspondence(uuid,uuid,text,text,timestamptz),public.get_my_case_questions() from public,anon;
grant execute on function public.get_case_questions(uuid),public.send_case_question(uuid,text,text,timestamptz,boolean,uuid,uuid),public.case_file_access(text,boolean),public.save_case_reply(uuid,uuid,text,jsonb,jsonb,boolean,text,uuid),public.review_case_correspondence(uuid,uuid,text,text,timestamptz),public.get_my_case_questions() to authenticated;
revoke all on function public.claim_case_correspondence_email(),public.finish_case_correspondence_email(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_case_correspondence_email(),public.finish_case_correspondence_email(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
