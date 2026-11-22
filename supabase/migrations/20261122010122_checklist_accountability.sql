create table operations_private.checklist_cases (
 work_id uuid primary key, unit_id uuid not null, title text not null, due_at timestamptz not null,
 shift_end timestamptz not null, owner_id uuid, submitted_at timestamptz, test boolean not null default false,
 discarded_at timestamptz, discarded_by uuid, decision text, reason text, incident_id uuid, cancelled boolean not null default false
);
create index checklist_cases_unit_due on operations_private.checklist_cases(unit_id,due_at);
create table operations_private.checklist_case_events (
 id bigint generated always as identity primary key, work_id uuid references operations_private.checklist_cases,
 action text not null, reason text, actor uuid, recorded_at timestamptz not null default now()
);
revoke all on operations_private.checklist_cases, operations_private.checklist_case_events from public,anon,authenticated;
create function operations_private.case_state(c operations_private.checklist_cases) returns text language sql stable set search_path='' as $$
select case when c.discarded_at is not null then 'Discarded as test' when c.cancelled then 'Cancelled'
 when c.decision='Excuse' then 'Excused' when c.decision='Close' then 'Missed'
 when c.submitted_at<=c.due_at then 'On time' when c.submitted_at is not null then 'Completed late'
 when c.decision='Request' then 'Completion requested' when now()>=c.shift_end then 'Missed — needs review'
 when now()>c.due_at then 'Overdue' else 'Scheduled' end $$;

create function operations_private.checklist_shift_end(emp uuid,bu uuid,day date,due timestamptz,window_end timestamptz)
returns timestamptz language sql stable set search_path='' as $$
with pub as (select p.snapshot from public.payroll_schedule_publications p where p.employee_id=emp and p.business_unit_id=bu
 and day between p.effective_from and p.effective_to and (not p.approval_required or exists(select 1 from public.payroll_schedule_overrides x where x.publication_id=p.id and x.decision='approve'))
 order by p.published_at desc,p.version desc limit 1),
 shifts as (select ((day+(e->>'start')::time) at time zone 'Asia/Manila') s,
 ((day+coalesce((e->>'endDayOffset')::int,case when (e->>'end')::time<=(e->>'start')::time then 1 else 0 end)+(e->>'end')::time) at time zone 'Asia/Manila') f
 from pub,jsonb_array_elements(snapshot) e where e->>'date'=day::text and e->>'kind'='work' and nullif(e->>'start','') is not null and nullif(e->>'end','') is not null)
select greatest(due,coalesce((select min(f) from shifts where s<=due and f>=due),window_end,(day+1)::timestamp at time zone 'Asia/Manila')) $$;

create function operations_private.sync_checklist_cases() returns void language plpgsql security definer set search_path='' as $$
begin
 insert into operations_private.checklist_cases(work_id,unit_id,title,due_at,shift_end,owner_id,submitted_at)
 select w.work_id,w.unit_id,w.title,w.due_at,operations_private.checklist_shift_end(p.owner_id,w.unit_id,coalesce(p.operating_date,(w.due_at at time zone 'Asia/Manila')::date),w.due_at,p.window_end),p.owner_id,w.submitted
 from operations_private.checklist_reporting_rows('-infinity','infinity') w
 left join lateral (select coalesce(o.owner_id,case when count(*) over()=1 or w.due_at>=now() then a.assignee_id end) owner_id,o.operating_date,o.window_end
 from public.ops_assignments a left join public.ops_occurrences o on o.id=a.occurrence_id
 where coalesce(a.checklist_run_id,a.id)=w.work_id and a.status<>'Cancelled' order by a.created_at,a.assignee_id limit 1) p on true
 where not w.unassigned and not exists(select from operations_private.checklist_cases c where c.work_id=w.work_id)
 on conflict do nothing;
 update operations_private.checklist_cases c set submitted_at=r.submitted_at from public.ops_checklist_runs r
 where r.id=c.work_id and r.submitted_at is not null and c.submitted_at is distinct from r.submitted_at;
 update operations_private.checklist_cases c set submitted_at=a.completed_at from public.ops_assignments a
 where c.submitted_at is null and c.work_id=coalesce(a.checklist_run_id,a.id) and a.status='Completed' and a.completed_at is not null;
 update operations_private.checklist_cases c set cancelled=true where not c.cancelled and c.submitted_at is null and not exists(select from public.ops_assignments a left join public.ops_occurrences o on o.id=a.occurrence_id where coalesce(a.checklist_run_id,a.id)=c.work_id and a.status<>'Cancelled' and coalesce(o.status,'Open')<>'Cancelled');
 insert into operations_private.checklist_case_events(work_id,action)
 select work_id,'Shift ended without submission' from operations_private.checklist_cases c
 where shift_end<=now() and (submitted_at is null or submitted_at>shift_end) and not test and not cancelled and discarded_at is null
 and not exists(select from operations_private.checklist_case_events e where e.work_id=c.work_id and e.action='Shift ended without submission') on conflict do nothing;
end $$;
create unique index checklist_shift_end_once on operations_private.checklist_case_events(work_id) where action='Shift ended without submission';
create function operations_private.checklist_clock() returns void language plpgsql security definer set search_path='' as $$
declare x record; begin
 perform operations_private.sync_checklist_cases();
 for x in select c.work_id,c.title,a.id,a.assignee_id from operations_private.checklist_cases c
 join public.ops_assignments a on coalesce(a.checklist_run_id,a.id)=c.work_id
 where not c.test and c.discarded_at is null and not c.cancelled and c.submitted_at is null and c.due_at between now() and now()+interval '30 minutes'
 and a.status in ('Assigned','In Progress') loop
 perform operations_private.review_notice(x.assignee_id,'checklist-due:'||x.work_id,x.title||' is due within 30 minutes.','/operations?assignment='||x.id);end loop;
end $$;
select operations_private.sync_checklist_cases();
select cron.schedule('ops-checklist-accountability','* * * * *','select operations_private.checklist_clock()');
create function public.ops_checklist_cases(p_unit uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by due_at desc),'[]') from (
 select c.work_id,c.unit_id,b.name unit,c.title,c.due_at,c.shift_end,c.submitted_at,c.test,c.discarded_at,c.reason,c.incident_id,
 operations_private.case_state(c) state,h.full_name owner, operations_private.manager(c.unit_id) manage,
 operations_private.role_unit(operations_private.actor(),c.unit_id,array['Admin']) admin,
 (select a.id from public.ops_assignments a where coalesce(a.checklist_run_id,a.id)=c.work_id and a.assignee_id=operations_private.actor() limit 1) assignment,
 (select string_agg(h2.full_name,', ' order by h2.full_name) from public.ops_assignments a join public.hris_users h2 on h2.id=a.assignee_id where coalesce(a.checklist_run_id,a.id)=c.work_id and a.assignee_id is distinct from c.owner_id and a.status<>'Cancelled') contributors
 from operations_private.checklist_cases c join public.business_units b on b.id=c.unit_id left join public.hris_users h on h.id=c.owner_id
 where not c.cancelled and (p_unit is null or c.unit_id=p_unit) and (operations_private.manager(c.unit_id)
 or exists(select from operations_private.checklist_result_units(operations_private.actor()) u where u.id=c.unit_id)
 or exists(select from public.ops_assignments a where coalesce(a.checklist_run_id,a.id)=c.work_id and a.assignee_id=operations_private.actor() and a.status<>'Cancelled'))
 and (c.discarded_at is null or operations_private.role_unit(operations_private.actor(),c.unit_id,array['Admin']))) x $$;
create function public.ops_checklist_decide(p_ids uuid[],p_action text,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare c operations_private.checklist_cases; actor uuid:=operations_private.actor(); ir uuid; bu text; emp text;
begin
 if p_ids is null or cardinality(p_ids)=0 or cardinality(p_ids)>500 or p_action is null or p_action not in ('Request','Close','Excuse','Discard','Refer') then raise exception 'Invalid checklist action';end if;
 if p_action in ('Close','Excuse') and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Add a short reason';end if;
 for c in select * from operations_private.checklist_cases where work_id=any(p_ids) order by work_id for update loop
 if not operations_private.manager(c.unit_id) then raise exception 'Manager access required';end if;
 if p_action='Discard' then
 if not operations_private.role_unit(actor,c.unit_id,array['Admin']) then raise exception 'Admin access required';end if;
 if c.discarded_at is not null then continue;end if;
 update operations_private.checklist_cases set discarded_at=now(),discarded_by=actor,test=true where work_id=c.work_id;
 elsif p_action='Refer' then
 if c.incident_id is not null then continue;end if;
 if operations_private.case_state(c)<>'Missed' or c.test then raise exception 'Only a reviewed, confirmed miss can be referred';end if;
 select name into bu from public.business_units where id=c.unit_id;select full_name into emp from public.hris_users where id=c.owner_id;
 insert into public.incident_reports(category,description,location,date_time,reported_by,involved_employee_ids,involved_employee_names,witness_ids,witness_names,status,pipeline_stage,nte_ids,business_unit_id,business_unit_name,chat_thread)
 values('Operations review',concat('Checklist: ',c.title,E'\nOriginal deadline (Manila): ',c.due_at at time zone 'Asia/Manila',E'\nManager review: ',c.reason,E'\nChecklist record: ',c.work_id),bu,now(),actor,array_remove(array[c.owner_id],null),array_remove(array[emp],null),'{}','{}','Submitted','ir-review','{}',c.unit_id,bu,'[]') returning id into ir;
 update operations_private.checklist_cases set incident_id=ir where work_id=c.work_id;
 else
 if exists(select from public.ops_checklist_runs r where r.id=c.work_id and r.submitted_at is not null) or operations_private.case_state(c) not in ('Missed — needs review','Overdue','Completion requested') then raise exception 'Checklist changed. Refresh the review.';end if;
 if p_action='Close' and now()<c.shift_end then raise exception 'Wait until the shift ends before confirming a miss';end if;
 update operations_private.checklist_cases set decision=p_action,reason=trim(p_reason) where work_id=c.work_id;
 end if;
 insert into operations_private.checklist_case_events(work_id,action,reason,actor) values(c.work_id,p_action,trim(p_reason),actor);
 end loop;
end $$;
create function operations_private.case_active(id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select from operations_private.checklist_cases c where c.work_id=id and (c.discarded_at is not null or c.cancelled or c.decision in ('Close','Excuse') or (c.shift_end<=now() and c.submitted_at is null and c.decision is distinct from 'Request'))) $$;
revoke all on function public.ops_checklist_cases(uuid),public.ops_checklist_decide(uuid[],text,text) from public,anon;
grant execute on function public.ops_checklist_cases(uuid),public.ops_checklist_decide(uuid[],text,text) to authenticated;
alter table operations_private.checklist_mail add column warning_owner uuid,add column warning_week date;
create view operations_private.checklist_warning_groups as
 select unit_id,owner_id,date_trunc('week',due_at at time zone 'Asia/Manila')::date week,count(*) misses
 from operations_private.checklist_cases c where operations_private.case_state(c)='Missed' and not test and owner_id is not null
 group by 1,2,3 having count(*)>=3;
create or replace function public.ops_queue_checklist_mail() returns void language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Manila')::date; period_start date; period_end date; cadence text;
begin
 insert into operations_private.checklist_mail(event_key,recipient,unit_id,subject,message)
 select 'attention:'||c.unit_id||':'||today,h.id,c.unit_id,'Checklist summary · '||b.name,
 count(*)||' checklists need attention as of '||today||' (Manila). '||
 count(*) filter(where operations_private.case_state(c)='Overdue')||' overdue, '||
 count(*) filter(where operations_private.case_state(c)='Missed — needs review')||' awaiting review. Open Needs attention for the details.'
 from operations_private.checklist_cases c join public.business_units b on b.id=c.unit_id join public.hris_users h on lower(h.status)='active' and h.email like '%@%' and operations_private.role_unit(h.id,c.unit_id,array['Business Unit Manager'])
 where not c.test and operations_private.case_state(c) in ('Overdue','Missed — needs review')
 group by c.unit_id,h.id,b.name on conflict(event_key,recipient) do nothing;
 insert into operations_private.checklist_mail(event_key,recipient,unit_id,warning_owner,warning_week,subject,message)
 select 'warning:'||g.unit_id||':'||g.owner_id||':'||g.week,h.id,g.unit_id,g.owner_id,g.week,'Missed checklist warning · '||b.name,
 emp.full_name||' has at least three manager-confirmed missed checklists for '||b.name||' in the week of '||g.week||' (Monday–Sunday, Manila). Please review the checklist history with your business unit manager.'
 from operations_private.checklist_warning_groups g join public.business_units b on b.id=g.unit_id join public.hris_users emp on emp.id=g.owner_id join public.hris_users h on lower(h.status)='active' and h.email like '%@%' and (h.id=g.owner_id or operations_private.role_unit(h.id,g.unit_id,array['Business Unit Manager']))
 on conflict(event_key,recipient) do nothing;
 foreach cadence in array array['week','month'] loop
 period_end:=date_trunc(cadence,today::timestamp)::date;
 if period_end<date '2026-11-23' then continue;end if;
 period_start:=(period_end-case cadence when 'week' then interval '7 days' else interval '1 month' end)::date;
 with totals as (select b.id,b.name,count(*) filter(where state='On time') on_time,count(*) filter(where state='Completed late') late,
 count(*) filter(where state='Missed') missed,count(*) filter(where state in('Overdue','Missed — needs review','Completion requested')) pending
 from public.business_units b left join (select c.unit_id,operations_private.case_state(c) state from operations_private.checklist_cases c
 where not c.test and not c.cancelled and (c.due_at at time zone 'Asia/Manila')::date>=period_start and (c.due_at at time zone 'Asia/Manila')::date<period_end) s on s.unit_id=b.id group by b.id,b.name)
 insert into operations_private.checklist_mail(event_key,recipient,subject,message)
 select cadence||':'||period_end,h.id,case cadence when 'month' then 'Monthly' else 'Weekly' end||' checklist report · '||period_start||' to '||(period_end-1),
 string_agg(t.name||' — '||(t.on_time+t.late)||' completed ('||t.on_time||' on time, '||t.late||' late), '||t.missed||' confirmed missed, '||t.pending||' awaiting review.',E'\n' order by t.name)
 from totals t join public.hris_users h on lower(h.status)='active' and h.email like '%@%' and operations_private.role_unit(h.id,t.id,array['Board of Director'])
 group by h.id on conflict(event_key,recipient) do nothing;
 end loop;
end $$;
CREATE OR REPLACE FUNCTION public.ops_claim_checklist_mail()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare delivery operations_private.checklist_mail; address text;
begin
  select q.* into delivery from operations_private.checklist_mail q join public.hris_users h on h.id=q.recipient
  where q.sent_at is null and q.retry_at<=now() and lower(h.status)='active' and h.email like '%@%'
    and q.event_key not like 'miss:%' and (case when q.warning_owner is not null then exists(select from operations_private.checklist_warning_groups g where g.owner_id=q.warning_owner and g.week=q.warning_week and g.unit_id=q.unit_id) and (h.id=q.warning_owner or operations_private.role_unit(h.id,q.unit_id,array['Business Unit Manager'])) when q.unit_id is not null then operations_private.role_unit(h.id,q.unit_id,array['Business Unit Manager'])
      else operations_private.role_unit(h.id,null,array['Board of Director']) end)
  order by q.retry_at,q.id limit 1 for update of q skip locked;
  if not found then return null; end if;
  select email into address from public.hris_users where id=delivery.recipient;
  update operations_private.checklist_mail set lease=gen_random_uuid(),retry_at=now()+interval '15 minutes'
  where id=delivery.id returning * into delivery;
  return jsonb_build_object('id',delivery.id,'token',delivery.lease,'email',address,'subject',delivery.subject,'message',delivery.message,'unit',delivery.unit_id);
end $function$
;
CREATE OR REPLACE FUNCTION operations_private.queue_notices(p_occ uuid, p_now timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.ops_occurrences;r public.ops_rules;s record;k text;msg text;begin
 select * into o from public.ops_occurrences where id=p_occ;select * into r from public.ops_rules where id=o.rule_id;
 if o.status<>'Open' then update operations_private.ops_deliveries set state='Stopped' where occurrence_id=o.id and state='Queued';return;end if;
 if exists(select from public.ops_template_versions v join public.ops_templates t on t.id=v.template_id where v.id=o.template_version_id and t.kind='checklist') then update operations_private.ops_deliveries set state='Stopped' where occurrence_id=o.id and state='Queued';return;end if;
 for s in select st.employee_id id from public.ops_occurrence_staff st join public.ops_assignments ax on ax.id=st.assignment_id where st.occurrence_id=o.id and st.active and ax.status not in('Completed','Cancelled') union select r.updated_by union select h.id from public.hris_users h where operations_private.role_unit(h.id,o.business_unit_id,array['Business Unit Manager']) loop
 k:=null;
 if o.coverage in('Uncovered','Schedule missing','No owner','At risk') and p_now>=o.window_start and (s.id=r.updated_by or operations_private.role_unit(s.id,o.business_unit_id,array['Business Unit Manager'])) then k:='coverage:'||o.coverage;msg:=o.coverage_reason;
 elsif p_now>o.due_at and coalesce((o.config->>'overdue_every')::int,0)>0 then k:='overdue:'||floor(extract(epoch from(p_now-o.due_at))/(60*(o.config->>'overdue_every')::int))::text;msg:='Outstanding work is overdue';
 elsif p_now>=o.due_at-make_interval(mins=>coalesce((o.config->>'remind_before')::int,0)) and p_now<=o.due_at and coalesce((o.config->>'remind_before')::int,0)>0 then k:='due';msg:='Assigned work is due soon';
 elsif exists(select 1 from public.ops_occurrence_staff where occurrence_id=o.id and employee_id=s.id and active) then k:='assigned';msg:='You are assigned for operating date '||o.operating_date::text;end if;
 if k is not null and k not like 'coverage:%' and exists(select 1 from operations_private.ops_snoozes sn join public.ops_assignments ax on ax.id=sn.assignment_id where ax.occurrence_id=o.id and sn.user_id=s.id and sn.state='Queued' and sn.until_at>p_now) then continue;end if;
 if k is not null then insert into operations_private.ops_deliveries(occurrence_id,recipient,event_key,title,message) values(o.id,s.id,k,o.title,msg) on conflict do nothing;end if;end loop;
end $function$
;
CREATE OR REPLACE FUNCTION operations_private.reconcile(p_occ uuid, p_now timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.ops_occurrences;r public.ops_rules;rv public.ops_rule_versions;w jsonb;p record;av jsonb;ids uuid[]:='{}';preferred uuid;did_start bool;begin
 select * into o from public.ops_occurrences where id=p_occ for update;select * into r from public.ops_rules where id=o.rule_id;
 if o.status<>'Open' then return;end if;perform 1 from public.ops_checklist_runs z where z.id in(select checklist_run_id from public.ops_assignments where occurrence_id=o.id) order by z.id for update;did_start:=operations_private.started(o.id);
 -- Once a rule is paused, future generation stops; existing assignments remain actionable.
 if not did_start and not o.override and r.status='Active' and o.asset_context is null then
 select * into rv from public.ops_rule_versions where rule_id=r.id and revision=r.revision;
 if not operations_private.recurrence_due(r.config,o.operating_date) then
 for p in select employee_id id from public.ops_occurrence_staff where occurrence_id=o.id and active loop perform operations_private.remove_staff(o.id,p.id,'Recurrence changed before execution');end loop;
 update public.ops_occurrences set status='Skipped',coverage='Skipped',coverage_reason='Recurrence changed before execution',revision=revision+1 where id=o.id;perform operations_private.auto_audit(r.id,o.id,'Occurrence skipped',jsonb_build_object('reason','Recurrence changed'),true);return;end if;
 -- Existing frozen executions are never rewritten; template changes apply to newly generated dates.
 w:=operations_private.rule_window(r.config,o.operating_date,r.business_unit_id);
 update public.ops_occurrences set window_start=(w->>'start')::timestamptz,window_end=(w->>'end')::timestamptz,due_at=(w->>'due')::timestamptz,config=r.config||jsonb_build_object('execution',o.config->>'execution')||case when w ? 'warning' then jsonb_build_object('timing_warning',w->>'warning') else '{}'::jsonb end,rule_version_id=rv.id where id=o.id returning * into o;
 update public.ops_assignments set due_at=o.due_at,updated_at=p_now,revision=revision+1 where occurrence_id=o.id and due_at is distinct from o.due_at;
 end if;
 for p in select * from operations_private.rule_people(o.business_unit_id,o.config) loop
 av:=operations_private.availability(p.id,o.business_unit_id,o.operating_date,o.window_start,o.window_end,p_now);
 if o.config->>'mode'='fixed' or (av->>'eligible')::bool then ids:=array_append(ids,p.id);end if;end loop;
 if not did_start and not o.override then
 for p in select employee_id id from public.ops_occurrence_staff where occurrence_id=o.id and active and not(employee_id=any(ids)) loop perform operations_private.remove_staff(o.id,p.id,'Published staffing changed before execution');perform operations_private.auto_audit(r.id,o.id,'Staff removed',jsonb_build_object('employee_id',p.id,'reason','Published staffing changed'),true);end loop;
 foreach preferred in array ids loop if not exists(select 1 from public.ops_occurrence_staff where occurrence_id=o.id and employee_id=preferred and active) then perform operations_private.add_staff(o.id,preferred);perform operations_private.auto_audit(r.id,o.id,'Staff assigned',jsonb_build_object('employee_id',preferred),true);end if;end loop;
 preferred:=nullif(o.config->>'preferred_owner','')::uuid;
 if o.owner_id is null or not(o.owner_id=any(ids)) then
 if preferred=any(ids) then null;
 elsif coalesce((o.config->>'auto_backup')::bool,false) then select x::uuid into preferred from jsonb_array_elements_text(o.config->'backup_ids') with ordinality z(x,n) where x::uuid=any(ids) order by n limit 1;
 else preferred:=null;end if;
 if preferred is null and o.due_at>=p_now and exists(select from public.ops_template_versions v join public.ops_templates t on t.id=v.template_id where v.id=o.template_version_id and t.kind='checklist') then select id into preferred from unnest(ids) id order by id limit 1;end if;
 if preferred is distinct from o.owner_id then update public.ops_occurrences set owner_id=preferred,revision=revision+1 where id=o.id;perform operations_private.auto_audit(r.id,o.id,'Owner selected',jsonb_build_object('from',o.owner_id,'to',preferred),true);end if;end if;end if;
 perform operations_private.evaluate_occurrence(o.id,p_now);
end $function$
;
CREATE OR REPLACE FUNCTION operations_private.can_write_run(p_run uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.ops_assignments a join public.ops_checklist_runs r on r.id=a.checklist_run_id where not exists(select from operations_private.checklist_cases c where c.work_id=p_run and (c.discarded_at is not null or c.decision in ('Close','Excuse'))) and r.id=p_run and r.execution_phase=2 and r.submitted_at is null and a.assignee_id=public.current_hris_user_id() and a.status in('Assigned','In Progress') and operations_private.member(a.assignee_id,a.business_unit_id) and (a.occurrence_id is null or exists(select 1 from public.ops_occurrence_staff s join public.ops_occurrences o on o.id=s.occurrence_id where s.assignment_id=a.id and s.active and o.status='Open')))
$function$
;
CREATE OR REPLACE FUNCTION public.ops_my_dashboard_tasks()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.due_at nulls last,x.id),'[]') from (
    select distinct on (coalesce(a.checklist_run_id,a.id)) a.id,a.due_at,a.status,
      v.content->>'title' title,b.name unit,t.kind
    from public.ops_assignments a
    join public.ops_template_versions v on v.id=a.template_version_id
    join public.ops_templates t on t.id=v.template_id
    join public.business_units b on b.id=a.business_unit_id
    left join public.ops_checklist_runs r on r.id=a.checklist_run_id
    where a.assignee_id=operations_private.actor() and a.status in ('Assigned','In Progress')
      and operations_private.case_active(coalesce(a.checklist_run_id,a.id)) and r.submitted_at is null and operations_private.can_view_assignment(a.id)
    order by coalesce(a.checklist_run_id,a.id),a.due_at,a.id
  ) x
$function$
;
CREATE OR REPLACE FUNCTION public.ops_checklist_results(p_date date, p_unit uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=operations_private.actor(); units uuid[]; choices jsonb;
begin
  select array_agg(u.id),jsonb_agg(to_jsonb(u) order by u.name) into units,choices
  from operations_private.checklist_result_units(actor) u;
  if units is null or (p_unit is not null and not p_unit=any(units)) then
    raise exception 'Checklist results unavailable' using errcode='42501';
  end if;
  if p_date is null then raise exception 'Choose a submission date'; end if;
  return jsonb_build_object('units',choices,'results',(
    select coalesce(jsonb_agg(to_jsonb(x) order by x.submitted_at desc,x.id),'[]'::jsonb)
    from (
      select r.id,b.name as unit,v.content->>'title' as title,coalesce(r.submitted_at,legacy.completed_at) as submitted_at,
        coalesce(r.outcome,'Completed') as outcome,h.full_name as submitted_by,
        case when r.execution_phase=1 then
          (select jsonb_agg(jsonb_build_object('title',i.snapshot->>'title','value',c.checked) order by i.ordinal)
           from public.ops_item_checks c join public.ops_checklist_items i on i.id=c.item_id where c.run_id=r.id)
        else
          (select jsonb_agg(jsonb_build_object('title',i.snapshot->>'title','value',s.value,'remarks',s.remarks,'issue',s.issue) order by i.ordinal)
           from public.ops_run_items i left join public.ops_responses s on s.item_id=i.id where i.run_id=r.id)
        end as items
      from public.ops_checklist_runs r join public.business_units b on b.id=r.business_unit_id
      join public.ops_template_versions v on v.id=r.template_version_id
      join public.ops_templates t on t.id=v.template_id and t.kind='checklist'
      left join public.hris_users h on h.id=r.submitted_by
      left join lateral (select max(a.completed_at) as completed_at from public.ops_assignments a
        where r.execution_phase=1 and a.checklist_run_id=r.id and a.status='Completed') legacy on true
      where not exists(select from operations_private.checklist_cases c where c.work_id=r.id and c.test) and b.id=any(units) and (p_unit is null or b.id=p_unit)
        and coalesce(r.submitted_at,legacy.completed_at)>=p_date::timestamp at time zone 'Asia/Manila'
        and coalesce(r.submitted_at,legacy.completed_at)<(p_date+1)::timestamp at time zone 'Asia/Manila'
    ) x
  ));
end $function$
;
CREATE OR REPLACE FUNCTION public.ops_workspace_overview(p_unit uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=operations_private.actor();
begin
 if p_unit is not null and not (operations_private.member(actor,p_unit) or operations_private.manager(p_unit) or exists(
  select 1 from public.ops_assignments where assignee_id=actor and business_unit_id=p_unit))
 then raise exception 'Business unit is not authorized' using errcode='42501';end if;
 return jsonb_build_object('actor',actor,'masterAdmin',operations_private.admin(null),'summary',true,
 'units',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,
  'manage',operations_private.manager(b.id),'edit',operations_private.can_edit(b.id),
  'assign',operations_private.manager(b.id) or exists(select 1 from public.ops_permissions p where p.user_id=actor and p.business_unit_id=b.id and p.can_assign and operations_private.member(actor,b.id)),
  'review',operations_private.review_manager(b.id),'bod',operations_private.admin(b.id)) order by b.name),'[]')
  from public.business_units b where operations_private.member(actor,b.id) or operations_private.manager(b.id) or exists(select 1 from public.ops_assignments where assignee_id=actor and business_unit_id=b.id)),
 'departments','[]'::jsonb,'people','[]'::jsonb,'assets','[]'::jsonb,'templates','[]'::jsonb,'permissions','[]'::jsonb,
 'assignments',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object(
  'accountability_state',operations_private.case_state(cc),'accountability_test',coalesce(cc.test,false),'accountability_active',operations_private.case_active(coalesce(a.checklist_run_id,a.id)),'kind',t.kind,'content',jsonb_build_object('title',v.content->'title','category',v.content->'category','flexible_timing',v.content->'flexible_timing'),'version',v.version,'assignee_name',h.full_name,
  'assignee_is_bum',operations_private.role_unit(h.id,a.business_unit_id,array['Business Unit Manager','GeneralManager']),
  'unit_name',b.name,'can_cancel',false,'items','[]'::jsonb,'history','[]'::jsonb,'instructions','',
  'members',case when a.checklist_run_id is null then '[]'::jsonb else (
   select coalesce(jsonb_agg(jsonb_build_object('id',x.assignee_id,'name',person.full_name) order by person.full_name),'[]')
   from public.ops_assignments x join public.hris_users person on person.id=x.assignee_id where x.checklist_run_id=a.checklist_run_id) end,
  'execution',case when run.execution_phase=2 then jsonb_build_object('id',run.id,'shared',run.shared,'outcome',run.outcome,'revision',run.revision,'submitted_at',run.submitted_at,'execution_phase',run.execution_phase,'items','[]'::jsonb,'can_write',false,'can_reopen',false) else null end,
  'review',case when review.id is not null then jsonb_build_object('id',review.id,'mode',review.mode,'state',review.state,'revision',review.revision,'critical',review.critical,'issues','[]'::jsonb,'eligible_reviewers','[]'::jsonb,'can_review',false,'can_manage',false) else null end,
  'maintenance',o.asset_context,'maintenance_owner',(select full_name from public.hris_users where id=o.owner_id),
  'snooze',case when a.assignee_id=actor then to_jsonb(s) else null end,
  'event',case when o.config ? 'event_window' then o.config->'event_window'||jsonb_build_object(
   'start',o.window_start,'end',o.window_end,'due',o.due_at,'owner_name',(select full_name from public.hris_users where id=o.owner_id),
   'coverage',o.coverage,'coverage_reason',o.coverage_reason,'occurrence_revision',o.revision,'can_claim',false) else null end
 ) order by a.due_at),'[]')
 from public.ops_assignments a
 join public.ops_template_versions v on v.id=a.template_version_id join public.ops_templates t on t.id=v.template_id
 join public.hris_users h on h.id=a.assignee_id join public.business_units b on b.id=a.business_unit_id
 left join operations_private.checklist_cases cc on cc.work_id=coalesce(a.checklist_run_id,a.id) left join public.ops_checklist_runs run on run.id=a.checklist_run_id
 left join public.ops_occurrences o on o.id=a.occurrence_id
 left join operations_private.ops_snoozes s on s.assignment_id=a.id
 left join operations_private.reviews review on review.assignment_id=a.id or (review.run_id is not null and review.run_id=a.checklist_run_id)
 where cc.discarded_at is null and (p_unit is null or a.business_unit_id=p_unit) and operations_private.can_view_assignment(a.id)));
end
$function$
;
CREATE OR REPLACE FUNCTION operations_private.review_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r operations_private.reviews;h record;i record;u record;d date;review_end timestamptz;begin
 if not pg_try_advisory_xact_lock(746320044) then return;end if;
 for r in select * from operations_private.reviews where not exists(select from operations_private.checklist_cases c where c.test and c.work_id=coalesce(reviews.run_id,reviews.assignment_id)) and state in('Awaiting verification','Awaiting BOD review','Needs correction') order by updated_at limit 500 loop
 if r.state='Needs correction' then
 for h in select assignee_id id,id assignment_id from public.ops_assignments where (id=r.assignment_id or checklist_run_id=r.run_id) and status<>'Cancelled' and operations_private.member(assignee_id,business_unit_id) loop perform operations_private.review_notice(h.id,'correction:'||r.id||':'||r.submission,'Your work needs correction. Open your task for the recorded instructions.','/operations?view=Tasks&assignment='||h.assignment_id);end loop;
 else
 for h in select id from public.hris_users where operations_private.review_eligible(r.id,r.state='Awaiting BOD review',id) and (r.state='Awaiting BOD review' or r.reviewer_id is null or r.reviewer_id=id) loop perform operations_private.review_notice(h.id,case when r.critical then 'critical-pending:' else 'pending:' end||r.id||':'||r.submission||':'||r.state,'Work is ready for an independent review.','/operations?view=Review&review='||r.id);end loop;
 end if;
 if (case when r.state='Needs correction' then r.correction_due else r.review_due end)<now() then for h in select id from public.hris_users where operations_private.role_unit(id,r.business_unit_id,array['Admin','Board of Director','Business Unit Manager','GeneralManager']) loop perform operations_private.review_notice(h.id,'review-overdue:'||r.id||':'||r.submission||':'||r.state,'An important correction or review deadline has been missed.','/operations?view=Review&review='||r.id);end loop;end if;
 if r.state<>'Needs correction' and not exists(select 1 from public.hris_users where operations_private.review_eligible(r.id,r.state='Awaiting BOD review',id) and (r.state='Awaiting BOD review' or r.reviewer_id is null or r.reviewer_id=id)) then for h in select id from public.hris_users where operations_private.role_unit(id,r.business_unit_id,array['Admin','Board of Director']) loop perform operations_private.review_notice(h.id,'reviewer-needed:'||r.id||':'||r.submission,'An independent reviewer is needed.','/operations?view=Review&review='||r.id);end loop;end if;
 end loop;
 for i in select x.*,q.business_unit_id from operations_private.review_issues x join operations_private.reviews q on q.id=x.review_id where x.status<>'Resolved' and (x.severity='Critical' or x.due_at<now()) order by x.due_at limit 500 loop
 for h in select id from public.hris_users where operations_private.role_unit(id,i.business_unit_id,array['Admin','Board of Director','Business Unit Manager','GeneralManager']) loop perform operations_private.review_notice(h.id,'issue:'||i.id||':'||case when i.severity='Critical' then 'critical' else 'overdue' end,'An operational issue needs urgent management attention.','/operations?view=Review&review='||i.review_id);end loop;end loop;
 for i in select q.business_unit_id,x.responsible_id,count(distinct x.review_id) n,coalesce(s.repeat_count,3) threshold,coalesce(s.repeat_days,30) days from operations_private.review_issues x join operations_private.reviews q on q.id=x.review_id left join operations_private.review_settings s on s.business_unit_id=q.business_unit_id where x.confirmed_quality and x.cause='Execution quality' and x.responsible_id is not null and x.created_at>=now()-make_interval(days=>coalesce(s.repeat_days,30)) group by q.business_unit_id,x.responsible_id,s.repeat_count,s.repeat_days having count(distinct x.review_id)>=coalesce(s.repeat_count,3) limit 500 loop
 for h in select id from public.hris_users where operations_private.role_unit(id,i.business_unit_id,array['Admin','Board of Director','Business Unit Manager','GeneralManager']) loop perform operations_private.review_notice(h.id,'repeat:'||i.business_unit_id||':'||i.responsible_id||':'||to_char(now() at time zone 'Asia/Manila','IYYY-IW'),'Repeated confirmed quality incidents need management review.','/operations?view=Review&unit='||i.business_unit_id);end loop;end loop;
 for r in select * from operations_private.reviews where state='Executing' and coalesce(execution_due,original_due)<now() order by coalesce(execution_due,original_due) limit 500 loop
 for h in select id from public.hris_users where operations_private.role_unit(id,r.business_unit_id,array['Admin','Board of Director','Business Unit Manager','GeneralManager']) loop perform operations_private.review_notice(h.id,'work-overdue:'||r.id,'Assigned work is overdue and needs coverage or corrective action.','/operations?view=Review&review='||r.id);end loop;end loop;
 for u in select distinct q.business_unit_id from operations_private.reviews q where q.operating_date between (now() at time zone 'Asia/Manila')::date-7 and (now() at time zone 'Asia/Manila')::date loop
 for d in select distinct operating_date from operations_private.reviews where business_unit_id=u.business_unit_id and operating_date between (now() at time zone 'Asia/Manila')::date-7 and (now() at time zone 'Asia/Manila')::date loop
 select greatest((d+coalesce((select daily_time from operations_private.review_settings where business_unit_id=u.business_unit_id),time '23:00')) at time zone 'Asia/Manila',coalesce((select max(window_end) from public.ops_occurrences where business_unit_id=u.business_unit_id and operating_date=d),'-infinity'::timestamptz)) into review_end;
 if d>=(now() at time zone 'Asia/Manila')::date-1 and now()>=review_end and not exists(select 1 from operations_private.daily_reviews where business_unit_id=u.business_unit_id and operating_date=d and completed_at is not null and scope=operations_private.daily_scope(u.business_unit_id,d)) then for h in select id from public.hris_users where operations_private.role_unit(id,u.business_unit_id,array['Business Unit Manager','GeneralManager']) loop perform operations_private.review_notice(h.id,'daily:'||u.business_unit_id||':'||d,'Your daily Operations summary is ready for review.','/operations?view=Review&date='||d||'&unit='||u.business_unit_id);end loop;end if;
 if now()>=review_end+interval '24 hours' and not exists(select 1 from operations_private.daily_reviews where business_unit_id=u.business_unit_id and operating_date=d and completed_at is not null) then for h in select id from public.hris_users where operations_private.role_unit(id,u.business_unit_id,array['Admin','Board of Director']) loop perform operations_private.review_notice(h.id,'daily-missed:'||u.business_unit_id||':'||d,'A business unit has not completed its daily review.','/operations?view=Review&date='||d||'&unit='||u.business_unit_id);end loop;end if;
 end loop;end loop;
 if extract(isodow from now() at time zone 'Asia/Manila')=1 and (now() at time zone 'Asia/Manila')::time>=time '09:00' then
 for h in select distinct hh.id from public.hris_users hh join operations_private.reviews rr on rr.operating_date>=(now() at time zone 'Asia/Manila')::date-7 and operations_private.role_unit(hh.id,rr.business_unit_id,array['Admin','Board of Director']) loop perform operations_private.review_notice(h.id,'weekly:'||to_char(now() at time zone 'Asia/Manila','IYYY-IW'),'Your weekly Operations review summary is available.','/operations?view=Review');end loop;end if;
end$function$
;
CREATE OR REPLACE FUNCTION operations_private.assign(p_unit uuid, p_version uuid, p_selection jsonb, p_due timestamp with time zone, p_priority text, p_instructions text, p_attachments jsonb, p_verify boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare batch uuid;run uuid;x record;v public.ops_template_versions;kind text;begin
 if coalesce(p_selection->>'phase','1') not in('1','2') then raise exception 'Invalid execution phase';end if;
 batch:=operations_private.assign_phase1(p_unit,p_version,p_selection,p_due,p_priority,p_instructions,p_attachments,p_verify);
 if p_selection->>'phase'='2' then
 select * into v from public.ops_template_versions where id=p_version;select t.kind into kind from public.ops_templates t where t.id=v.template_id;
 for x in select a.id,a.checklist_run_id from public.ops_assignments a where a.batch_id=batch order by a.id loop
 run:=x.checklist_run_id;
 if run is null then insert into public.ops_checklist_runs(business_unit_id,template_version_id,created_by,execution_phase,shared) values(p_unit,p_version,operations_private.actor(),2,false) returning id into run;update public.ops_assignments set checklist_run_id=run where id=x.id;
 else update public.ops_checklist_runs set execution_phase=2 where id=run;end if;
 if not exists(select 1 from public.ops_run_items where run_id=run) then
 if kind='checklist' then insert into public.ops_run_items(run_id,ordinal,snapshot,required,response_type) select run,i.ordinal,i.snapshot,i.required,i.response_type from public.ops_checklist_items i where i.checklist_version_id=p_version;
 else insert into public.ops_run_items(run_id,ordinal,snapshot,required,response_type) values(run,0,v.content,true,coalesce(v.content->>'evidence','none'));end if;
 insert into public.ops_responses(item_id) select id from public.ops_run_items where run_id=run;
 end if;
 end loop;
 end if;
 if coalesce((p_selection->>'test_mode')::boolean,false) and not operations_private.role_unit(operations_private.actor(),p_unit,array['Admin']) then raise exception 'Admin access required for test mode';end if;
 perform operations_private.sync_checklist_cases();
 if p_selection->>'owner' is not null and not exists(select from public.ops_assignments where batch_id=batch and assignee_id=(p_selection->>'owner')::uuid) then raise exception 'Select an assigned owner';end if;
 update operations_private.checklist_cases c set test=coalesce((p_selection->>'test_mode')::boolean,false),owner_id=coalesce((p_selection->>'owner')::uuid,c.owner_id)
 where exists(select from public.ops_assignments a where a.batch_id=batch and coalesce(a.checklist_run_id,a.id)=c.work_id);
 return batch;
end $function$
;
revoke all on function operations_private.sync_checklist_cases(),operations_private.checklist_clock(),operations_private.checklist_shift_end(uuid,uuid,date,timestamptz,timestamptz),operations_private.case_active(uuid),operations_private.case_state(operations_private.checklist_cases) from public,anon,authenticated;