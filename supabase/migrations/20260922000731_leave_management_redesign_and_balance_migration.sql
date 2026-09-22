-- Leave requests retain the employee's selected leave type while tracking the
-- payroll result separately. LWOP never consumes a paid-credit balance.
alter table public.leave_requests add column if not exists selected_leave_type_id uuid references public.leave_types(id);
alter table public.leave_requests add column if not exists selected_leave_type text;
alter table public.leave_requests add column if not exists paid_days numeric not null default 0 check(paid_days>=0);
alter table public.leave_requests add column if not exists unpaid_days numeric not null default 0 check(unpaid_days>=0);
alter table public.leave_requests add column if not exists credit_shortfall numeric not null default 0 check(credit_shortfall>=0);
alter table public.leave_requests add column if not exists final_classification text not null default 'paid' check(final_classification in('paid','lwop','paid_exception'));
alter table public.leave_requests add column if not exists lwop_confirmed boolean not null default false;

create table if not exists private.leave_exception_decisions(
 request_id uuid primary key references public.leave_requests(id), approver_id uuid not null references public.hris_users(id),
 outcome text not null check(outcome in('paid_exception','lwop')), credit_shortfall numeric not null,
 available_credits numeric not null, requested_days numeric not null, note text, decided_at timestamptz not null default clock_timestamp()
);
alter table private.leave_exception_decisions enable row level security;
revoke all on private.leave_exception_decisions from public,anon,authenticated;
create trigger immutable before update or delete on private.leave_exception_decisions for each row execute function private.prevent_time_decision_mutation();

create or replace function public.submit_leave_request(p_key uuid,p_data jsonb,p_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();r public.leave_requests;old public.leave_requests;h public.hris_users;fingerprint text;prior private.leave_submission_keys;existing uuid;k text;balance numeric;paid numeric;unpaid numeric;confirmed boolean;
begin
 if auth.uid() is null or actor is null or not public.has_feature_permission('Leave','create') or not public.has_workflow_permission('Leave','submit') then raise exception 'Authorized employee sign-in required' using errcode='42501';end if;
 if p_key is null then raise exception 'Submission key required';end if;
 perform pg_advisory_xact_lock(hashtextextended('leave-submit:'||actor::text,0));select * into h from public.hris_users where id=actor;
 r.employee_id:=actor;r.employee_name:=h.full_name;r.leave_type_id:=(p_data->>'leave_type_id')::uuid;r.selected_leave_type_id:=coalesce(nullif(p_data->>'selected_leave_type_id','')::uuid,r.leave_type_id);r.selected_leave_type:=nullif(p_data->>'selected_leave_type','');
 r.start_date:=(p_data->>'start_date')::date;r.end_date:=(p_data->>'end_date')::date;r.start_time:=nullif(p_data->>'start_time','');r.end_time:=nullif(p_data->>'end_time','');r.duration_days:=(p_data->>'duration_days')::numeric;r.reason:=p_data->>'reason';r.attachment_url:=nullif(p_data->>'attachment_url','');r.status:=coalesce(p_data->>'status','Pending');
 if r.status not in('Draft','Pending') or r.start_date is null or r.end_date is null or r.end_date<r.start_date or r.duration_days is null or r.duration_days<=0 or r.duration_days>(r.end_date-r.start_date+1) then raise exception 'Enter a valid leave period and duration';end if;
 select case when lower(name) like '%vacation%' then 'vacation' when lower(name) like '%sick%' then 'sick' when lower(name) like '%offset%' then 'offset' else 'lwop' end, name into k,r.selected_leave_type from public.leave_types where id=r.selected_leave_type_id;
 if k='lwop' then balance:=0;paid:=0;unpaid:=r.duration_days;confirmed:=true;else balance:=private.confirmed_leave_balance(actor,k,(now() at time zone 'Asia/Manila')::date);paid:=least(r.duration_days,greatest(0,balance));unpaid:=greatest(0,r.duration_days-paid);confirmed:=coalesce((p_data->>'lwop_confirmed')::boolean,false);end if;
 if r.status='Pending' and unpaid>0 and k<>'lwop' and not confirmed then raise exception 'You do not have enough available credits. Confirm Continue as Leave Without Pay before submitting.' using errcode='22023';end if;
 r.paid_days:=paid;r.unpaid_days:=unpaid;r.credit_shortfall:=unpaid;r.final_classification:=case when unpaid>0 then 'lwop' else 'paid' end;r.lwop_confirmed:=confirmed;
 fingerprint:=private.leave_fingerprint(r);select * into prior from private.leave_submission_keys where employee_id=actor and submission_key=p_key;
 if prior.request_id is not null and p_id is null then if prior.fingerprint<>fingerprint then raise exception 'Submission key already used for different leave details';end if;return jsonb_build_object('request',(select to_jsonb(x) from public.leave_requests x where id=prior.request_id),'created',false);end if;
 if p_id is not null then select * into old from public.leave_requests where id=p_id for update;if old.employee_id is distinct from actor or old.status<>'Draft' or old.duplicate_of is not null then if old.employee_id=actor and private.leave_fingerprint(old)=fingerprint and old.status in('Pending','PendingGM','PendingBOD','Approved') then return jsonb_build_object('request',to_jsonb(old),'created',false);end if;raise exception 'Only your draft may be edited' using errcode='42501';end if;end if;
 select id into existing from public.leave_requests x where x.employee_id=actor and x.id is distinct from p_id and x.duplicate_of is null and x.status in('Pending','PendingGM','PendingBOD','Approved') and private.leave_fingerprint(x)=fingerprint order by created_at,id limit 1;
 if existing is not null then insert into private.leave_submission_keys values(actor,p_key,existing,fingerprint) on conflict do nothing;return jsonb_build_object('request',(select to_jsonb(x) from public.leave_requests x where id=existing),'created',false);end if;
 if p_id is null then
  insert into public.leave_requests(employee_id,employee_name,leave_type_id,selected_leave_type_id,selected_leave_type,start_date,end_date,start_time,end_time,duration_days,reason,status,attachment_url,business_unit_id,department_id,history_log,paid_days,unpaid_days,credit_shortfall,final_classification,lwop_confirmed)
  values(actor,h.full_name,r.leave_type_id,r.selected_leave_type_id,r.selected_leave_type,r.start_date,r.end_date,r.start_time,r.end_time,r.duration_days,r.reason,r.status,r.attachment_url,h.business_unit_id,h.department_id,jsonb_build_array(jsonb_build_object('action','Submitted','userId',actor,'userName',h.full_name,'timestamp',clock_timestamp(),'details',case when unpaid>0 then format('%s selected; confirmed %s unpaid day(s)',r.selected_leave_type,unpaid) else format('%s selected; %s paid day(s)',r.selected_leave_type,paid) end)),paid,unpaid,unpaid,r.final_classification,confirmed) returning * into r;
 else
  update public.leave_requests set leave_type_id=r.leave_type_id,selected_leave_type_id=r.selected_leave_type_id,selected_leave_type=r.selected_leave_type,start_date=r.start_date,end_date=r.end_date,start_time=r.start_time,end_time=r.end_time,duration_days=r.duration_days,reason=r.reason,status=r.status,attachment_url=r.attachment_url,paid_days=paid,unpaid_days=unpaid,credit_shortfall=unpaid,final_classification=r.final_classification,lwop_confirmed=confirmed,history_log=coalesce(history_log,'[]')||jsonb_build_array(jsonb_build_object('action','Draft saved or submitted','userId',actor,'userName',h.full_name,'timestamp',clock_timestamp())) where id=p_id returning * into r;
 end if;
 insert into private.leave_submission_keys values(actor,p_key,r.id,fingerprint) on conflict do nothing;return jsonb_build_object('request',to_jsonb(r),'created',true);
end $$;

create or replace function private.confirmed_leave_request_accounting() returns trigger
language plpgsql security definer set search_path='' as $$
declare k text;h public.hris_users;used numeric;charge numeric;
begin
 select case when lower(name) like '%vacation%' then 'vacation' when lower(name) like '%sick%' then 'sick' when lower(name) like '%offset%' then 'offset' end into k from public.leave_types where id=coalesce(new.selected_leave_type_id,new.leave_type_id);
 if k is null then return new;end if;
 if tg_op='UPDATE' and old.status='Approved' and (new.employee_id<>old.employee_id or new.leave_type_id<>old.leave_type_id or new.duration_days<>old.duration_days or new.start_date<>old.start_date or new.end_date<>old.end_date) then raise exception 'Cancel and submit a revised leave request; approved leave history is retained';end if;
 if tg_op='UPDATE' and old.status='Cancelled' and new.status='Approved' then raise exception 'Submit a new request after cancellation to preserve leave accounting';end if;
 if new.status='Approved' and (tg_op='INSERT' or old.status is distinct from 'Approved') then
  if new.final_classification='lwop' then return new;end if;
  charge:=case when new.final_classification='paid_exception' then new.duration_days else coalesce(nullif(new.paid_days,0),new.duration_days) end;
  perform private.sync_confirmed_leave(new.employee_id,(now() at time zone 'Asia/Manila')::date);select * into h from public.hris_users where id=new.employee_id;
  if k<>'offset' and h.employment_status is distinct from 'Regular' and new.final_classification<>'paid_exception' then raise exception 'Accrued leave becomes available upon regularization';end if;
  if charge<=0 then return new;end if;
  if private.confirmed_leave_balance(new.employee_id,k,(now() at time zone 'Asia/Manila')::date)<charge and not(new.final_classification='paid_exception' and current_setting('app.time_request_approval_context',true)=format('leave:%s:%s',new.id,public.current_hris_user_id()) and public.has_active_role('Board of Director')) then raise exception 'Credit shortfall — BOD exception approval required.';end if;
  insert into public.payroll_leave_ledger(employee_id,leave_kind,amount,credit_date,source,event_key,approved_by) values(new.employee_id,k,-charge,(now() at time zone 'Asia/Manila')::date,case when new.final_classification='paid_exception' then 'BOD paid leave exception ' else 'Approved leave ' end||new.id,'usage:'||new.id,public.current_hris_user_id()) on conflict do nothing;
 elsif tg_op='UPDATE' and old.status='Approved' and new.status='Cancelled' then
  select -sum(amount) into used from public.payroll_leave_ledger where employee_id=new.employee_id and event_key='usage:'||new.id;if used>0 then insert into public.payroll_leave_ledger(employee_id,leave_kind,amount,credit_date,source,event_key,approved_by) values(new.employee_id,k,used,(now() at time zone 'Asia/Manila')::date,'Approved leave cancelled '||new.id,'return:'||new.id,public.current_hris_user_id()) on conflict do nothing;end if;
 end if;return new;
end $$;

create or replace function public.process_leave_exception_approval(p_request_id uuid,p_decision text,p_outcome text,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();r public.leave_requests;credits jsonb;result jsonb;
begin
 select * into strict r from public.leave_requests where id=p_request_id for update;
 if r.status<>'PendingBOD' or not coalesce((private.leave_credit_context(r.id)->>'creditException')::boolean,false) then raise exception 'This request is not awaiting a BOD credit exception decision.';end if;
 if not public.has_active_role('Board of Director') or not exists(select 1 from public.time_request_approval_assignments where request_type='leave' and request_id=r.id and approver_user_id=actor and is_bod and status='Pending') then raise exception 'You are not an assigned authorized BOD approver.' using errcode='42501';end if;
 if lower(p_decision) not in('approve','reject') then raise exception 'Choose approve or reject.';end if;
 if lower(p_decision)='reject' and nullif(btrim(p_note),'') is null then raise exception 'A rejection reason is required.';end if;
 if lower(p_decision)='approve' and p_outcome not in('paid_exception','lwop') then raise exception 'Choose paid leave exception or Leave Without Pay.';end if;
 credits:=private.leave_credit_context(r.id);
 if lower(p_decision)='approve' then update public.leave_requests set final_classification=p_outcome,paid_days=case when p_outcome='paid_exception' then duration_days else 0 end,unpaid_days=case when p_outcome='lwop' then duration_days else 0 end,history_log=coalesce(history_log,'[]')||jsonb_build_array(jsonb_build_object('action',case when p_outcome='paid_exception' then 'BOD paid leave exception approved' else 'BOD approved as Leave Without Pay' end,'userId',actor,'userName',(select full_name from public.hris_users where id=actor),'timestamp',clock_timestamp(),'details',jsonb_build_object('creditShortfall',credits->'creditShortfall','outcome',p_outcome,'note',nullif(btrim(p_note),'')))) where id=r.id;end if;
 result:=public.process_time_request_approval('leave',r.id,lower(p_decision),p_note);
 if lower(p_decision)='approve' then insert into private.leave_exception_decisions(request_id,approver_id,outcome,credit_shortfall,available_credits,requested_days,note) values(r.id,actor,p_outcome,(credits->>'creditShortfall')::numeric,(credits->>'availableCredits')::numeric,(credits->>'requestedCredits')::numeric,nullif(btrim(p_note),''));end if;
 return result||jsonb_build_object('exceptionOutcome',case when lower(p_decision)='approve' then p_outcome else null end,'creditShortfall',credits->'creditShortfall');
end $$;
revoke all on function public.process_leave_exception_approval(uuid,text,text,text) from public,anon;grant execute on function public.process_leave_exception_approval(uuid,text,text,text) to authenticated;

-- Approval-controlled leave balance migration.
create table public.leave_balance_migration_batches(
 id uuid primary key default gen_random_uuid(),source_file text not null,entry_method text not null check(entry_method in('manual','import')),
 status text not null default 'draft' check(status in('draft','pending_hr_manager','pending_bod','approved','rejected','returned')),
 approval_route text,created_by uuid not null references public.hris_users(id),created_at timestamptz not null default clock_timestamp(),submitted_at timestamptz,
 approved_by uuid references public.hris_users(id),approved_at timestamptz,approval_note text,returned_reason text
);
create table public.leave_balance_migration_rows(
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references public.leave_balance_migration_batches(id) on delete cascade,row_number integer not null,
 employee_id uuid references public.hris_users(id),employee_id_code text,employee_name text,business_unit text,employee_role text,leave_type text not null,leave_kind text,
 opening_balance numeric not null default 0,accrued_credits numeric not null default 0,used_credits numeric not null default 0,remaining_balance numeric not null default 0,
 as_of_date date,source text,supporting_document text,notes text,validation_status text not null check(validation_status in('valid','review','invalid','not_applicable')),
 validation_messages jsonb not null default '[]',raw_data jsonb not null default '{}',activated_at timestamptz,created_at timestamptz not null default clock_timestamp(),unique(batch_id,row_number)
);
create table private.leave_balance_migration_audit(id uuid primary key default gen_random_uuid(),batch_id uuid not null,reviewer_id uuid,action text not null,note text,old_value jsonb,new_value jsonb,created_at timestamptz not null default clock_timestamp());
alter table public.leave_balance_migration_batches enable row level security;alter table public.leave_balance_migration_rows enable row level security;alter table private.leave_balance_migration_audit enable row level security;
revoke all on public.leave_balance_migration_batches,public.leave_balance_migration_rows,private.leave_balance_migration_audit from public,anon,authenticated;
create trigger immutable before update or delete on private.leave_balance_migration_audit for each row execute function private.prevent_time_decision_mutation();

create function private.leave_balance_migration_access() returns boolean language sql stable security definer set search_path='' as $$select public.is_hr_or_admin() or public.has_active_role('Board of Director')$$;
create function private.activate_leave_balance_migration(p_batch uuid,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.leave_balance_migration_rows;begin
 for r in select * from public.leave_balance_migration_rows where batch_id=p_batch and validation_status in('valid','review') and leave_kind in('vacation','sick','offset') order by row_number loop
  insert into public.payroll_leave_ledger(employee_id,leave_kind,amount,credit_date,source,event_key,approved_by) values(r.employee_id,r.leave_kind,r.opening_balance,r.as_of_date,'Leave balance migration opening · '||coalesce(r.source,'Unspecified'),'migration:'||p_batch||':'||r.id||':opening',p_actor) on conflict do nothing;
  insert into public.payroll_leave_ledger(employee_id,leave_kind,amount,credit_date,source,event_key,approved_by) values(r.employee_id,r.leave_kind,r.accrued_credits,r.as_of_date,'Leave balance migration accrued · '||coalesce(r.source,'Unspecified'),'migration:'||p_batch||':'||r.id||':accrued',p_actor) on conflict do nothing;
  insert into public.payroll_leave_ledger(employee_id,leave_kind,amount,credit_date,source,event_key,approved_by) values(r.employee_id,r.leave_kind,-r.used_credits,r.as_of_date,'Leave balance migration used · '||coalesce(r.source,'Unspecified'),'migration:'||p_batch||':'||r.id||':used',p_actor) on conflict do nothing;
  update public.leave_balance_migration_rows set activated_at=clock_timestamp() where id=r.id;
 end loop;
end $$;

create or replace function public.save_leave_balance_migration(p_batch_id uuid,p_source_file text,p_rows jsonb,p_submit boolean default false,p_manual boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();batch public.leave_balance_migration_batches;item jsonb;row_no int:=0;emp public.hris_users;kind text;status text;messages jsonb;route text:='pending_hr_manager';protected boolean:=false;
begin
 if auth.uid() is null or actor is null or not public.is_hr_or_admin() then raise exception 'HR authorization is required.' using errcode='42501';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'Add at least one balance row.';end if;
 if p_batch_id is null then insert into public.leave_balance_migration_batches(source_file,entry_method,created_by) values(coalesce(nullif(btrim(p_source_file),''),'Manual balance entry'),case when p_manual then 'manual' else 'import' end,actor) returning * into batch;else select * into strict batch from public.leave_balance_migration_batches where id=p_batch_id for update;if batch.created_by<>actor or batch.status not in('draft','returned') then raise exception 'Only the creator may edit a draft or returned migration.' using errcode='42501';end if;delete from public.leave_balance_migration_rows where batch_id=batch.id;update public.leave_balance_migration_batches set source_file=p_source_file,status='draft',returned_reason=null where id=batch.id returning * into batch;end if;
 for item in select value from jsonb_array_elements(p_rows) loop row_no:=row_no+1;select * into emp from public.hris_users where lower(employee_id)=lower(nullif(btrim(item->>'employee_id_code'),'')) and lower(status)='active' and not coalesce(is_duplicate,false) limit 1;
  kind:=case when lower(item->>'leave_type') like '%vacation%' then 'vacation' when lower(item->>'leave_type') like '%sick%' then 'sick' when lower(item->>'leave_type') like '%offset%' then 'offset' when lower(item->>'leave_type') in('leave without pay','without pay','lwop') then 'lwop' end;messages:=coalesce(item->'validation_messages','[]');status:=coalesce(item->>'validation_status','invalid');
  if emp.id is null then status:='invalid';messages:=messages||'["Unknown or missing employee ID"]'::jsonb;end if;if kind is null then status:='invalid';messages:=messages||'["Unknown leave type"]'::jsonb;end if;if kind='lwop' then status:='not_applicable';end if;
  if emp.role in('Business Unit Manager','Manager','GeneralManager','General Manager','Operations Manager','Operations Director','Auditor') then protected:=true;end if;
  insert into public.leave_balance_migration_rows(batch_id,row_number,employee_id,employee_id_code,employee_name,business_unit,employee_role,leave_type,leave_kind,opening_balance,accrued_credits,used_credits,remaining_balance,as_of_date,source,supporting_document,notes,validation_status,validation_messages,raw_data)
  values(batch.id,row_no,emp.id,item->>'employee_id_code',coalesce(nullif(item->>'employee_name',''),emp.full_name),coalesce(nullif(item->>'business_unit',''),emp.business_unit),emp.role,item->>'leave_type',kind,coalesce((item->>'opening_balance')::numeric,0),coalesce((item->>'accrued_credits')::numeric,0),coalesce((item->>'used_credits')::numeric,0),coalesce((item->>'remaining_balance')::numeric,0),nullif(item->>'as_of_date','')::date,item->>'source',item->>'supporting_document',item->>'notes',status,messages,item);
 end loop;
 if public.has_active_role('HR Manager') or protected then route:='pending_bod';end if;
 if p_submit then if exists(select 1 from public.leave_balance_migration_rows where batch_id=batch.id and validation_status='invalid') then raise exception 'Correct invalid rows before submitting.';end if;update public.leave_balance_migration_batches set status=route,approval_route=case when route='pending_bod' then 'At least one BOD approval' else 'HR Manager approval' end,submitted_at=clock_timestamp() where id=batch.id returning * into batch;end if;
 insert into private.leave_balance_migration_audit(batch_id,reviewer_id,action,new_value) values(batch.id,actor,case when p_submit then 'submitted' else 'draft_saved' end,to_jsonb(batch));return public.get_leave_balance_migration(batch.id);
end $$;

create function public.get_leave_balance_migration(p_batch uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();b public.leave_balance_migration_batches;begin
 if not private.leave_balance_migration_access() then raise exception 'Leave balance migration access denied.' using errcode='42501';end if;select * into strict b from public.leave_balance_migration_batches where id=p_batch;
 return to_jsonb(b)||jsonb_build_object('created_by_name',(select full_name from public.hris_users where id=b.created_by),'approved_by_name',(select full_name from public.hris_users where id=b.approved_by),'as_of_date',(select max(as_of_date) from public.leave_balance_migration_rows where batch_id=b.id),'can_act',b.created_by<>actor and ((b.status='pending_hr_manager' and public.has_active_role('HR Manager')) or (b.status='pending_bod' and public.has_active_role('Board of Director'))),'rows',(select coalesce(jsonb_agg(to_jsonb(r) order by row_number),'[]') from public.leave_balance_migration_rows r where batch_id=b.id),'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by created_at),'[]') from private.leave_balance_migration_audit a where batch_id=b.id));
end $$;

create function public.get_leave_balance_migration_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.leave_balance_migration_access() then raise exception 'Leave balance migration access denied.' using errcode='42501';end if;return jsonb_build_object('batches',(select coalesce(jsonb_agg(public.get_leave_balance_migration(id) order by created_at desc),'[]') from public.leave_balance_migration_batches));end $$;

create function public.review_leave_balance_migration(p_batch_id uuid,p_action text,p_note text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();b public.leave_balance_migration_batches;old jsonb;begin
 select * into strict b from public.leave_balance_migration_batches where id=p_batch_id for update;old:=to_jsonb(b);if b.created_by=actor then raise exception 'The creator cannot approve their own entry.' using errcode='42501';end if;
 if not ((b.status='pending_hr_manager' and public.has_active_role('HR Manager')) or (b.status='pending_bod' and public.has_active_role('Board of Director'))) then raise exception 'You are not authorized for this approval step.' using errcode='42501';end if;if p_action not in('approve','reject','return') then raise exception 'Choose approve, reject, or return.';end if;if p_action in('reject','return') and nullif(btrim(p_note),'') is null then raise exception 'A reason is required.';end if;
 if p_action='approve' then perform private.activate_leave_balance_migration(b.id,actor);update public.leave_balance_migration_batches set status='approved',approved_by=actor,approved_at=clock_timestamp(),approval_note=nullif(btrim(p_note),'') where id=b.id;elsif p_action='reject' then update public.leave_balance_migration_batches set status='rejected',approved_by=actor,approved_at=clock_timestamp(),approval_note=p_note where id=b.id;else update public.leave_balance_migration_batches set status='returned',returned_reason=p_note where id=b.id;end if;
 insert into private.leave_balance_migration_audit(batch_id,reviewer_id,action,note,old_value,new_value) values(b.id,actor,p_action,p_note,old,(select to_jsonb(x) from public.leave_balance_migration_batches x where id=b.id));return public.get_leave_balance_migration(b.id);
end $$;

create function public.get_leave_balance_summary(p_employee uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare e uuid:=coalesce(p_employee,public.current_hris_user_id());begin
 if private.payroll_actor_id() is null or not(e=public.current_hris_user_id() or (public.is_hr_or_admin() and public.can_access_hris_user(e))) then raise exception 'Leave balance outside authorized scope' using errcode='42501';end if;perform private.sync_confirmed_leave(e,(now() at time zone 'Asia/Manila')::date);
 return(select coalesce(jsonb_agg(jsonb_build_object('leaveTypeId',t.id,'name',t.name,'opening',coalesce(s.opening,0),'accrued',coalesce(s.accrued,0),'used',coalesce(s.used,0),'adjusted',coalesce(s.adjusted,0),'pending',coalesce((select sum(r.duration_days) from public.leave_requests r where r.employee_id=e and r.status in('Pending','PendingGM','PendingBOD') and coalesce(r.selected_leave_type_id,r.leave_type_id)=t.id),0),'available',private.confirmed_leave_balance(e,s.kind,(now() at time zone 'Asia/Manila')::date),'asOfDate',coalesce(s.as_of,(now() at time zone 'Asia/Manila')::date),'lastUpdatedBy',coalesce((select full_name from public.hris_users where id=s.last_actor),'System ledger'),'approvalStatus',case when exists(select 1 from public.leave_balance_migration_rows mr join public.leave_balance_migration_batches mb on mb.id=mr.batch_id where mr.employee_id=e and mr.leave_kind=s.kind and mb.status in('pending_hr_manager','pending_bod')) then 'Imported balance — Pending approval' else 'Active' end) order by t.name),'[]') from public.leave_types t left join lateral(select case when lower(t.name) like '%vacation%' then 'vacation' when lower(t.name) like '%sick%' then 'sick' when lower(t.name) like '%offset%' then 'offset' end kind,sum(amount) filter(where source like 'Leave balance migration opening%') opening,sum(amount) filter(where amount>0 and source not like 'Leave balance migration opening%' and source not like '%adjust%') accrued,abs(sum(amount) filter(where amount<0)) used,sum(amount) filter(where source ilike '%adjust%') adjusted,max(credit_date) as_of,(array_agg(approved_by order by recorded_at desc))[1] last_actor from public.payroll_leave_ledger where employee_id=e and leave_kind=case when lower(t.name) like '%vacation%' then 'vacation' when lower(t.name) like '%sick%' then 'sick' when lower(t.name) like '%offset%' then 'offset' end)s on true where s.kind is not null);
end $$;

revoke all on function public.save_leave_balance_migration(uuid,text,jsonb,boolean,boolean),public.get_leave_balance_migration(uuid),public.get_leave_balance_migration_workspace(),public.review_leave_balance_migration(uuid,text,text),public.get_leave_balance_summary(uuid) from public,anon;
grant execute on function public.save_leave_balance_migration(uuid,text,jsonb,boolean,boolean),public.get_leave_balance_migration(uuid),public.get_leave_balance_migration_workspace(),public.review_leave_balance_migration(uuid,text,text),public.get_leave_balance_summary(uuid) to authenticated;
notify pgrst,'reload schema';
