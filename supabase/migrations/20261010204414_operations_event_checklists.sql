-- Event stages reuse the existing authenticated Operations rules, runs and minute worker.
-- Event planning records are private; only guarded RPCs return authorized workspaces.
create table operations_private.ops_events(
 id uuid primary key default gen_random_uuid(),business_unit_id uuid not null references public.business_units(id),
 title text not null,description text not null default '',start_at timestamptz not null,end_at timestamptz not null,
 status text not null check(status in('Draft','Active','Cancelled','Archived')),revision int not null default 1,
 created_by uuid not null references public.hris_users(id),updated_by uuid not null references public.hris_users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(end_at>start_at)
);
create index ops_events_unit on operations_private.ops_events(business_unit_id,start_at);
create index ops_events_creator on operations_private.ops_events(created_by);create index ops_events_updater on operations_private.ops_events(updated_by);
create table operations_private.ops_event_stages(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references operations_private.ops_events(id),
 rule_id uuid not null unique references public.ops_rules(id),ordinal int not null,definition jsonb not null
);
create index ops_event_stages_event on operations_private.ops_event_stages(event_id,ordinal);
create table operations_private.ops_event_versions(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references operations_private.ops_events(id),revision int not null,
 snapshot jsonb not null,actor_id uuid not null references public.hris_users(id),reason text not null default '',created_at timestamptz not null default now(),unique(event_id,revision)
);
create index ops_event_window_lookup on public.ops_occurrences(business_unit_id,window_start,window_end) where config ? 'event_window';
create index ops_event_versions_actor on operations_private.ops_event_versions(actor_id);
do $$declare t text;begin foreach t in array array['ops_events','ops_event_stages','ops_event_versions'] loop execute format('alter table operations_private.%I enable row level security',t);execute format('revoke all on operations_private.%I from public,anon,authenticated',t);end loop;end $$;

create function operations_private.event_manage(u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.current_hris_user_id() is not null and operations_private.can_edit(u) and operations_private.manager(u)
$$;
create function operations_private.event_bounds(e jsonb,s jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare starts timestamptz;ends timestamptz;n int;begin
 if s->>'timing_mode'='fixed' then starts:=(s->>'fixed_start')::timestamptz;
 elsif s->>'timing_mode'='relative' and s->>'anchor' in('start','end') then
 starts:=(e->>case when s->>'anchor'='end' then 'end_at' else 'start_at' end)::timestamptz+make_interval(mins=>(s->>'offset_minutes')::int);
 else raise exception 'Choose a fixed date or event-relative stage start';end if;
 n:=(s->>'duration_minutes')::int;
 if starts is null or not isfinite(starts) or n is null or n not between 1 and 129600 or abs(coalesce((s->>'offset_minutes')::int,0))>525600 then raise exception 'Stage duration must be 1 minute to 90 days';end if;
 ends:=starts+make_interval(mins=>n);
 if s->>'finish_mode'='deadline' and ((s->>'fixed_deadline')::timestamptz is distinct from ends) then raise exception 'Stage duration must match its specific deadline';end if;
 if starts<(e->>'start_at')::timestamptz-interval '366 days' or ends>(e->>'end_at')::timestamptz+interval '366 days' then raise exception 'Stage dates must be within one year of the event';end if;
 return jsonb_build_object('start',starts,'end',ends,'due',ends);
end $$;
create function operations_private.event_config(e jsonb,s jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare w jsonb:=operations_private.event_bounds(e,s);d date:=((w->>'start')::timestamptz at time zone 'Asia/Manila')::date;begin
 return jsonb_build_object('frequency','once','interval',1,'start_date',d,'end_date','','mode',coalesce(s->>'mode','shift'),'execution',coalesce(s->>'execution','shared'),'timezone','Asia/Manila','anchor','fixed',
 'start_time','00:00','end_time','23:59','due_time','23:59','end_day_offset',0,'due_day_offset',0,'employee_ids',coalesce(s->'employee_ids','[]'),'backup_ids',coalesce(s->'backup_ids','[]'),'preferred_owner',coalesce(s->>'preferred_owner',''),'auto_backup',coalesce((s->>'auto_backup')::bool,false),'allow_claim',true,
 'horizon_days',31,'grace_minutes',15,'remind_before',30,'overdue_every',120,'priority',coalesce(s->>'priority','Normal'),'department_id',coalesce(s->>'department_id',''),'position',coalesce(s->>'position',''),'instructions',coalesce(s->>'instructions',''),'requires_verification',coalesce((s->>'requires_verification')::bool,false),'excluded_dates','[]'::jsonb,
 'event_window',w||jsonb_build_object('event_id',e->>'id','event_title',e->>'title','stage_title',s->>'title','event_start',e->>'start_at','event_end',e->>'end_at'));
end $$;
alter function operations_private.rule_window(jsonb,date,uuid) rename to rule_window_before_events;
create function operations_private.rule_window(c jsonb,d date,p_unit uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if c ? 'event_window' then return c->'event_window';end if;
 return operations_private.rule_window_before_events(c,d,p_unit);
end $$;
alter function operations_private.validate_rule(uuid,uuid,jsonb) rename to validate_rule_before_events;
create function operations_private.validate_rule(u uuid,v uuid,c jsonb) returns void language plpgsql security definer set search_path='' as $$
declare w jsonb:=c->'event_window';begin
 if not c ? 'event_window' then perform operations_private.validate_rule_before_events(u,v,c);return;end if;
 perform operations_private.validate_rule_before_events(u,v,c-'event_window');
 if c->>'frequency'<>'once' or c->>'anchor'<>'fixed' or c ? 'maintenance' or w->>'start' is null or w->>'end' is null or not isfinite((w->>'start')::timestamptz) or not isfinite((w->>'end')::timestamptz) or (w->>'end')::timestamptz<=(w->>'start')::timestamptz or (w->>'end')::timestamptz-(w->>'start')::timestamptz>interval '90 days' or w->>'due' is distinct from w->>'end' then raise exception 'Invalid event stage window';end if;
 if not exists(select 1 from public.ops_template_versions z join public.ops_templates t on t.id=z.template_id where z.id=v and t.kind='checklist' and t.status<>'Archived') then raise exception 'Choose a published, unarchived checklist';end if;
end $$;
-- A multi-day preparation window can be worked during any overlapping published shift.
-- Presence still reflects today's attendance, not a shift scheduled on another day.
create function operations_private.event_availability(p_employee uuid,p_unit uuid,p_start timestamptz,p_end timestamptz,p_now timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d date;pub public.payroll_schedule_publications;x jsonb;a jsonb;cur jsonb;ss timestamptz;ee timestamptz;ws timestamptz;we timestamptz;eligible bool:=false;present bool:=false;days jsonb:='[]';today date:=(p_now at time zone 'Asia/Manila')::date;begin
 for d in select t::date from generate_series(((p_start at time zone 'Asia/Manila')::date-1)::timestamp,(((p_end-interval '1 second') at time zone 'Asia/Manila')::date)::timestamp,interval '1 day') t loop
 select * into pub from public.payroll_schedule_publications z where z.employee_id=p_employee and z.business_unit_id=p_unit and d between z.effective_from and z.effective_to and (not z.approval_required or exists(select 1 from public.payroll_schedule_overrides b where b.publication_id=z.id and b.decision='approve')) order by z.published_at desc,z.version desc limit 1;
 a:=null;
 for x in select value from jsonb_array_elements(coalesce(pub.snapshot,'[]')) where value->>'date'=d::text and value->>'kind'='work' and not coalesce((value->>'flexible')::bool,false) loop
 ss:=((d+(x->>'start')::time) at time zone 'Asia/Manila');ee:=((d+coalesce((x->>'endDayOffset')::int,case when (x->>'end')::time<=(x->>'start')::time then 1 else 0 end)+(x->>'end')::time) at time zone 'Asia/Manila');
 ws:=greatest(ss,p_start);we:=least(ee,p_end);if we<=ws then continue;end if;
 a:=operations_private.availability_before_events(p_employee,p_unit,d,ws,we,p_now);
 if (a->>'eligible')::bool and we>p_now then eligible:=true;end if;
 if (a->>'present')::bool then present:=true;cur:=a;elsif today=d and cur is null then cur:=a;end if;
 days:=days||jsonb_build_array(jsonb_build_object('date',d,'start',ws,'end',we,'eligible',(a->>'eligible')::bool,'label',a->>'label'));
 end loop;
 if a is null then a:=operations_private.availability_before_events(p_employee,p_unit,d,greatest(p_start,(d+time '00:00') at time zone 'Asia/Manila'),least(p_end,(d+1+time '00:00') at time zone 'Asia/Manila'),p_now);if d=today and cur is null then cur:=a;end if;end if;
 end loop;
 return jsonb_build_object('employee_id',p_employee,'eligible',eligible,'present',present,'label',case when present then cur->>'label' when p_now<p_start and eligible then 'Scheduled — shift not started' when eligible then 'Scheduled within preparation window — check today’s coverage' else coalesce(cur->>'label','No remaining published shift in this window') end,'days',days,'warning',case when eligible and not present and p_now>=p_start then 'No attendance-confirmed responsibility at this time' else '' end);
end $$;
alter function operations_private.availability(uuid,uuid,date,timestamptz,timestamptz,timestamptz) rename to availability_before_events;
create function operations_private.availability(p_employee uuid,p_unit uuid,p_date date,p_start timestamptz,p_end timestamptz,p_now timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if exists(select 1 from public.ops_occurrences o where o.business_unit_id=p_unit and o.window_start=p_start and o.window_end=p_end and o.config ? 'event_window') then return operations_private.event_availability(p_employee,p_unit,p_start,p_end,p_now);end if;
 return operations_private.availability_before_events(p_employee,p_unit,p_date,p_start,p_end,p_now);
end $$;
-- Linked rules cannot be detached or edited through the generic rule API.
alter function operations_private.save_rule(uuid,uuid,text,uuid,jsonb,text,integer,text) rename to save_rule_before_events;
create function operations_private.save_rule(p_id uuid,p_unit uuid,p_title text,p_version uuid,p_config jsonb,p_status text,p_revision int,p_note text) returns uuid language plpgsql security definer set search_path='' as $$begin
 perform operations_private.actor();
 if p_config ? 'event_window' or exists(select 1 from operations_private.ops_event_stages where rule_id=p_id) then raise exception 'Edit event stages through Events';end if;
 return operations_private.save_rule_before_events(p_id,p_unit,p_title,p_version,p_config,p_status,p_revision,p_note);
end $$;
alter function operations_private.generate_rule(uuid,timestamptz) rename to generate_rule_before_events;
create function operations_private.generate_rule(p_id uuid,p_now timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare r public.ops_rules;rv public.ops_rule_versions;o uuid;w jsonb;begin
 select * into r from public.ops_rules where id=p_id for update;
 if not r.config ? 'event_window' then perform operations_private.generate_rule_before_events(p_id,p_now);return;end if;
 -- Closed event rules still evaluate retained historical work without requiring a now-transferred pool.
 if r.status='Active' then
 if not operations_private.event_manage(r.business_unit_id) then raise exception 'Event manager no longer has workspace access';end if;
 select * into rv from public.ops_rule_versions where rule_id=r.id and revision=r.revision;w:=r.config->'event_window';
 insert into public.ops_occurrences(rule_id,rule_version_id,business_unit_id,operating_date,title,config,template_version_id,window_start,window_end,due_at)
 values(r.id,rv.id,r.business_unit_id,(r.config->>'start_date')::date,r.title,r.config,r.template_version_id,(w->>'start')::timestamptz,(w->>'end')::timestamptz,(w->>'due')::timestamptz) on conflict(rule_id,operating_date) do nothing returning id into o;
 if o is not null then perform operations_private.auto_audit(r.id,o,'Event stage generated',jsonb_build_object('event_id',w->>'event_id'),true);end if;
 end if;
 for o in select id from public.ops_occurrences where rule_id=r.id and status='Open' loop perform operations_private.reconcile(o,p_now);perform operations_private.queue_notices(o,p_now);end loop;
 update public.ops_rules set last_attempt_at=p_now,last_success_at=p_now,last_error=null where id=r.id;
end $$;

create function operations_private.preview_event(p_unit uuid,p_event jsonb,p_stages jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;c jsonb;w jsonb;pool jsonb;rows jsonb:='[]';d date;coverage_days jsonb;day_count int;begin
 perform operations_private.actor();if not operations_private.event_manage(p_unit) then raise exception 'Event management is not authorized' using errcode='42501';end if;
 if p_event->>'title' is null or length(trim(p_event->>'title')) not between 3 and 120 or p_event->>'start_at' is null or p_event->>'end_at' is null or not isfinite((p_event->>'start_at')::timestamptz) or not isfinite((p_event->>'end_at')::timestamptz) or (p_event->>'end_at')::timestamptz<=(p_event->>'start_at')::timestamptz or (p_event->>'end_at')::timestamptz-(p_event->>'start_at')::timestamptz>interval '90 days' then raise exception 'Enter event title and a valid start/end within 90 days';end if;
 if jsonb_typeof(p_stages) is distinct from 'array' or jsonb_array_length(p_stages) not between 1 and 30 then raise exception 'An event needs 1 to 30 stages';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_stages) x)<>jsonb_array_length(p_stages) then raise exception 'Stage IDs must be unique';end if;
 for s in select value from jsonb_array_elements(p_stages) loop
 if length(trim(coalesce(s->>'title',''))) not between 3 and 50 or nullif(s->>'id','') is null then raise exception 'Enter a stage title (3 to 50 characters)';end if;
 c:=operations_private.event_config(p_event,s);w:=c->'event_window';perform operations_private.validate_rule(p_unit,(s->>'template_version_id')::uuid,c);
 select coalesce(jsonb_agg(operations_private.event_availability(p.id,p_unit,(w->>'start')::timestamptz,(w->>'end')::timestamptz,now())||jsonb_build_object('name',p.name)),'[]') into pool from operations_private.rule_people(p_unit,c) p;
 coverage_days:='[]';
 for d in select t::date from generate_series(((w->>'start')::timestamptz at time zone 'Asia/Manila')::date::timestamp,(((w->>'end')::timestamptz-interval '1 second') at time zone 'Asia/Manila')::date::timestamp,interval '1 day') t loop
 select count(*) into day_count from operations_private.rule_people(p_unit,c) p where (operations_private.event_availability(p.id,p_unit,greatest((w->>'start')::timestamptz,(d+time '00:00') at time zone 'Asia/Manila'),least((w->>'end')::timestamptz,(d+1+time '00:00') at time zone 'Asia/Manila'),now())->>'eligible')::bool;
 coverage_days:=coverage_days||jsonb_build_array(jsonb_build_object('date',d,'scheduled_staff',day_count));end loop;
 rows:=rows||jsonb_build_array(jsonb_build_object('id',s->>'id','title',s->>'title','window',w,'people',pool,'coverage_days',coverage_days,'warning',case when not exists(select 1 from jsonb_array_elements(pool) x where (x->>'eligible')::bool) then 'No scheduled staff covers this stage — assign or publish shifts before execution' when c->>'execution'='shared' and nullif(c->>'preferred_owner','') is null then 'Choose a responsible owner or have an assigned employee take responsibility' else '' end));
 end loop;return rows;
end $$;
create function operations_private.event_snapshot(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(e)||jsonb_build_object('stages',(select coalesce(jsonb_agg(s.definition||jsonb_build_object('id',s.id,'rule_id',s.rule_id) order by s.ordinal),'[]') from operations_private.ops_event_stages s where s.event_id=e.id)) from operations_private.ops_events e where e.id=p_id
$$;
create function operations_private.save_event(p_id uuid,p_unit uuid,p_revision int,p_event jsonb,p_stages jsonb,p_status text,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare e operations_private.ops_events;s jsonb;old operations_private.ops_event_stages;r public.ops_rules;c jsonb;eid uuid;rid uuid;i int:=0;o public.ops_occurrences;w jsonb;begin
 perform operations_private.actor();if not operations_private.event_manage(p_unit) then raise exception 'Event management is not authorized' using errcode='42501';end if;
 if p_status is null or p_status not in('Draft','Active') then raise exception 'Save as draft or publish the event';end if;
 if p_id is not null then select * into e from operations_private.ops_events where id=p_id for update;
 if not found or e.business_unit_id<>p_unit then raise exception 'Event is not authorized' using errcode='42501';end if;
 if e.revision is distinct from p_revision then raise exception 'Event changed; refresh before saving';end if;
 if e.status in('Cancelled','Archived') or (e.status='Active' and p_status='Draft') then raise exception 'Published/closed events cannot return to draft; duplicate for a new event';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception 'Enter a reason for event changes';end if;
 end if;
 eid:=coalesce(p_id,gen_random_uuid());p_event:=p_event||jsonb_build_object('id',eid);perform operations_private.preview_event(p_unit,p_event,p_stages);
 if p_status='Active' and (p_event->>'end_at')::timestamptz<=now() then raise exception 'Cannot publish an event that already ended';end if;
 if p_id is not null and exists(select 1 from operations_private.ops_event_stages z where z.event_id=eid and not exists(select 1 from jsonb_array_elements(p_stages) x where x->>'id'=z.id::text) ) then raise exception 'Saved stages cannot be removed; cancel the event or retain the stage';end if;
 -- Match the worker lock order: rule -> occurrence -> run -> assignment.
 perform 1 from public.ops_rules x join operations_private.ops_event_stages z on z.rule_id=x.id where z.event_id=eid order by x.id for update of x;
 perform 1 from public.ops_occurrences x join operations_private.ops_event_stages z on z.rule_id=x.rule_id where z.event_id=eid order by x.id for update of x;
 perform 1 from public.ops_checklist_runs x where x.id in(select a.checklist_run_id from public.ops_assignments a join public.ops_occurrences o2 on o2.id=a.occurrence_id join operations_private.ops_event_stages z on z.rule_id=o2.rule_id where z.event_id=eid) order by x.id for update;
 for s in select value from jsonb_array_elements(p_stages) loop
 select * into old from operations_private.ops_event_stages where id=(s->>'id')::uuid;
 if found and old.event_id<>eid then raise exception 'Stage belongs to another event' using errcode='42501';end if;
 c:=operations_private.event_config(p_event,s);
 if old.id is not null then select * into r from public.ops_rules where id=old.rule_id;
 if exists(select 1 from public.ops_occurrences x where x.rule_id=r.id and (operations_private.started(x.id) or x.override) and (x.config is distinct from c or x.template_version_id is distinct from (s->>'template_version_id')::uuid)) then raise exception 'Started or manually managed stages keep their original timing and staff; use responsibility handover or duplicate the event';end if;
 if r.template_version_id is distinct from (s->>'template_version_id')::uuid and exists(select 1 from public.ops_occurrences where rule_id=r.id) then raise exception 'Published stage checklist versions are frozen; add a new stage';end if;
 end if;
 end loop;
 if p_id is null then insert into operations_private.ops_events(id,business_unit_id,title,description,start_at,end_at,status,created_by,updated_by) values(eid,p_unit,trim(p_event->>'title'),coalesce(p_event->>'description',''),(p_event->>'start_at')::timestamptz,(p_event->>'end_at')::timestamptz,p_status,operations_private.actor(),operations_private.actor());
 else update operations_private.ops_events set title=trim(p_event->>'title'),description=coalesce(p_event->>'description',''),start_at=(p_event->>'start_at')::timestamptz,end_at=(p_event->>'end_at')::timestamptz,status=p_status,revision=revision+1,updated_by=operations_private.actor(),updated_at=now() where id=eid;end if;
 for s in select value from jsonb_array_elements(p_stages) loop
 i:=i+1;select * into old from operations_private.ops_event_stages where id=(s->>'id')::uuid;c:=operations_private.event_config(p_event,s);
 if old.id is not null then select * into r from public.ops_rules where id=old.rule_id;else r:=null;end if;
 rid:=operations_private.save_rule_before_events(old.rule_id,p_unit,trim(p_event->>'title')||' · '||trim(s->>'title'),(s->>'template_version_id')::uuid,c,case when p_status='Active' then 'Active' else 'Paused' end,r.revision,case when old.id is null then '' else p_note end);
 insert into operations_private.ops_event_stages(id,event_id,rule_id,ordinal,definition) values((s->>'id')::uuid,eid,rid,i,s-'rule_id') on conflict(id) do update set ordinal=excluded.ordinal,definition=excluded.definition;
 select * into o from public.ops_occurrences where rule_id=rid limit 1;
 if o.id is not null and not operations_private.started(o.id) and not o.override and o.status='Open' then
 w:=c->'event_window';update public.ops_occurrences set operating_date=(c->>'start_date')::date,window_start=(w->>'start')::timestamptz,window_end=(w->>'end')::timestamptz,due_at=(w->>'due')::timestamptz,title=trim(p_event->>'title')||' · '||trim(s->>'title'),config=c,revision=revision+1 where id=o.id;
 update public.ops_assignments set due_at=(w->>'due')::timestamptz,instructions=coalesce(c->>'instructions',''),priority=c->>'priority',revision=revision+1,updated_at=now() where occurrence_id=o.id and status in('Assigned','In Progress');
 perform operations_private.auto_audit(rid,o.id,'Event stage rescheduled',jsonb_build_object('reason',p_note,'previous_start',o.window_start,'previous_end',o.window_end,'window',w));
 for w in select to_jsonb(a) from public.ops_assignments a where a.occurrence_id=o.id and a.status in('Assigned','In Progress') loop perform operations_private.audit_assignment((w->>'id')::uuid,'Event stage updated',jsonb_build_object('note',p_note,'event_id',eid,'start',c->'event_window'->>'start','due',c->'event_window'->>'due'));end loop;
 end if;
 if p_status='Active' then perform operations_private.generate_rule(rid,now());end if;
 end loop;
 insert into operations_private.ops_event_versions(event_id,revision,snapshot,actor_id,reason) select eid,revision,operations_private.event_snapshot(eid),operations_private.actor(),coalesce(p_note,'') from operations_private.ops_events where id=eid;
 perform operations_private.deliver_notices();return eid;
end $$;
create function operations_private.event_state(p_id uuid,p_revision int,p_status text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare e operations_private.ops_events;s record;o public.ops_occurrences;begin
 perform operations_private.actor();select * into e from operations_private.ops_events where id=p_id for update;
 if not found or not operations_private.event_manage(e.business_unit_id) then raise exception 'Event is not authorized' using errcode='42501';end if;
 if e.revision is distinct from p_revision then raise exception 'Event changed; refresh before saving';end if;
 if p_status is null or p_status not in('Cancelled','Archived') or length(trim(coalesce(p_note,'')))<3 then raise exception 'Choose cancel/archive and enter a reason';end if;
 if e.status='Archived' or e.status=p_status then raise exception 'Event is already closed';end if;
 perform 1 from public.ops_rules x join operations_private.ops_event_stages z on z.rule_id=x.id where z.event_id=e.id order by x.id for update of x;
 if p_status='Archived' and exists(select 1 from public.ops_occurrences x join operations_private.ops_event_stages z on z.rule_id=x.rule_id where z.event_id=e.id and x.status='Open') then raise exception 'Finish or cancel outstanding event stages before archiving';end if;
 for s in select rule_id from operations_private.ops_event_stages where event_id=e.id order by rule_id loop
 for o in select * from public.ops_occurrences where rule_id=s.rule_id and status='Open' order by id for update loop
 perform operations_private.occ_action(o.id,o.revision,'cancel',null,p_note,'{}');end loop;
 update public.ops_rules set status='Archived',revision=revision+1,updated_at=now(),updated_by=operations_private.actor() where id=s.rule_id;
 insert into public.ops_rule_versions(rule_id,revision,title,template_version_id,config,actor_id) select id,revision,title,template_version_id,config,updated_by from public.ops_rules where id=s.rule_id;
 perform operations_private.auto_audit(s.rule_id,null,'Event '||lower(p_status),jsonb_build_object('event_id',e.id,'reason',p_note));end loop;
 update operations_private.ops_events set status=p_status,revision=revision+1,updated_at=now(),updated_by=operations_private.actor() where id=e.id;
 insert into operations_private.ops_event_versions(event_id,revision,snapshot,actor_id,reason) select e.id,revision,operations_private.event_snapshot(e.id),operations_private.actor(),p_note from operations_private.ops_events where id=e.id;
end $$;
create function operations_private.event_workspace(p_unit uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 perform operations_private.actor();if p_unit is not null and not operations_private.event_manage(p_unit) then raise exception 'Event workspace is not authorized' using errcode='42501';end if;
 return jsonb_build_object('events',(select coalesce(jsonb_agg(operations_private.event_snapshot(e.id)||jsonb_build_object('unit_name',(select name from public.business_units where id=e.business_unit_id),
 'progress',(select jsonb_build_object('total',count(*),'completed',count(*) filter(where o.status='Completed'),'open',count(*) filter(where o.status='Open'),'overdue',count(*) filter(where o.status='Open' and o.due_at<now())) from operations_private.ops_event_stages s join public.ops_occurrences o on o.rule_id=s.rule_id where s.event_id=e.id),
 'versions',(select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('actor_name',(select full_name from public.hris_users where id=v.actor_id)) order by v.revision desc),'[]') from operations_private.ops_event_versions v where v.event_id=e.id),
 'work',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'stage_id',s.id,'title',o.title,'status',o.status,'coverage',o.coverage,'coverage_reason',o.coverage_reason,'start',o.window_start,'end',o.window_end,'due',o.due_at,'revision',o.revision,'owner_name',(select full_name from public.hris_users where id=o.owner_id),'assignment_id',(select a.id from public.ops_assignments a where a.occurrence_id=o.id and operations_private.can_view_assignment(a.id) order by (a.assignee_id=public.current_hris_user_id()) desc,a.created_at limit 1)) order by s.ordinal),'[]') from operations_private.ops_event_stages s join public.ops_occurrences o on o.rule_id=s.rule_id where s.event_id=e.id)) order by e.start_at desc),'[]') from operations_private.ops_events e where (p_unit is null or e.business_unit_id=p_unit) and operations_private.event_manage(e.business_unit_id)));
end $$;
-- Frozen occurrence context is visible inside the ordinary authorized task detail.
alter function operations_private.workspace(uuid) rename to workspace_before_events;
create function operations_private.workspace(p_unit uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w jsonb:=operations_private.workspace_before_events(p_unit);begin
 return w||jsonb_build_object('assignments',(select coalesce(jsonb_agg(a||jsonb_build_object('event',case when o.config ? 'event_window' then o.config->'event_window'||jsonb_build_object('start',o.window_start,'end',o.window_end,'due',o.due_at,'owner_name',(select full_name from public.hris_users where id=o.owner_id),'coverage',o.coverage,'coverage_reason',o.coverage_reason,'occurrence_revision',o.revision,'can_claim',o.status='Open' and o.owner_id is null and o.config->>'execution'='shared' and exists(select 1 from public.ops_occurrence_staff z where z.occurrence_id=o.id and z.employee_id=public.current_hris_user_id() and z.active)) else null end)),'[]') from jsonb_array_elements(w->'assignments') a left join public.ops_occurrences o on o.id=(a->>'occurrence_id')::uuid));
end $$;
-- Multi-day event work stays visible in Coverage on every day of its window.
alter function operations_private.automation_workspace(uuid,date) rename to automation_workspace_before_events;
create function operations_private.automation_workspace(p_unit uuid,p_date date) returns jsonb language plpgsql security definer set search_path='' as $$
declare w jsonb:=operations_private.automation_workspace_before_events(p_unit,p_date);extra jsonb;begin
 select coalesce(jsonb_agg((to_jsonb(o)-'config')||jsonb_build_object('shared',o.config->>'execution'='shared','can_manage',operations_private.rule_manage(o.rule_id),'can_claim',o.owner_id is null and exists(select 1 from public.ops_occurrence_staff z where z.occurrence_id=o.id and z.employee_id=public.current_hris_user_id() and z.active),'owner_name',(select full_name from public.hris_users where id=o.owner_id),
 'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',s.employee_id,'name',h.full_name,'assignment_id',s.assignment_id,'active',s.active,'availability',operations_private.availability(s.employee_id,o.business_unit_id,o.operating_date,o.window_start,o.window_end,now()))),'[]') from public.ops_occurrence_staff s join public.hris_users h on h.id=s.employee_id where s.occurrence_id=o.id),'candidates',case when operations_private.rule_manage(o.rule_id) then (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'availability',operations_private.availability(p.id,o.business_unit_id,o.operating_date,o.window_start,o.window_end,now()))),'[]') from operations_private.rule_people(o.business_unit_id,o.config) p) else '[]'::jsonb end,'history',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from public.ops_occurrence_audit a where a.occurrence_id=o.id))),'[]') into extra from public.ops_occurrences o where o.config ? 'event_window' and o.status='Open' and (p_unit is null or o.business_unit_id=p_unit) and o.window_start<((p_date+1+time '00:00') at time zone 'Asia/Manila') and o.window_end>((p_date+time '00:00') at time zone 'Asia/Manila') and operations_private.occ_view(o.id) and not exists(select 1 from jsonb_array_elements(w->'occurrences') x where x->>'id'=o.id::text);
 return w||jsonb_build_object('rules',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(w->'rules') x where not x->'config' ? 'event_window'),'occurrences',(w->'occurrences')||extra);
end $$;
alter function operations_private.submit_run(uuid,integer) rename to submit_run_before_events;
create function operations_private.submit_run(p_run uuid,p_revision int) returns void language plpgsql security definer set search_path='' as $$declare o uuid;begin
 perform operations_private.submit_run_before_events(p_run,p_revision);
 select x.id into o from public.ops_occurrences x join public.ops_assignments a on a.occurrence_id=x.id where a.checklist_run_id=p_run and x.config ? 'event_window' limit 1;
 if o is not null then perform operations_private.evaluate_occurrence(o,now());end if;
end $$;
revoke all on function operations_private.submit_run_before_events(uuid,integer) from public,anon,authenticated;
revoke all on function operations_private.submit_run(uuid,integer) from public,anon;
grant execute on function operations_private.submit_run(uuid,integer) to authenticated;
create function public.ops_event_workspace(p_unit uuid) returns jsonb language sql security definer set search_path='' as $$select operations_private.event_workspace(p_unit)$$;
create function public.ops_preview_event(p_unit uuid,p_event jsonb,p_stages jsonb) returns jsonb language sql security definer set search_path='' as $$select operations_private.preview_event(p_unit,p_event,p_stages)$$;
create function public.ops_save_event(p_id uuid,p_unit uuid,p_revision int,p_event jsonb,p_stages jsonb,p_status text,p_note text) returns uuid language sql security definer set search_path='' as $$select operations_private.save_event(p_id,p_unit,p_revision,p_event,p_stages,p_status,p_note)$$;
create function public.ops_event_state(p_id uuid,p_revision int,p_status text,p_note text) returns void language sql security definer set search_path='' as $$select operations_private.event_state(p_id,p_revision,p_status,p_note)$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='operations_private' and p.proname in('event_manage','event_bounds','event_config','event_availability','event_snapshot','preview_event','save_event','event_state','event_workspace','rule_window','rule_window_before_events','validate_rule','validate_rule_before_events','availability','availability_before_events','save_rule','save_rule_before_events','generate_rule','generate_rule_before_events','workspace','workspace_before_events','automation_workspace','automation_workspace_before_events') or n.nspname='public' and p.proname in('ops_event_workspace','ops_preview_event','ops_save_event','ops_event_state') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.nspname='public' or f.proname in('workspace','save_rule','automation_workspace') then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;end $$;
