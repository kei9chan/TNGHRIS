-- Additive weekly compliance; never writes attendance, payroll or assignments.
create schema schedule_compliance;
revoke all on schema schedule_compliance from public,anon,authenticated;
create function schedule_compliance.hr() returns boolean language sql stable security definer set search_path='' as $$
 select public.current_hris_user_id() is not null and (public.has_active_role('HR Staff') or public.has_active_role('HR Manager') or public.has_active_role('Admin'));
$$;
create table schedule_compliance.settings (
 id boolean primary key default true check(id), days_before integer not null default 2 check(days_before between 1 and 7),
 deadline_time time not null default '23:59', changed_by uuid references public.hris_users(id), changed_at timestamptz not null default now()
);
insert into schedule_compliance.settings(id) values(true);
create table schedule_compliance.exemptions (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.hris_users(id),
 effective_from date not null, effective_to date, exempt boolean not null, reason text not null check(length(trim(reason))>=3),
 approved_by uuid not null references public.hris_users(id), approved_at timestamptz not null default clock_timestamp(),
 check(effective_to is null or effective_to>=effective_from)
);
create index on schedule_compliance.exemptions(employee_id,approved_at desc);
create table schedule_compliance.tasks (
 manager_id uuid not null references public.hris_users(id), week date not null check(extract(isodow from week)=1),
 deadline timestamptz not null, created_at timestamptz not null default clock_timestamp(), completed_at timestamptz,
 primary key(manager_id,week)
);
create table schedule_compliance.audit (
 id bigint generated always as identity primary key, actor_id uuid default public.current_hris_user_id(),
 action text not null, manager_id uuid, employee_id uuid, week date, previous_value jsonb, new_value jsonb,
 created_at timestamptz not null default clock_timestamp()
);
create table schedule_compliance.deliveries (
 id uuid primary key default gen_random_uuid(), event_key text not null unique, manager_id uuid not null, week date not null,
 recipient_id uuid not null references public.hris_users(id), event text not null, status text not null default 'pending',
 attempts integer not null default 0, payload jsonb, lease uuid, lease_until timestamptz, first_attempt timestamptz,
 provider_id text, error text, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create index on schedule_compliance.deliveries(status,created_at);
create function schedule_compliance.audit_row() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into schedule_compliance.audit(action,manager_id,employee_id,week,previous_value,new_value)
 values(tg_table_name||':'||tg_op,
 nullif(coalesce(to_jsonb(new)->>'manager_id',to_jsonb(old)->>'manager_id'),'')::uuid,
 nullif(coalesce(to_jsonb(new)->>'employee_id',to_jsonb(old)->>'employee_id'),'')::uuid,
 nullif(coalesce(to_jsonb(new)->>'week',to_jsonb(old)->>'week',to_jsonb(new)->>'effective_from'),'')::date,
 case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
do $$declare t text;begin
 foreach t in array array['settings','exemptions','tasks','audit','deliveries'] loop
 execute format('alter table schedule_compliance.%I enable row level security',t);
 if t<>'audit' then execute format('create trigger compliance_audit after insert or update or delete on schedule_compliance.%I for each row execute function schedule_compliance.audit_row()',t);end if;
 end loop;
end $$;
create trigger immutable before update or delete on schedule_compliance.audit for each row execute function private.payroll_audit_immutable();
create trigger immutable before update or delete on schedule_compliance.exemptions for each row execute function private.payroll_audit_immutable();

create function schedule_compliance.snapshot(p_manager uuid,p_week date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e record; d date; draft jsonb; days jsonb; people jsonb:='[]'; missing jsonb; tag jsonb;
 required integer:=0; done integer:=0; excluded integer:=0; needed integer; deadline timestamptz; today date:=(statement_timestamp() at time zone 'Asia/Manila')::date; state text;
begin
 if p_week is null or extract(isodow from p_week)<>1 then raise exception 'Select a Monday schedule week';end if;
 select t.deadline into deadline from schedule_compliance.tasks t where t.manager_id=p_manager and t.week=p_week;
 if deadline is null then select ((p_week-s.days_before)+s.deadline_time) at time zone 'Asia/Manila' into deadline from schedule_compliance.settings s;end if;
 for e in select id,full_name,business_unit_id,business_unit,department from public.hris_users where reports_to=p_manager::text and id<>p_manager and lower(status::text)='active' order by full_name loop
  draft:=private.payroll_schedule_draft(e.id,p_week);missing:='[]';days:='[]';needed:=0;
  for d in select generate_series(p_week,p_week+6,'1 day')::date loop
   if coalesce((select x.exempt from schedule_compliance.exemptions x where x.employee_id=e.id and d>=x.effective_from and (x.effective_to is null or d<=x.effective_to) order by x.approved_at desc,x.id desc limit 1),false) then
    days:=days||jsonb_build_array(jsonb_build_object('date',d,'status','Exempt'));continue;
   end if;
   needed:=needed+1;
   select x into tag from jsonb_array_elements(draft) x where (x->>'date')::date=d and x->>'kind' in('work','rest','no_schedule') limit 1;
   if tag is not null and coalesce(tag->>'statusTag','')<>'absence' then
    days:=days||jsonb_build_array(jsonb_build_object('date',d,'status',case when tag->>'kind'='rest' then 'Rest Day' else 'Saved' end));
   elsif exists(select 1 from jsonb_array_elements(private.approved_schedule_leave(e.id,d)) l where (l->>'fullDay')::boolean) then
    days:=days||jsonb_build_array(jsonb_build_object('date',d,'status','Approved leave'));
   else missing:=missing||to_jsonb(d);days:=days||jsonb_build_array(jsonb_build_object('date',d,'status','Missing'));end if;
  end loop;
  if needed=0 then excluded:=excluded+1;else required:=required+1;if jsonb_array_length(missing)=0 then done:=done+1;end if;end if;
  people:=people||jsonb_build_array(jsonb_build_object('id',e.id,'name',e.full_name,'businessUnitId',e.business_unit_id,'businessUnit',e.business_unit,'department',e.department,
   'exempt',needed=0,'complete',needed>0 and jsonb_array_length(missing)=0,'missingDates',missing,'days',days,
   'publication',coalesce((select case when source_hash=md5(draft::text) then 'Published' else 'Draft changes' end from public.payroll_schedule_publications where employee_id=e.id and effective_from=p_week order by version desc limit 1),'Draft')));
 end loop;
 state:=case when required=0 then 'No Scheduling Required' when done=required then 'Completed' when statement_timestamp()>deadline then 'Overdue'
 when (deadline at time zone 'Asia/Manila')::date=today then 'Due Today' when (deadline at time zone 'Asia/Manila')::date=today+1 then 'Due Tomorrow' when done=0 then 'Not Started' else 'In Progress' end;
 return jsonb_build_object('managerId',p_manager,'managerName',(select full_name from public.hris_users where id=p_manager),'week',p_week,'deadline',deadline,
 'required',required,'completed',done,'remaining',required-done,'exempt',excluded,'percentage',case when required=0 then 0 else round(100.0*done/required) end,'status',state,'employees',people);
end $$;

create function schedule_compliance.refresh_task(p_manager uuid,p_week date) returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended('schedule-compliance:'||p_manager||':'||p_week,0));
 s:=schedule_compliance.snapshot(p_manager,p_week);
 if (s->>'required')::int>0 and p_week>=(statement_timestamp() at time zone 'Asia/Manila')::date and p_week<=(statement_timestamp() at time zone 'Asia/Manila')::date+14 then
 insert into schedule_compliance.tasks(manager_id,week,deadline) values(p_manager,p_week,(s->>'deadline')::timestamptz) on conflict do nothing;
 end if;
 update schedule_compliance.tasks set completed_at=case when s->>'status' in('Completed','No Scheduling Required') then clock_timestamp() else null end
 where manager_id=p_manager and week=p_week and ((completed_at is null and s->>'status' in('Completed','No Scheduling Required')) or (completed_at is not null and s->>'status' not in('Completed','No Scheduling Required')));
 return s;
end $$;
create function public.get_schedule_compliance(p_week date default null,p_manager uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();w date:=coalesce(p_week,date_trunc('week',statement_timestamp() at time zone 'Asia/Manila')::date+7);m uuid:=coalesce(p_manager,actor); result jsonb;
begin
 if actor is null or not exists(select 1 from public.hris_users where id=actor and lower(status::text)='active') then raise exception 'Active account required' using errcode='42501';end if;
 if m<>actor and not schedule_compliance.hr() then raise exception 'HR access required' using errcode='42501';end if;
 result:=schedule_compliance.refresh_task(m,w);
 return result||jsonb_build_object('hr',schedule_compliance.hr(),'overdueTasks',
 (select coalesce(jsonb_agg(schedule_compliance.snapshot(m,t.week)),'[]') from schedule_compliance.tasks t where t.manager_id=m and t.week<>w and t.deadline<now() and t.completed_at is null));
end $$;
create function public.get_schedule_compliance_report(p_week date default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare w date:=coalesce(p_week,date_trunc('week',statement_timestamp() at time zone 'Asia/Manila')::date+7);outp jsonb:='[]';m record;begin
 if not schedule_compliance.hr() then raise exception 'HR access required' using errcode='42501';end if;
 for m in select h.id from public.hris_users h where lower(h.status::text)='active' and (exists(select 1 from public.hris_users e where e.reports_to=h.id::text and lower(e.status::text)='active') or exists(select 1 from public.user_roles ur where ur.user_id=h.id and ur.is_active and ur.role_id in('Manager','Business Unit Manager','Team Leader'))) loop
 outp:=outp||jsonb_build_array(schedule_compliance.refresh_task(m.id,w));end loop;
 return jsonb_build_object('rows',outp,'settings',(select to_jsonb(s) from schedule_compliance.settings s),'exemptions',(select coalesce(jsonb_agg(to_jsonb(e) order by approved_at desc),'[]') from schedule_compliance.exemptions e));
end $$;
create function public.save_schedule_compliance_setting(p_days integer,p_time time,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not schedule_compliance.hr() then raise exception 'HR authorization required' using errcode='42501';end if;
 if length(trim(coalesce(p_reason,'')))<3 or p_days is null or p_time is null then raise exception 'Provide deadline and change reason';end if;
 update schedule_compliance.settings set days_before=p_days,deadline_time=p_time,changed_by=public.current_hris_user_id(),changed_at=clock_timestamp();
 insert into schedule_compliance.audit(action,new_value) values('deadline_change_reason',jsonb_build_object('reason',p_reason));
end $$;
create function public.save_schedule_exemption(p_employee uuid,p_from date,p_to date,p_exempt boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not schedule_compliance.hr() then raise exception 'HR authorization required' using errcode='42501';end if;
 insert into schedule_compliance.exemptions(employee_id,effective_from,effective_to,exempt,reason,approved_by) values(p_employee,p_from,p_to,p_exempt,p_reason,public.current_hris_user_id());
end $$;

-- Existing saves remain authoritative. Audit committed edits and refresh existing tasks.
create function schedule_compliance.schedule_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare rowdata jsonb:=coalesce(to_jsonb(new),to_jsonb(old));e uuid:=(rowdata->>'employee_id')::uuid;w date; m uuid;begin
 w:=date_trunc('week',coalesce(rowdata->>'date',rowdata->>'work_date',rowdata->>'effective_from')::date)::date;
 insert into schedule_compliance.audit(action,employee_id,week,previous_value,new_value) values(tg_table_name||':'||tg_op,e,w,case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 for m in select manager_id from schedule_compliance.tasks where week=w and manager_id::text=(select reports_to from public.hris_users where id=e) loop perform schedule_compliance.refresh_task(m,w);end loop;
 return coalesce(new,old);
end $$;
create trigger compliance_saved after insert or update or delete on public.shift_assignments for each row execute function schedule_compliance.schedule_changed();
create trigger compliance_status_saved after insert on public.schedule_day_statuses for each row execute function schedule_compliance.schedule_changed();
create trigger compliance_published after insert on public.payroll_schedule_publications for each row execute function schedule_compliance.schedule_changed();

create function public.queue_schedule_compliance_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare today date:=(statement_timestamp() at time zone 'Asia/Manila')::date;w date;m record; s jsonb;ev text;hr record;counted integer:=0;t record;begin
 -- Execute is service-role-only. Open two weeks before Monday so the seven-day notice exists.
 for w in select generate_series(date_trunc('week',today)::date+7,date_trunc('week',today)::date+14,'7 days')::date loop
 for m in select h.id from public.hris_users h where lower(h.status::text)='active' and exists(select 1 from public.hris_users e where e.reports_to=h.id::text and lower(e.status::text)='active') loop
 perform schedule_compliance.refresh_task(m.id,w);end loop;end loop;
 for t in select t.* from schedule_compliance.tasks t join public.hris_users h on h.id=t.manager_id where lower(h.status::text)='active' and t.completed_at is null loop
 s:=schedule_compliance.refresh_task(t.manager_id,t.week);
 if (s->>'remaining')::int=0 then continue;end if;
 if today=(t.created_at at time zone 'Asia/Manila')::date then
 insert into schedule_compliance.deliveries(event_key,manager_id,week,recipient_id,event) values(t.manager_id||':'||t.week||':opened',t.manager_id,t.week,t.manager_id,'opened') on conflict do nothing;
 end if;
 ev:=null;
 if today=(t.deadline at time zone 'Asia/Manila')::date-7 then ev:='seven_days';
 elsif today=(t.deadline at time zone 'Asia/Manila')::date-3 then ev:='three_days';
 elsif today=(t.deadline at time zone 'Asia/Manila')::date-1 then ev:='one_day';
 elsif today=(t.deadline at time zone 'Asia/Manila')::date then ev:='deadline_day';
 elsif statement_timestamp()>t.deadline then ev:='overdue_'||today;end if;
 if ev is not null then
 insert into schedule_compliance.deliveries(event_key,manager_id,week,recipient_id,event) values(t.manager_id||':'||t.week||':'||ev,t.manager_id,t.week,t.manager_id,ev) on conflict do nothing;
 counted:=counted+1;end if;
 if statement_timestamp()>t.deadline then
 for hr in select distinct h.id from public.hris_users h join public.user_roles ur on ur.user_id=h.id where lower(h.status::text)='active' and ur.is_active and ur.role_id in('HR Staff','HR Manager') loop
 insert into schedule_compliance.deliveries(event_key,manager_id,week,recipient_id,event) values(hr.id||':'||t.manager_id||':'||t.week||':escalation:'||today,t.manager_id,t.week,hr.id,'HR escalation') on conflict do nothing;
 end loop;end if;end loop;return counted;
end $$;
create function public.request_schedule_compliance_reminder(p_manager uuid,p_week date) returns void language plpgsql security definer set search_path='' as $$begin
 if not schedule_compliance.hr() then raise exception 'HR access required' using errcode='42501';end if;
 if (schedule_compliance.refresh_task(p_manager,p_week)->>'remaining')::int=0 then return;end if;
 insert into schedule_compliance.deliveries(event_key,manager_id,week,recipient_id,event) values(p_manager||':'||p_week||':manual:'||(statement_timestamp() at time zone 'Asia/Manila')::date,p_manager,p_week,p_manager,'HR follow-up') on conflict do nothing;
end $$;
create function public.claim_schedule_compliance_email() returns jsonb language plpgsql security definer set search_path='' as $$
declare d schedule_compliance.deliveries; s jsonb; token uuid:=gen_random_uuid(); email text;begin
 select * into d from schedule_compliance.deliveries where status in('pending','failed','sending') and (lease_until is null or lease_until<now()) and (first_attempt is null or first_attempt>now()-interval '20 hours') and attempts<5 order by created_at for update skip locked limit 1;
 if d.id is null then return null;end if;
 s:=schedule_compliance.refresh_task(d.manager_id,d.week);
 select h.email into email from public.hris_users h where h.id=d.recipient_id and lower(h.status::text)='active';
 if (s->>'remaining')::int=0 or email is null or not exists(select 1 from public.hris_users where id=d.manager_id and lower(status::text)='active') or (d.event='HR escalation' and not exists(select 1 from public.user_roles where user_id=d.recipient_id and is_active and role_id in('HR Staff','HR Manager'))) then
 update schedule_compliance.deliveries set status='skipped',updated_at=clock_timestamp() where id=d.id;return jsonb_build_object('skipped',true);end if;
 update schedule_compliance.deliveries set status='sending',lease=token,lease_until=now()+interval '5 minutes',attempts=attempts+1,first_attempt=coalesce(first_attempt,now()),payload=coalesce(payload,s||jsonb_build_object('email',email,'event',d.event)),updated_at=clock_timestamp() where id=d.id returning * into d;
 return jsonb_build_object('id',d.id,'token',token,'key',d.event_key,'payload',d.payload);
end $$;
create function public.finish_schedule_compliance_email(p_id uuid,p_token uuid,p_provider text,p_error text) returns void language plpgsql security definer set search_path='' as $$begin
 update schedule_compliance.deliveries set status=case when p_provider is not null then 'sent' else 'failed' end,provider_id=p_provider,error=left(p_error,300),lease_until=now()+interval '30 minutes',updated_at=clock_timestamp() where id=p_id and lease=p_token;
end $$;
revoke all on all functions in schema schedule_compliance from public,anon,authenticated;
revoke all on function public.get_schedule_compliance(date,uuid),public.get_schedule_compliance_report(date),public.save_schedule_compliance_setting(integer,time,text),public.save_schedule_exemption(uuid,date,date,boolean,text),public.request_schedule_compliance_reminder(uuid,date),public.queue_schedule_compliance_reminders(),public.claim_schedule_compliance_email(),public.finish_schedule_compliance_email(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.get_schedule_compliance(date,uuid),public.get_schedule_compliance_report(date),public.save_schedule_compliance_setting(integer,time,text),public.save_schedule_exemption(uuid,date,date,boolean,text),public.request_schedule_compliance_reminder(uuid,date) to authenticated;
grant execute on function public.queue_schedule_compliance_reminders(),public.claim_schedule_compliance_email(),public.finish_schedule_compliance_email(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
