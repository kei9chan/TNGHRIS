-- Explicit payroll handoff; requested evidence and previous decisions remain audited.
create table private.payroll_ot_handoffs(
 request_id uuid primary key references public.ot_requests(id),
 sender_id uuid not null references public.hris_users(id), manager_id uuid not null,
 state text not null, note text, return_note text, sent_at timestamptz not null default now()
);
alter table private.payroll_ot_handoffs enable row level security;
revoke all on private.payroll_ot_handoffs from public,anon,authenticated;

create function private.can_send_payroll_ot(r public.ot_requests) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and exists(select 1 from public.hris_users where id=public.current_hris_user_id() and lower(status)='active')
 and (public.has_active_role('HR Staff') or public.has_active_role('HR Manager') or public.has_active_role('Admin') or public.has_active_role('Board of Director') or private.is_business_unit_ot_manager(public.current_hris_user_id(),r.employee_id))
 and private.resolve_ot_manager(r.employee_id) is not null
 and not exists(select 1 from public.payroll_schedule_freezes f where f.employee_id=r.employee_id and r.date between f.date_from and f.date_to)
 and (r.status::text in('Submitted','PendingGM') or (r.status::text='Approved' and r.final_approved_minutes is null and r.approved_hours is null) or (r.status::text='Draft' and exists(select 1 from private.payroll_ot_handoffs h where h.request_id=r.id and h.state='Returned')))
 and not exists(select 1 from private.payroll_ot_handoffs h where h.request_id=r.id and h.state='Manager review')
$$;
revoke all on function private.can_send_payroll_ot(public.ot_requests) from public,anon,authenticated;

create function public.send_payroll_ot_to_manager(p_ids uuid[],p_versions jsonb,p_operation uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();r public.ot_requests;g record;manager uuid;payload jsonb;prior private.ot_batch_decisions;outcome jsonb:='[]';
begin
 if auth.uid() is null or actor is null or p_operation is null or coalesce(cardinality(p_ids),0) not between 1 and 100 or (select count(distinct x) from unnest(p_ids)x)<>cardinality(p_ids) then raise exception 'Select 1–100 distinct OT requests.';end if;
 payload:=jsonb_build_object('action','payroll-manager-handoff','ids',p_ids,'versions',p_versions,'note',p_note);
 perform pg_advisory_xact_lock(hashtextextended('ot-operation:'||actor||':'||p_operation,0));
 select * into prior from private.ot_batch_decisions where actor_id=actor and operation_id=p_operation;
 if found then if prior.payload<>payload then raise exception 'Operation ID already used.';end if;return prior.result;end if;
 for g in select distinct employee_id,date_trunc('week',date)::date week from public.ot_requests where id=any(p_ids) order by employee_id,week loop
  perform pg_advisory_xact_lock(hashtextextended('ot-week:'||g.employee_id||':'||g.week,0));
 end loop;
 perform 1 from public.ot_requests where id=any(p_ids) order by id for update;
 if (select count(*) from public.ot_requests where id=any(p_ids))<>cardinality(p_ids) then raise exception 'A selected request is unavailable. Nothing was sent.';end if;
 for r in select * from public.ot_requests where id=any(p_ids) order by id loop
  if not coalesce(private.can_send_payroll_ot(r),false) then raise exception 'Request % cannot be sent by you in its current state. Refresh; nothing was sent.',r.id using errcode='42501';end if;
  if (p_versions->>r.id::text) is distinct from (to_jsonb(r)->>'updated_at') then raise exception 'Request % changed. Refresh before sending; nothing was sent.',r.id;end if;
  if r.status::text='Draft' and nullif(btrim(p_note),'') is null then raise exception 'Add the details requested by the manager before resending %.',r.date;end if;
 end loop;
 perform set_config('app.manual_ot_decision',actor::text,true);
 for r in select * from public.ot_requests where id=any(p_ids) order by id loop
  manager:=private.resolve_ot_manager(r.employee_id);
  insert into private.payroll_ot_handoffs(request_id,sender_id,manager_id,state,note) values(r.id,actor,manager,'Manager review',p_note)
   on conflict(request_id) do update set sender_id=excluded.sender_id,manager_id=excluded.manager_id,state=excluded.state,note=excluded.note,return_note=null,sent_at=now();
  update public.time_request_approval_assignments set status='Skipped',updated_at=now() where request_type='overtime' and request_id=r.id and status='Pending';
  perform set_config('app.time_request_approval_context','overtime:'||r.id||':'||actor,true);
  update public.ot_requests set status='Submitted',direct_manager_id=manager,approved_hours=null,manager_confirmed_minutes=null,manager_confirmed_by=null,manager_confirmed_at=null,final_approved_minutes=null,manager_night_minutes=null,final_night_minutes=null,updated_at=clock_timestamp(),
   history_log=coalesce(history_log,'[]')||jsonb_build_array(jsonb_build_object('action','Sent to manager from payroll','by',actor,'date',now(),'note',p_note,'previousStatus',r.status,'requestedMinutes',private.ot_requested_minutes(r))) where id=r.id;
  insert into public.audit_logs(user_id,action,entity,entity_id,details) values(actor::text,'PAYROLL_OT_HANDOFF','Overtime',r.id::text,jsonb_build_object('before',to_jsonb(r),'manager',manager,'note',p_note,'operation',p_operation)::text);
  insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key) values(manager::text,'GENERAL','Payroll OT needs your review',r.employee_name||' · '||r.date||'. Approve, adjust hours, reject, or return for details.','/payroll/overtime-requests?employee='||r.employee_id||'&date='||r.date,r.id::text,'payroll-ot-send:'||p_operation||':'||r.id);
  outcome:=outcome||jsonb_build_array(jsonb_build_object('id',r.id,'managerId',manager,'status','Submitted'));
 end loop;
 insert into private.ot_batch_decisions values(actor,p_operation,payload,outcome,now());
 return outcome;
end $$;
revoke all on function public.send_payroll_ot_to_manager(uuid[],jsonb,uuid,text) from public,anon;
grant execute on function public.send_payroll_ot_to_manager(uuid[],jsonb,uuid,text) to authenticated;

create function private.notify_payroll_ot_sender() returns trigger language plpgsql security definer set search_path='' as $$
declare h private.payroll_ot_handoffs;reason text;
begin
 if new.status is not distinct from old.status then return new;end if;
 select * into h from private.payroll_ot_handoffs where request_id=new.id;
 if not found or new.status::text not in('Draft','Rejected','Approved','PendingBOD') then return new;end if;
 reason:=new.history_log->-1->>'note';
 update private.payroll_ot_handoffs set state=case when new.status::text='Draft' then 'Returned' else new.status::text end,return_note=case when new.status::text='Draft' then reason else null end where request_id=new.id;
 insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key) values(h.sender_id::text,'GENERAL',case when new.status::text='Draft' then 'Payroll OT returned for details' else 'Payroll OT review updated' end,new.employee_name||' · '||new.date||' · '||new.status::text||coalesce(': '||reason,''),'/payroll/overtime-requests?employee='||new.employee_id||'&date='||new.date,new.id::text,'payroll-ot-result:'||new.id||':'||new.updated_at);
 return new;
end $$;
revoke all on function private.notify_payroll_ot_sender() from public,anon,authenticated;
create trigger notify_payroll_ot_sender after update of status on public.ot_requests for each row execute function private.notify_payroll_ot_sender();

do $$declare ddl text;begin
 ddl:=pg_get_functiondef('public.get_ot_week_review(uuid[])'::regprocedure);
 if strpos(ddl,'''blocked'',blocked)')=0 then raise exception 'Review payload changed; check before patching.';end if;
 ddl:=replace(ddl,'''blocked'',blocked)', '''blocked'',blocked,''canSend'',private.can_send_payroll_ot(r),''managerName'',(select full_name from public.hris_users where id=private.resolve_ot_manager(r.employee_id)),''handoff'',(select jsonb_build_object(''state'',h.state,''note'',h.note,''returnNote'',h.return_note,''senderName'',u.full_name) from private.payroll_ot_handoffs h join public.hris_users u on u.id=h.sender_id where h.request_id=r.id))');
 execute ddl;
end $$;

create function public.get_payroll_ot_review(p_employee uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare ids uuid[];
begin
 if auth.uid() is null or p_from is null or p_to is null or p_to<p_from or p_to-p_from>62 then raise exception 'Choose an authenticated payroll cutoff of up to 63 days.';end if;
 select array_agg(id order by date,id) into ids from public.ot_requests where employee_id=p_employee and date between p_from and p_to;
 if coalesce(cardinality(ids),0)>500 then raise exception 'More than 500 requests. Use a smaller period.';end if;
 return public.get_ot_week_review(coalesce(ids,'{}'::uuid[]));
end $$;
revoke all on function public.get_payroll_ot_review(uuid,date,date) from public,anon;
grant execute on function public.get_payroll_ot_review(uuid,date,date) to authenticated;

-- The old direct quantity setter would skip the renewed manager/BOD route.
create or replace function public.verify_legacy_ot_hours(p_amounts jsonb,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin raise exception 'Send these OT requests to manager review, then approve the reviewed hours through the normal approval route.';end $$;
notify pgrst,'reload schema';
