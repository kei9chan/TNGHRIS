-- Personal reminder deferral. Deadlines, recurrence, staffing and execution stay intact.
create table operations_private.ops_snoozes (
 assignment_id uuid primary key references public.ops_assignments(id),
 user_id uuid not null references public.hris_users(id),
 until_at timestamptz not null,
 revision integer not null default 1 check(revision>0),
 state text not null default 'Queued' check(state in('Queued','Sent','Stopped')),
 updated_at timestamptz not null default now(), wake_sent_at timestamptz
);
alter table operations_private.ops_snoozes enable row level security;
revoke all on operations_private.ops_snoozes from public,anon,authenticated;
create index ops_snoozes_due on operations_private.ops_snoozes(until_at) where state='Queued';
create index ops_snoozes_user on operations_private.ops_snoozes(user_id);

create function operations_private.can_snooze(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ops_assignments a join public.hris_users h on h.id=a.assignee_id
 where a.id=p_id and a.assignee_id=public.current_hris_user_id() and lower(h.status)='active'
 and operations_private.member(a.assignee_id,a.business_unit_id) and a.status in('Assigned','In Progress')
 and (a.occurrence_id is null or exists(select 1 from public.ops_occurrence_staff s join public.ops_occurrences o on o.id=s.occurrence_id where s.assignment_id=a.id and s.active and o.status='Open'))
 and (a.checklist_run_id is null or exists(select 1 from public.ops_checklist_runs r where r.id=a.checklist_run_id and r.submitted_at is null)))
$$;
create function operations_private.snooze_assignment(p_assignment uuid,p_revision integer,p_until timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();a public.ops_assignments;s operations_private.ops_snoozes;begin
 select * into a from public.ops_assignments where id=p_assignment;
 if a.occurrence_id is not null then perform 1 from public.ops_occurrences where id=a.occurrence_id for update;end if;
 if a.checklist_run_id is not null then perform 1 from public.ops_checklist_runs where id=a.checklist_run_id for update;end if;
 select * into a from public.ops_assignments where id=p_assignment for update;
 if not operations_private.can_snooze(p_assignment) then raise exception 'Only your current open assignment can be snoozed' using errcode='42501';end if;
 if p_until is null or not isfinite(p_until) or p_until<now()+interval '30 seconds' or p_until>now()+interval '366 days' then raise exception 'Choose a future snooze time within one year';end if;
 select * into s from operations_private.ops_snoozes where assignment_id=a.id for update;
 if p_revision is distinct from coalesce(s.revision,0) then raise exception 'Snooze changed; refresh before retrying';end if;
 insert into operations_private.ops_snoozes(assignment_id,user_id,until_at) values(a.id,actor,p_until)
 on conflict(assignment_id) do update set until_at=excluded.until_at,state='Queued',revision=ops_snoozes.revision+1,updated_at=now(),wake_sent_at=null;
 -- Discard queued personal reminders instead of releasing a backlog when snooze ends.
 update operations_private.ops_deliveries set state='Stopped' where occurrence_id=a.occurrence_id and recipient=actor and state='Queued' and event_key not like 'coverage:%';
 perform operations_private.audit_assignment(a.id,'Reminder snoozed',jsonb_build_object('note','Personal reminder snoozed','from',s.until_at,'until',p_until,'due_at',a.due_at));
 if a.occurrence_id is not null then perform operations_private.auto_audit((select rule_id from public.ops_occurrences where id=a.occurrence_id),a.occurrence_id,'Reminder snoozed',jsonb_build_object('employee_id',actor,'until',p_until,'due_at',a.due_at));end if;
end $$;
create function public.ops_snooze_assignment(p_assignment uuid,p_revision integer,p_until timestamptz) returns void language sql security definer set search_path='' as $$select operations_private.snooze_assignment(p_assignment,p_revision,p_until)$$;

alter function operations_private.workspace(uuid) rename to workspace_before_snooze;
create function operations_private.workspace(p_unit uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w jsonb:=operations_private.workspace_before_snooze(p_unit);begin
 return w||jsonb_build_object('assignments',(select coalesce(jsonb_agg(x||jsonb_build_object('can_snooze',operations_private.can_snooze((x->>'id')::uuid),'snooze',case when (x->>'assignee_id')::uuid=public.current_hris_user_id() then to_jsonb(s) else null end)),'[]') from jsonb_array_elements(w->'assignments') x left join operations_private.ops_snoozes s on s.assignment_id=(x->>'id')::uuid));
end $$;
create function operations_private.stop_snooze_on_close() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status in('Completed','Cancelled') then update operations_private.ops_snoozes set state='Stopped',revision=revision+1,updated_at=now() where assignment_id=new.id and state='Queued';end if;return new;
end $$;
create trigger ops_assignment_stop_snooze after update of status on public.ops_assignments for each row execute function operations_private.stop_snooze_on_close();

-- The existing minute worker sends one notification per saved snooze revision.
create function operations_private.wake_snoozes(p_now timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare candidate record;a public.ops_assignments;s operations_private.ops_snoozes;title text;begin
 for candidate in select assignment_id from operations_private.ops_snoozes where state='Queued' and until_at<=p_now order by until_at limit 200 loop
 select * into a from public.ops_assignments where id=candidate.assignment_id for update skip locked;
 if not found then continue;end if;
 select * into s from operations_private.ops_snoozes where assignment_id=a.id and state='Queued' and until_at<=p_now for update skip locked;
 if not found then continue;end if;
 if a.status not in('Assigned','In Progress') or not operations_private.member(s.user_id,a.business_unit_id)
 or not exists(select 1 from public.hris_users h where h.id=s.user_id and lower(h.status)='active')
 or (a.checklist_run_id is not null and exists(select 1 from public.ops_checklist_runs r where r.id=a.checklist_run_id and r.submitted_at is not null))
 or (a.occurrence_id is not null and not exists(select 1 from public.ops_occurrence_staff st join public.ops_occurrences o on o.id=st.occurrence_id where st.assignment_id=a.id and st.employee_id=s.user_id and st.active and o.status='Open')) then
 update operations_private.ops_snoozes set state='Stopped',updated_at=p_now where assignment_id=a.id;continue;end if;
 select coalesce(o.title,v.content->>'title','Assigned task') into title from public.ops_template_versions v left join public.ops_occurrences o on o.id=a.occurrence_id where v.id=a.template_version_id;
 insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key)
 values(s.user_id::text,'info',title,'Snooze ended. Your assigned work is still outstanding.','/operations?view=Tasks&assignment='||a.id,a.id::text,'ops-snooze:'||a.id||':'||s.revision) on conflict(user_id,dedupe_key) do nothing;
 update operations_private.ops_snoozes set state='Sent',wake_sent_at=p_now,updated_at=p_now where assignment_id=a.id;
 end loop;
end $$;
alter function operations_private.automation_tick() rename to automation_tick_before_snooze;
create function operations_private.automation_tick() returns void language plpgsql security definer set search_path='' as $$begin
 if not pg_try_advisory_xact_lock(746320019) then return;end if;
 perform operations_private.automation_tick_before_snooze();perform operations_private.wake_snoozes(now());
end $$;
-- Skip is no longer a user action. Historical records and recurrence rules remain untouched.
alter function operations_private.occ_action(uuid,integer,text,uuid,text,jsonb) rename to occ_action_before_snooze;
create function operations_private.occ_action(p_id uuid,p_revision integer,p_action text,p_employee uuid,p_note text,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 perform operations_private.actor();if p_action='skip' then raise exception 'Skipping is disabled. Use Snooze on your assigned task';end if;
 perform operations_private.occ_action_before_snooze(p_id,p_revision,p_action,p_employee,p_note,p_payload);
end $$;

create or replace function operations_private.queue_notices(p_occ uuid,p_now timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare o public.ops_occurrences;r public.ops_rules;s record;k text;msg text;begin
 select * into o from public.ops_occurrences where id=p_occ;select * into r from public.ops_rules where id=o.rule_id;
 if o.status<>'Open' then update operations_private.ops_deliveries set state='Stopped' where occurrence_id=o.id and state='Queued';return;end if;
 for s in select st.employee_id id from public.ops_occurrence_staff st join public.ops_assignments ax on ax.id=st.assignment_id where st.occurrence_id=o.id and st.active and ax.status not in('Completed','Cancelled') union select r.updated_by union select h.id from public.hris_users h where operations_private.role_unit(h.id,o.business_unit_id,array['Business Unit Manager']) loop
 k:=null;
 if o.coverage in('Uncovered','Schedule missing','No owner','At risk') and p_now>=o.window_start and (s.id=r.updated_by or operations_private.role_unit(s.id,o.business_unit_id,array['Business Unit Manager'])) then k:='coverage:'||o.coverage;msg:=o.coverage_reason;
 elsif p_now>o.due_at and coalesce((o.config->>'overdue_every')::int,0)>0 then k:='overdue:'||floor(extract(epoch from(p_now-o.due_at))/(60*(o.config->>'overdue_every')::int))::text;msg:='Outstanding work is overdue';
 elsif p_now>=o.due_at-make_interval(mins=>coalesce((o.config->>'remind_before')::int,0)) and p_now<=o.due_at and coalesce((o.config->>'remind_before')::int,0)>0 then k:='due';msg:='Assigned work is due soon';
 elsif exists(select 1 from public.ops_occurrence_staff where occurrence_id=o.id and employee_id=s.id and active) then k:='assigned';msg:='You are assigned for operating date '||o.operating_date::text;end if;
 if k is not null and k not like 'coverage:%' and exists(select 1 from operations_private.ops_snoozes sn join public.ops_assignments ax on ax.id=sn.assignment_id where ax.occurrence_id=o.id and sn.user_id=s.id and sn.state='Queued' and sn.until_at>p_now) then continue;end if;
 if k is not null then insert into operations_private.ops_deliveries(occurrence_id,recipient,event_key,title,message) values(o.id,s.id,k,o.title,msg) on conflict do nothing;end if;end loop;
end $$;
create or replace function operations_private.deliver_notices() returns void language plpgsql security definer set search_path='' as $$
declare d record;n uuid;begin
 for d in select x.* from operations_private.ops_deliveries x join public.ops_occurrences o on o.id=x.occurrence_id where x.state='Queued' and x.next_attempt_at<=now() and o.status='Open' order by x.next_attempt_at limit 200 for update of x skip locked loop
 begin
 if d.event_key not like 'coverage:%' and exists(select 1 from operations_private.ops_snoozes sn join public.ops_assignments ax on ax.id=sn.assignment_id where ax.occurrence_id=d.occurrence_id and sn.user_id=d.recipient and sn.state='Queued' and sn.until_at>now()) then update operations_private.ops_deliveries set state='Stopped' where id=d.id;continue;end if;
 if exists(select 1 from public.ops_occurrence_staff st join public.ops_assignments ax on ax.id=st.assignment_id where st.occurrence_id=d.occurrence_id and st.employee_id=d.recipient and (not st.active or ax.status in('Completed','Cancelled'))) and not exists(select 1 from public.ops_occurrences o join public.ops_rules r on r.id=o.rule_id where o.id=d.occurrence_id and (r.updated_by=d.recipient or operations_private.role_unit(d.recipient,o.business_unit_id,array['Business Unit Manager','GeneralManager','Admin','Board of Director']))) then update operations_private.ops_deliveries set state='Stopped' where id=d.id;continue;end if;
 if not exists(select 1 from public.hris_users h join public.ops_occurrences o on o.id=d.occurrence_id where h.id=d.recipient and lower(h.status)='active' and (operations_private.member(h.id,o.business_unit_id) or operations_private.role_unit(h.id,o.business_unit_id,array['Admin','Board of Director']))) then update operations_private.ops_deliveries set state='Stopped' where id=d.id;continue;end if;
 insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key) values(d.recipient::text,'info',d.title,d.message,case when d.event_key like 'coverage:%' then '/operations?view=Coverage' else '/operations?view=Tasks'||coalesce((select '&assignment='||ax.id from public.ops_assignments ax where ax.occurrence_id=d.occurrence_id and ax.assignee_id=d.recipient and ax.status in('Assigned','In Progress') limit 1),'') end,d.occurrence_id::text,'ops:'||d.occurrence_id||':'||d.event_key) on conflict(user_id,dedupe_key) do nothing returning id into n;
 if n is null then select id into n from public.notifications where user_id=d.recipient::text and dedupe_key='ops:'||d.occurrence_id||':'||d.event_key;end if;
 update operations_private.ops_deliveries set state='Sent',attempts=attempts+1,notification_id=n,last_error=null where id=d.id;
 exception when others then update operations_private.ops_deliveries set attempts=attempts+1,last_error=SQLERRM,next_attempt_at=now()+interval '5 minutes' where id=d.id;end;end loop;
end $$;

-- All mutation/worker internals are private; only the guarded signed-in RPC is new.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='operations_private' and p.proname in('can_snooze','snooze_assignment','workspace_before_snooze','workspace','stop_snooze_on_close','wake_snoozes','automation_tick_before_snooze','automation_tick','occ_action_before_snooze','occ_action','queue_notices','deliver_notices') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);end loop;
end $$;
revoke all on function public.ops_snooze_assignment(uuid,integer,timestamptz) from public,anon;
grant execute on function public.ops_snooze_assignment(uuid,integer,timestamptz) to authenticated;
