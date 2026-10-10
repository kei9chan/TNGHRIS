-- Operations automation is additive; canonical schedule/attendance writers are untouched.
create table public.ops_rules(
 id uuid primary key default gen_random_uuid(),business_unit_id uuid not null references public.business_units(id),
 title text not null,status text not null check(status in('Active','Paused','Archived')),revision integer not null default 1,
 template_version_id uuid not null references public.ops_template_versions(id),config jsonb not null,
 resume_from date not null,created_by uuid not null references public.hris_users(id),updated_by uuid not null references public.hris_users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),last_attempt_at timestamptz,last_success_at timestamptz,last_error text
);
create index ops_rules_unit on public.ops_rules(business_unit_id,status);
create index ops_rules_creator on public.ops_rules(created_by);create index ops_rules_updater on public.ops_rules(updated_by);create index ops_rules_template on public.ops_rules(template_version_id);
create table public.ops_rule_versions(id uuid primary key default gen_random_uuid(),rule_id uuid not null references public.ops_rules(id),revision integer not null,title text not null,template_version_id uuid not null references public.ops_template_versions(id),config jsonb not null,actor_id uuid not null references public.hris_users(id),created_at timestamptz not null default now(),unique(rule_id,revision));
create index ops_rule_versions_template on public.ops_rule_versions(template_version_id);create index ops_rule_versions_actor on public.ops_rule_versions(actor_id);
create table public.ops_occurrences(
 id uuid primary key default gen_random_uuid(),rule_id uuid not null references public.ops_rules(id),rule_version_id uuid not null references public.ops_rule_versions(id),
 business_unit_id uuid not null references public.business_units(id),operating_date date not null,title text not null,config jsonb not null,template_version_id uuid not null references public.ops_template_versions(id),
 window_start timestamptz not null,window_end timestamptz not null,due_at timestamptz not null,status text not null default 'Open' check(status in('Open','Completed','Skipped','Cancelled')),
 owner_id uuid references public.hris_users(id),shared_run_id uuid references public.ops_checklist_runs(id),revision integer not null default 1,override boolean not null default false,
 coverage text not null default 'Schedule missing',coverage_reason text not null default '',evaluated_at timestamptz,last_error text,created_at timestamptz not null default now(),
 unique(rule_id,operating_date),check(window_end>window_start)
);
create index ops_occurrences_unit_date on public.ops_occurrences(business_unit_id,operating_date);create index ops_occurrences_open on public.ops_occurrences(due_at) where status='Open';
create index ops_occurrences_version on public.ops_occurrences(rule_version_id);create index ops_occurrences_template on public.ops_occurrences(template_version_id);create index ops_occurrences_owner on public.ops_occurrences(owner_id);create index ops_occurrences_run on public.ops_occurrences(shared_run_id);
alter table public.ops_assignments add column occurrence_id uuid references public.ops_occurrences(id);create index ops_assignments_occurrence on public.ops_assignments(occurrence_id);
create table public.ops_occurrence_staff(occurrence_id uuid not null references public.ops_occurrences(id),employee_id uuid not null references public.hris_users(id),assignment_id uuid references public.ops_assignments(id),active boolean not null default true,confirmed_until timestamptz,confirmed_by uuid references public.hris_users(id),confirmed_note text,primary key(occurrence_id,employee_id));
create index ops_staff_employee on public.ops_occurrence_staff(employee_id);create index ops_staff_assignment on public.ops_occurrence_staff(assignment_id);create index ops_staff_confirmer on public.ops_occurrence_staff(confirmed_by);
create table public.ops_occurrence_audit(id uuid primary key default gen_random_uuid(),occurrence_id uuid references public.ops_occurrences(id),rule_id uuid references public.ops_rules(id),business_unit_id uuid not null references public.business_units(id),actor_id uuid references public.hris_users(id),actor_name text not null,action text not null,detail jsonb not null default '{}',created_at timestamptz not null default now());
create index ops_occ_audit_occurrence on public.ops_occurrence_audit(occurrence_id,created_at);create index ops_occ_audit_rule on public.ops_occurrence_audit(rule_id,created_at);create index ops_occ_audit_unit on public.ops_occurrence_audit(business_unit_id);create index ops_occ_audit_actor on public.ops_occurrence_audit(actor_id);
create table operations_private.ops_deliveries(id uuid primary key default gen_random_uuid(),occurrence_id uuid not null references public.ops_occurrences(id),recipient uuid not null references public.hris_users(id),event_key text not null,title text not null,message text not null,state text not null default 'Queued',attempts integer not null default 0,next_attempt_at timestamptz not null default now(),last_error text,notification_id uuid,unique(occurrence_id,recipient,event_key));
alter table operations_private.ops_deliveries enable row level security;revoke all on operations_private.ops_deliveries from public,anon,authenticated;
create index ops_deliveries_pending on operations_private.ops_deliveries(next_attempt_at) where state<>'Sent';create index ops_deliveries_recipient on operations_private.ops_deliveries(recipient);
create table operations_private.ops_automation_health(singleton boolean primary key default true check(singleton),last_attempt_at timestamptz,last_success_at timestamptz,last_error text);
alter table operations_private.ops_automation_health enable row level security;revoke all on operations_private.ops_automation_health from public,anon,authenticated;insert into operations_private.ops_automation_health(singleton) values(true);
create function operations_private.rule_manage(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.ops_rules r where r.id=p_id and (operations_private.manager(r.business_unit_id) or (r.created_by=public.current_hris_user_id() and operations_private.can_edit(r.business_unit_id) and exists(select 1 from public.ops_permissions p where p.business_unit_id=r.business_unit_id and p.user_id=public.current_hris_user_id() and p.can_assign))))$$;
create function operations_private.occ_view(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.ops_occurrences o where o.id=p_id and public.current_hris_user_id() is not null and (operations_private.rule_manage(o.rule_id) or exists(select 1 from public.ops_occurrence_staff s where s.occurrence_id=o.id and operations_private.can_view_assignment(s.assignment_id))))$$;
do $$declare t text;begin foreach t in array array['ops_rules','ops_rule_versions','ops_occurrences','ops_occurrence_staff','ops_occurrence_audit'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);end loop;end $$;
create policy ops_rules_read on public.ops_rules for select to authenticated using(operations_private.rule_manage(id));
create policy ops_rule_versions_read on public.ops_rule_versions for select to authenticated using(operations_private.rule_manage(rule_id));
create policy ops_occurrences_read on public.ops_occurrences for select to authenticated using(operations_private.occ_view(id));
create policy ops_occ_staff_read on public.ops_occurrence_staff for select to authenticated using(operations_private.occ_view(occurrence_id));
create policy ops_occ_audit_read on public.ops_occurrence_audit for select to authenticated using(case when occurrence_id is null then operations_private.rule_manage(rule_id) else operations_private.occ_view(occurrence_id) end);
create function operations_private.auto_audit(p_rule uuid,p_occ uuid,p_action text,p_detail jsonb,p_system boolean default false) returns void language plpgsql security definer set search_path='' as $$begin
 insert into public.ops_occurrence_audit(rule_id,occurrence_id,business_unit_id,actor_id,actor_name,action,detail) select r.id,p_occ,r.business_unit_id,public.current_hris_user_id(),case when p_system then 'Operations automation' else coalesce((select full_name from public.hris_users where id=public.current_hris_user_id()),'Operations automation') end,p_action,p_detail from public.ops_rules r where r.id=p_rule;
end $$;
-- Recurrence has explicit short-month behavior; no fabricated day 31.
create function operations_private.recurrence_due(c jsonb,d date) returns boolean language plpgsql immutable set search_path='' as $$
declare start_d date:=(c->>'start_date')::date;freq text:=c->>'frequency';n int:=coalesce((c->>'interval')::int,1);months int;target int;begin
 if coalesce(c->'excluded_dates','[]') ? d::text then return false;end if;
 if d<start_d or (nullif(c->>'end_date','') is not null and d>(c->>'end_date')::date) then return false;end if;
 if freq='once' then return d=start_d;elsif freq='daily' then return (d-start_d)%n=0;
 elsif freq='weekly' then return ((d-date_trunc('week',start_d)::date)/7)%n=0 and (c->'weekdays') @> to_jsonb(array[extract(isodow from d)::int]);
 elsif freq='monthly' then months:=(extract(year from d)::int-extract(year from start_d)::int)*12+extract(month from d)::int-extract(month from start_d)::int;target:=(c->>'month_day')::int;
 if c->>'short_month'='last' then target:=least(target,extract(day from(date_trunc('month',d)+interval '1 month' - interval '1 day'))::int);end if;
 return months%n=0 and extract(day from d)::int=target;end if;return false;
end $$;
create function operations_private.rule_people(p_unit uuid,c jsonb,p_scope boolean default true) returns table(id uuid,name text) language sql stable security definer set search_path='' as $$
 select h.id,h.full_name from public.hris_users h where operations_private.member(h.id,p_unit) and lower(h.status)='active'
 and (jsonb_array_length(coalesce(c->'employee_ids','[]'))=0 or c->'employee_ids' ? h.id::text)
 and (nullif(c->>'department_id','') is null or h.department_id::text=c->>'department_id')
 and (nullif(c->>'position','') is null or h.position=c->>'position')
 and (nullif(c->>'role','') is null or operations_private.role_unit(h.id,p_unit,array[c->>'role']))
 and (not p_scope or operations_private.can_assign(p_unit,h.id))
$$;
-- Sanitized operational labels; no leave explanation, destination or medical details returned.
create function operations_private.availability(p_employee uuid,p_unit uuid,p_date date,p_start timestamptz,p_end timestamptz,p_now timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare pub public.payroll_schedule_publications;sch jsonb;day jsonb;entry jsonb;entries jsonb;leaves jsonb;state text;label text;eligible boolean:=false;flex boolean:=false;imported record;last_action text;is_absent boolean:=false;source text:='HRIS attendance';starts timestamptz;ends timestamptz;warning text:='';begin
 if not operations_private.member(p_employee,p_unit) then return jsonb_build_object('employee_id',p_employee,'label','Inactive or outside unit','eligible',false,'present',false);end if;
 select * into pub from public.payroll_schedule_publications p where p.employee_id=p_employee and p.business_unit_id=p_unit and p_date between p.effective_from and p.effective_to and (not p.approval_required or exists(select 1 from public.payroll_schedule_overrides x where x.publication_id=p.id and x.decision='approve')) order by p.published_at desc,p.version desc limit 1;
 select coalesce(jsonb_agg(e order by e->>'start'),'[]') into entries from jsonb_array_elements(coalesce(pub.snapshot,'[]')) e where e->>'date'=p_date::text;
 sch:=private.attendance_schedule(p_employee,p_date);leaves:=coalesce(sch->'approvedLeave','[]');
 if pub.id is null or jsonb_array_length(entries)=0 then label:='Schedule missing';
 elsif exists(select 1 from jsonb_array_elements(entries) e where e->>'kind'='rest') and not exists(select 1 from jsonb_array_elements(entries) e where e->>'kind'='work') then label:='Rest day';
 elsif sch->>'statusTag'='suspended' then label:='Unavailable';
 elsif exists(select 1 from jsonb_array_elements(leaves) l where coalesce((l->>'fullDay')::boolean,false) or (nullif(l->>'startTime','') is not null and ((p_date+(l->>'startTime')::time) at time zone 'Asia/Manila')<p_end and ((p_date+(l->>'endTime')::time) at time zone 'Asia/Manila')>p_start)) then label:='Approved leave';
 elsif sch ? 'officialBusiness' then label:='Official Business — location requires confirmation';
 else
 for entry in select value from jsonb_array_elements(entries) loop
 if entry->>'statusTag'='absence' then is_absent:=true;end if;
 if entry->>'kind'<>'work' then continue;end if;
 if coalesce((entry->>'flexible')::boolean,false) then flex:=true;continue;end if;
 starts:=((p_date+(entry->>'start')::time) at time zone 'Asia/Manila');ends:=((p_date+coalesce((entry->>'endDayOffset')::int,case when (entry->>'end')::time<=(entry->>'start')::time then 1 else 0 end)+(entry->>'end')::time) at time zone 'Asia/Manila');
 -- Full configured task window must fit paid shift bounds; otherwise manager reviews timing.
 if starts<=p_start and ends>=p_end then eligible:=true;else if starts<p_end and ends>p_start then warning:='Execution window extends outside the published shift';end if;end if;
 end loop;
 if is_absent then label:='Confirmed absence';eligible:=false;
 elsif eligible then label:=case when p_now<p_start then 'Scheduled — shift not started' else 'Scheduled — attendance not confirmed' end;
 elsif flex then label:='Flexible shift — timing requires confirmation';else label:='Outside execution window';end if;
 end if;
 if eligible then
 if exists(select 1 from attendance_issues.requests a where a.employee_id=p_employee and a.work_date=p_date and a.kind='absence' and a.status in('pending','approved')) then
 label:=case when exists(select 1 from attendance_issues.requests a where a.employee_id=p_employee and a.work_date=p_date and a.kind='absence' and a.status='approved') then 'Confirmed absence' else 'Reported unavailable — review pending' end;eligible:=false;
 else
 day:=private.attendance_day(p_employee,p_date);state:=day->>'state';
 select a.day_status,a.events into imported from private.payroll_actual_days a where a.employee_id=p_employee and a.work_date=p_date order by a.updated_at desc limit 1;
 if found then
 source:='Confirmed attendance import';state:='not_started';
 select e->>'type' into last_action from jsonb_array_elements(imported.events) e where (e->>'timestamp')::timestamptz<=p_now order by (e->>'timestamp')::timestamptz desc limit 1;
 state:=case last_action when 'ClockIn' then 'working' when 'BreakEnd' then 'working' when 'BreakStart' then 'on_break' when 'ClockOut' then 'completed' else 'not_started' end;
 if lower(imported.day_status)='absent' then label:='Confirmed absence';eligible:=false;end if;
 end if;
 if eligible then label:=case when p_now<p_start then 'Scheduled — shift not started' when state='working' then 'On duty' when state='on_break' then 'On break' when state='completed' then 'Shift completed' when not coalesce((day->>'requiresClock')::boolean,true) then 'Clock-in exempt — presence not confirmed' else 'Scheduled — attendance not confirmed' end;if state='completed' and p_now>=p_start then eligible:=false;end if;
 end if;
 end if;end if;
 return jsonb_build_object('employee_id',p_employee,'label',label,'eligible',eligible,'present',eligible and label in('On duty','On break') and p_now>=p_start and p_now<p_end,'publication_id',pub.id,'schedule',entries,'source',source,'warning',warning);
end $$;
create function operations_private.rule_window(c jsonb,d date,p_unit uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s timestamptz;e timestamptz;due timestamptz;pub public.payroll_schedule_publications;entry jsonb;ref uuid:=nullif(c->>'reference_employee','')::uuid;anchor text:=coalesce(c->>'anchor','fixed');begin
 if anchor='fixed' then
 s:=((d+(c->>'start_time')::time) at time zone(c->>'timezone'));
 e:=((d+coalesce((c->>'end_day_offset')::int,0)+(c->>'end_time')::time) at time zone(c->>'timezone'));
 due:=((d+coalesce((c->>'due_day_offset')::int,0)+(c->>'due_time')::time) at time zone(c->>'timezone'));
 else
 select * into pub from public.payroll_schedule_publications p where p.employee_id=ref and p.business_unit_id=p_unit and d between p.effective_from and p.effective_to and (not p.approval_required or exists(select 1 from public.payroll_schedule_overrides x where x.publication_id=p.id and x.decision='approve')) order by p.published_at desc,p.version desc limit 1;
 select x into entry from jsonb_array_elements(coalesce(pub.snapshot,'[]')) x where x->>'date'=d::text and x->>'kind'='work' and not coalesce((x->>'flexible')::boolean,false) order by x->>'start' limit 1;
 if entry is null then
 return operations_private.rule_window(c||jsonb_build_object('anchor','fixed'),d,p_unit)||jsonb_build_object('warning','Reference employee has no published timed shift; fallback window needs manager review');end if;
 s:=((d+case when anchor='shift_end' then coalesce((entry->>'endDayOffset')::int,case when (entry->>'end')::time<=(entry->>'start')::time then 1 else 0 end) else 0 end+case when anchor='shift_end' then (entry->>'end')::time else (entry->>'start')::time end) at time zone 'Asia/Manila')+make_interval(mins=>(c->>'start_offset')::int);
 e:=s+make_interval(mins=>(c->>'duration_minutes')::int);due:=s+make_interval(mins=>(c->>'due_offset')::int);
 end if;
 return jsonb_build_object('start',s,'end',e,'due',due);
end $$;
create function operations_private.validate_rule(u uuid,v uuid,c jsonb) returns void language plpgsql security definer set search_path='' as $$
declare x text;w jsonb;begin
 perform operations_private.actor();
 if not c ?& array['interval','horizon_days','grace_minutes','remind_before','overdue_every','employee_ids','backup_ids','end_day_offset','due_day_offset','start_time','end_time','due_time'] or exists(select 1 from jsonb_each(c) where key in('interval','horizon_days','grace_minutes','remind_before','overdue_every','end_day_offset','due_day_offset') and jsonb_typeof(value)<>'number') then raise exception 'Rule timing and staffing fields are required';end if;
 if not operations_private.can_edit(u) or not (operations_private.manager(u) or exists(select 1 from public.ops_permissions where user_id=public.current_hris_user_id() and business_unit_id=u and can_assign)) then raise exception 'Rule management is not authorized' using errcode='42501';end if;
 if not exists(select 1 from public.ops_template_versions z join public.ops_templates t on t.id=z.template_id where z.id=v and (t.business_unit_id=u or t.business_unit_id is null)) then raise exception 'Published version is outside this workspace';end if;
 if c->>'frequency' not in('once','daily','weekly','monthly') or c->>'mode' not in('fixed','shift') or c->>'execution' not in('shared','individual') or c->>'timezone'<>'Asia/Manila' or c->>'anchor' not in('fixed','shift_start','shift_end') then raise exception 'Invalid recurrence, assignment mode or timezone';end if;
 if c->>'frequency' is null or c->>'mode' is null or c->>'execution' is null or c->>'timezone' is null or c->>'anchor' is null or nullif(c->>'start_date','') is null then raise exception 'Rule configuration is incomplete';end if;
 if (c->>'interval')::int not between 1 and 12 or (c->>'horizon_days')::int not between 0 and 31 or (c->>'grace_minutes')::int not between 0 and 240 or (c->>'remind_before')::int not between 0 and 1440 or (c->>'overdue_every')::int not between 0 and 1440 or ((c->>'overdue_every')::int>0 and (c->>'overdue_every')::int<60) then raise exception 'Invalid recurrence or reminder interval';end if;
 if nullif(c->>'end_date','')::date<(c->>'start_date')::date then raise exception 'End date precedes start date';end if;
 if jsonb_typeof(c->'employee_ids')<>'array' or jsonb_typeof(c->'backup_ids')<>'array' then raise exception 'Employee pools must be arrays';end if;
 if c->>'frequency'='weekly' and (c->'weekdays' is null or jsonb_typeof(c->'weekdays')<>'array' or jsonb_array_length(c->'weekdays')=0 or exists(select 1 from jsonb_array_elements_text(c->'weekdays') d where d::int not between 1 and 7)) then raise exception 'Select weekdays';end if;
 if c->>'frequency'='monthly' and (c->>'month_day' is null or c->>'short_month' is null or (c->>'month_day')::int not between 1 and 31 or c->>'short_month' not in('skip','last')) then raise exception 'Invalid monthly rule';end if;
 if nullif(c->>'department_id','') is not null and not exists(select 1 from public.departments where id=(c->>'department_id')::uuid and business_unit_id=u) then raise exception 'Department is outside this unit';end if;
 for x in select value from jsonb_array_elements_text(c->'employee_ids') loop if not operations_private.can_assign(u,x::uuid) then raise exception 'Employee is outside authorized assignment scope';end if;end loop;
 if not exists(select 1 from operations_private.rule_people(u,c)) then raise exception 'No eligible employees in this pool';end if;
 for x in select value from jsonb_array_elements_text(c->'backup_ids') union select nullif(c->>'preferred_owner','') union select nullif(c->>'reference_employee','') loop
 if x is not null and not exists(select 1 from operations_private.rule_people(u,c) where id=x::uuid) then raise exception 'Owner, backup and shift reference must belong to the authorized pool';end if;end loop;
 if exists(select 1 from jsonb_array_elements_text(coalesce(c->'excluded_dates','[]')) d where d !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'Non-operating dates must be YYYY-MM-DD';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(c->'attachments','[]')) a where a->>'url' !~ '^https?://' or a->>'url' is null) then raise exception 'Attachment links must use http or https';end if;
 if coalesce(c->>'priority','Normal') not in('Low','Normal','High','Urgent') then raise exception 'Invalid priority';end if;
 if (c->>'end_day_offset')::int not between 0 and 1 or (c->>'due_day_offset')::int not between 0 and 1 then raise exception 'Invalid operating date offset';end if;
 w:=operations_private.rule_window(c||jsonb_build_object('anchor','fixed'),(c->>'start_date')::date,u);
 if (w->>'end')::timestamptz<=(w->>'start')::timestamptz or (w->>'due')::timestamptz<(w->>'start')::timestamptz or (w->>'due')::timestamptz>(w->>'end')::timestamptz then raise exception 'Deadline must fall within a nonempty execution window';end if;
 if c->>'anchor'<>'fixed' and (nullif(c->>'reference_employee','') is null or (c->>'duration_minutes')::int not between 1 and 1440 or (c->>'due_offset')::int not between 0 and (c->>'duration_minutes')::int or abs((c->>'start_offset')::int)>1440) then raise exception 'Invalid published shift timing';end if;
end $$;
create function operations_private.save_rule(p_id uuid,p_unit uuid,p_title text,p_version uuid,p_config jsonb,p_status text,p_revision int,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.ops_rules;begin
 if not(p_id is not null and p_status<>'Active' and exists(select 1 from public.ops_rules where id=p_id and business_unit_id=p_unit and template_version_id=p_version and config=p_config)) then perform operations_private.validate_rule(p_unit,p_version,p_config);else perform operations_private.actor();end if;
 if length(trim(p_title)) not between 3 and 180 or p_status not in('Active','Paused','Archived') then raise exception 'Invalid title or status';end if;
 if p_id is null then insert into public.ops_rules(business_unit_id,title,status,template_version_id,config,resume_from,created_by,updated_by) values(p_unit,trim(p_title),p_status,p_version,p_config,(now() at time zone 'Asia/Manila')::date,operations_private.actor(),operations_private.actor()) returning * into r;
 else select * into r from public.ops_rules where id=p_id for update;
 if not found or not operations_private.rule_manage(p_id) or r.business_unit_id<>p_unit then raise exception 'Rule is not authorized';end if;
 if r.revision<>p_revision then raise exception 'Rule changed; refresh before saving';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception 'A reason is required for rule changes';end if;
 update public.ops_rules set title=trim(p_title),status=p_status,template_version_id=p_version,config=p_config,revision=revision+1,updated_by=operations_private.actor(),updated_at=now(),resume_from=case when r.status<>'Active' and p_status='Active' then (now() at time zone 'Asia/Manila')::date else resume_from end where id=p_id returning * into r;
 end if;
 insert into public.ops_rule_versions(rule_id,revision,title,template_version_id,config,actor_id) values(r.id,r.revision,r.title,r.template_version_id,r.config,r.updated_by);
 perform operations_private.auto_audit(r.id,null,'Rule saved',jsonb_build_object('revision',r.revision,'status',r.status,'reason',p_note));return r.id;
end $$;
create function operations_private.preview_rule(p_unit uuid,p_version uuid,p_config jsonb,p_from date,p_days int) returns jsonb language plpgsql security definer set search_path='' as $$
declare d date;w jsonb;pool jsonb;rows jsonb:='[]';begin
 perform operations_private.validate_rule(p_unit,p_version,p_config);if p_days not between 1 and 31 then raise exception 'Preview is limited to 31 days';end if;
 for d in select p_from+x from generate_series(0,p_days-1) x loop if not operations_private.recurrence_due(p_config,d) then continue;end if;
 w:=operations_private.rule_window(p_config,d,p_unit);
 select coalesce(jsonb_agg(operations_private.availability(p.id,p_unit,d,(w->>'start')::timestamptz,(w->>'end')::timestamptz,now())||jsonb_build_object('name',p.name)),'[]') into pool from operations_private.rule_people(p_unit,p_config) p;
 rows:=rows||jsonb_build_array(jsonb_build_object('date',d,'window',w,'people',pool));end loop;return rows;
end $$;
-- Pinned published versions are copied directly; manual assignment still requires latest publication.
create function operations_private.add_staff(p_occ uuid,p_employee uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.ops_occurrences;v public.ops_template_versions;kind text;run uuid;a uuid;begin
 select * into o from public.ops_occurrences where id=p_occ;select * into v from public.ops_template_versions where id=o.template_version_id;
 select assignment_id into a from public.ops_occurrence_staff where occurrence_id=p_occ and employee_id=p_employee and active;if found then return a;end if;
 if not operations_private.can_assign(o.business_unit_id,p_employee) then raise exception 'Assignee outside authorized scope';end if;
 select t.kind into kind from public.ops_templates t where t.id=v.template_id;
 run:=case when o.config->>'execution'='shared' then o.shared_run_id else null end;
 if run is null then
 insert into public.ops_checklist_runs(business_unit_id,template_version_id,created_by,execution_phase,shared) values(o.business_unit_id,v.id,operations_private.actor(),2,o.config->>'execution'='shared') returning id into run;
 if kind='checklist' then insert into public.ops_run_items(run_id,ordinal,snapshot,required,response_type) select run,ordinal,snapshot,required,response_type from public.ops_checklist_items where checklist_version_id=v.id;
 else insert into public.ops_run_items(run_id,ordinal,snapshot,required,response_type) values(run,0,v.content,true,coalesce(v.content->>'evidence','none'));end if;
 insert into public.ops_responses(item_id) select id from public.ops_run_items where run_id=run;
 if o.config->>'execution'='shared' then update public.ops_occurrences set shared_run_id=run where id=p_occ;end if;end if;
 insert into public.ops_assignments(batch_id,business_unit_id,template_version_id,assignee_id,created_by,instructions,attachments,due_at,priority,requires_verification,verification_status,checklist_run_id,occurrence_id) values(gen_random_uuid(),o.business_unit_id,v.id,p_employee,operations_private.actor(),coalesce(o.config->>'instructions',''),coalesce(o.config->'attachments','[]'),o.due_at,coalesce(o.config->>'priority','Normal'),coalesce((o.config->>'requires_verification')::boolean,false),case when coalesce((o.config->>'requires_verification')::boolean,false) then 'Not yet implemented' else 'Not required' end,run,o.id) returning id into a;
 insert into public.ops_occurrence_staff(occurrence_id,employee_id,assignment_id) values(o.id,p_employee,a) on conflict(occurrence_id,employee_id) do update set assignment_id=excluded.assignment_id,active=true;
 perform operations_private.audit_assignment(a,'Assigned',jsonb_build_object('rule_id',o.rule_id,'operating_date',o.operating_date));return a;
end $$;
create function operations_private.started(p_occ uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.ops_assignments a where a.occurrence_id=p_occ and (a.status in('In Progress','Completed') or exists(select 1 from public.ops_run_items i left join public.ops_responses s on s.item_id=i.id where i.run_id=a.checklist_run_id and (s.actor_id is not null or exists(select 1 from public.ops_evidence e where e.item_id=i.id)))))$$;
create function operations_private.remove_staff(p_occ uuid,p_employee uuid,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare a uuid;begin
 select assignment_id into a from public.ops_occurrence_staff where occurrence_id=p_occ and employee_id=p_employee and active;
 if a is not null then
 perform 1 from public.ops_checklist_runs r join public.ops_assignments x on x.checklist_run_id=r.id where x.id=a for update of r;
 update public.ops_occurrence_staff set active=false where occurrence_id=p_occ and employee_id=p_employee;
 update public.ops_assignments set status='Cancelled',revision=revision+1,updated_at=now() where id=a and status in('Assigned','In Progress');
 perform operations_private.audit_assignment(a,'Staff removed',jsonb_build_object('note',p_note));end if;
end $$;
create function operations_private.evaluate_occurrence(p_occ uuid,p_now timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare o public.ops_occurrences;a jsonb;staff_rec record;covered bool:=false;planned bool:=false;risky bool:=false;eligible_count int:=0;missing bool:=false;label text;reason text;begin
 select * into o from public.ops_occurrences where id=p_occ for update;
 if o.status in('Skipped','Cancelled') then label:=o.status;reason:='Closed by manager';
 elsif exists(select 1 from public.ops_assignments where occurrence_id=o.id) and not exists(select 1 from public.ops_assignments where occurrence_id=o.id and status<>'Cancelled') and o.override then label:='Cancelled';reason:='All assignments cancelled';update public.ops_occurrences set status='Cancelled' where id=o.id;
 elsif exists(select 1 from public.ops_occurrence_staff where occurrence_id=o.id and active) and not exists(select 1 from public.ops_assignments x join public.ops_occurrence_staff s on s.assignment_id=x.id where s.occurrence_id=o.id and s.active and x.status<>'Completed') then label:='Completed';reason:='All active work submitted';update public.ops_occurrences set status='Completed' where id=o.id;
 else
 for staff_rec in select p.id,st.confirmed_until,st.active from (select id from operations_private.rule_people(o.business_unit_id,o.config) union select employee_id from public.ops_occurrence_staff where occurrence_id=o.id and active) p left join public.ops_occurrence_staff st on st.occurrence_id=o.id and st.employee_id=p.id loop
 a:=operations_private.availability(staff_rec.id,o.business_unit_id,o.operating_date,o.window_start,o.window_end,p_now);
 if a->>'label'='Schedule missing' then missing:=true;end if;
 if (a->>'eligible')::bool or (staff_rec.active and staff_rec.confirmed_until>p_now and a->>'label' in('Flexible shift — timing requires confirmation','Official Business — location requires confirmation')) then eligible_count:=eligible_count+1;end if;
 if staff_rec.active and (o.config->>'execution'='individual' or staff_rec.id=o.owner_id) then
 if not (a->>'eligible')::bool and not(staff_rec.confirmed_until>p_now and a->>'label' in('Flexible shift — timing requires confirmation','Official Business — location requires confirmation')) then risky:=true;end if;
 if (a->>'present')::bool or (staff_rec.confirmed_until>p_now and p_now>=o.window_start and p_now<o.window_end and a->>'label' not in('Rest day','Approved leave','Confirmed absence','Inactive or outside unit','Unavailable')) then covered:=true;
 elsif (a->>'eligible')::bool and p_now<o.window_start then planned:=true;else risky:=true;end if;
 end if;end loop;
 if o.config->>'execution'='shared' and o.owner_id is null then label:=case when eligible_count=0 and missing then 'Schedule missing' when eligible_count=0 then 'Uncovered' else 'No owner' end;reason:='A named responsible person is required';
 elsif eligible_count=0 then label:=case when missing then 'Schedule missing' else 'Uncovered' end;reason:='No confirmed eligible person covers this window';
 elsif risky then label:=case when p_now<o.window_start+make_interval(mins=>coalesce((o.config->>'grace_minutes')::int,15)) then 'Needs confirmation' else 'At risk' end;reason:='Responsibility or presence needs manager review; missing clock-in is not absence';
 elsif covered then label:='Covered';reason:='Responsible staff presence confirmed';elsif planned then label:='Planned';reason:='Published shift covers the future execution window';else label:='Needs confirmation';reason:='Confirm responsibility and presence';end if;
 if p_now>o.due_at then if label not in('No owner','Uncovered','Schedule missing') then label:='At risk';end if;reason:=reason||'; deadline passed with outstanding work';end if;
 if o.config ? 'timing_warning' then label:='At risk';reason:=o.config->>'timing_warning';end if;
 end if;
 if label is distinct from o.coverage or reason is distinct from o.coverage_reason then
 update public.ops_occurrences set coverage=label,coverage_reason=reason,evaluated_at=p_now,revision=revision+1 where id=o.id;
 perform operations_private.auto_audit(o.rule_id,o.id,'Coverage changed',jsonb_build_object('from',o.coverage,'to',label,'reason',reason),true);
 else update public.ops_occurrences set evaluated_at=p_now where id=o.id;end if;
end $$;
create function operations_private.reconcile(p_occ uuid,p_now timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare o public.ops_occurrences;r public.ops_rules;rv public.ops_rule_versions;w jsonb;p record;av jsonb;ids uuid[]:='{}';preferred uuid;did_start bool;begin
 select * into o from public.ops_occurrences where id=p_occ for update;select * into r from public.ops_rules where id=o.rule_id;
 if o.status<>'Open' then return;end if;perform 1 from public.ops_checklist_runs z where z.id in(select checklist_run_id from public.ops_assignments where occurrence_id=o.id) order by z.id for update;did_start:=operations_private.started(o.id);
 -- Once a rule is paused, future generation stops; existing assignments remain actionable.
 if not did_start and not o.override and r.status='Active' then
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
 if preferred is distinct from o.owner_id then update public.ops_occurrences set owner_id=preferred,revision=revision+1 where id=o.id;perform operations_private.auto_audit(r.id,o.id,'Owner selected',jsonb_build_object('from',o.owner_id,'to',preferred),true);end if;end if;end if;
 perform operations_private.evaluate_occurrence(o.id,p_now);
end $$;
create function operations_private.audit_assignment(p_id uuid,p_action text,p_detail jsonb) returns void language sql security definer set search_path='' as $$insert into public.ops_audit_log(business_unit_id,assignment_id,actor_id,action,detail) select business_unit_id,id,operations_private.actor(),p_action,p_detail from public.ops_assignments where id=p_id$$;
create function operations_private.occ_action(p_id uuid,p_revision int,p_action text,p_employee uuid,p_note text,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare o public.ops_occurrences;manager bool;av jsonb;old_owner uuid;p record;begin
 perform operations_private.actor();select * into o from public.ops_occurrences where id=p_id for update;
 if not found or not operations_private.occ_view(o.id) then raise exception 'Occurrence is not authorized' using errcode='42501';end if;
 manager:=operations_private.rule_manage(o.rule_id);perform 1 from public.ops_checklist_runs z where z.id in(select checklist_run_id from public.ops_assignments where occurrence_id=o.id) order by z.id for update;
 if o.revision<>p_revision then raise exception 'Responsibility changed; refresh before retrying';end if;
 if o.status<>'Open' then raise exception 'This occurrence is closed';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception 'A reason is required';end if;
 if p_action='claim' then
 if not coalesce((o.config->>'allow_claim')::bool,false) or o.owner_id is not null or o.config->>'execution'<>'shared' or p_employee<>operations_private.actor() or not exists(select 1 from public.ops_occurrence_staff where occurrence_id=o.id and employee_id=p_employee and active) then raise exception 'Claim is not permitted';end if;
 elsif not manager then raise exception 'Manager action is not authorized' using errcode='42501';end if;
 if p_action in('owner','handover','claim','add','confirm') then
 if not exists(select 1 from operations_private.rule_people(o.business_unit_id,o.config,p_action<>'claim') where id=p_employee) then raise exception 'Employee is outside the authorized pool';end if;
 av:=operations_private.availability(p_employee,o.business_unit_id,o.operating_date,o.window_start,o.window_end,now());
 if not(av->>'eligible')::bool and not(manager and av->>'label' in('Flexible shift — timing requires confirmation','Official Business — location requires confirmation')) then raise exception 'Employee is unavailable for this execution window';end if;
 if p_action='confirm' then
 if now()<o.window_start or now()>=o.window_end then raise exception 'Presence can only be confirmed within the execution window';end if;
 perform operations_private.add_staff(o.id,p_employee);
 update public.ops_occurrence_staff set confirmed_until=least(o.window_end,now()+interval '4 hours'),confirmed_by=operations_private.actor(),confirmed_note=p_note where occurrence_id=o.id and employee_id=p_employee;
 else
 if o.config->>'execution'='individual' and p_action in('owner','claim') then raise exception 'Individual executions each have their own responsible assignee';end if;
 if p_action='owner' and operations_private.started(o.id) and o.owner_id is distinct from p_employee then raise exception 'Started work requires explicit handover';end if;
 perform operations_private.add_staff(o.id,p_employee);
 if p_action in('owner','handover','claim') then old_owner:=o.owner_id;update public.ops_occurrences set owner_id=p_employee where id=o.id;
 if p_action='handover' and old_owner is not null and old_owner<>p_employee then perform operations_private.remove_staff(o.id,old_owner,p_note);end if;end if;
 end if;
 elsif p_action='remove' then
 if o.owner_id=p_employee then raise exception 'Handover responsibility before removing the owner';end if;perform operations_private.remove_staff(o.id,p_employee,p_note);
 elsif p_action in('skip','cancel') then
 for p in select employee_id from public.ops_occurrence_staff where occurrence_id=o.id and active loop perform operations_private.remove_staff(o.id,p.employee_id,p_note);end loop;
 update public.ops_occurrences set status=case when p_action='skip' then 'Skipped' else 'Cancelled' end where id=o.id;
 elsif p_action='reschedule' then
 if (p_payload->>'end')::timestamptz<=(p_payload->>'start')::timestamptz or (p_payload->>'due')::timestamptz not between (p_payload->>'start')::timestamptz and (p_payload->>'end')::timestamptz or p_payload->>'start' is null or p_payload->>'end' is null or p_payload->>'due' is null then raise exception 'Invalid execution window';end if;
 update public.ops_occurrences set window_start=(p_payload->>'start')::timestamptz,window_end=(p_payload->>'end')::timestamptz,due_at=(p_payload->>'due')::timestamptz,config=config-'timing_warning' where id=o.id;
 update public.ops_assignments set due_at=(p_payload->>'due')::timestamptz,revision=revision+1,updated_at=now() where occurrence_id=o.id and status in('Assigned','In Progress');
 else raise exception 'Unknown occurrence action';end if;
 update public.ops_occurrences set override=true,revision=revision+1 where id=o.id;
 perform operations_private.auto_audit(o.rule_id,o.id,p_action,jsonb_build_object('employee_id',p_employee,'previous_owner',o.owner_id,'reason',p_note,'payload',p_payload));perform operations_private.evaluate_occurrence(o.id,now());
end $$;
-- Removed staff keep history but immediately lose the right to contribute to automated work.
create or replace function operations_private.can_write_run(p_run uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ops_assignments a join public.ops_checklist_runs r on r.id=a.checklist_run_id where r.id=p_run and r.execution_phase=2 and r.submitted_at is null and a.assignee_id=public.current_hris_user_id() and a.status in('Assigned','In Progress') and operations_private.member(a.assignee_id,a.business_unit_id) and (a.occurrence_id is null or exists(select 1 from public.ops_occurrence_staff s join public.ops_occurrences o on o.id=s.occurrence_id where s.assignment_id=a.id and s.active and o.status='Open')))
$$;
create function operations_private.queue_notices(p_occ uuid,p_now timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare o public.ops_occurrences;r public.ops_rules;s record;k text;msg text;begin
 select * into o from public.ops_occurrences where id=p_occ;select * into r from public.ops_rules where id=o.rule_id;
 if o.status<>'Open' then update operations_private.ops_deliveries set state='Stopped' where occurrence_id=o.id and state='Queued';return;end if;
 for s in select employee_id id from public.ops_occurrence_staff where occurrence_id=o.id and active union select r.updated_by union select h.id from public.hris_users h where operations_private.role_unit(h.id,o.business_unit_id,array['Business Unit Manager']) loop
 k:=null;
 if o.coverage in('Uncovered','Schedule missing','No owner','At risk') and p_now>=o.window_start and (s.id=r.updated_by or operations_private.role_unit(s.id,o.business_unit_id,array['Business Unit Manager'])) then k:='coverage:'||o.coverage;msg:=o.coverage_reason;
 elsif p_now>o.due_at and coalesce((o.config->>'overdue_every')::int,0)>0 then k:='overdue:'||floor(extract(epoch from(p_now-o.due_at))/(60*(o.config->>'overdue_every')::int))::text;msg:='Outstanding work is overdue';
 elsif p_now>=o.due_at-make_interval(mins=>coalesce((o.config->>'remind_before')::int,0)) and p_now<=o.due_at and coalesce((o.config->>'remind_before')::int,0)>0 then k:='due';msg:='Assigned work is due soon';
 elsif exists(select 1 from public.ops_occurrence_staff where occurrence_id=o.id and employee_id=s.id and active) then k:='assigned';msg:='You are assigned for operating date '||o.operating_date::text;end if;
 if k is not null then insert into operations_private.ops_deliveries(occurrence_id,recipient,event_key,title,message) values(o.id,s.id,k,o.title,msg) on conflict do nothing;end if;end loop;
end $$;
create function operations_private.deliver_notices() returns void language plpgsql security definer set search_path='' as $$
declare d record;n uuid;begin
 for d in select x.* from operations_private.ops_deliveries x join public.ops_occurrences o on o.id=x.occurrence_id where x.state='Queued' and x.next_attempt_at<=now() and o.status='Open' order by x.next_attempt_at limit 200 for update of x skip locked loop
 begin
 if not exists(select 1 from public.hris_users h join public.ops_occurrences o on o.id=d.occurrence_id where h.id=d.recipient and lower(h.status)='active' and (operations_private.member(h.id,o.business_unit_id) or operations_private.role_unit(h.id,o.business_unit_id,array['Admin','Board of Director']))) then update operations_private.ops_deliveries set state='Stopped' where id=d.id;continue;end if;
 insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key) values(d.recipient::text,'info',d.title,d.message,'/operations?view=Coverage',d.occurrence_id::text,'ops:'||d.occurrence_id||':'||d.event_key) on conflict(user_id,dedupe_key) do nothing returning id into n;
 if n is null then select id into n from public.notifications where user_id=d.recipient::text and dedupe_key='ops:'||d.occurrence_id||':'||d.event_key;end if;
 update operations_private.ops_deliveries set state='Sent',attempts=attempts+1,notification_id=n,last_error=null where id=d.id;
 exception when others then update operations_private.ops_deliveries set attempts=attempts+1,last_error=SQLERRM,next_attempt_at=now()+interval '5 minutes' where id=d.id;end;end loop;
end $$;
create function operations_private.generate_rule(p_id uuid,p_now timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare r public.ops_rules;rv public.ops_rule_versions;d date;w jsonb;o uuid;today date:=(p_now at time zone 'Asia/Manila')::date;begin
 select * into r from public.ops_rules where id=p_id for update;
 perform operations_private.validate_rule(r.business_unit_id,r.template_version_id,r.config);
 update public.ops_rules set last_attempt_at=p_now where id=r.id;
 if r.status='Active' then
 select * into rv from public.ops_rule_versions where rule_id=r.id and revision=r.revision;
 for d in select x::date from generate_series(greatest(today-1,r.resume_from)::timestamp,(today+coalesce((r.config->>'horizon_days')::int,7))::timestamp,interval '1 day') x loop
 if not operations_private.recurrence_due(r.config,d) then continue;end if;
 w:=operations_private.rule_window(r.config,d,r.business_unit_id);
 if (w->>'end')::timestamptz<=p_now and d<today then continue;end if;
 insert into public.ops_occurrences(rule_id,rule_version_id,business_unit_id,operating_date,title,config,template_version_id,window_start,window_end,due_at) values(r.id,rv.id,r.business_unit_id,d,r.title,r.config||case when w ? 'warning' then jsonb_build_object('timing_warning',w->>'warning') else '{}'::jsonb end,r.template_version_id,(w->>'start')::timestamptz,(w->>'end')::timestamptz,(w->>'due')::timestamptz) on conflict(rule_id,operating_date) do nothing returning id into o;
 if o is not null then perform operations_private.auto_audit(r.id,o,'Occurrence generated',jsonb_build_object('rule_revision',r.revision,'operating_date',d),true);end if;end loop;end if;
 for o in select id from public.ops_occurrences where rule_id=r.id and (status='Open' or operating_date>=today-1) and operating_date<=today+31 order by coalesce(evaluated_at,'epoch'),due_at limit 200 loop
 perform operations_private.reconcile(o,p_now);perform operations_private.queue_notices(o,p_now);end loop;
 update public.ops_rules set last_success_at=p_now,last_error=null where id=r.id;
end $$;
create function operations_private.automation_tick() returns void language plpgsql security definer set search_path='' as $$
declare r record;old_sub text:=current_setting('request.jwt.claim.sub',true);old_claims text:=current_setting('request.jwt.claims',true);begin
 if not pg_try_advisory_xact_lock(746320019) then return;end if;
 update operations_private.ops_automation_health set last_attempt_at=now() where singleton;
 for r in select x.id,h.auth_user_id from public.ops_rules x join public.hris_users h on h.id=x.updated_by where (x.status<>'Archived' or exists(select 1 from public.ops_occurrences o where o.rule_id=x.id and o.status='Open')) order by coalesce(x.last_attempt_at,'epoch') limit 100 loop
 begin
 if r.auth_user_id is null then raise exception 'Rule manager has no authenticated HRIS account';end if;
 perform set_config('request.jwt.claim.sub',r.auth_user_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',r.auth_user_id)::text,true);
 perform operations_private.generate_rule(r.id,now());
 exception when others then update public.ops_rules set last_attempt_at=now(),last_error=SQLERRM where id=r.id;
 insert into public.ops_occurrence_audit(occurrence_id,rule_id,business_unit_id,actor_name,action,detail) select o.id,o.rule_id,o.business_unit_id,'Operations automation','Generation failed',jsonb_build_object('reason',SQLERRM) from public.ops_occurrences o where o.rule_id=r.id and o.status='Open' and o.coverage_reason is distinct from ('Rule evaluation failed: '||SQLERRM);
 update public.ops_occurrences set coverage='At risk',coverage_reason='Rule evaluation failed: '||SQLERRM,revision=revision+1 where rule_id=r.id and status='Open' and coverage_reason is distinct from ('Rule evaluation failed: '||SQLERRM);end;end loop;
 perform operations_private.deliver_notices();
 update operations_private.ops_automation_health set last_success_at=now(),last_error=null where singleton;
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 exception when others then
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 update operations_private.ops_automation_health set last_error=SQLERRM where singleton;
end $$;
create function operations_private.retry_rule(p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if not operations_private.rule_manage(p_id) then raise exception 'Rule retry is not authorized';end if;
 perform operations_private.generate_rule(p_id,now());perform operations_private.deliver_notices();
end $$;
create function operations_private.automation_workspace(p_unit uuid,p_date date) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 perform operations_private.actor();
 if p_unit is not null and not operations_private.member(public.current_hris_user_id(),p_unit) and not operations_private.manager(p_unit) then raise exception 'Workspace is not authorized';end if;
 -- Evaluation runs under the rule manager in the worker, never an employee's narrowed assignment scope.
 select jsonb_build_object('rules',(select coalesce(jsonb_agg(to_jsonb(r) order by r.title),'[]') from public.ops_rules r where (p_unit is null or r.business_unit_id=p_unit) and operations_private.rule_manage(r.id)),
 'health',case when exists(select 1 from public.ops_rules r where operations_private.rule_manage(r.id)) then (select to_jsonb(h) from operations_private.ops_automation_health h) else null end,
 'occurrences',(select coalesce(jsonb_agg((to_jsonb(o)-'config')||jsonb_build_object('shared',o.config->>'execution'='shared','can_manage',operations_private.rule_manage(o.rule_id),'can_claim',coalesce((o.config->>'allow_claim')::bool,false) and o.owner_id is null and o.config->>'execution'='shared' and exists(select 1 from public.ops_occurrence_staff s where s.occurrence_id=o.id and s.employee_id=public.current_hris_user_id() and s.active),'owner_name',(select full_name from public.hris_users where id=o.owner_id),
 'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',s.employee_id,'name',h.full_name,'assignment_id',s.assignment_id,'active',s.active,'confirmed_until',s.confirmed_until,'availability',operations_private.availability(s.employee_id,o.business_unit_id,o.operating_date,o.window_start,o.window_end,now()))),'[]') from public.ops_occurrence_staff s join public.hris_users h on h.id=s.employee_id where s.occurrence_id=o.id),
 'candidates',case when operations_private.rule_manage(o.rule_id) then (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'availability',operations_private.availability(p.id,o.business_unit_id,o.operating_date,o.window_start,o.window_end,now()))),'[]') from operations_private.rule_people(o.business_unit_id,o.config) p) else '[]'::jsonb end,
 'history',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from public.ops_occurrence_audit a where a.occurrence_id=o.id)) order by o.window_start),'[]') from public.ops_occurrences o where (p_unit is null or o.business_unit_id=p_unit) and (o.operating_date=p_date or (o.operating_date=p_date-1 and o.status='Open' and o.window_end>((p_date+time '00:00') at time zone 'Asia/Manila'))) and operations_private.occ_view(o.id))) into result;return result;
end $$;
create function public.ops_save_rule(p_id uuid,p_unit uuid,p_title text,p_version uuid,p_config jsonb,p_status text,p_revision int,p_note text) returns uuid language sql security definer set search_path='' as $$select operations_private.save_rule(p_id,p_unit,p_title,p_version,p_config,p_status,p_revision,p_note)$$;
create function public.ops_preview_rule(p_unit uuid,p_version uuid,p_config jsonb,p_from date,p_days int) returns jsonb language sql security definer set search_path='' as $$select operations_private.preview_rule(p_unit,p_version,p_config,p_from,p_days)$$;
create function public.ops_occurrence_action(p_id uuid,p_revision int,p_action text,p_employee uuid,p_note text,p_payload jsonb) returns void language sql security definer set search_path='' as $$select operations_private.occ_action(p_id,p_revision,p_action,p_employee,p_note,p_payload)$$;
create function public.ops_retry_rule(p_id uuid) returns void language sql security definer set search_path='' as $$select operations_private.retry_rule(p_id)$$;
create function public.ops_automation_workspace(p_unit uuid,p_date date) returns jsonb language sql security definer set search_path='' as $$select operations_private.automation_workspace(p_unit,p_date)$$;
-- Only guarded entrypoints and RLS predicates can execute as clients; no cron impersonation endpoint.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='operations_private' and p.proname in('rule_manage','occ_view','auto_audit','recurrence_due','rule_people','availability','rule_window','validate_rule','save_rule','preview_rule','add_staff','started','remove_staff','evaluate_occurrence','reconcile','audit_assignment','occ_action','queue_notices','deliver_notices','generate_rule','automation_tick','retry_rule','automation_workspace') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname in('ops_save_rule','ops_preview_rule','ops_occurrence_action','ops_retry_rule','ops_automation_workspace')) or (n.nspname='operations_private' and p.proname in('rule_manage','occ_view','save_rule','preview_rule','occ_action','retry_rule','automation_workspace')) loop execute format('revoke all on function %s from public,anon',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;
end $$;
do $$begin if exists(select 1 from pg_extension where extname='pg_cron') then perform cron.schedule('ops-recurring-work','* * * * *','select operations_private.automation_tick();');end if;end $$;

alter function operations_private.reopen_run(uuid,integer,text) rename to reopen_run_phase2;
create function operations_private.reopen_run(p_run uuid,p_revision integer,p_note text) returns void language plpgsql security definer set search_path='' as $$declare o uuid;r uuid;begin
 select occurrence_id into o from public.ops_assignments where checklist_run_id=p_run and occurrence_id is not null limit 1;
 if o is not null then perform 1 from public.ops_occurrences where id=o for update;end if;
 perform operations_private.reopen_run_phase2(p_run,p_revision,p_note);
 if o is not null then update public.ops_occurrences set status='Open',coverage='Needs confirmation',coverage_reason='Work reopened for corrections',revision=revision+1 where id=o returning rule_id into r;perform operations_private.auto_audit(r,o,'Work reopened',jsonb_build_object('reason',p_note));end if;
end $$;
revoke all on function operations_private.reopen_run_phase2(uuid,integer,text) from public,anon,authenticated;
revoke all on function operations_private.reopen_run(uuid,integer,text) from public,anon;
grant execute on function operations_private.reopen_run(uuid,integer,text) to authenticated;
