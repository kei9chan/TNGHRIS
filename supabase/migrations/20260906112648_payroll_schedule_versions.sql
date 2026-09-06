-- Existing scheduler remains the only assignment/preset writer. Add publication
-- evidence and freeze references; do not rewrite any existing schedule rows/RLS.
set local lock_timeout='5s';
alter table public.shift_templates add column end_day_offset smallint check(end_day_offset in(0,1));
alter table public.shift_templates add column paid_minutes integer check(paid_minutes between 1 and 1380);
alter table public.shift_templates add column schedule_kind text not null default 'work' check(schedule_kind in('work','rest','no_schedule'));
alter table public.shift_templates alter column grace_period_minutes set default 5;
create table public.payroll_schedule_publications (
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.hris_users(id),
 business_unit_id uuid not null references public.business_units(id),effective_from date not null,effective_to date not null,
 version integer not null,source_hash text not null,snapshot jsonb not null,previous_id uuid references public.payroll_schedule_publications(id),
 approval_required boolean not null,published_by uuid not null references public.hris_users(id),published_at timestamptz not null default now(),
 reference text not null check(length(trim(reference)) between 3 and 1000),unique(employee_id,effective_from,version),
 check(extract(isodow from effective_from)=1 and effective_to=effective_from+6)
);
create table public.payroll_schedule_overrides (
 publication_id uuid primary key references public.payroll_schedule_publications(id),decision text not null check(decision in('approve','reject')),
 actor_id uuid not null references public.hris_users(id),reference text not null check(length(trim(reference)) between 3 and 1000),created_at timestamptz not null default now()
);
create table public.payroll_schedule_freezes (
 package_id uuid not null references public.payroll_time_packages(id),publication_id uuid not null references public.payroll_schedule_publications(id),
 employee_id uuid not null references public.hris_users(id),date_from date not null,date_to date not null,primary key(package_id,publication_id)
);
create index payroll_schedule_effective on public.payroll_schedule_publications(employee_id,effective_from,version desc);
create index payroll_schedule_freeze_dates on public.payroll_schedule_freezes(employee_id,date_from,date_to);
do $$declare t text;begin
 foreach t in array array['payroll_schedule_publications','payroll_schedule_overrides','payroll_schedule_freezes'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('create trigger immutable before update or delete on public.%I for each row execute function private.payroll_audit_immutable()',t);end loop;
end $$;

-- Exact existing assignment write routes, with an active login. No new HRIS role.
create function private.payroll_schedule_can_edit(p_employee uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and exists(select 1 from public.hris_users target join public.hris_users actor on actor.auth_user_id=auth.uid()
 where target.id=p_employee and (public.is_hr_or_admin() or (actor.role='BusinessUnitManager' and target.business_unit_id=actor.business_unit_id)
 or (actor.role='Manager' and (target.department=actor.department or target.reports_to=actor.id::text))))
$$;
create function private.payroll_schedule_can_read(p_employee uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and (private.payroll_schedule_can_edit(p_employee) or p_employee=public.current_hris_user_id()
 or exists(select 1 from public.hris_users h where h.id=p_employee and public.current_hris_role()='Manager' and h.reports_to=public.current_hris_name()))
$$;
create function private.payroll_schedule_validate(p jsonb) returns void language plpgsql immutable set search_path='' as $$
declare span integer;begin
 if p->>'kind' is null or p->>'kind' not in('work','rest','no_schedule') then raise exception 'Choose Work, Rest Day or Leave / No Schedule.';end if;
 if p->>'kind'<>'work' then return;end if;
 if coalesce((p->>'flexible')::boolean,false) then
 if coalesce((p->>'paidMinutes')::integer,0) not between 1 and 1380 then raise exception 'Flexible shift requires paid hours per day, excluding the unpaid lunch.';end if;
 else
 if p->>'start' is null or p->>'end' is null or (p->>'start')::time=(p->>'end')::time then raise exception 'Work shift requires distinct valid start and end times.';end if;
 if (p->>'end')::time<(p->>'start')::time and p->>'endDayOffset' is distinct from '1' then raise exception 'Overnight shift must explicitly end the next day.';end if;
 if (p->>'end')::time>(p->>'start')::time and coalesce(p->>'endDayOffset','0')<>'0' then raise exception 'Next-day end would exceed 24 hours. Review the shift times.';end if;
 span:=extract(epoch from((p->>'end')::time-(p->>'start')::time))/60+coalesce((p->>'endDayOffset')::integer,0)*1440;
 if span<=60 or span>=1440 then raise exception 'Working shift must have positive paid time after lunch and last less than 24 hours.';end if;
 end if;
 if (p->>'breakMinutes')::integer is distinct from 60 then raise exception 'Working shifts require a 60-minute unpaid lunch.';end if;
end $$;
create function private.payroll_schedule_template_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 new.grace_period_minutes:=5;
 perform private.payroll_schedule_validate(jsonb_build_object('kind',new.schedule_kind,'start',new.start_time,'end',new.end_time,'flexible',new.is_flexible,'paidMinutes',new.paid_minutes,'endDayOffset',new.end_day_offset,'breakMinutes',new.break_minutes));return new;
end $$;
create function private.payroll_schedule_write_lock() returns trigger language plpgsql set search_path='' as $$begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-schedule-publication',0));return null;
end $$;
create trigger schedule_serialization before insert or update or delete on public.shift_templates for each statement execute function private.payroll_schedule_write_lock();
create trigger schedule_serialization before insert or update or delete on public.shift_assignments for each statement execute function private.payroll_schedule_write_lock();
create trigger payroll_template_valid before insert or update on public.shift_templates for each row execute function private.payroll_schedule_template_guard();

create function private.payroll_schedule_draft(p_employee uuid,p_week date) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'employeeId',a.employee_id,'date',a.date,'templateId',a.shift_template_id,'name',t.name,
 'start',t.start_time,'end',t.end_time,'breakMinutes',t.break_minutes,'graceMinutes',5,'unpaidLunchMinutes',60,'flexible',t.is_flexible,
 'kind',t.schedule_kind,'paidMinutes',t.paid_minutes,'endDayOffset',t.end_day_offset,'businessUnitId',a.business_unit_id,'areaId',a.assigned_area_id) order by a.date,a.id),'[]')
 from public.shift_assignments a left join public.shift_templates t on t.id=a.shift_template_id where a.employee_id=p_employee and a.date between p_week and p_week+6
$$;
create function public.publish_payroll_schedule_week(p_employee_ids uuid[],p_week date,p_reference text,p_expected jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare emp uuid;draft jsonb;line jsonb;prior public.payroll_schedule_publications;r public.payroll_schedule_publications;frozen boolean;outp jsonb:='[]';bu uuid;begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-schedule-publication',0));
 if p_week is null or extract(isodow from p_week)<>1 or coalesce(cardinality(p_employee_ids),0) not between 1 and 300 or length(trim(coalesce(p_reference,''))) not between 3 and 1000 then raise exception 'Select up to 300 employees, a Monday week start and the publication/override reason.';end if;
 for emp in select distinct unnest(p_employee_ids) order by 1 loop
 if not private.payroll_schedule_can_edit(emp) then raise exception 'Existing schedule write access is required for every selected employee.' using errcode='42501';end if;
 draft:=private.payroll_schedule_draft(emp,p_week);if p_expected->>emp::text is distinct from md5(draft::text) then raise exception 'Schedule changed since review. Refresh the week before publishing.' using errcode='40001';end if;select business_unit_id into bu from public.hris_users where id=emp;
 if bu is null then raise exception 'Employee business unit is missing.';end if;
 for line in select value from jsonb_array_elements(draft) loop
 if line->>'businessUnitId' is distinct from bu::text then raise exception 'Schedule business unit differs from employee business unit; reconcile it in the existing scheduler.';end if;
 perform private.payroll_schedule_validate(line);end loop;
 if exists(select 1 from jsonb_array_elements(draft) x group by x->>'date' having count(*)>1 and bool_or(x->>'kind'<>'work')) then raise exception 'Rest / No Schedule conflicts with another assignment on the same day.';end if;
 select * into prior from public.payroll_schedule_publications where employee_id=emp and effective_from=p_week order by version desc limit 1;
 if prior.id is not null and prior.source_hash=md5(draft::text) and not exists(select 1 from public.payroll_schedule_overrides where publication_id=prior.id and decision='reject') then outp:=outp||jsonb_build_array(to_jsonb(prior)-'snapshot');continue;end if;
 frozen:=exists(select 1 from public.payroll_schedule_freezes where employee_id=emp and date_from<=p_week+6 and date_to>=p_week);
 insert into public.payroll_schedule_publications(employee_id,business_unit_id,effective_from,effective_to,version,source_hash,snapshot,previous_id,approval_required,published_by,reference)
 values(emp,bu,p_week,p_week+6,coalesce(prior.version,0)+1,md5(draft::text),draft,prior.id,frozen,public.current_hris_user_id(),p_reference) returning * into r;
 outp:=outp||jsonb_build_array(to_jsonb(r)-'snapshot');end loop;return outp;
end $$;
create function public.review_payroll_schedule_override(p_id uuid,p_approve boolean,p_reference text) returns void language plpgsql security definer set search_path='' as $$
declare p public.payroll_schedule_publications;scope uuid;begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-schedule-publication',0));select * into p from public.payroll_schedule_publications where id=p_id;
 select id into scope from public.payroll_access_scopes where kind='business_unit' and business_unit_id=p.business_unit_id;
 if p.id is null or not private.payroll_time_permission(scope,'rules') or not private.workflow_user_has_role(public.current_hris_user_id(),'HR Manager')
 or not public.can_access_hris_user(p.employee_id) or public.current_hris_user_id() in(p.employee_id,p.published_by) then raise exception 'An independent scoped HR Manager must approve this schedule override.' using errcode='42501';end if;
 if p_approve is null or not p.approval_required or p.id is distinct from (select id from public.payroll_schedule_publications where employee_id=p.employee_id and effective_from=p.effective_from order by version desc limit 1) or p.source_hash<>md5(private.payroll_schedule_draft(p.employee_id,p.effective_from)::text) then raise exception 'Override is superseded or the draft changed. Publish the current changes for review.';end if;
 insert into public.payroll_schedule_overrides(publication_id,decision,actor_id,reference) values(p.id,case when p_approve then 'approve' else 'reject' end,public.current_hris_user_id(),p_reference);
end $$;

-- Freeze membership is explicit. Old submitted payloads remain immutable. An
-- approved override changes the current source; HR must submit a linked new
-- timekeeping version before Finance can use the changed schedule.
do $$declare ddl text;begin
 ddl:=pg_get_functiondef('private.payroll_time_sources(uuid,date,date)'::regprocedure);
 execute replace(ddl,'FUNCTION private.payroll_time_sources(','FUNCTION private.payroll_pre_schedule_sources(');
end $$;
create or replace function private.payroll_time_sources(p_scope uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare src jsonb;u jsonb;p public.payroll_schedule_publications;wk date;d date;draft jsonb;shifts jsonb:='[]';days jsonb:='[]';pubs jsonb:='[]';status text;begin
 src:=private.payroll_pre_schedule_sources(p_scope,p_from,p_to);
 for u in select value from jsonb_array_elements(src->'employees') loop
 for wk in select generate_series(date_trunc('week',p_from-1),date_trunc('week',p_to+1),'7 days')::date loop
 select * into p from public.payroll_schedule_publications x where x.employee_id=(u->>'id')::uuid and x.effective_from=wk
 and (not x.approval_required or exists(select 1 from public.payroll_schedule_overrides where publication_id=x.id and decision='approve')) order by version desc limit 1;
 draft:=private.payroll_schedule_draft((u->>'id')::uuid,wk);
 if p.id is not null then
 shifts:=shifts||(select coalesce(jsonb_agg(x||jsonb_build_object('publicationId',p.id,'publicationVersion',p.version,'published',true)),'[]') from jsonb_array_elements(p.snapshot) x where (x->>'date')::date between p_from-1 and p_to+1);
 pubs:=pubs||jsonb_build_array(jsonb_build_object('id',p.id,'employeeId',p.employee_id,'version',p.version,'from',p.effective_from,'to',p.effective_to));end if;
 for d in select generate_series(greatest(p_from,wk),least(p_to,wk+6),'1 day')::date loop
 status:='published';
 if p.id is null then status:=case when exists(select 1 from jsonb_array_elements(draft) x where (x->>'date')::date=d) then 'unpublished' else 'missing' end;
 elsif p.source_hash<>md5(draft::text) and not exists(select 1 from public.payroll_schedule_freezes where employee_id=(u->>'id')::uuid and date_from<=d and date_to>=d) then status:='unpublished';
 elsif not exists(select 1 from jsonb_array_elements(p.snapshot) x where (x->>'date')::date=d) then status:='missing';end if;
 days:=days||jsonb_build_array(jsonb_build_object('employeeId',u->>'id','date',d,'status',status));end loop;
 end loop;end loop;
 return src||jsonb_build_object('shifts',shifts,'scheduleDays',days,'schedulePublications',pubs,'schedulePolicy',jsonb_build_object('graceMinutes',5,'unpaidLunchMinutes',60));
end $$;
create function private.payroll_freeze_schedule_versions() returns trigger language plpgsql security definer set search_path='' as $$
declare pub jsonb;begin
 if new.status='submitted' and old.status='draft' then
 if jsonb_array_length(coalesce(new.source_snapshot->'schedulePublications','[]'))=0 then raise exception 'Publish and review the schedules before HR finalizes timekeeping.';end if;
 for pub in select value from jsonb_array_elements(new.source_snapshot->'schedulePublications') where (value->>'from')::date<=new.date_to and (value->>'to')::date>=new.date_from loop
 insert into public.payroll_schedule_freezes(package_id,publication_id,employee_id,date_from,date_to)
 values(new.id,(pub->>'id')::uuid,(pub->>'employeeId')::uuid,greatest(new.date_from,(pub->>'from')::date),least(new.date_to,(pub->>'to')::date)) on conflict do nothing;
 end loop;end if;return new;
end $$;
create trigger schedule_version_freeze after update on public.payroll_time_packages for each row execute function private.payroll_freeze_schedule_versions();
do $$declare ddl text;sig text;begin
 foreach sig in array array['public.save_payroll_time_package(uuid,date,date,text,text)','public.submit_payroll_time_package(uuid)'] loop
 ddl:=pg_get_functiondef(sig::regprocedure);execute regexp_replace(ddl,'\mbegin\M','begin'||chr(10)||' perform pg_advisory_xact_lock(hashtextextended(''payroll-schedule-publication'',0));','i');end loop;
end $$;

-- Reuse the existing attendance interpreter; only add scheduling evidence and
-- bounded flexible-shift windows. Lunch logs/approved worked-lunch OT are retained.
create or replace function private.interpret_payroll_time(p_source jsonb,p_from date,p_to date) returns jsonb
language plpgsql immutable set search_path='' as $$
declare u jsonb;d date;a jsonb;e jsonb;l jsonb;o jsonb;r jsonb;cfg jsonb;shifts jsonb;events jsonb;leaves jsonb;ots jsonb;holidays jsonb;
 rows jsonb:='[]';issues jsonb;segments jsonb;pairs jsonb;breaks jsonb;ot_segments jsonb;piece jsonb;sp jsonb;bp jsonb;
 ss timestamptz;se timestamptz;ws timestamptz;we timestamptz;ts timestamptz;opened timestamptz;break_open timestamptz;meal_s timestamptz;meal_e timestamptz;
 scheduled numeric;actual numeric;break_m numeric;regular_m numeric;late_m numeric;under_m numeric;approved_ot numeric;actual_ot numeric;om numeric;
 n integer;flex_start timestamptz;rest boolean;full_leave boolean;holiday boolean;is_worked_lunch boolean;source_ids jsonb;holiday_segments jsonb;day_end timestamptz;
begin
 for u in select value from jsonb_array_elements(p_source->'employees') loop
 for d in select generate_series(p_from,p_to,'1 day'::interval)::date loop
 if nullif(u->>'hireDate','') is not null and (u->>'hireDate')::date>d then continue;end if;
 if nullif(u->>'endDate','') is not null and (u->>'endDate')::date<d then continue;end if;
 issues:='[]';segments:='[]';pairs:='[]';breaks:='[]';ot_segments:='[]';holiday_segments:='[]';opened:=null;break_open:=null;
 scheduled:=0;actual:=0;regular_m:=0;break_m:=0;late_m:=0;under_m:=0;approved_ot:=0;actual_ot:=0;rest:=false;full_leave:=false;is_worked_lunch:=false;
 select value into r from jsonb_array_elements(p_source->'rules') where (value->>'effective_from')::date<=d and (value->>'effective_to')::date>=d order by (value->>'revision')::bigint desc limit 1;cfg:=r->'config';
 if r is null then issues:=issues||'"Approved time rules missing"'::jsonb;end if;
 if nullif(u->>'hireDate','') is null then issues:=issues||'"Employment start date missing"'::jsonb;end if;
 if lower(u->>'status')<>'active' and nullif(u->>'endDate','') is null then issues:=issues||'"Inactive employee has no end date — confirm period coverage"'::jsonb;end if;
 if not coalesce((cfg->>'holidayCoverageConfirmed')::boolean,false) then issues:=issues||'"Holiday calendar coverage needs review"'::jsonb;end if;
 select coalesce(jsonb_agg(value order by value->>'start'),'[]') into shifts from jsonb_array_elements(p_source->'shifts') where value->>'employeeId'=u->>'id' and (value->>'date')::date=d;
 select coalesce(jsonb_agg(value),'[]') into leaves from jsonb_array_elements(p_source->'leave') where value->>'employeeId'=u->>'id' and (value->>'startDate')::date<=d and (value->>'endDate')::date>=d and value->>'status' not in('Rejected','Cancelled','Draft');
 select coalesce(jsonb_agg(value),'[]') into ots from jsonb_array_elements(p_source->'ot') where value->>'employeeId'=u->>'id' and (value->>'date')::date=d and value->>'status' not in('Rejected','Cancelled','Draft');
 select coalesce(jsonb_agg(value),'[]') into holidays from jsonb_array_elements(p_source->'holidays') where (value->>'date')::date between d and d+1;
 holiday:=exists(select 1 from jsonb_array_elements(holidays) where (value->>'date')::date=d);
 if jsonb_array_length(shifts)=0 then issues:=issues||'"Missing Schedule — do not mark absent"'::jsonb;end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(p_source->'scheduleDays','[]')) x where x->>'employeeId'=u->>'id' and (x->>'date')::date=d and x->>'status'='published') then issues:=issues||'"Missing or unpublished schedule — publish the reviewed week first"'::jsonb;end if;
 ws:=null;we:=null;
 for a in select value from jsonb_array_elements(shifts) loop
 if a->>'published' is distinct from 'true' then issues:=issues||'"Unpublished schedule"'::jsonb;end if;
 if a->>'kind'='rest' or coalesce(cfg->'restTemplates','[]') ? (a->>'templateId') then rest:=true;continue;end if;
 if a->>'kind'='no_schedule' then continue;end if;
 begin perform private.payroll_schedule_validate(a);exception when raise_exception then issues:=issues||jsonb_build_array(sqlerrm);continue;end;
 if coalesce((a->>'flexible')::boolean,false) then
 select min((x->>'timestamp')::timestamptz) into flex_start from jsonb_array_elements(p_source->'events') x where x->>'employeeId'=u->>'id' and x->>'type'='CLOCK_IN' and ((x->>'timestamp')::timestamptz at time zone 'Asia/Manila')::date=d;
 if flex_start is null then issues:=issues||'"Flexible shift punches missing — do not assume hours worked"'::jsonb;continue;end if;
 ss:=flex_start;se:=ss+make_interval(mins=>(a->>'paidMinutes')::integer+60);
 else
 ss:=(d+(a->>'start')::time) at time zone 'Asia/Manila';se:=((d+coalesce((a->>'endDayOffset')::integer,0))+(a->>'end')::time) at time zone 'Asia/Manila';end if;
 if exists(select 1 from jsonb_array_elements(segments) x where (x->>'start')::timestamptz<se and (x->>'end')::timestamptz>ss) then issues:=issues||'"Overlapping scheduled segments"'::jsonb;end if;
 segments:=segments||jsonb_build_array(jsonb_build_object('start',ss,'end',se,'shiftId',a->>'id'));
 ws:=least(ws,ss);we:=greatest(we,se);scheduled:=scheduled+extract(epoch from(se-ss))/60;
 if coalesce((a->>'breakMinutes')::numeric,-1) not in(0,60) then issues:=issues||'"Scheduled lunch duration needs review"'::jsonb;end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(shifts) x where x->>'kind'='no_schedule') and jsonb_array_length(shifts)>1 then issues:=issues||'"Leave / No Schedule conflicts with a working assignment"'::jsonb;end if;
 if rest and jsonb_array_length(shifts)>1 then issues:=issues||'"Rest-day and work assignments conflict"'::jsonb;end if;
 if jsonb_array_length(segments)>1 and not coalesce((cfg->>'splitShiftConfirmed')::boolean,false) then issues:=issues||'"Split-shift break treatment needs review"'::jsonb;end if;
 if jsonb_array_length(segments)>1 and exists(select 1 from jsonb_array_elements(shifts) x where (x->>'breakMinutes')::integer<>0) then issues:=issues||'"Split shifts must identify the unpaid gap without deducting it twice"'::jsonb;end if;
 if jsonb_array_length(segments)=1 and not rest then
 if scheduled<480 and not exists(select 1 from jsonb_array_elements(shifts) x where x->>'flexible'='true') then issues:=issues||'"Short-shift lunch treatment needs review"'::jsonb;end if;
 scheduled:=greatest(0,scheduled-60);end if;
 -- Approved request times extend the capture window, including rest-day work.
 for o in select value from jsonb_array_elements(ots) loop
 if o->>'start' is not null and o->>'end' is not null then
 ss:=(d+(o->>'start')::time) at time zone 'Asia/Manila';se:=(d+(o->>'end')::time) at time zone 'Asia/Manila';if se<ss then se:=se+interval '1 day';end if;
 ws:=least(ws,ss);we:=greatest(we,se);end if;end loop;
 ws:=coalesce(ws,d::timestamp at time zone 'Asia/Manila');we:=coalesce(we,(d+1)::timestamp at time zone 'Asia/Manila');
 select coalesce(jsonb_agg(value order by (value->>'timestamp')::timestamptz,value->>'id'),'[]') into events from jsonb_array_elements(p_source->'events') where value->>'employeeId'=u->>'id' and (value->>'timestamp')::timestamptz>=ws-interval '4 hours' and (value->>'timestamp')::timestamptz<=we+interval '8 hours';
 -- Adjacent schedules in the same capture window are ambiguous, never silently merged.
 if exists(select 1 from jsonb_array_elements(p_source->'shifts') x where x->>'employeeId'=u->>'id' and (x->>'date')::date<>d and coalesce(x->>'kind','work')='work' and not(coalesce(cfg->'restTemplates','[]') ? (x->>'templateId')) and x->>'start' is not null and (((x->>'date')::date+(x->>'start')::time) at time zone 'Asia/Manila') between ws-interval '4 hours' and we+interval '8 hours') then issues:=issues||'"Adjacent shifts share a punch window — review boundaries"'::jsonb;end if;
 for e in select value from jsonb_array_elements(events) loop
 ts:=(e->>'timestamp')::timestamptz;
 if e->>'source'='Manual' and nullif(e->>'managerId','') is null then issues:=issues||'"Manual punch requires manager evidence"'::jsonb;end if;
 case e->>'type'
 when 'CLOCK_IN' then if opened is not null then issues:=issues||'"Duplicate or unpaired clock-in"'::jsonb;else opened:=ts;end if;
 when 'CLOCK_OUT' then if opened is null or ts<=opened or break_open is not null then issues:=issues||'"Missing or out-of-order punch"'::jsonb;else pairs:=pairs||jsonb_build_array(jsonb_build_object('start',opened,'end',ts));opened:=null;end if;
 when 'START_BREAK' then if opened is null or break_open is not null then issues:=issues||'"Unpaired break punch"'::jsonb;else break_open:=ts;end if;
 when 'END_BREAK' then if break_open is null or ts<=break_open then issues:=issues||'"Unpaired break punch"'::jsonb;else breaks:=breaks||jsonb_build_array(jsonb_build_object('start',break_open,'end',ts));break_open:=null;end if;
 else issues:=issues||'"Unsupported punch type"'::jsonb;end case;
 end loop;
 if opened is not null or break_open is not null then issues:=issues||'"Missing clock-out or break end"'::jsonb;end if;
 for piece in select value from jsonb_array_elements(pairs) loop actual:=actual+extract(epoch from((piece->>'end')::timestamptz-(piece->>'start')::timestamptz))/60;end loop;
 for bp in select value from jsonb_array_elements(breaks) loop break_m:=break_m+extract(epoch from((bp->>'end')::timestamptz-(bp->>'start')::timestamptz))/60;end loop;actual:=greatest(0,actual-break_m);
 for l in select value from jsonb_array_elements(leaves) loop
 if l->>'status'<>'Approved' or coalesce((l->>'configurationRequired')::boolean,false) then issues:=issues||'"Leave approval incomplete"'::jsonb;
 elsif nullif(l->>'startTime','') is not null or nullif(l->>'endTime','') is not null then issues:=issues||'"Partial-day leave needs an approved time interpretation"'::jsonb;
 else full_leave:=true;end if;
 if coalesce((l->>'paid')::boolean,false) and (nullif(cfg->>'leavePolicyRef','') is null or not exists(select 1 from jsonb_array_elements(p_source->'leavePolicies') p where p->>'leave_type_id'=l->>'typeId' and p->>'accrual_rule' is not null and p->>'accrual_rule'<>'none')) then issues:=issues||'"Paid leave accrual / regularization source needs reconciliation"'::jsonb;end if;
 if l->>'type'='Offset Leave' then issues:=issues||'"Offset leave balance and consumption require reconciliation"'::jsonb;end if;
 end loop;
 if full_leave and exists(select 1 from jsonb_array_elements(shifts) x where x->>'kind'='no_schedule') then
 select (x->>'paidMinutes')::integer into scheduled from jsonb_array_elements(shifts) x where x->>'kind'='no_schedule' limit 1;
 if scheduled is null then scheduled:=0;issues:=issues||'"Leave / No Schedule needs planned paid-hours information for leave valuation"'::jsonb;end if;end if;
 if jsonb_array_length(leaves)>1 then issues:=issues||'"Overlapping leave records"'::jsonb;end if;
 if full_leave and actual>0 then issues:=issues||'"Approved leave overlaps worked time"'::jsonb;end if;
 if not rest and not full_leave and jsonb_array_length(pairs)=0 and jsonb_array_length(segments)>0 then issues:=issues||'"Punches missing — absence requires review"'::jsonb;end if;
 if exists(select 1 from jsonb_array_elements(p_source->'wfh') w where w->>'employeeId'=u->>'id' and (w->>'startDate')::date<=d and (w->>'endDate')::date>=d and w->>'status' not in('Rejected','Cancelled','Draft') and (w->>'status' not in('Approved','WFH_FOR_TIMEKEEPING') or coalesce((w->>'configurationRequired')::boolean,false))) then issues:=issues||'"WFH approval incomplete"'::jsonb;end if;
 -- Keep requested, approved and actual OT distinct, without rounding 75 to 60/90.
 for o in select value from jsonb_array_elements(ots) loop
 if o->>'status'<>'Approved' or coalesce((o->>'configurationRequired')::boolean,false) then issues:=issues||'"OT approval incomplete"'::jsonb;continue;end if;
 if o->>'start' is null or o->>'end' is null or o->>'approvedHours' is null then issues:=issues||'"Approved OT times or duration missing"'::jsonb;continue;end if;
 ss:=(d+(o->>'start')::time) at time zone 'Asia/Manila';se:=(d+(o->>'end')::time) at time zone 'Asia/Manila';if se<ss then se:=se+interval '1 day';end if;
 if extract(epoch from(se-ss))/60<60 or (o->>'approvedHours')::numeric*60<60 then issues:=issues||'"Below-one-hour OT needs policy review; retain worked time"'::jsonb;end if;
 if exists(select 1 from jsonb_array_elements(ot_segments) x where (x->>'start')::timestamptz<se and (x->>'end')::timestamptz>ss) then issues:=issues||'"Overlapping approved OT"'::jsonb;end if;
 ot_segments:=ot_segments||jsonb_build_array(jsonb_build_object('start',ss,'end',se));om:=0;
 for piece in select value from jsonb_array_elements(pairs) loop om:=om+greatest(0,extract(epoch from(least(se,(piece->>'end')::timestamptz)-greatest(ss,(piece->>'start')::timestamptz)))/60);end loop;
 for bp in select value from jsonb_array_elements(breaks) loop om:=om-greatest(0,extract(epoch from(least(se,(bp->>'end')::timestamptz)-greatest(ss,(bp->>'start')::timestamptz)))/60);end loop;
 approved_ot:=approved_ot+(o->>'approvedHours')::numeric*60;actual_ot:=actual_ot+greatest(0,om);
 if om is distinct from (o->>'approvedHours')::numeric*60 then issues:=issues||'"Actual versus approved OT duration needs reconciliation"'::jsonb;end if;
 if o->>'type'='Offset' and not(rest or holiday) then issues:=issues||'"Ordinary-day excess is not eligible for manager offset"'::jsonb;end if;
 if o->>'type'='Offset' then issues:=issues||'"Manager offset requires HR → GM → two distinct BOD approvals and balance reconciliation"'::jsonb;end if;
 for a in select value from jsonb_array_elements(shifts) loop
 if cfg->'meals' ? (a->>'templateId') then
 meal_s:=(d+(cfg->'meals'->>(a->>'templateId'))::time) at time zone 'Asia/Manila';if meal_s<ws then meal_s:=meal_s+interval '1 day';end if;meal_e:=meal_s+interval '1 hour';
 if ss=meal_s and se=meal_e and om=60 and o->>'type'='Paid' and o->>'approvedBy'=o->>'directManagerId' and o->>'directManagerId'=u->>'managerId' then is_worked_lunch:=true;end if;end if;end loop;
 end loop;
 if not full_leave and not rest and jsonb_array_length(segments)=1 and actual>0 and break_m<>60 and not(break_m=0 and is_worked_lunch) then issues:=issues||'"One unpaid movable lunch hour needs logs or direct-manager approved worked-lunch OT"'::jsonb;end if;
 if rest and actual>0 and approved_ot=0 then issues:=issues||'"Rest-day work requires approved source request"'::jsonb;end if;
 for sp in select value from jsonb_array_elements(segments) loop
 ss:=(sp->>'start')::timestamptz;se:=(sp->>'end')::timestamptz;
 select min((x->>'start')::timestamptz),max((x->>'end')::timestamptz) into opened,ts from jsonb_array_elements(pairs) x where (x->>'end')::timestamptz>ss and (x->>'start')::timestamptz<se;
 if opened is not null then late_m:=late_m+greatest(0,extract(epoch from(opened-ss))/60-5);under_m:=under_m+greatest(0,extract(epoch from(se-ts))/60);end if;
 for piece in select value from jsonb_array_elements(pairs) loop regular_m:=regular_m+greatest(0,extract(epoch from(least(se,(piece->>'end')::timestamptz)-greatest(ss,(piece->>'start')::timestamptz)))/60);end loop;
 for bp in select value from jsonb_array_elements(breaks) loop regular_m:=regular_m-greatest(0,extract(epoch from(least(se,(bp->>'end')::timestamptz)-greatest(ss,(bp->>'start')::timestamptz)))/60);end loop;
 -- Explicit calendar-day segments preserve overnight holiday boundaries for Phase 4.
 day_end:=(((ss at time zone 'Asia/Manila')::date+1)::timestamp at time zone 'Asia/Manila');
 holiday_segments:=holiday_segments||jsonb_build_array(jsonb_build_object('date',(ss at time zone 'Asia/Manila')::date,'start',ss,'end',least(se,day_end)));
 if se>day_end then holiday_segments:=holiday_segments||jsonb_build_array(jsonb_build_object('date',(day_end at time zone 'Asia/Manila')::date,'start',day_end,'end',se));end if;
 end loop;
 if is_worked_lunch then regular_m:=greatest(0,regular_m-60);end if;
 if actual>regular_m+actual_ot then issues:=issues||'"Worked time outside the reviewed schedule / OT needs reconciliation"'::jsonb;end if;
 if scheduled>0 and regular_m>scheduled and not is_worked_lunch then issues:=issues||'"Worked and scheduled minutes need reconciliation"'::jsonb;end if;
 select coalesce(jsonb_agg(distinct value),'[]') into issues from jsonb_array_elements(issues);
 rows:=rows||jsonb_build_array(jsonb_build_object('employeeId',u->>'id','employeeName',u->>'name','date',d,'restDay',rest,'scheduleState',case when rest then 'Rest Day' when full_leave or exists(select 1 from jsonb_array_elements(shifts) x where x->>'kind'='no_schedule') then 'Leave / No Schedule' when jsonb_array_length(shifts)=0 then 'Missing Schedule' else 'Work' end,'holiday',holiday,'approvedFullLeave',full_leave,
 'scheduledMinutes',scheduled,'actualMinutes',actual,'regularMinutes',greatest(0,regular_m),'breakMinutes',break_m,'lateMinutes',late_m,'undertimeMinutes',under_m,
 'approvedOtMinutes',approved_ot,'actualOtMinutes',actual_ot,'workedLunch',is_worked_lunch,'issues',issues,'ready',jsonb_array_length(issues)=0,
 'shiftIds',(select coalesce(jsonb_agg(x->'id'),'[]') from jsonb_array_elements(shifts) x),'eventIds',(select coalesce(jsonb_agg(x->'id'),'[]') from jsonb_array_elements(events) x),
 'leaveIds',(select coalesce(jsonb_agg(x->'id'),'[]') from jsonb_array_elements(leaves) x),'ot',ots,'holidays',holidays,'segments',holiday_segments,'ruleId',r->'id'));
 end loop;end loop;
 return jsonb_build_object('engineVersion','phase3-v1','rows',rows,'blockedDays',(select count(*) from jsonb_array_elements(rows) x where not(x->>'ready')::boolean),'totalDays',jsonb_array_length(rows));
end $$;

create function public.get_payroll_schedule_week(p_employee_ids uuid[],p_week date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare emp uuid;p public.payroll_schedule_publications;active public.payroll_schedule_publications;outp jsonb:='[]';scope uuid;draft jsonb;begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS login required.' using errcode='42501';end if;
 if coalesce(cardinality(p_employee_ids),0)>300 or p_week is null then raise exception 'Choose a week and up to 300 employees.';end if;
 for emp in select distinct unnest(p_employee_ids) loop
 if not private.payroll_schedule_can_read(emp) then continue;end if;
 select * into p from public.payroll_schedule_publications where employee_id=emp and effective_from=p_week order by version desc limit 1;
 select * into active from public.payroll_schedule_publications x where employee_id=emp and effective_from=p_week and (not approval_required or exists(select 1 from public.payroll_schedule_overrides where publication_id=x.id and decision='approve')) order by version desc limit 1;
 select s.id into scope from public.payroll_access_scopes s join public.hris_users h on h.business_unit_id=s.business_unit_id where h.id=emp and s.kind='business_unit';
 draft:=private.payroll_schedule_draft(emp,p_week);
 outp:=outp||jsonb_build_array(jsonb_build_object('employeeId',emp,'draftHash',md5(draft::text),'publicationId',p.id,'version',p.version,'activeVersion',active.version,
 'current',p.id is not null and p.source_hash=md5(draft::text),'published',active.id is not null and active.source_hash=md5(draft::text),'pending',p.approval_required and not exists(select 1 from public.payroll_schedule_overrides where publication_id=p.id),
 'frozen',exists(select 1 from public.payroll_schedule_freezes where employee_id=emp and date_from<=p_week+6 and date_to>=p_week),
 'reference',p.reference,'decision',(select decision from public.payroll_schedule_overrides where publication_id=p.id),'before',active.snapshot,'after',p.snapshot,
 'canApprove',p.approval_required and private.payroll_time_permission(scope,'rules') and private.workflow_user_has_role(public.current_hris_user_id(),'HR Manager') and public.can_access_hris_user(emp)
 and public.current_hris_user_id() not in(emp,p.published_by) and not exists(select 1 from public.payroll_schedule_overrides where publication_id=p.id)));
 end loop;return outp;
end $$;
-- Only guarded endpoints are public. Existing scheduler policies are untouched.
do $$declare r record;begin
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='private' and p.proname in('payroll_schedule_can_edit','payroll_schedule_can_read','payroll_schedule_validate','payroll_schedule_template_guard','payroll_schedule_write_lock','payroll_schedule_draft','payroll_pre_schedule_sources','payroll_freeze_schedule_versions'))
 or (n.nspname='public' and p.proname in('publish_payroll_schedule_week','review_payroll_schedule_override','get_payroll_schedule_week')) loop
 execute 'revoke all on function '||r.sig||' from public,anon,authenticated';
 if r.sig::text like 'publish_%' or r.sig::text like 'review_%' or r.sig::text like 'get_%' or r.sig::text like 'public.%' then execute 'grant execute on function '||r.sig||' to authenticated';end if;end loop;
end $$;
notify pgrst,'reload schema';
