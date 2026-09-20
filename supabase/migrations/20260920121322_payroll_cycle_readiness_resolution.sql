set local lock_timeout='5s';
set local statement_timeout='45s';

create table public.payroll_calendar_rules(
 id uuid primary key default gen_random_uuid(),
 scope_id uuid references public.payroll_access_scopes(id) on delete restrict,
 effective_from date not null,
 calendar jsonb not null,
 status text not null check(status in ('Global default','Business-unit override')),
 policy_ref text not null check(length(btrim(policy_ref)) between 3 and 1000),
 created_by uuid references public.hris_users(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),
 check((scope_id is null and status='Global default') or (scope_id is not null and status='Business-unit override'))
);
create unique index payroll_calendar_global_effective_unique on public.payroll_calendar_rules(effective_from) where scope_id is null;
create unique index payroll_calendar_scope_effective_unique on public.payroll_calendar_rules(scope_id,effective_from) where scope_id is not null;
create index payroll_calendar_rule_creator_idx on public.payroll_calendar_rules(created_by);

create table public.payroll_calendar_audit(
 id uuid primary key default gen_random_uuid(), rule_id uuid not null references public.payroll_calendar_rules(id) on delete restrict,
 scope_id uuid references public.payroll_access_scopes(id) on delete restrict, actor_id uuid references public.hris_users(id) on delete restrict,
 previous_value jsonb, new_value jsonb not null, action text not null, occurred_at timestamptz not null default clock_timestamp()
);
create index payroll_calendar_audit_rule_idx on public.payroll_calendar_audit(rule_id,occurred_at desc);
create index payroll_calendar_audit_actor_idx on public.payroll_calendar_audit(actor_id);

create table public.payroll_attendance_resolutions(
 id uuid primary key default gen_random_uuid(), scope_id uuid not null references public.payroll_access_scopes(id) on delete restrict,
 employee_id uuid not null references public.hris_users(id) on delete restrict, work_date date not null,
 action text not null, status text not null check(status in ('applied','pending_manager_approval','open_exception')),
 original_punch timestamptz, original_snapshot jsonb not null, result_snapshot jsonb not null,
 policy jsonb not null, audit_note text not null, actor_id uuid not null references public.hris_users(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),
 unique(scope_id,employee_id,work_date,action)
);
create index payroll_attendance_resolution_scope_date_idx on public.payroll_attendance_resolutions(scope_id,work_date);
create index payroll_attendance_resolution_employee_idx on public.payroll_attendance_resolutions(employee_id,work_date);
create index payroll_attendance_resolution_actor_idx on public.payroll_attendance_resolutions(actor_id);

alter table public.payroll_calendar_rules enable row level security;
alter table public.payroll_calendar_audit enable row level security;
alter table public.payroll_attendance_resolutions enable row level security;
revoke all on public.payroll_calendar_rules,public.payroll_calendar_audit,public.payroll_attendance_resolutions from public,anon,authenticated;

insert into public.payroll_calendar_rules(scope_id,effective_from,calendar,status,policy_ref)
select null,date '2000-01-01','[{"releaseDay":5,"startDay":11,"endDay":25,"startMonthOffset":-1,"endMonthOffset":-1},{"releaseDay":20,"startDay":26,"endDay":10,"startMonthOffset":-1,"endMonthOffset":0}]','Global default','Confirmed TNG payroll calendar: 11–25 pays on the 5th; 26–10 pays on the 20th'
where not exists(select 1 from public.payroll_calendar_rules where scope_id is null);

create function private.payroll_calendar_can_configure(p_scope uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.current_hris_user_id() is not null and
 (private.workflow_user_has_role(public.current_hris_user_id(),'Admin') or private.workflow_user_has_role(public.current_hris_user_id(),'HR Manager')) and
 (p_scope is null or private.payroll_time_permission(p_scope,'rules'))
$$;
revoke all on function private.payroll_calendar_can_configure(uuid) from public,anon,authenticated;

create function public.get_payroll_calendar_settings() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare global_rule public.payroll_calendar_rules;begin
 if auth.uid() is null or not exists(select 1 from public.payroll_access_scopes s where private.payroll_time_permission(s.id,'view')) then raise exception 'Scoped payroll access is required.' using errcode='42501';end if;
 select * into global_rule from public.payroll_calendar_rules where scope_id is null order by effective_from desc,created_at desc limit 1;
 return jsonb_build_object('canConfigure',private.payroll_calendar_can_configure(null),
  'global',jsonb_build_object('id',global_rule.id,'scopeId',null,'scopeName',null,'effectiveFrom',global_rule.effective_from,'releaseDays',jsonb_build_array(5,20),'cutoffRules',global_rule.calendar,'status',global_rule.status,'policyRef',global_rule.policy_ref,'createdAt',global_rule.created_at),
  'overrides',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'scopeId',r.scope_id,'scopeName',s.name,'effectiveFrom',r.effective_from,'releaseDays',(select jsonb_agg((x->>'releaseDay')::int) from jsonb_array_elements(r.calendar) x),'cutoffRules',r.calendar,'status',r.status,'policyRef',r.policy_ref,'createdAt',r.created_at) order by r.effective_from desc,r.created_at desc) from public.payroll_calendar_rules r join public.payroll_access_scopes s on s.id=r.scope_id where private.payroll_time_permission(s.id,'view') and not exists(select 1 from public.payroll_calendar_rules n where n.scope_id=r.scope_id and n.effective_from>r.effective_from and n.effective_from<=(now() at time zone 'Asia/Manila')::date)),'[]'::jsonb));
end $$;

create function public.save_payroll_calendar_override(p_scope_id uuid,p_effective_from date,p_calendar jsonb,p_policy_ref text) returns uuid
language plpgsql security definer set search_path='' as $$
declare id uuid;today date:=(now() at time zone 'Asia/Manila')::date;open_end date;item jsonb;begin
 if not private.payroll_calendar_can_configure(p_scope_id) then raise exception 'Admin or HR Manager payroll-calendar authority is required.' using errcode='42501';end if;
 if not exists(select 1 from public.payroll_access_scopes where payroll_access_scopes.id=p_scope_id and kind='business_unit') then raise exception 'Choose a business-unit payroll scope.';end if;
 open_end:=case when extract(day from today)<=10 then date_trunc('month',today)::date+9 when extract(day from today)<=25 then date_trunc('month',today)::date+24 else (date_trunc('month',today)+interval '1 month')::date+9 end;
 if p_effective_from is null or p_effective_from<=open_end then raise exception 'The effective date must begin after the currently open payroll period ends on %.',open_end;end if;
 if jsonb_typeof(p_calendar)<>'array' or jsonb_array_length(p_calendar)<>2 then raise exception 'Provide exactly two reviewed payroll cycles.';end if;
 for item in select value from jsonb_array_elements(p_calendar) loop
  if (item->>'releaseDay')::int not between 1 and 28 or (item->>'startDay')::int not between 1 and 31 or (item->>'endDay')::int not between 1 and 31 then raise exception 'Payroll release and cutoff days are invalid.';end if;
 end loop;
 if length(btrim(coalesce(p_policy_ref,'')))<3 then raise exception 'Policy and approval reference is required.';end if;
 insert into public.payroll_calendar_rules(scope_id,effective_from,calendar,status,policy_ref,created_by) values(p_scope_id,p_effective_from,p_calendar,'Business-unit override',btrim(p_policy_ref),public.current_hris_user_id()) returning payroll_calendar_rules.id into id;
 insert into public.payroll_calendar_audit(rule_id,scope_id,actor_id,new_value,action) values(id,p_scope_id,public.current_hris_user_id(),jsonb_build_object('effectiveFrom',p_effective_from,'calendar',p_calendar,'policyRef',p_policy_ref),'future_override_created');return id;
end $$;

create function private.payroll_grace_minutes(p_scope uuid,p_date date) returns integer
language sql stable security definer set search_path='' as $$
 select coalesce((select greatest(0,least(60,(r.config->>'graceMinutes')::int)) from public.payroll_time_rules r where r.scope_id=p_scope and r.effective_from<=p_date and r.effective_to>=p_date order by r.revision desc limit 1),5)
$$;
revoke all on function private.payroll_grace_minutes(uuid,date) from public,anon,authenticated;

create function private.payroll_apply_grace(p_scope uuid,p_employee uuid,p_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare day jsonb;shift jsonb;punch jsonb;scheduled_at timestamptz;actual_at timestamptz;difference integer;grace integer;result jsonb;pending boolean:=false;resolution_id uuid;begin
 if auth.uid() is null or not private.attendance_admin() or not private.payroll_time_permission(p_scope,'finalize') or not public.can_access_hris_user(p_employee) or not exists(select 1 from public.hris_users h join public.payroll_access_scopes s on s.business_unit_id=h.business_unit_id where h.id=p_employee and s.id=p_scope) then raise exception 'Scoped HR timekeeping-finalizer authority is required.' using errcode='42501';end if;
 if exists(select 1 from public.payroll_attendance_resolutions where scope_id=p_scope and employee_id=p_employee and work_date=p_date and action='grace_applied') then raise exception 'Grace was already applied to this attendance record.';end if;
 day:=public.get_hr_attendance_day(p_employee,p_date);
 select value into shift from jsonb_array_elements(coalesce(day#>'{schedule,entries}','[]')) where value->>'kind'='work' and nullif(value->>'start','') is not null order by value->>'start' limit 1;
 select value into punch from jsonb_array_elements(coalesce(day->'events','[]')) where value->>'type'='CLOCK_IN' order by (value->>'timestamp')::timestamptz limit 1;
 if shift is null or punch is null then raise exception 'A published work schedule and original clock-in are required.';end if;
 scheduled_at:=(p_date+(shift->>'start')::time) at time zone 'Asia/Manila';actual_at:=(punch->>'timestamp')::timestamptz;difference:=greatest(0,ceil(extract(epoch from(actual_at-scheduled_at))/60.0)::int);grace:=private.payroll_grace_minutes(p_scope,p_date);
 if difference not between 1 and grace then raise exception 'This clock-in is % minutes late and is not eligible for the % minute grace action.',difference,grace;end if;
 pending:=coalesce((select (r.config->>'managerApprovalRequired')::boolean from public.payroll_time_rules r where r.scope_id=p_scope and r.effective_from<=p_date and r.effective_to>=p_date order by r.revision desc limit 1),false);
 if pending then result:=day;else result:=public.correct_attendance_day(p_employee,p_date,(day->>'revision')::int,day->'events','Within approved grace period. Original punch retained; policy applied automatically.');end if;
 insert into public.payroll_attendance_resolutions(scope_id,employee_id,work_date,action,status,original_punch,original_snapshot,result_snapshot,policy,audit_note,actor_id)
 values(p_scope,p_employee,p_date,'grace_applied',case when pending then 'pending_manager_approval' else 'applied' end,actual_at,day,result,jsonb_build_object('graceMinutes',grace,'differenceMinutes',difference,'timezone','Asia/Manila'),'Within approved grace period',public.current_hris_user_id()) returning id into resolution_id;
 return jsonb_build_object('id',resolution_id,'employeeId',p_employee,'date',p_date,'status',case when pending then 'pending_manager_approval' else 'applied' end,'auditNote','Within approved grace period');
end $$;
revoke all on function private.payroll_apply_grace(uuid,uuid,date) from public,anon,authenticated;

create function public.apply_payroll_attendance_grace_bulk(p_scope_id uuid,p_from date,p_to date,p_records jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb;applied jsonb:='[]';skipped jsonb:='[]';value jsonb;begin
 if auth.uid() is null or not private.payroll_time_permission(p_scope_id,'finalize') or not private.attendance_admin() then raise exception 'Scoped HR timekeeping-finalizer authority is required.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 or jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records)>500 then raise exception 'Select a valid payroll cycle and no more than 500 attendance records.';end if;
 for item in select value from jsonb_array_elements(p_records) loop
  begin
   if (item->>'date')::date not between p_from and p_to then raise exception 'The date is outside the selected payroll cycle.';end if;
   value:=private.payroll_apply_grace(p_scope_id,(item->>'employeeId')::uuid,(item->>'date')::date);applied:=applied||jsonb_build_array(value);
  exception when others then skipped:=skipped||jsonb_build_array(jsonb_build_object('employeeId',item->>'employeeId','date',item->>'date','reason',sqlerrm));end;
 end loop;
 return jsonb_build_object('applied',applied,'skipped',skipped);
end $$;

create function public.apply_payroll_attendance_preset(p_scope_id uuid,p_employee_id uuid,p_date date,p_preset text,p_note text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare day jsonb;events jsonb;shift jsonb;start_break timestamptz;end_break timestamptz;end_time timestamptz;result jsonb;status text:='applied';note text;resolution_id uuid;begin
 if auth.uid() is null or not private.attendance_admin() or not private.payroll_time_permission(p_scope_id,'finalize') or not public.can_access_hris_user(p_employee_id) or not exists(select 1 from public.hris_users h join public.payroll_access_scopes s on s.business_unit_id=h.business_unit_id where h.id=p_employee_id and s.id=p_scope_id) then raise exception 'Scoped HR timekeeping-finalizer authority is required.' using errcode='42501';end if;
 if p_preset not in ('use_scheduled_break','mark_break_compliant','keep_exception','use_scheduled_end','send_clarification','request_schedule_confirmation','review_lateness','approved_adjustment','send_manager') then raise exception 'Choose an approved correction preset.';end if;
 if exists(select 1 from public.payroll_attendance_resolutions where scope_id=p_scope_id and employee_id=p_employee_id and work_date=p_date and action=p_preset) then raise exception 'This preset was already recorded for the attendance record.';end if;
 day:=public.get_hr_attendance_day(p_employee_id,p_date);events:=day->'events';select value into shift from jsonb_array_elements(coalesce(day#>'{schedule,entries}','[]')) where value->>'kind'='work' order by value->>'start' limit 1;note:=coalesce(nullif(btrim(p_note),''),'Preset correction: '||replace(p_preset,'_',' '));
 if p_preset in ('use_scheduled_break','mark_break_compliant') then
  if shift is null then raise exception 'Publish the schedule before using a scheduled break.';end if;start_break:=(p_date+time '12:00') at time zone 'Asia/Manila';end_break:=(p_date+time '13:00') at time zone 'Asia/Manila';
  select jsonb_agg(value order by (value->>'timestamp')::timestamptz) into events from (select value from jsonb_array_elements(events) where value->>'type' not in ('START_BREAK','END_BREAK') union all select jsonb_build_object('type','START_BREAK','timestamp',start_break) union all select jsonb_build_object('type','END_BREAK','timestamp',end_break)) x;
  result:=public.correct_attendance_day(p_employee_id,p_date,(day->>'revision')::int,events,case when p_preset='mark_break_compliant' then 'Break marked compliant; original punch evidence retained. ' else 'Scheduled break applied. ' end||note);
 elsif p_preset='use_scheduled_end' then
  if shift is null then raise exception 'Publish the schedule before using its end time.';end if;end_time:=(p_date+(shift->>'end')::time+make_interval(days=>coalesce((shift->>'endDayOffset')::int,0))) at time zone 'Asia/Manila';
  select jsonb_agg(value order by (value->>'timestamp')::timestamptz) into events from (select value from jsonb_array_elements(events) where value->>'type'<>'CLOCK_OUT' union all select jsonb_build_object('type','CLOCK_OUT','timestamp',end_time)) x;result:=public.correct_attendance_day(p_employee_id,p_date,(day->>'revision')::int,events,'Published scheduled end used for missing clock-out. '||note);
 elsif p_preset='approved_adjustment' then
  if length(btrim(coalesce(p_note,'')))<3 then raise exception 'Reference the approved adjustment.';end if;result:=public.correct_attendance_day(p_employee_id,p_date,(day->>'revision')::int,events,'Approved attendance adjustment. '||note);
 else status:=case when p_preset in ('keep_exception','send_clarification','request_schedule_confirmation') then 'open_exception' else 'pending_manager_approval' end;result:=day;
 end if;
 insert into public.payroll_attendance_resolutions(scope_id,employee_id,work_date,action,status,original_snapshot,result_snapshot,policy,audit_note,actor_id)
 values(p_scope_id,p_employee_id,p_date,p_preset,status,day,result,jsonb_build_object('preset',p_preset,'timezone','Asia/Manila'),note,public.current_hris_user_id()) returning id into resolution_id;
 return jsonb_build_object('id',resolution_id,'status',status,'result',result);
end $$;

create function public.get_payroll_attendance_actions(p_scope_id uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or not private.payroll_time_permission(p_scope_id,'view') then raise exception 'Scoped payroll readiness access is required.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'employeeId',r.employee_id,'date',r.work_date,'action',r.action,'status',r.status,'actorName',h.full_name,'createdAt',r.created_at,'originalPunch',r.original_punch,'auditNote',r.audit_note) order by r.created_at desc) from public.payroll_attendance_resolutions r join public.hris_users h on h.id=r.actor_id where r.scope_id=p_scope_id and r.work_date between p_from and p_to),'[]'::jsonb);
end $$;

-- Enrich the existing reviewed rows without changing their source punches or calculation rules.
create or replace function public.preview_payroll_time(p_scope_id uuid,p_date_from date,p_date_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare review jsonb;enriched jsonb;begin
 if not private.payroll_time_permission(p_scope_id,'view') then raise exception 'A scoped timekeeping/payroll duty and existing Timekeeping access are required.' using errcode='42501';end if;
 review:=private.payroll_time_review(p_scope_id,p_date_from,p_date_to);review:=review||jsonb_build_object('result',private.payroll_time_evidence(review->'result',review->'source'));
 select coalesce(jsonb_agg(x.row_value||jsonb_build_object('employeeCode',h.employee_id,'issues',(select coalesce(jsonb_agg(to_jsonb(case when issue='Employee profile information incomplete' then 'Timekeeping setup needed — employment start date missing' else issue end)),'[]'::jsonb) from jsonb_array_elements_text(coalesce(x.row_value->'issues','[]')) issue)||case when x.missing_pay then jsonb_build_array('Approved salary source missing') else '[]'::jsonb end,'ready',coalesce((x.row_value->>'ready')::boolean,false) and not x.missing_pay) order by x.row_value->>'employeeName',x.row_value->>'date'),'[]'::jsonb) into enriched
 from (select r.value row_value,private.payroll_package_permission((r.value->>'employeeId')::uuid,p_scope_id,'view') and (r.value->>'date')::date=(select min((z.value->>'date')::date) from jsonb_array_elements(review#>'{result,rows}') z where z.value->>'employeeId'=r.value->>'employeeId') and not exists(select 1 from public.payroll_pay_packages p where p.employee_id=(r.value->>'employeeId')::uuid and p.scope_id=p_scope_id and p.stream='employee_payroll' and p.status='approved' and p.effective_from<=(r.value->>'date')::date) missing_pay from jsonb_array_elements(review#>'{result,rows}') r) x join public.hris_users h on h.id=(x.row_value->>'employeeId')::uuid;
 review:=jsonb_set(review,'{result,rows}',enriched);review:=jsonb_set(review,'{result,blockedDays}',to_jsonb((select count(*) from jsonb_array_elements(enriched) as item(value) where not (item.value->>'ready')::boolean)));
 return (review-'source')||jsonb_build_object('holidays',review#>'{source,holidays}','rules',review#>'{source,rules}','templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'start',t.start_time,'end',t.end_time) order by t.name) from public.shift_templates t join public.payroll_access_scopes s on (s.business_unit_id=t.business_unit_id or t.business_unit_id is null) where s.id=p_scope_id and private.schedule_preset_visible(t.created_by)),'[]'),'packages',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'status',p.status,'createdAt',p.created_at,'submittedAt',p.submitted_at,'reason',p.reason,'previousId',p.previous_id,'current',p.source_hash=review->>'sourceHash','blockedDays',p.result->'blockedDays') order by p.version desc) from public.payroll_time_packages p where p.scope_id=p_scope_id and p.date_from=p_date_from and p.date_to=p_date_to),'[]'));
end $$;

revoke all on function public.get_payroll_calendar_settings(),public.save_payroll_calendar_override(uuid,date,jsonb,text),public.apply_payroll_attendance_grace_bulk(uuid,date,date,jsonb),public.apply_payroll_attendance_preset(uuid,uuid,date,text,text),public.get_payroll_attendance_actions(uuid,date,date) from public,anon;
grant execute on function public.get_payroll_calendar_settings(),public.save_payroll_calendar_override(uuid,date,jsonb,text),public.apply_payroll_attendance_grace_bulk(uuid,date,date,jsonb),public.apply_payroll_attendance_preset(uuid,uuid,date,text,text),public.get_payroll_attendance_actions(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
