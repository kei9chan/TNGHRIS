-- BOD credit exceptions preserve earned credits and existing approval assignments.
alter table public.leave_requests add column duplicate_of uuid references public.leave_requests(id);
create table private.leave_credit_overrides(request_id uuid not null references public.leave_requests(id),approver_id uuid not null,role text not null default 'Board of Director',created_at timestamptz not null default clock_timestamp(),credit_snapshot jsonb not null,note text,primary key(request_id,approver_id));
create table private.leave_duplicate_audit(duplicate_id uuid primary key references public.leave_requests(id),canonical_id uuid not null references public.leave_requests(id),employee_id uuid not null,detected_at timestamptz not null default clock_timestamp(),cleaned_at timestamptz not null default clock_timestamp(),actor text not null,method text not null,previous_record jsonb not null,previous_assignments jsonb not null,final_status text not null default 'Cancelled');
create table private.leave_submission_keys(employee_id uuid not null,submission_key uuid not null,request_id uuid not null references public.leave_requests(id),fingerprint text not null,primary key(employee_id,submission_key));
alter table private.leave_credit_overrides enable row level security;
alter table private.leave_duplicate_audit enable row level security;
alter table private.leave_submission_keys enable row level security;
revoke all on private.leave_credit_overrides,private.leave_duplicate_audit,private.leave_submission_keys from public,anon,authenticated;
create trigger immutable before update or delete on private.leave_credit_overrides for each row execute function private.prevent_time_decision_mutation();
create trigger immutable before update or delete on private.leave_duplicate_audit for each row execute function private.prevent_time_decision_mutation();
create trigger immutable before update or delete on private.leave_submission_keys for each row execute function private.prevent_time_decision_mutation();
create function private.leave_fingerprint(p public.leave_requests) returns text language sql immutable set search_path='' as $$
 select md5(jsonb_build_array(p.employee_id,p.leave_type_id,p.start_date,p.end_date,p.start_time,p.end_time,p.duration_days,lower(btrim(coalesce(p.reason,''))),coalesce(p.attachment_url,''))::text)
$$;
create index leave_fingerprint_lookup on public.leave_requests(employee_id,start_date,end_date,status);
create function private.guard_leave_duplicate() returns trigger language plpgsql set search_path='' as $$
declare other_id uuid;begin
 if tg_op='UPDATE' and old.duplicate_of is not null then raise exception 'Duplicate request is cancelled. Open canonical request %',old.duplicate_of;end if;
 if tg_op='UPDATE' and new.duplicate_of is distinct from old.duplicate_of and current_user in('authenticated','anon') then raise exception 'Audited duplicate cleanup required' using errcode='42501';end if;
 if new.duplicate_of is not null then if new.status<>'Cancelled' then raise exception 'Duplicate requests must remain cancelled';end if;return new;end if;
 if new.status in('Pending','PendingGM','PendingBOD','Approved') then
 perform pg_advisory_xact_lock(hashtextextended('leave-submit:'||new.employee_id::text,0));
 select id into other_id from public.leave_requests r where r.employee_id=new.employee_id and r.id<>new.id and r.duplicate_of is null and r.status in('Pending','PendingGM','PendingBOD','Approved') and private.leave_fingerprint(r)=private.leave_fingerprint(new) order by r.created_at,r.id limit 1;
 if other_id is not null then raise exception 'Matching active leave request already exists: %',other_id using errcode='23505';end if;
 end if;return new;
end $$;
create trigger aa_leave_duplicate_guard before insert or update on public.leave_requests for each row execute function private.guard_leave_duplicate();
create function private.leave_credit_context(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.leave_requests;k text;balance numeric;begin
 select * into r from public.leave_requests where id=p_id;
 select case when lower(name) like '%vacation%' then 'vacation' when lower(name) like '%sick%' then 'sick' when lower(name) like '%offset%' then 'offset' end into k from public.leave_types where id=r.leave_type_id;
 if k is null then return jsonb_build_object('creditTracked',false,'creditException',false);end if;
 balance:=private.confirmed_leave_balance(r.employee_id,k,(now() at time zone 'Asia/Manila')::date);
 return jsonb_build_object('creditTracked',true,'creditKind',k,'availableCredits',balance,'requestedCredits',r.duration_days,'creditShortfall',greatest(0,r.duration_days-balance),'remainingBalance',balance-r.duration_days,'creditException',balance<r.duration_days);
end $$;
-- Retain the established threshold computation and add insufficient credits as a BOD route.
do $$declare s text;begin
 s:=pg_get_functiondef('private.time_request_context(text,uuid)'::regprocedure);
 s:=replace(s,'  return result_value;', $patch$
  if lower(p_request_type)='leave' then
    result_value:=result_value||private.leave_credit_context(p_request_id);
    if coalesce((result_value->>'creditException')::boolean,false) then result_value:=result_value||jsonb_build_object('requiresBod',true,'reason','Insufficient earned credits. This request requires BOD exception approval. An authorized BOD may approve or reject this request.');end if;
  end if;
  return result_value;$patch$);execute s;
 s:=pg_get_functiondef('private.confirmed_leave_request_accounting()'::regprocedure);
 s:=replace(s,'k in (''vacation'',''sick'')', 'k in (''vacation'',''sick'',''offset'')');
 s:=replace(s,'a.is_bod and a.is_required and a.status=''Approved''', 'a.is_bod and a.status=''Approved''');
 s:=replace(s,'if k=''offset'' then raise exception ''Insufficient earned offset credits. HR must review the leave type or offset balance before approval; BOD routing does not grant offset credits.'' using errcode=''P0001''; end if; raise exception ''Insufficient available leave credits; a routed BOD exception approval is required'';', 'raise exception ''Insufficient earned credits. This request requires BOD exception approval. An authorized BOD may approve or reject this request.'';');
 execute s;
end $$;
-- Extend the existing transactional/idempotent wrapper; duplicate decisions stay immutable.
do $$declare s text;begin
 s:=pg_get_functiondef('public.process_time_request_approval(text,uuid,text,text)'::regprocedure);
 s:=replace(s,'previous private.time_approval_decisions;', 'previous private.time_approval_decisions; credits jsonb;');
 s:=replace(s,' if v_stage is null then',$patch$
 if lower(p_request_type)='leave' then
   if exists(select 1 from public.leave_requests where id=p_request_id and duplicate_of is not null) then raise exception 'Duplicate request cancelled; open the canonical request.' using errcode='22023';end if;
   if v_stage='PendingBOD' and lower(p_decision)='approve' then
     credits:=private.leave_credit_context(p_request_id);
     if coalesce((credits->>'creditException')::boolean,false) and not (public.has_active_role('Board of Director') and exists(select 1 from public.time_request_approval_assignments where request_type='leave' and request_id=p_request_id and approver_user_id=actor and is_bod and status in('Pending','Approved'))) then raise exception 'Assigned BOD exception approval required' using errcode='42501';end if;
   end if;
 end if;
 if lower(p_decision)='reject' and nullif(btrim(p_note),'') is null then raise exception 'A rejection reason is required';end if;
 if v_stage is null then$patch$);
 s:=replace(s,' insert into private.time_approval_decisions values', $patch$
 if coalesce((credits->>'creditException')::boolean,false) then
   insert into private.leave_credit_overrides(request_id,approver_id,credit_snapshot,note) values(p_request_id,actor,credits,nullif(btrim(p_note),'')) on conflict do nothing;
   result:=result||jsonb_build_object('bodCreditOverride',credits);
   insert into public.audit_logs(user_id,action,entity,entity_id,details) values(actor::text,'BOD_CREDIT_EXCEPTION','Leave',p_request_id::text,(credits||jsonb_build_object('role','Board of Director','note',nullif(btrim(p_note),''),'timestamp',clock_timestamp()))::text);
 end if;
 insert into private.time_approval_decisions values$patch$);execute s;
 s:=pg_get_functiondef('public.get_time_approval_progress(text,uuid)'::regprocedure);
 s:=replace(s,' return result;', $patch$
 if lower(p_request_type)='leave' then
 result:=result||private.leave_credit_context(p_request_id)||jsonb_build_object('creditOverrides',(select coalesce(jsonb_agg(to_jsonb(o) order by created_at),'[]') from private.leave_credit_overrides o where request_id=p_request_id));
 end if;
 return result;$patch$);execute s;
end $$;
create function public.submit_leave_request(p_key uuid,p_data jsonb,p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();r public.leave_requests;old public.leave_requests;h public.hris_users;fingerprint text;prior private.leave_submission_keys;existing uuid;begin
 if auth.uid() is null or actor is null or not public.has_feature_permission('Leave','create') or not public.has_workflow_permission('Leave','submit') then raise exception 'Authorized employee sign-in required' using errcode='42501';end if;
 if p_key is null then raise exception 'Submission key required';end if;
 perform pg_advisory_xact_lock(hashtextextended('leave-submit:'||actor::text,0));
 select * into h from public.hris_users where id=actor;
 r.employee_id:=actor;r.employee_name:=h.full_name;r.leave_type_id:=(p_data->>'leave_type_id')::uuid;r.start_date:=(p_data->>'start_date')::date;r.end_date:=(p_data->>'end_date')::date;r.start_time:=nullif(p_data->>'start_time','');r.end_time:=nullif(p_data->>'end_time','');r.duration_days:=(p_data->>'duration_days')::numeric;r.reason:=p_data->>'reason';r.attachment_url:=nullif(p_data->>'attachment_url','');r.status:=coalesce(p_data->>'status','Pending');
 if r.status not in('Draft','Pending') or r.start_date is null or r.end_date is null or r.end_date<r.start_date or r.duration_days is null or r.duration_days<=0 or r.duration_days>(r.end_date-r.start_date+1) then raise exception 'Enter a valid leave period and duration';end if;
 fingerprint:=private.leave_fingerprint(r);
 select * into prior from private.leave_submission_keys where employee_id=actor and submission_key=p_key;
 if prior.request_id is not null and p_id is null then
 if prior.fingerprint<>fingerprint then raise exception 'Submission key already used for different leave details';end if;
 return jsonb_build_object('request',(select to_jsonb(x) from public.leave_requests x where id=prior.request_id),'created',false);end if;
 if p_id is not null then
 select * into old from public.leave_requests where id=p_id for update;
 if old.employee_id is distinct from actor or old.status<>'Draft' or old.duplicate_of is not null then
 if old.employee_id=actor and private.leave_fingerprint(old)=fingerprint and old.status in('Pending','PendingGM','PendingBOD','Approved') then return jsonb_build_object('request',to_jsonb(old),'created',false);end if;
 raise exception 'Only your draft may be edited' using errcode='42501';end if;
 end if;
 select id into existing from public.leave_requests x where x.employee_id=actor and x.id is distinct from p_id and x.duplicate_of is null and x.status in('Pending','PendingGM','PendingBOD','Approved') and private.leave_fingerprint(x)=fingerprint order by created_at,id limit 1;
 if existing is not null then
 insert into private.leave_submission_keys values(actor,p_key,existing,fingerprint) on conflict do nothing;
 return jsonb_build_object('request',(select to_jsonb(x) from public.leave_requests x where id=existing),'created',false);end if;
 if p_id is null then
 insert into public.leave_requests(employee_id,employee_name,leave_type_id,start_date,end_date,start_time,end_time,duration_days,reason,status,attachment_url,business_unit_id,department_id,history_log)
 values(actor,h.full_name,r.leave_type_id,r.start_date,r.end_date,r.start_time,r.end_time,r.duration_days,r.reason,r.status,r.attachment_url,h.business_unit_id,h.department_id,jsonb_build_array(jsonb_build_object('action','Submitted','userId',actor,'timestamp',clock_timestamp()))) returning * into r;
 else
 update public.leave_requests set leave_type_id=r.leave_type_id,start_date=r.start_date,end_date=r.end_date,start_time=r.start_time,end_time=r.end_time,duration_days=r.duration_days,reason=r.reason,status=r.status,attachment_url=r.attachment_url,history_log=coalesce(history_log,'[]')||jsonb_build_array(jsonb_build_object('action','Draft saved or submitted','userId',actor,'timestamp',clock_timestamp())) where id=p_id returning * into r;
 end if;
 insert into private.leave_submission_keys values(actor,p_key,r.id,fingerprint) on conflict do nothing;
 return jsonb_build_object('request',to_jsonb(r),'created',true);
end $$;
revoke all on function public.submit_leave_request(uuid,jsonb,uuid) from public,anon;
grant execute on function public.submit_leave_request(uuid,jsonb,uuid) to authenticated;
revoke all on function private.leave_credit_context(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
-- A cleanup is accepted only after its immutable audit row exists.
do $$declare s text;begin
 s:=pg_get_functiondef('public.guard_conditional_time_approval_transition()'::regprocedure);
 s:=replace(s,'  if new.status::text is not distinct from old.status::text then', $patch$
  if tg_table_name='leave_requests' and new.status::text='Cancelled' and (to_jsonb(new)->>'duplicate_of') is not null and exists(select 1 from private.leave_duplicate_audit where duplicate_id=new.id and canonical_id=(to_jsonb(new)->>'duplicate_of')::uuid) then return new;end if;
  if new.status::text is not distinct from old.status::text then$patch$);execute s;
end $$;
create function private.cancel_duplicate_leave(p_canonical uuid,p_duplicates uuid[],p_method text) returns integer language plpgsql security definer set search_path='' as $$
declare c public.leave_requests;d public.leave_requests;n integer:=0;begin
 select * into c from public.leave_requests where id=p_canonical for update;
 if c.id is null or c.status not in('Pending','PendingGM','PendingBOD','Approved') or c.duplicate_of is not null then raise exception 'Canonical request must be valid';end if;
 perform pg_advisory_xact_lock(hashtextextended('leave-submit:'||c.employee_id::text,0));
 for d in select * from public.leave_requests where id=any(p_duplicates) order by id for update loop
 if d.id=c.id or d.employee_id<>c.employee_id or d.leave_type_id<>c.leave_type_id or d.start_date<>c.start_date or d.end_date<>c.end_date or d.duration_days<>c.duration_days or d.start_time is distinct from c.start_time or d.end_time is distinct from c.end_time or d.attachment_url is distinct from c.attachment_url or d.status not in('Pending','PendingGM','PendingBOD') or abs(extract(epoch from(d.created_at-c.created_at)))>120 then raise exception 'Records do not meet duplicate cleanup criteria';end if;
 if replace(lower(btrim(coalesce(d.reason,''))),'occassion','occasion')<>replace(lower(btrim(coalesce(c.reason,''))),'occassion','occasion') then raise exception 'Materially different reasons require separate review';end if;
 if exists(select 1 from public.payroll_leave_ledger where event_key='usage:'||d.id) then raise exception 'A charged request requires separate ledger review';end if;
 insert into private.leave_duplicate_audit(duplicate_id,canonical_id,employee_id,actor,method,previous_record,previous_assignments) values(d.id,c.id,c.employee_id,coalesce(public.current_hris_user_id()::text,'authorized-system-cleanup'),p_method,to_jsonb(d),(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.time_request_approval_assignments a where request_type='leave' and request_id=d.id));
 update public.time_request_approval_assignments set status='Skipped',decision_note='Superseded duplicate; canonical request '||c.id,updated_at=clock_timestamp() where request_type='leave' and request_id=d.id;
 perform set_config('app.time_request_approval_context',format('leave:%s:%s',d.id,public.current_hris_user_id()),true);
 update public.leave_requests set duplicate_of=c.id,status='Cancelled',history_log=coalesce(history_log,'[]')||jsonb_build_array(jsonb_build_object('action','Duplicate cancelled','canonicalRequestId',c.id,'timestamp',clock_timestamp(),'method',p_method)) where id=d.id;
 update public.notifications set is_read=true where related_entity_id=d.id::text;
 n:=n+1;
 end loop;
 perform set_config('app.time_request_approval_context','',true);
 -- Refresh inflated threshold metadata without undoing a completed manager stage.
 update public.leave_requests set approval_context=private.time_request_context('leave',id),approval_reason=private.time_request_context('leave',id)->>'reason' where id=c.id;
 return n;
end $$;
revoke all on function private.cancel_duplicate_leave(uuid,uuid[],text) from public,anon,authenticated;
-- Old clients must not insert terminal requests or mutate another employee's fields.
create function private.leave_write_boundary() returns trigger language plpgsql set search_path='' as $$begin
 if current_user in('authenticated','anon') then
 if tg_op='INSERT' and new.status not in('Draft','Pending') then raise exception 'Submit leave through the employee workflow' using errcode='42501';end if;
 if tg_op='UPDATE' and new.employee_id<>old.employee_id then raise exception 'Employee identity is immutable' using errcode='42501';end if;
 end if;return new;end $$;
create trigger a_leave_write_boundary before insert or update on public.leave_requests for each row execute function private.leave_write_boundary();
