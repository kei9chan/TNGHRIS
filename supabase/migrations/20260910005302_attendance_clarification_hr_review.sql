-- Attendance clarification and factual HR review. Additive; no payroll changes.
set local lock_timeout='5s';
alter table attendance_issues.settings add column clarification_hours integer not null default 48 check(clarification_hours between 1 and 720);
alter table attendance_issues.requests add column clarification_message text;
alter table attendance_issues.requests add column rejection_category text;
alter table attendance_issues.requests add column rejection_comments text;
create table attendance_issues.hr_cases(
 request_id uuid primary key references attendance_issues.requests(id),
 incident_id uuid not null unique references public.incident_reports(id) deferrable initially deferred,
 state text not null default 'draft' check(state in('draft','employee_clarification','response_received','nte_draft','nte_approval','nte_ready','nte_sent','closed_no_violation','closed_confirmed')),
 facts jsonb not null,question text,response_due timestamptz,decision text,
 nte_draft jsonb,nte_id uuid unique references public.ntes(id),revision integer not null default 1,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
alter table attendance_issues.hr_cases enable row level security;
revoke all on attendance_issues.hr_cases from public,anon,authenticated;
alter table attendance_issues.audit add column actor_roles text[];
alter table attendance_issues.audit add column request_revision integer;
alter table attendance_issues.audit add column incident_id uuid;
alter table attendance_issues.audit add column nte_id uuid;
create function attendance_issues.audit_context() returns trigger language plpgsql security definer set search_path='' as $$begin
 new.actor_roles:=coalesce((select array_agg(role_id) from private.effective_role_ids(new.actor)),'{}');
 select revision into new.request_revision from attendance_issues.requests where id=new.request_id;
 select c.incident_id,c.nte_id into new.incident_id,new.nte_id from attendance_issues.hr_cases c where c.request_id=new.request_id;
 return new;end $$;
create trigger audit_context before insert on attendance_issues.audit for each row execute function attendance_issues.audit_context();
create function attendance_issues.hr_access(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and private.attendance_admin() and public.is_hr_or_admin() and exists(select 1 from attendance_issues.requests where id=p_id and employee_id<>public.current_hris_user_id() and public.can_access_hris_user(employee_id))
$$;
create function attendance_issues.case_event(p_id uuid,p_action text,p_previous jsonb,p_new jsonb,p_reason text) returns void language sql security definer set search_path='' as $$
 insert into attendance_issues.audit(request_id,actor,action,previous,new_value,reason) values(p_id,public.current_hris_user_id(),p_action,p_previous,p_new,p_reason)
$$;

-- Preserve existing validated approval/punch implementation behind a private wrapper.
alter function public.review_attendance_issue(uuid,text,text,integer) set schema attendance_issues;
alter function attendance_issues.review_attendance_issue(uuid,text,text,integer) rename to review_before_hr;
revoke all on function attendance_issues.review_before_hr(uuid,text,text,integer) from public,anon,authenticated;
create function public.review_attendance_issue(p_id uuid,p_action text,p_reason text,p_revision integer,p_category text default null,p_confirm boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare r attendance_issues.requests;ir uuid:=gen_random_uuid();facts jsonb;h record;begin
 select * into r from attendance_issues.requests where id=p_id for update;
 if r.id is null or not attendance_issues.can_read(p_id) then raise exception 'Request unavailable' using errcode='42501';end if;
 if exists(select 1 from attendance_issues.hr_cases where request_id=p_id) and p_action<>'cancel' then raise exception 'This request is in HR review. Use the HR review actions.';end if;
 if p_action='reject' and (not coalesce(p_confirm,false) or coalesce(p_category,'') not in('Insufficient information after clarification','Request conflicts with policy','Supporting document not provided','Request submitted too late','Other')) then raise exception 'Choose a rejection reason and confirm HR review. Rejection is not a finding of a violation.';end if;
 perform attendance_issues.review_before_hr(p_id,p_action,p_reason,p_revision);
 if p_action='details' then
 update attendance_issues.requests set clarification_message=trim(p_reason),due_at=clock_timestamp()+make_interval(hours=>(select clarification_hours from attendance_issues.settings)),escalated_at=null where id=p_id;
 perform attendance_issues.case_event(p_id,'manager clarification',to_jsonb(r),(select to_jsonb(x) from attendance_issues.requests x where id=p_id),p_reason);
 elsif p_action='reject' then
 update attendance_issues.requests set rejection_category=p_category,rejection_comments=trim(p_reason) where id=p_id;
 select full_name,employee_id,business_unit_id,business_unit,department into h from public.hris_users where id=r.employee_id;
 facts:=jsonb_build_object('employeeName',h.full_name,'employeeCode',h.employee_id,'businessUnit',h.business_unit,'department',h.department,'request',to_jsonb(r),'source','HRIS','gcReportStatus','Not recorded','notice','No conclusion has been made. This record is pending HR review.','rejectionCategory',p_category,'managerComments',p_reason,'punches',public.get_attendance_issue_punches(p_id),'history',(select coalesce(jsonb_agg(to_jsonb(a) order by created_at),'[]') from attendance_issues.audit a where request_id=p_id));
 insert into attendance_issues.hr_cases(request_id,incident_id,facts) values(p_id,ir,facts);
 insert into public.incident_reports(id,category,description,date_time,reported_by,involved_employee_ids,involved_employee_names,status,pipeline_stage,business_unit_id,business_unit_name)
 values(ir,'Attendance review','No conclusion has been made. This record is pending HR review. Factual source and private evidence: attendance request '||p_id,(r.work_date::timestamp at time zone 'Asia/Manila'),public.current_hris_user_id(),array[r.employee_id],array[h.full_name],'Draft','Draft – Awaiting HR Review',h.business_unit_id,h.business_unit);
 perform attendance_issues.case_event(p_id,'incident report draft created',null,jsonb_build_object('incidentId',ir,'status','Draft – Awaiting HR Review','facts',facts),p_reason);
 perform attendance_issues.notify_hr(p_id,'Rejected – HR Review Pending',p_id||':hr-rejection:'||r.revision);
 end if;
end $$;

-- Same ID, validated fields, immutable prior versions; clients cannot choose a manager.
alter function public.submit_attendance_issue(jsonb,uuid,uuid,integer) set schema attendance_issues;
alter function attendance_issues.submit_attendance_issue(jsonb,uuid,uuid,integer) rename to submit_before_hr;
revoke all on function attendance_issues.submit_before_hr(jsonb,uuid,uuid,integer) from public,anon,authenticated;
create function public.submit_attendance_issue(p_data jsonb,p_key uuid,p_id uuid default null,p_revision integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;begin
 if p_id is not null and (not coalesce((p_data->>'changesConfirmed')::boolean,false) or exists(select 1 from attendance_issues.hr_cases where request_id=p_id)) then raise exception 'Confirm the changes before resubmitting the original request';end if;
 rid:=attendance_issues.submit_before_hr(p_data,p_key,p_id,p_revision);
 if p_id is not null then perform attendance_issues.notify(rid,private.punch_direct_manager(public.current_hris_user_id()),'Attendance request resubmitted',rid||':resubmission:'||p_revision);end if;
 return rid;end $$;

-- Suppress ordinary case-filing alerts for these private drafts only.
do $$declare ddl text;begin
 ddl:=pg_get_functiondef('public.notify_hr_on_incident_report_filed()'::regprocedure);
 ddl:=replace(ddl,'select full_name into reporter_name','if exists(select 1 from attendance_issues.hr_cases where incident_id=new.id) then return new;end if;'||chr(10)||'  select full_name into reporter_name');execute ddl;
end $$;
create function public.attendance_incident_readable(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from attendance_issues.hr_cases where incident_id=p_id) or exists(select 1 from attendance_issues.hr_cases c join attendance_issues.requests r on r.id=c.request_id where c.incident_id=p_id and ((public.is_hr_or_admin() and public.can_access_hris_user(r.employee_id)) or exists(select 1 from public.nte_approvals a where a.nte_id=c.nte_id and a.approver_user_id=public.current_hris_user_id()) or (r.employee_id=public.current_hris_user_id() and private.nte_is_published(c.nte_id))))
$$;
create policy attendance_incident_privacy on public.incident_reports as restrictive for select to authenticated using(public.attendance_incident_readable(id));

-- Explicit HR review; employee explanations never replace the rejection.
create function public.act_attendance_hr_case(p_id uuid,p_action text,p_revision integer,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare c attendance_issues.hr_cases;r attendance_issues.requests;note text:=trim(coalesce(p_data->>'reason',''));dt timestamptz;path text:=nullif(p_data->>'attachment','');n public.ntes;begin
 select * into r from attendance_issues.requests where id=p_id for update;
 select * into c from attendance_issues.hr_cases where request_id=p_id for update;
 if c.request_id is null or c.revision is distinct from p_revision then raise exception 'Case changed or unavailable. Refresh and retry.' using errcode='40001';end if;
 if not attendance_issues.can_read(p_id) or length(note) not between 3 and 4000 then raise exception 'Authorized access and a reason are required' using errcode='42501';end if;
 if p_action='respond' then
 if r.employee_id<>public.current_hris_user_id() or c.state<>'employee_clarification' then raise exception 'Only the employee may respond to an open clarification' using errcode='42501';end if;
 if path is not null and not exists(select 1 from storage.objects where bucket_id='attendance-issue-files' and name=path and (storage.foldername(name))[1]=auth.uid()::text) then raise exception 'Upload your attachment first' using errcode='42501';end if;
 if nullif(p_data->>'link','') is not null and p_data->>'link' !~ '^https://' then raise exception 'Supporting links must use HTTPS';end if;
 update attendance_issues.hr_cases set state='response_received' where request_id=p_id;
 perform attendance_issues.notify_hr(p_id,'Employee clarification received',p_id||':hr-response:'||c.revision);
 else
 if not attendance_issues.hr_access(p_id) then raise exception 'Authorized HR review required' using errcode='42501';end if;
 if c.state in('closed_no_violation','closed_confirmed','nte_sent') then raise exception 'Use the existing NTE case workflow after issuance or closure';end if;
 if c.state='employee_clarification' then raise exception 'Review the employee response before making a case or NTE decision';end if;
 if p_action='clarify' then
 if c.nte_id is not null then raise exception 'Return the NTE through its existing revision workflow before further clarification';end if;
 dt:=(p_data->>'deadline')::timestamptz;
 if dt is null or dt<=clock_timestamp() or dt>clock_timestamp()+interval '30 days' then raise exception 'Choose a future response deadline within 30 days';end if;
 update attendance_issues.hr_cases set state='employee_clarification',question=note,response_due=dt where request_id=p_id;
 elsif p_action='close' then
 if c.nte_id is not null then raise exception 'Close or revise the linked NTE using its existing workflow';end if;
 if coalesce((p_data->>'approveAttendance')::boolean,false) then
 update attendance_issues.requests set status='hr_review' where id=p_id;
 perform attendance_issues.review_before_hr(p_id,'approve',left(note,1000),r.revision);
 end if;
 update attendance_issues.hr_cases set state='closed_no_violation',decision=note where request_id=p_id;
 update public.incident_reports set status='Closed',pipeline_stage='Closed – No Violation' where id=c.incident_id;
 elsif p_action in('draft','edit_draft') then
 if not private.can_issue_nte() or c.nte_id is not null then raise exception 'Authorized NTE drafting required; use the linked NTE revision workflow once submitted' using errcode='42501';end if;
 if length(trim(coalesce(p_data->>'facts','')))<3 or length(trim(coalesce(p_data->>'allegation','')))<3 then raise exception 'Enter verified facts and the proposed allegation for HR review';end if;
 update attendance_issues.hr_cases set state='nte_draft',nte_draft=jsonb_build_object('facts',p_data->>'facts','allegation',p_data->>'allegation','body',p_data->>'body','policyIds',coalesce(p_data->'policyIds','[]'),'deadline',p_data->>'deadline','rationale',note,'editedBy',public.current_hris_user_id(),'editedAt',clock_timestamp()) where request_id=p_id;
 elsif p_action='submit_nte' then
 if c.state<>'nte_draft' or c.nte_id is not null or not private.can_issue_nte() then raise exception 'An authorized, reviewed NTE draft is required' using errcode='42501';end if;
 if not coalesce((p_data->>'confirmed')::boolean,false) or jsonb_array_length(coalesce(c.nte_draft->'policyIds','[]'))=0 then raise exception 'Select the applicable policy and confirm the draft review';end if;
 if exists(select 1 from jsonb_array_elements_text(c.nte_draft->'policyIds') p where not exists(select 1 from public.memos m where m.id::text=p)) then raise exception 'Select an existing policy or memorandum';end if;
 dt:=(c.nte_draft->>'deadline')::timestamptz;
 if dt is null or dt<=clock_timestamp() or length(trim(coalesce(c.nte_draft->>'body','')))<3 then raise exception 'Review the NTE body and future response deadline';end if;
 perform set_config('app.attendance_nte_draft','on',true);
 select * into n from public.create_nte_for_employee(c.incident_id,r.employee_id,null,dt,(c.nte_draft->>'facts')||E'\nProposed allegation: '||(c.nte_draft->>'allegation'),c.nte_draft->>'body',null,array(select jsonb_array_elements_text(c.nte_draft->'policyIds')),'{}'::text[],coalesce(p_data->'approvers','[]'),null);
 update attendance_issues.hr_cases set state='nte_approval',nte_id=n.id where request_id=p_id;
 elsif p_action='send_nte' then
 if not private.can_issue_nte() or c.nte_id is null then raise exception 'Authorized HR NTE sending required' using errcode='42501';end if;
 select * into n from public.ntes where id=c.nte_id for update;
 if n.status<>'Approved' or not exists(select 1 from public.nte_approvals where nte_id=n.id and is_required and is_bod_role and status='Approved') or exists(select 1 from public.nte_approvals where nte_id=n.id and is_required and status<>'Approved') then raise exception 'Complete the existing designated NTE approvals first';end if;
 if n.response_deadline<=clock_timestamp() then raise exception 'The response deadline has passed. Revise the NTE before sending';end if;
 if exists(select 1 from unnest(array['irReviewed','timelineComplete','clarificationsConsidered','reasonDocumented','policySelected','deadlineCorrect','contentReviewed']) k where not coalesce((p_data->k)::boolean,false)) then raise exception 'Complete every HR sending confirmation';end if;
 perform set_config('app.attendance_nte_send','on',true);perform set_config('app.nte_workflow_rpc','on',true);
 update public.ntes set status='Issued',updated_at=clock_timestamp(),workflow_history=coalesce(workflow_history,'[]')||jsonb_build_array(jsonb_build_object('action','HR Approve and Send NTE','actorId',public.current_hris_user_id(),'previousStatus','Approved','newStatus','Issued','timestamp',clock_timestamp(),'note',note)) where id=n.id;
 update attendance_issues.hr_cases set state='nte_sent' where request_id=p_id;
 insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key) values(r.employee_id::text,'NTE_ISSUED','Notice to Explain Issued','HR has reviewed and sent a Notice to Explain. Open the notice to review and respond.','/feedback/nte/'||n.id,n.id::text,'attendance-nte:'||n.id||':issued') on conflict do nothing;
 else raise exception 'Unknown HR action';end if;
 perform attendance_issues.notify(p_id,r.employee_id,case p_action when 'clarify' then 'HR requests clarification' when 'close' then 'HR closed review – No Violation' when 'send_nte' then 'NTE issued – response required' else 'HR review in progress' end,p_id||':hr-action:'||c.revision);
 if p_action='close' then perform attendance_issues.notify(p_id,r.manager_id,'HR closed review – No Violation',p_id||':hr-close-manager:'||c.revision);end if;
 end if;
 update attendance_issues.hr_cases set revision=revision+1,updated_at=clock_timestamp() where request_id=p_id;
 perform attendance_issues.case_event(p_id,'HR case '||p_action,to_jsonb(c),jsonb_build_object('case',(select to_jsonb(x) from attendance_issues.hr_cases x where request_id=p_id),'response',p_data),note);
end $$;

-- Attendance NTEs require both existing designated approvals and explicit HR send.
do $$declare ddl text;needle text:='then ''Issued''::public.nte_status';begin
 ddl:=pg_get_functiondef('public.act_on_nte_approval(uuid,text,text)'::regprocedure);
 if position(needle in ddl)=0 then raise exception 'NTE approval function changed; review integration';end if;
 ddl:=replace(ddl,needle,'then case when exists(select 1 from attendance_issues.hr_cases where nte_id=p_nte_id) then ''Approved''::public.nte_status else ''Issued''::public.nte_status end');execute ddl;
end $$;
create function attendance_issues.nte_guard() returns trigger language plpgsql security definer set search_path='' as $$declare c attendance_issues.hr_cases;begin
 select * into c from attendance_issues.hr_cases where incident_id=new.incident_report_id;
 if c.request_id is null then return new;end if;
 if tg_op='INSERT' and coalesce(current_setting('app.attendance_nte_draft',true),'')<>'on' then raise exception 'Create this NTE through authorized attendance HR review' using errcode='42501';end if;
 if new.status='Issued' and (tg_op='INSERT' or old.status is distinct from new.status) and coalesce(current_setting('app.attendance_nte_send',true),'')<>'on' then raise exception 'HR Approve and Send NTE is required' using errcode='42501';end if;
 if tg_op='UPDATE' and old.status in('Approved','PendingApproval') and (new.body,new.details,new.response_deadline,new.memo_ids,new.discipline_code_ids) is distinct from (old.body,old.details,old.response_deadline,old.memo_ids,old.discipline_code_ids) then raise exception 'Return the NTE for revision before changing reviewed content';end if;
 return new;end $$;
create trigger attendance_nte_guard before insert or update on public.ntes for each row execute function attendance_issues.nte_guard();
create function attendance_issues.nte_audit() returns trigger language plpgsql security definer set search_path='' as $$declare rid uuid;begin
 select request_id into rid from attendance_issues.hr_cases where incident_id=new.incident_report_id;
 if rid is null then return new;end if;
 if tg_op='UPDATE' and new.status is distinct from old.status then
 update attendance_issues.hr_cases set state=case new.status::text when 'Approved' then 'nte_ready' when 'Closed' then 'closed_confirmed' when 'Issued' then 'nte_sent' else state end,updated_at=clock_timestamp() where request_id=rid;
 end if;
 perform attendance_issues.case_event(rid,'linked NTE '||lower(tg_op),case when tg_op='UPDATE' then jsonb_build_object('status',old.status,'body',old.body,'details',old.details,'response',old.employee_response) end,jsonb_build_object('nteId',new.id,'status',new.status,'body',new.body,'details',new.details,'response',new.employee_response,'receipt',new.receipt_recorded_at),'Existing NTE workflow event');return new;end $$;
create trigger attendance_nte_audit after insert or update on public.ntes for each row execute function attendance_issues.nte_audit();

create or replace function public.can_read_attendance_attachment(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from attendance_issues.requests r where attendance_issues.can_read(r.id) and (r.attachment=p_path or exists(select 1 from attendance_issues.audit a where a.request_id=r.id and (a.previous->>'attachment'=p_path or a.new_value->>'attachment'=p_path or a.new_value#>>'{response,attachment}'=p_path))))
$$;
create function public.get_attendance_case(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare c attendance_issues.hr_cases;hr boolean;begin
 if not attendance_issues.can_read(p_id) then raise exception 'Request unavailable' using errcode='42501';end if;
 hr:=attendance_issues.hr_access(p_id);select * into c from attendance_issues.hr_cases where request_id=p_id;
 return jsonb_build_object('canHR',hr,'canNTE',hr and private.can_issue_nte(),'case',case when c.request_id is null then null when hr then to_jsonb(c) else jsonb_build_object('state',case when c.state like 'nte_%' and c.state<>'nte_sent' then 'draft' else c.state end,'revision',c.revision,'question',c.question,'response_due',c.response_due,'decision',c.decision,'nte_id',case when private.nte_is_published(c.nte_id) then c.nte_id end) end,
 'nte',case when c.nte_id is not null and (hr or private.nte_is_published(c.nte_id)) then (select jsonb_build_object('id',id,'status',status,'number',nte_number,'deadline',response_deadline) from public.ntes where id=c.nte_id) end,
 'history',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'actorName',h.full_name,'roles',a.actor_roles,'created_at',a.created_at,'revision',a.request_revision,'reason',a.reason,'previous',a.previous,'new_value',a.new_value) order by a.created_at),'[]') from attendance_issues.audit a left join public.hris_users h on h.id=a.actor where a.request_id=p_id and (hr or a.action in('submitted','edited and resubmitted','details','manager clarification','approve','reject','withdraw','cancel'))),
 'responses',(select coalesce(jsonb_agg(jsonb_build_object('at',a.created_at,'actor',h.full_name,'message',a.reason,'attachment',a.new_value#>>'{response,attachment}','link',a.new_value#>>'{response,link}') order by a.created_at),'[]') from attendance_issues.audit a left join public.hris_users h on h.id=a.actor where a.request_id=p_id and a.action='HR case respond'));
end $$;

create function public.save_attendance_clarification_period(p_hours integer,p_reason text) returns void language plpgsql security definer set search_path='' as $$declare old integer;begin
 if not private.attendance_admin() or public.current_data_scope()->>'type'<>'GLOBAL' then raise exception 'Global HR authorization required' using errcode='42501';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter a change reason';end if;
 select clarification_hours into old from attendance_issues.settings for update;
 update attendance_issues.settings set clarification_hours=p_hours,changed_by=public.current_hris_user_id(),changed_at=clock_timestamp();
 perform attendance_issues.case_event(null,'clarification period changed',to_jsonb(old),to_jsonb(p_hours),p_reason);end $$;
alter function attendance_issues.reminders() rename to reminders_before_clarification;
create function attendance_issues.reminders() returns void language plpgsql security definer set search_path='' as $$declare r record;begin
 perform attendance_issues.reminders_before_clarification();
 for r in select id,revision,due_at from attendance_issues.requests where status='details' and due_at<=clock_timestamp()
 union all select request_id,revision,response_due from attendance_issues.hr_cases where state='employee_clarification' and response_due<=clock_timestamp() loop
 perform attendance_issues.notify_hr(r.id,'Attendance clarification overdue – HR follow-up required',r.id||':clarification-overdue:'||r.revision||':'||(clock_timestamp() at time zone 'Asia/Manila')::date);
 end loop;end $$;

-- Generic audit summaries must not leak unsent NTE facts to employees/managers.
do $$declare ddl text;begin
 ddl:=pg_get_functiondef('public.get_attendance_issues(uuid)'::regprocedure);
 ddl:=replace(ddl,'''reason'',a.reason','''reason'',case when a.action like ''HR case %'' then ''HR review update — open request details'' else a.reason end');
 ddl:=replace(ddl,'''exception'',','''hrState'',(select case when c.state like ''nte_%'' and c.state<>''nte_sent'' and not attendance_issues.hr_access(r.id) then ''draft'' else c.state end from attendance_issues.hr_cases c where c.request_id=r.id),''isManager'',private.punch_direct_manager(r.employee_id)=public.current_hris_user_id(),''exception'',');execute ddl;
 ddl:=pg_get_functiondef('public.claim_attendance_issue_email()'::regprocedure);
 ddl:=replace(ddl,'''explanation'',r.explanation','''explanation'',r.explanation,''reviewMessage'',case when r.status=''details'' then r.clarification_message when r.status=''rejected'' then coalesce((select question from attendance_issues.hr_cases where request_id=r.id and state=''employee_clarification''),r.rejection_category||'': ''||r.rejection_comments) end');execute ddl;
 ddl:=pg_get_functiondef('private.attendance_review_facts(uuid,date)'::regprocedure);
 ddl:=replace(ddl,'status in(''pending'',''details'',''hr_review'')','status in(''pending'',''details'',''hr_review'',''rejected'')');execute ddl;
end $$;
do $$declare f record;begin for f in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='attendance_issues' or (n.nspname='public' and p.proname in('review_attendance_issue','submit_attendance_issue','act_attendance_hr_case','get_attendance_case','attendance_incident_readable','save_attendance_clarification_period')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;end $$;
notify pgrst,'reload schema';
