-- Temporary manual OT uses manager-verified extra work, never inferred clock punches.
alter table public.ot_requests alter column start_time drop not null;
alter table public.ot_requests alter column end_time drop not null;
create index if not exists ot_requests_employee_work_date_idx on public.ot_requests(employee_id,date);
alter table public.ot_requests add column if not exists evidence_mode text not null default 'manual';
alter table public.ot_requests add column if not exists end_date date;
alter table public.ot_requests add column if not exists unpaid_break_minutes integer not null default 0;
alter table public.ot_requests add column if not exists requested_minutes integer;
alter table public.ot_requests add column if not exists manager_confirmed_minutes integer;
alter table public.ot_requests add column if not exists manager_confirmed_by uuid;
alter table public.ot_requests add column if not exists manager_confirmed_at timestamptz;
alter table public.ot_requests add column if not exists final_approved_minutes integer;
alter table public.ot_requests add column if not exists manager_night_minutes integer;
alter table public.ot_requests add column if not exists final_night_minutes integer;

create table private.ot_week_baselines(employee_id uuid not null references public.hris_users(id),week_start date not null,minutes integer not null check(minutes between 0 and 10080),evidence text not null,confirmed_by uuid not null,confirmed_at timestamptz not null default now(),primary key(employee_id,week_start));
create table private.ot_batch_decisions(actor_id uuid not null,operation_id uuid not null,payload jsonb not null,result jsonb not null,decided_at timestamptz not null default now(),primary key(actor_id,operation_id));
revoke all on private.ot_week_baselines,private.ot_batch_decisions from public,anon,authenticated;

create function private.ot_requested_minutes(r public.ot_requests) returns integer language sql immutable set search_path='' as $$
 select coalesce(r.requested_minutes,round(r.hours*60)::integer,
 case when r.start_time is not null and r.end_time is not null then
 round(extract(epoch from ((coalesce(r.end_date,r.date+case when r.end_time<r.start_time then 1 else 0 end)+r.end_time)-(r.date+r.start_time)))/60)::integer-r.unpaid_break_minutes end)
$$;
create function private.ot_can_decide(r public.ot_requests) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.current_hris_user_id()<>r.employee_id
 and exists(select 1 from public.hris_users where id=public.current_hris_user_id() and lower(status)='active')
 and ((r.status::text in('Submitted','PendingGM') and private.is_direct_reporting_manager(public.current_hris_user_id(),r.employee_id))
 or (r.status::text='PendingBOD' and public.has_active_role('Board of Director') and exists(select 1 from public.time_request_approval_assignments a where a.request_type='overtime' and a.request_id=r.id and a.approver_user_id=public.current_hris_user_id() and a.status='Pending')))
$$;

create function private.ot_week_summary(p_employee uuid,p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w date:=date_trunc('week',p_date)::date;d date;sch jsonb;e jsonb;regular integer:=0;complete boolean:=true;baseline private.ot_week_baselines;approved integer;reviewed integer;requested integer;threshold integer;source text;pubs jsonb:='[]';
begin
 select * into baseline from private.ot_week_baselines where employee_id=p_employee and week_start=w;
 for d in select generate_series(w,w+6,'1 day')::date loop
  sch:=private.attendance_pre_leave_schedule(p_employee,d);
  if not coalesce((sch->>'published')::boolean,false) then complete:=false;continue;end if;
  pubs:=pubs||jsonb_build_array(sch);
  for e in select value from jsonb_array_elements(sch->'entries') loop
   if e->>'kind' in('rest','no_schedule') then continue;end if;
   if coalesce((e->>'flexible')::boolean,false) then
    if e->>'paidMinutes' is null then complete:=false;else regular:=regular+(e->>'paidMinutes')::integer;end if;
   elsif e->>'start' is not null and e->>'end' is not null and e->>'breakMinutes' is not null then
    regular:=regular+greatest(0,round(extract(epoch from ((d+coalesce((e->>'endDayOffset')::integer,case when (e->>'end')::time<(e->>'start')::time then 1 else 0 end)+(e->>'end')::time)-(d+(e->>'start')::time)))/60)::integer-(e->>'breakMinutes')::integer);
   else complete:=false;end if;
  end loop;
 end loop;
 source:='Published schedule';
 if not complete then regular:=baseline.minutes;source:=case when baseline.employee_id is not null then 'Manager-confirmed baseline' else 'Baseline needed' end;end if;
 select coalesce(sum(coalesce(final_approved_minutes,round(approved_hours*60)::integer)) filter(where status::text='Approved'),0),
 coalesce(sum(coalesce(manager_confirmed_minutes,round(approved_hours*60)::integer)) filter(where status::text in('PendingBOD','Submitted','PendingGM') and coalesce(manager_confirmed_minutes,round(approved_hours*60)::integer) is not null),0),
 coalesce(sum(private.ot_requested_minutes(r)) filter(where status::text in('Submitted','PendingGM') and manager_confirmed_minutes is null and approved_hours is null),0)
 into approved,reviewed,requested from public.ot_requests r where employee_id=p_employee and date between w and w+6;
 threshold:=round(coalesce((private.conditional_time_approval_config()->>'weekly_total_hours')::numeric,50)*60)::integer;
 return jsonb_build_object('weekStart',w,'weekEnd',w+6,'regularMinutes',regular,'baselineSource',source,'baselineEvidence',baseline.evidence,'publishedSchedules',pubs,'approvedMinutes',approved,'reviewedMinutes',reviewed,'unreviewedMinutes',requested,'projectedMinutes',regular+approved+reviewed,'thresholdMinutes',threshold,'baselineMissing',regular is null,'requiresBod',regular is not null and regular+approved+reviewed>threshold,
 'scheduledHours',regular/60.0,'weekOtHours',(approved+reviewed)/60.0,'totalWeekHours',(regular+approved+reviewed)/60.0,'threshold',threshold/60.0,'reason',case when regular is null then 'Manager must confirm the weekly regular-hour baseline. No default hours were assumed.' else 'Projected weekly hours for approval routing; not actual attendance. Daily overtime is reviewed separately.' end);
end $$;
-- Preserve leave/WFH behavior and historical request snapshots.
alter function private.time_request_context(text,uuid) rename to time_request_context_before_manual_ot;
create function private.time_request_context(p_request_type text,p_request_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.ot_requests;begin
 if lower(p_request_type)<>'overtime' then return private.time_request_context_before_manual_ot(p_request_type,p_request_id);end if;
 select * into strict r from public.ot_requests where id=p_request_id;
 return private.ot_week_summary(r.employee_id,r.date);
end $$;

create function public.confirm_ot_week_baseline(p_employee uuid,p_week date,p_minutes integer,p_evidence text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.current_hris_user_id()=p_employee or not private.is_direct_reporting_manager(public.current_hris_user_id(),p_employee) then raise exception 'Only the active direct manager can confirm this baseline.' using errcode='42501';end if;
 if p_minutes is null or p_minutes not between 0 and 10080 or nullif(btrim(p_evidence),'') is null then raise exception 'Enter regular minutes and the schedule or record used to verify them.';end if;
 perform pg_advisory_xact_lock(hashtextextended('ot-week:'||p_employee||':'||date_trunc('week',p_week)::date,0));
 insert into public.audit_logs(user_id,action,entity,entity_id,details) select public.current_hris_user_id()::text,'CONFIRM_OT_BASELINE','Overtime',p_employee::text,jsonb_build_object('week',date_trunc('week',p_week)::date,'previous',(select to_jsonb(b) from private.ot_week_baselines b where employee_id=p_employee and week_start=date_trunc('week',p_week)::date),'minutes',p_minutes,'evidence',p_evidence)::text;
 insert into private.ot_week_baselines values(p_employee,date_trunc('week',p_week)::date,p_minutes,p_evidence,public.current_hris_user_id(),now()) on conflict(employee_id,week_start) do update set minutes=excluded.minutes,evidence=excluded.evidence,confirmed_by=excluded.confirmed_by,confirmed_at=now();
end $$;

create function private.ot_review_problem(r public.ot_requests) returns text language plpgsql stable security definer set search_path='' as $$
begin
 if exists(select 1 from public.payroll_schedule_freezes f where f.employee_id=r.employee_id and r.date between f.date_from and f.date_to) then return 'Payroll locked — authorized correction required';end if;
 if coalesce(private.ot_requested_minutes(r),0)<=0 then return 'Requested extra-work duration needs correction';end if;
 if r.status::text in('Submitted','PendingGM','PendingBOD') and exists(select 1 from public.ot_requests x where x.id<>r.id and x.employee_id=r.employee_id and x.date between r.date-1 and r.date+1 and x.status::text not in('Draft','Rejected','Cancelled','Canceled') and
 ((r.start_time is not null and x.start_time is not null and (x.date+x.start_time)<(coalesce(r.end_date,r.date+case when r.end_time<r.start_time then 1 else 0 end)+r.end_time) and (coalesce(x.end_date,x.date+case when x.end_time<x.start_time then 1 else 0 end)+x.end_time)>(r.date+r.start_time))
 or (r.start_time is null and x.start_time is null and x.date=r.date and private.ot_requested_minutes(x)=private.ot_requested_minutes(r) and lower(btrim(x.reason))=lower(btrim(r.reason))))) then return 'This request overlaps another active request or duplicates a duration request. Resolve it before approval.';end if;
 return null;
end $$;
revoke all on function private.ot_review_problem(public.ot_requests) from public,anon,authenticated;

create function public.get_ot_week_review(p_ids uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g record;rows jsonb;summary jsonb;outcome jsonb:='[]';actor uuid:=public.current_hris_user_id();r public.ot_requests;entry jsonb;blocked text;
begin
 if auth.uid() is null or cardinality(p_ids)>500 then raise exception 'Authenticated review of up to 500 requests required.' using errcode='42501';end if;
 for g in select distinct employee_id,date_trunc('week',date)::date week_start from public.ot_requests where id=any(p_ids) and (employee_id=actor or private.can_read_ot_report(employee_id,business_unit_id) or private.is_active_time_request_approver(actor,'overtime',id)) loop
  summary:=private.ot_week_summary(g.employee_id,g.week_start);rows:='[]';
  for r in select * from public.ot_requests where employee_id=g.employee_id and date between g.week_start and g.week_start+6 and (employee_id=actor or private.can_read_ot_report(employee_id,business_unit_id) or private.is_active_time_request_approver(actor,'overtime',id)) order by date,start_time,id loop
   blocked:=private.ot_review_problem(r);
   entry:=to_jsonb(r)||jsonb_build_object('requestedMinutes',private.ot_requested_minutes(r),'reviewedMinutes',coalesce(r.manager_confirmed_minutes,case when r.status::text='PendingBOD' then round(r.approved_hours*60)::integer end),'finalMinutes',coalesce(r.final_approved_minutes,case when r.status::text='Approved' then round(r.approved_hours*60)::integer end),'canDecide',private.ot_can_decide(r),'blocked',blocked);
   rows:=rows||jsonb_build_array(entry);
  end loop;
  outcome:=outcome||jsonb_build_array(jsonb_build_object('employeeId',g.employee_id,'employee',(select jsonb_build_object('name',u.full_name,'position',u.position,'businessUnit',b.name,'businessUnitId',u.business_unit_id) from public.hris_users u left join public.business_units b on b.id=u.business_unit_id where u.id=g.employee_id),'summary',summary,'requests',rows,'version',md5(rows::text||summary::text),'canConfirmBaseline',actor<>g.employee_id and private.is_direct_reporting_manager(actor,g.employee_id)));
 end loop;
 return outcome;
end $$;

-- Batch is all-or-nothing, locks the entire week and verifies the rendered version.
create function public.decide_ot_week(p_ids uuid[],p_minutes jsonb,p_version text,p_operation uuid,p_decision text default 'approve',p_note text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();r public.ot_requests;first_row public.ot_requests;review jsonb;payload jsonb;prior private.ot_batch_decisions;minutes integer;outcome jsonb:='[]';summary jsonb;previous_status text;res jsonb;pay_input jsonb:=p_minutes;night_minutes integer;
begin
 if auth.uid() is null or p_operation is null or coalesce(cardinality(p_ids),0) not between 1 and 100 or p_decision not in('approve','reject','return') then raise exception 'Select 1–100 eligible requests and a valid decision.';end if;
 if p_decision<>'approve' and nullif(btrim(p_note),'') is null then raise exception 'A specific return or rejection reason is required.';end if;
 payload:=jsonb_build_object('ids',p_ids,'minutes',p_minutes,'version',p_version,'decision',p_decision,'note',p_note);
 perform pg_advisory_xact_lock(hashtextextended('ot-operation:'||actor||':'||p_operation,0));
 select * into prior from private.ot_batch_decisions where actor_id=actor and operation_id=p_operation;
 if found then if prior.payload<>payload then raise exception 'Operation ID already used for a different decision.';end if;return prior.result;end if;
 select * into first_row from public.ot_requests where id=p_ids[1];
 if first_row.id is null then raise exception 'Request unavailable.';end if;
 perform pg_advisory_xact_lock(hashtextextended('ot-week:'||first_row.employee_id||':'||date_trunc('week',first_row.date)::date,0));
 perform 1 from public.ot_requests where employee_id=first_row.employee_id and date_trunc('week',date)=date_trunc('week',first_row.date) order by id for update;
 review:=public.get_ot_week_review(p_ids)->0;
 if review is null or review->>'version' is distinct from p_version then raise exception 'This week changed. Refresh and review the updated requests; nothing was approved.';end if;
 if (select count(distinct x) from unnest(p_ids)x)<>cardinality(p_ids) or (select count(*) from public.ot_requests where id=any(p_ids) and employee_id=first_row.employee_id and date_trunc('week',date)=date_trunc('week',first_row.date))<>cardinality(p_ids) then raise exception 'Select distinct requests from one employee week.';end if;
 for r in select * from public.ot_requests where id=any(p_ids) order by id loop
  if not private.ot_can_decide(r) then raise exception 'Request % is no longer assigned to you; nothing was approved.',r.id using errcode='42501';end if;
  if exists(select 1 from public.payroll_schedule_freezes f where f.employee_id=r.employee_id and r.date between f.date_from and f.date_to) then raise exception 'Request % belongs to locked payroll; use the authorized correction path.',r.id;end if;
  if p_decision='approve' then
   if jsonb_typeof(p_minutes->r.id::text)='object' then p_minutes:=jsonb_set(p_minutes,array[r.id::text],p_minutes->r.id::text->'minutes');end if;
   if jsonb_typeof(p_minutes->r.id::text)<>'number' or (p_minutes->>r.id::text)::numeric<>trunc((p_minutes->>r.id::text)::numeric) then raise exception 'Request % needs whole approved minutes.',r.id;end if;
   minutes:=(p_minutes->>r.id::text)::integer;
   if minutes is null or minutes<0 or minutes>coalesce(private.ot_requested_minutes(r),-1) or minutes>1440 then raise exception 'Request %: approved minutes must be between zero and the requested extra-work duration.',r.id;end if;
   if r.status::text='PendingBOD' and minutes is distinct from coalesce(r.manager_confirmed_minutes,round(r.approved_hours*60)::integer,-1) then raise exception 'Request % must match the manager-reviewed amount. Return it for revision to change hours.',r.id;end if;
   if r.start_time is null then
    night_minutes:=case when r.status::text='PendingBOD' then r.manager_night_minutes else (pay_input->r.id::text->>'nightMinutes')::integer end;
    if night_minutes is null or night_minutes not between 0 and minutes then raise exception 'Request %: the manager must verify night-work minutes (zero if none) for this work date.',r.id;end if;
   end if;
   if private.ot_review_problem(r) is not null then raise exception 'Request %: %',r.id,private.ot_review_problem(r);end if;
  end if;
 end loop;
 -- Stage every manager quantity before calculating the batch's common routing total.
 perform set_config('app.manual_ot_decision',actor::text,true);
 if p_decision='approve' then
  update public.ot_requests set manager_night_minutes=case when status::text<>'PendingBOD' and start_time is null then (pay_input->id::text->>'nightMinutes')::integer else manager_night_minutes end,approved_hours=(p_minutes->>id::text)::numeric/60,manager_confirmed_minutes=case when status::text<>'PendingBOD' then (p_minutes->>id::text)::integer else manager_confirmed_minutes end,manager_confirmed_by=case when status::text<>'PendingBOD' then actor else manager_confirmed_by end,manager_confirmed_at=case when status::text<>'PendingBOD' then now() else manager_confirmed_at end,updated_at=clock_timestamp() where id=any(p_ids);
  summary:=private.ot_week_summary(first_row.employee_id,first_row.date);
  if (summary->>'baselineMissing')::boolean then
   if first_row.status::text='PendingBOD' then raise exception 'Weekly baseline is missing. The direct manager must confirm it before BOD approval.';end if;
   -- Review can be saved without a guessed baseline or a final approval.
   update public.ot_requests set history_log=coalesce(history_log,'[]')||jsonb_build_array(jsonb_build_object('action','Manager verified OT; baseline needed','by',actor,'date',now(),'minutes',(p_minutes->>id::text)::integer,'note',p_note)) where id=any(p_ids);
   outcome:=jsonb_build_object('reviewed',cardinality(p_ids),'baselineNeeded',true);
   insert into private.ot_batch_decisions values(actor,p_operation,payload,outcome,now());return outcome;
  end if;
 end if;
 for r in select * from public.ot_requests where id=any(p_ids) order by id loop
  if p_decision='return' then
   update public.time_request_approval_assignments set status='Skipped',updated_at=now() where request_type='overtime' and request_id=r.id and status='Pending';
   perform set_config('app.time_request_approval_context','overtime:'||r.id||':'||actor,true);
   update public.ot_requests set status='Draft',approved_hours=null,manager_confirmed_minutes=null,manager_confirmed_by=null,manager_confirmed_at=null,final_approved_minutes=null,manager_night_minutes=null,final_night_minutes=null,updated_at=clock_timestamp(),history_log=coalesce(history_log,'[]')||jsonb_build_array(jsonb_build_object('action','Returned for revision','by',actor,'date',now(),'note',p_note)) where id=r.id;
   res:=jsonb_build_object('status','Draft');
  else
   res:=private.process_time_request_approval_core('overtime',r.id,p_decision,p_note);
   if res->>'status'='Approved' then update public.ot_requests set final_approved_minutes=(p_minutes->>r.id::text)::integer,final_night_minutes=manager_night_minutes where id=r.id;end if;
  end if;
  insert into public.audit_logs(user_id,action,entity,entity_id,details) values(actor::text,'MANUAL_OT_DECISION','Overtime',r.id::text,jsonb_build_object('operation',p_operation,'decision',p_decision,'minutes',p_minutes->r.id::text,'note',p_note,'week',summary,'result',res,'reviewedVersion',review)::text);
  insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key)
  select r.employee_id::text,'GENERAL','Overtime review updated',case res->>'status' when 'Approved' then 'Your verified overtime was finally approved.' when 'Rejected' then 'Your overtime request was rejected: '||coalesce(p_note,'') when 'Draft' then 'Your overtime request was returned for revision: '||coalesce(p_note,'') else 'Your manager-reviewed overtime is awaiting the remaining required approval.' end,
  '/payroll/overtime-requests?item='||r.id,r.id::text,'manual-ot:'||p_operation||':'||r.id
  where not exists(select 1 from public.notifications where dedupe_key='manual-ot:'||p_operation||':'||r.id);
  outcome:=outcome||jsonb_build_array(jsonb_build_object('id',r.id,'result',res));
 end loop;
 insert into private.ot_batch_decisions values(actor,p_operation,payload,outcome,now());
 return outcome;
end $$;

-- Existing single-request buttons enter the same server path.
create or replace function public.process_overtime_request_approval(p_request_id uuid,p_decision text,p_note text default null,p_approved_hours numeric default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare review jsonb;begin
 review:=public.get_ot_week_review(array[p_request_id])->0;
 review:=public.decide_ot_week(array[p_request_id],jsonb_build_object(p_request_id::text,round(p_approved_hours*60)),review->>'version',gen_random_uuid(),lower(p_decision),p_note);
 return case when jsonb_typeof(review)='array' then review->0->'result' else review end;
end $$;

-- Entry validation and protection apply to direct table/API writes as well.
create function private.guard_manual_ot() returns trigger language plpgsql security definer set search_path='' as $$
declare n integer;deciding boolean:=current_setting('app.manual_ot_decision',true)=public.current_hris_user_id()::text;
begin
 perform pg_advisory_xact_lock(hashtextextended('ot-week:'||new.employee_id||':'||date_trunc('week',new.date)::date,0));
 if tg_op='UPDATE' and not coalesce(deciding,false) and (new.approved_hours is distinct from old.approved_hours or new.manager_confirmed_minutes is distinct from old.manager_confirmed_minutes or new.final_approved_minutes is distinct from old.final_approved_minutes or new.manager_night_minutes is distinct from old.manager_night_minutes or new.final_night_minutes is distinct from old.final_night_minutes or new.manager_confirmed_by is distinct from old.manager_confirmed_by or new.manager_confirmed_at is distinct from old.manager_confirmed_at or new.evidence_mode is distinct from old.evidence_mode or new.status::text in('Approved','PendingBOD','Rejected') and new.status is distinct from old.status) then raise exception 'Use the assigned overtime review action to record a decision.' using errcode='42501';end if;
 if tg_op='UPDATE' and exists(select 1 from public.payroll_schedule_freezes f where f.employee_id=old.employee_id and old.date between f.date_from and f.date_to) and new is distinct from old then raise exception 'This overtime record belongs to locked payroll. Use the authorized correction path.';end if;
 if tg_op='UPDATE' and new.employee_id is distinct from old.employee_id then raise exception 'The employee on an overtime request cannot be changed.';end if;
 if tg_op='INSERT' or (new.date,new.start_time,new.end_time,new.end_date,new.hours,new.requested_minutes,new.unpaid_break_minutes,new.reason) is distinct from (old.date,old.start_time,old.end_time,old.end_date,old.hours,old.requested_minutes,old.unpaid_break_minutes,old.reason) then
  if tg_op='UPDATE' and old.status::text<>'Draft' then raise exception 'Return this request for revision before changing the original extra-work evidence.';end if;
  if new.evidence_mode<>'manual' or new.unpaid_break_minutes<0 then raise exception 'Invalid manual overtime evidence.';end if;
  if new.start_time is not null and new.end_time is not null then
   if new.end_date is null then new.end_date:=new.date+case when new.end_time<new.start_time then 1 else 0 end;end if;
   n:=round(extract(epoch from ((new.end_date+new.end_time)-(new.date+new.start_time)))/60)::integer-new.unpaid_break_minutes;
   if n<=0 or n>1440 or new.end_date not between new.date and new.date+1 then raise exception 'Check extra-work dates, times and unpaid breaks. Duration must be 1–1440 minutes.';end if;
   new.requested_minutes:=coalesce(new.requested_minutes,round(new.hours*60)::integer,n);
   if new.requested_minutes not between 1 and n then raise exception 'Requested minutes exceed the extra-work interval after breaks.';end if;
   n:=new.requested_minutes;
  else
   if new.start_time is not null or new.end_time is not null then raise exception 'Enter both extra-work times, or use duration only.';end if;
   n:=new.requested_minutes;
   if n is null or n not between 1 and 1440 then raise exception 'Enter 1–1440 requested extra-work minutes.';end if;
  end if;
  new.hours:=n/60.0;
  if new.status::text<>'Draft' and nullif(btrim(new.reason),'') is null then raise exception 'The reason for extra work is required.';end if;
 end if;
 if tg_op='INSERT' and (new.approved_hours is not null or new.manager_confirmed_minutes is not null or new.final_approved_minutes is not null or new.manager_night_minutes is not null or new.final_night_minutes is not null or new.status::text not in('Draft','Submitted','PendingGM')) then raise exception 'New requests must start with direct-manager review.';end if;
 return new;
end $$;
create trigger a_manual_ot_guard before insert or update on public.ot_requests for each row execute function private.guard_manual_ot();

revoke all on function private.ot_requested_minutes(public.ot_requests),private.ot_can_decide(public.ot_requests),private.ot_week_summary(uuid,date),private.time_request_context(text,uuid),private.time_request_context_before_manual_ot(text,uuid),private.guard_manual_ot() from public,anon,authenticated;
revoke all on function public.get_ot_week_review(uuid[]),public.decide_ot_week(uuid[],jsonb,text,uuid,text,text),public.confirm_ot_week_baseline(uuid,date,integer,text),public.process_overtime_request_approval(uuid,text,text,numeric) from public,anon;
grant execute on function public.get_ot_week_review(uuid[]),public.decide_ot_week(uuid[],jsonb,text,uuid,text,text),public.confirm_ot_week_baseline(uuid,date,integer,text),public.process_overtime_request_approval(uuid,text,text,numeric) to authenticated;
notify pgrst,'reload schema';
