-- Separate supplemental statements; never edit the original IR or NTE explanation.
alter table case_correspondence.questions drop constraint questions_kind_check;
alter table case_correspondence.questions add constraint questions_kind_check
 check(kind in ('complainant','manager','respondent','reporter'));

create table case_correspondence.requests (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references case_correspondence.cases(id),
 nte_id uuid references public.ntes(id),
 sender uuid not null references public.hris_users(id),
 nonce uuid not null, payload jsonb not null,
 internal_note text not null default '' check(length(internal_note)<=10000),
 created_at timestamptz not null default clock_timestamp(), unique(sender,nonce)
);
alter table case_correspondence.requests enable row level security;
revoke all on case_correspondence.requests from public,anon,authenticated;
create index case_information_requests_case_idx on case_correspondence.requests(case_id);
create index case_information_requests_nte_idx on case_correspondence.requests(nte_id);
create trigger case_information_requests_immutable before update or delete on case_correspondence.requests
 for each row execute function case_correspondence.immutable();
alter table case_correspondence.questions add column request_id uuid references case_correspondence.requests(id);
create unique index case_information_request_recipient_idx on case_correspondence.questions(request_id,recipient);
create index case_questions_pending_case_idx on case_correspondence.questions(case_id) where state in ('awaiting','received');

create function case_correspondence.hr_admin(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case_correspondence.manage(p_id) and exists(select 1 from public.user_roles
 where user_id=public.current_hris_user_id() and is_active and role_id in ('Admin','HR Manager','HR Staff'));
$$;

create function public.request_case_information(p_id uuid,p_nte_id uuid,p_recipient text,p_body text,
 p_deadline timestamptz,p_attachment boolean,p_internal_note text,p_nonce uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); r public.incident_reports;
 rid uuid; prior case_correspondence.requests; payload jsonb; recipients uuid[]:='{}'; respondent_ids uuid[]:='{}';
 target uuid; qid uuid; ids jsonb:='[]';
begin
 if not case_correspondence.hr_admin(p_id) then raise exception 'Authorized HR/Admin case access is required' using errcode='42501';end if;
 -- Same lock is taken by the closure/decision guard, so request and finalization cannot race.
 select * into r from public.incident_reports where id=p_id for update;
 payload:=jsonb_build_object('case',p_id,'nte',p_nte_id,'recipient',p_recipient,'body',btrim(p_body),
  'deadline',p_deadline,'attachment',p_attachment,'note',coalesce(p_internal_note,''));
 select * into prior from case_correspondence.requests where sender=actor and nonce=p_nonce;
 if prior.id is not null then
  if prior.payload is distinct from payload then raise exception 'Submission token already used for a different request';end if;
  return jsonb_build_object('requestId',prior.id,'questionIds',(select jsonb_agg(id order by id) from case_correspondence.questions where request_id=prior.id));
 end if;
 if p_nonce is null or p_recipient is null or p_recipient not in ('respondent','reporter','both')
  or p_body is null or length(btrim(p_body)) not between 1 and 10000
  or p_deadline is null or p_deadline<=clock_timestamp() or p_attachment is null
  or length(coalesce(p_internal_note,''))>10000 then raise exception 'Enter a recipient, question, future response deadline, and attachment requirement';end if;
 if p_nte_id is not null and not exists(select 1 from public.ntes where id=p_nte_id and incident_report_id=p_id and private.can_view_nte(id)) then
  raise exception 'The selected NTE does not belong to this accessible case' using errcode='42501';end if;
 if r.status::text in ('Closed','Resolved','Dismissed','Archived','Cancelled') or r.pipeline_stage in ('closed','resolved')
  or exists(select 1 from public.ntes where incident_report_id=p_id and status::text='Closed' and (p_nte_id is null or id=p_nte_id))
  or exists(select 1 from public.resolutions where incident_report_id=p_id and status in ('Issued','Pending Acknowledgement','Acknowledged','Closed','Approved')) then
  raise exception 'This case already has a final decision or is closed; use the authorized reopening workflow';end if;
 if p_recipient in ('respondent','both') then
  select coalesce(array_agg(distinct recipient_employee_id),'{}') into respondent_ids from public.ntes
   where incident_report_id=p_id and (p_nte_id is null or id=p_nte_id)
   and recipient_employee_id is not null and private.nte_is_published(id) and status::text<>'Closed';
  if cardinality(respondent_ids)=0 then raise exception 'No issued NTE respondent is available for this case';end if;
  recipients:=respondent_ids;
 end if;
 if p_recipient in ('reporter','both') then
  if r.reported_by is null then raise exception 'No original incident reporter is recorded';end if;
  recipients:=array_append(recipients,r.reported_by);
 end if;
 if exists(select 1 from unnest(recipients) x where x=actor or not exists(select 1 from public.hris_users where id=x and lower(status)='active' and auth_user_id is not null)) then
  raise exception 'Every selected recipient must have an active linked HRIS account and be different from the requesting reviewer';end if;
 perform case_correspondence.ensure_case(p_id);
 insert into case_correspondence.requests(case_id,nte_id,sender,nonce,payload,internal_note)
 values(p_id,p_nte_id,actor,p_nonce,payload,coalesce(p_internal_note,'')) returning id into rid;
 for target in select distinct unnest(recipients) loop
  insert into case_correspondence.questions(case_id,sender,recipient,kind,body,deadline,attachment_requested,nonce,request_id)
  values(p_id,actor,target,case when target=r.reported_by then 'reporter' else 'respondent' end,btrim(p_body),p_deadline,p_attachment,gen_random_uuid(),rid) returning id into qid;
  ids:=ids||jsonb_build_array(qid);
  perform case_correspondence.log(p_id,'additional information requested',null,
   (select to_jsonb(q) from case_correspondence.questions q where id=qid));
  perform case_correspondence.notify(p_id,target,'Action Required: Case Information Requested',qid::text||':question');
 end loop;
 update case_correspondence.cases set status='Awaiting Additional Information' where id=p_id;
 perform case_correspondence.log(p_id,'supplemental request recorded',null,
  jsonb_build_object('requestId',rid,'nteId',p_nte_id,'questionIds',ids,'internalNoteRecorded',length(btrim(coalesce(p_internal_note,'')))>0));
 return jsonb_build_object('requestId',rid,'questionIds',ids);
end$$;

-- Enforce attachments on new mandatory requests in the database, including direct RPC retries.
create function case_correspondence.validate_supplement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.kind='reply' and not new.draft then
  if exists(select 1 from case_correspondence.questions where id=new.question_id and request_id is not null and attachment_requested)
   and (new.files is null or jsonb_typeof(new.files)<>'array' or jsonb_array_length(new.files)=0) then
   raise exception 'A supporting attachment is required before submitting this response';end if;
 end if;
 return new;
end$$;
create trigger require_case_supporting_attachment before insert on case_correspondence.messages
 for each row execute function case_correspondence.validate_supplement();

-- Keep a response from one recipient from hiding another recipient's outstanding request.
create function case_correspondence.pending_status() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from case_correspondence.questions where case_id=new.id and state='awaiting') then
  new.status:='Awaiting Additional Information';
 elsif exists(select 1 from case_correspondence.questions where case_id=new.id and state='received') then
  new.status:='Response Received — HR Review Required';
 end if;return new;
end$$;
create trigger a_case_pending_status before update of status on case_correspondence.cases
 for each row execute function case_correspondence.pending_status();

create function case_correspondence.guard_finalization() returns trigger
language plpgsql security definer set search_path='' as $$
declare cid uuid; blocking boolean:=false;
begin
 cid:=case when tg_table_name='incident_reports' then new.id else (to_jsonb(new)->>'incident_report_id')::uuid end;
 if tg_table_name='incident_reports' then
  blocking:=new.status::text in ('Closed','Resolved','Dismissed','Archived','Cancelled') or new.pipeline_stage in ('closed','resolved');
 elsif tg_table_name='ntes' then blocking:=new.status::text='Closed';
 else
  blocking:=new.status in ('Pending Approval','Approved','Issued','Pending Acknowledgement','Acknowledged','Closed');
 end if;
 if blocking then
  perform 1 from public.incident_reports where id=cid for update;
  if exists(select 1 from case_correspondence.questions where case_id=cid and state in ('awaiting','received')) then
   raise exception 'Additional information is pending. Review or explicitly resolve all case questions before decision approval or case closure.';
  end if;
 end if;return new;
end$$;
create trigger a_case_information_incident_guard before update of status,pipeline_stage on public.incident_reports
 for each row execute function case_correspondence.guard_finalization();
create trigger a_case_information_nte_guard before update of status on public.ntes
 for each row execute function case_correspondence.guard_finalization();
create trigger a_case_information_decision_guard before insert or update on public.resolutions
 for each row execute function case_correspondence.guard_finalization();

revoke all on function case_correspondence.hr_admin(uuid),case_correspondence.validate_supplement(),
 case_correspondence.pending_status(),case_correspondence.guard_finalization() from public,anon,authenticated;
revoke all on function public.request_case_information(uuid,uuid,text,text,timestamptz,boolean,text,uuid) from public,anon;
grant execute on function public.request_case_information(uuid,uuid,text,text,timestamptz,boolean,text,uuid) to authenticated;
create or replace function public.get_case_questions(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); full_view boolean; r public.incident_reports; result jsonb; opened_question record;
begin
 if not case_correspondence.readable(p_id) then raise exception 'Case correspondence unavailable' using errcode='42501';end if;
 full_view:=case_correspondence.oversight(p_id);select * into r from public.incident_reports where id=p_id;
 for opened_question in select id from case_correspondence.questions where case_id=p_id and recipient=actor and opened_at is null for update loop update case_correspondence.questions set opened_at=clock_timestamp() where id=opened_question.id;end loop;
 insert into case_correspondence.message_reads(message_id,reader)
 select m.id,actor from case_correspondence.messages m where m.case_id=p_id and not m.draft and m.author<>actor and (full_view or (m.kind='reply' and exists(select 1 from case_correspondence.questions qr where qr.id=m.question_id and qr.recipient=actor))) on conflict do nothing;
 select jsonb_build_object('id',p_id,'reference',coalesce('TNGIR-'||lpad(r.case_number::text,5,'0'),p_id::text),'canManage',case_correspondence.manage(p_id),'canRequest',case_correspondence.hr_admin(p_id),'canComment',full_view,'isComplainant',r.reported_by=actor,'actorId',actor,
 'status',coalesce((select status from case_correspondence.cases where id=p_id),'HR Reviewing Response'),
 'original',case when full_view or r.reported_by=actor then coalesce((select original from case_correspondence.cases where id=p_id),jsonb_build_object('description',r.description,'category',r.category,'submittedAt',r.created_at,'attachment',r.attachment_url,'files',to_jsonb(r.attachment_urls))) else null end,
 'recipient',case when full_view then (select jsonb_build_object('id',id,'name',full_name) from public.hris_users where id=r.reported_by) else null end,
 'respondents',case when case_correspondence.hr_admin(p_id) then coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name,'nteId',n.id)) from public.ntes n join public.hris_users u on u.id=n.recipient_employee_id where n.incident_report_id=p_id and private.nte_is_published(n.id) and n.status::text<>'Closed'),'[]') else '[]' end,
 'internalNotes',case when case_correspondence.hr_admin(p_id) then coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'body',x.internal_note,'author',u.full_name,'createdAt',x.created_at) order by x.created_at) from case_correspondence.requests x join public.hris_users u on u.id=x.sender where x.case_id=p_id and btrim(x.internal_note)<>''),'[]') else '[]' end,
 'pendingInformation',exists(select 1 from case_correspondence.questions where case_id=p_id and state in ('awaiting','received')),
 'managers',case when case_correspondence.manage(p_id) then coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name)) from public.hris_users u where lower(u.status)='active' and u.id in (select private.resolve_direct_manager_id(e) from unnest(coalesce(r.involved_employee_ids,'{}'::uuid[])||array[r.reported_by]) e)),'[]') else '[]' end,
 'questions',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from (select q.*,s.full_name sender_name,u.full_name recipient_name from case_correspondence.questions q join public.hris_users s on s.id=q.sender join public.hris_users u on u.id=q.recipient where q.case_id=p_id and (full_view or q.recipient=actor)) t),'[]'),
 'messages',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from (select m.*,u.full_name author_name from case_correspondence.messages m join public.hris_users u on u.id=m.author where m.case_id=p_id and ((m.draft and m.author=actor) or (not m.draft and (full_view or (m.kind='reply' and exists(select 1 from case_correspondence.questions q where q.id=m.question_id and q.recipient=actor)))))) t),'[]'),
 'timeline',case when full_view then coalesce((select jsonb_agg(to_jsonb(t) order by created_at) from (select a.action,a.actor,(select full_name from public.hris_users where id=a.actor) actor_name,a.actor_roles,a.created_at,a.previous_value,a.new_value from case_correspondence.audit a where a.case_id=p_id order by a.created_at desc limit 200) t),'[]') else '[]' end
 ) into result;return result;
end$$;

create or replace function case_correspondence.readable(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case_correspondence.active() and (case_correspondence.oversight(p_id)
 or exists(select 1 from public.incident_reports where id=p_id and reported_by=public.current_hris_user_id())
 or exists(select 1 from case_correspondence.questions where case_id=p_id and recipient=public.current_hris_user_id())
 or exists(select 1 from public.ntes where incident_report_id=p_id and recipient_employee_id=public.current_hris_user_id() and private.nte_is_published(id)));
$$;
notify pgrst,'reload schema';
