-- Cross-business-unit schedule visibility and isolated historical payroll reconciliation.
-- Live schedules, attendance, payroll runs, approvals, payments and payslips are never
-- written by the reconciliation functions in this migration.
set local lock_timeout = '5s';
set local statement_timeout = '45s';

create or replace function private.schedule_global_viewer(p_actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (
   select 1 from public.user_roles ur
   join public.roles r on r.id=ur.role_id and r.is_active
   where ur.user_id=p_actor and ur.is_active
     and ur.role_id in ('Admin','Board of Director','GeneralManager','HR Manager','HR Staff')
 ) or exists (
   select 1 from public.hris_users h where h.id=p_actor
     and h.role in ('Admin','Board of Director','GeneralManager','HR Manager','HR Staff')
 )
$$;

create or replace function private.historical_reconciliation_user(p_actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (
   select 1 from public.user_roles ur
   join public.roles r on r.id=ur.role_id and r.is_active
   where ur.user_id=p_actor and ur.is_active
     and ur.role_id in ('Admin','Board of Director','HR Manager','HR Staff')
 ) or exists (
   select 1 from public.hris_users h where h.id=p_actor
     and h.role in ('Admin','Board of Director','HR Manager','HR Staff')
 )
$$;

revoke all on function private.schedule_global_viewer(uuid),private.historical_reconciliation_user(uuid) from public,anon,authenticated;

-- p_scope is direct, all, or business_unit:<uuid>. Read scope and edit authority
-- intentionally remain separate: can_edit still uses the existing employee-level rule.
create or replace function public.get_schedule_builder_data(p_scope text, p_week date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid:=public.current_hris_user_id(); ids uuid[]; people jsonb; requested_bu uuid; broad boolean;
begin
 if auth.uid() is null or private.payroll_actor_id() is null then
  raise exception 'Sign in with an active schedule-builder account.' using errcode='42501';
 end if;
 if p_scope is null or p_week is null or extract(isodow from p_week)<>1 then
  raise exception 'Select a valid scope and Monday week-start date.' using errcode='22023';
 end if;
 broad:=private.schedule_global_viewer(actor);
 if p_scope like 'business_unit:%' then
  begin requested_bu:=substring(p_scope from 15)::uuid; exception when others then raise exception 'Select a valid business unit.' using errcode='22023'; end;
 elsif p_scope not in ('direct','all') then
  raise exception 'Select direct reports, all business units, or one business unit.' using errcode='22023';
 end if;
 if p_scope='all' and not broad then raise exception 'All-business-unit schedule viewing is not authorized.' using errcode='42501'; end if;
 if requested_bu is not null and not broad and not exists(
   select 1 from public.hris_users a where a.id=actor and a.business_unit_id=requested_bu
 ) and not exists(
   select 1 from public.hris_users h where h.reports_to=actor::text and h.business_unit_id=requested_bu and lower(h.status::text)='active'
 ) then raise exception 'That business unit is outside your schedule-viewing scope.' using errcode='42501'; end if;
 if not (broad or private.payroll_schedule_can_edit(actor) or exists(select 1 from public.hris_users h where h.reports_to=actor::text and lower(h.status::text)='active' and h.id<>actor)) then
  raise exception 'Schedule builder access required.' using errcode='42501';
 end if;
 select array_agg(h.id),coalesce(jsonb_agg(jsonb_build_object(
  'id',h.id,'full_name',h.full_name,'role',h.role,'status',h.status,
  'business_unit',h.business_unit,'business_unit_id',h.business_unit_id,
  'department',h.department,'department_id',h.department_id,'position',h.position,
  'reports_to',h.reports_to,'can_edit',private.payroll_schedule_can_edit(h.id)
 ) order by h.business_unit,h.full_name),'[]') into ids,people
 from public.hris_users h
 where lower(h.status::text)='active' and (
   (p_scope='direct' and h.reports_to=actor::text and h.id<>actor)
   or p_scope='all'
   or (requested_bu is not null and h.business_unit_id=requested_bu)
 );
 ids:=coalesce(ids,array[]::uuid[]);
 return jsonb_build_object('people',people,
  'templates',(select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object(
   'can_use',private.schedule_preset_visible(t.created_by),
   'can_manage',private.schedule_preset_manage(t.created_by,t.business_unit_id)) order by t.name),'[]')
   from public.shift_templates t where private.schedule_preset_visible(t.created_by)
   or exists(select 1 from public.shift_assignments a where a.shift_template_id=t.id and a.employee_id=any(ids) and a.date between p_week-7 and p_week+13)),
  'assignments',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'employee_id',s.employee_id,'shift_template_id',s.shift_template_id,'date',s.date,'assigned_area_id',s.assigned_area_id) order by s.date,s.id),'[]') from public.shift_assignments s where s.employee_id=any(ids) and s.date between p_week-7 and p_week+13),
  'statuses',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'employee_id',s.employee_id,'work_date',s.work_date,'tag',s.tag,'revision',s.revision)),'[]') from public.schedule_day_statuses s where s.employee_id=any(ids) and s.work_date between p_week-7 and p_week+13 and not exists(select 1 from public.schedule_day_statuses n where n.employee_id=s.employee_id and n.work_date=s.work_date and n.revision>s.revision)));
end $$;
revoke all on function public.get_schedule_builder_data(text,date) from public,anon;
grant execute on function public.get_schedule_builder_data(text,date) to authenticated;

create table payroll_history_private.reconciliations (
 id uuid primary key default gen_random_uuid(),
 scope_id uuid not null references public.payroll_access_scopes(id) on delete restrict,
 release_date date not null,date_from date not null,date_to date not null,
 employee_group text not null default 'all' check(length(btrim(employee_group)) between 1 and 200),
 status text not null default 'draft' check(status in ('draft','ready','calculated','archived')),
 created_by uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id) on delete restrict,updated_at timestamptz not null default now(),archived_at timestamptz,
 check(date_to>=date_from and date_to-date_from<=31 and release_date>=date_to),
 unique(scope_id,release_date,date_from,date_to,employee_group)
);
create table payroll_history_private.reconciliation_sources (
 id uuid primary key default gen_random_uuid(),reconciliation_id uuid not null references payroll_history_private.reconciliations(id) on delete restrict,
 kind text not null check(kind in ('schedule','attendance','original_payroll')),
 filename text,source_bytes bytea,source_hash text,reference text not null,
 created_by uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now()
);
create table payroll_history_private.reconciliation_records (
 id uuid primary key default gen_random_uuid(),reconciliation_id uuid not null references payroll_history_private.reconciliations(id) on delete restrict,
 kind text not null check(kind in ('employee','schedule','attendance','original_payroll')),
 record_key text not null,employee_id uuid references public.hris_users(id) on delete restrict,work_date date,payload jsonb not null,
 revision integer not null default 1,created_by uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
 unique(reconciliation_id,kind,record_key,revision)
);
create table payroll_history_private.reconciliation_runs (
 id uuid primary key default gen_random_uuid(),reconciliation_id uuid not null references payroll_history_private.reconciliations(id) on delete restrict,
 version integer not null,snapshot_hash text not null,snapshot jsonb not null,result jsonb not null,
 created_by uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
 unique(reconciliation_id,version),unique(reconciliation_id,snapshot_hash)
);
create table payroll_history_private.reconciliation_audit (
 id uuid primary key default gen_random_uuid(),reconciliation_id uuid not null references payroll_history_private.reconciliations(id) on delete restrict,
 actor uuid not null references auth.users(id) on delete restrict,action text not null,details jsonb not null default '{}',created_at timestamptz not null default now()
);
create index historical_reconciliation_scope on payroll_history_private.reconciliations(scope_id,release_date desc);
create index historical_reconciliation_records_lookup on payroll_history_private.reconciliation_records(reconciliation_id,kind,record_key,revision desc);
create index historical_reconciliation_runs_lookup on payroll_history_private.reconciliation_runs(reconciliation_id,version desc);
create index historical_reconciliation_audit_lookup on payroll_history_private.reconciliation_audit(reconciliation_id,created_at);
alter table payroll_history_private.reconciliations enable row level security;
alter table payroll_history_private.reconciliation_sources enable row level security;
alter table payroll_history_private.reconciliation_records enable row level security;
alter table payroll_history_private.reconciliation_runs enable row level security;
alter table payroll_history_private.reconciliation_audit enable row level security;
revoke all on payroll_history_private.reconciliations,payroll_history_private.reconciliation_sources,payroll_history_private.reconciliation_records,payroll_history_private.reconciliation_runs,payroll_history_private.reconciliation_audit from public,anon,authenticated;

create trigger historical_sources_immutable before update or delete on payroll_history_private.reconciliation_sources for each row execute function payroll_history_private.immutable();
create trigger historical_records_immutable before update or delete on payroll_history_private.reconciliation_records for each row execute function payroll_history_private.immutable();
create trigger historical_runs_immutable before update or delete on payroll_history_private.reconciliation_runs for each row execute function payroll_history_private.immutable();
create trigger historical_audit_immutable before update or delete on payroll_history_private.reconciliation_audit for each row execute function payroll_history_private.immutable();

create function payroll_history_private.reconciliation_allowed(p_scope uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and private.historical_reconciliation_user(public.current_hris_user_id())
 and exists(select 1 from public.payroll_access_scopes s where s.id=p_scope and s.kind='business_unit')
$$;
revoke all on function payroll_history_private.reconciliation_allowed(uuid) from public,anon,authenticated;

create function public.get_historical_reconciliation_context(p_reconciliation uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); rec payroll_history_private.reconciliations;
begin
 if auth.uid() is null or not private.historical_reconciliation_user(actor) then raise exception 'Historical payroll reconciliation is limited to BOD, Admin and HR.' using errcode='42501';end if;
 if p_reconciliation is not null then
  select * into rec from payroll_history_private.reconciliations r where r.id=p_reconciliation;
  if rec.id is null or not payroll_history_private.reconciliation_allowed(rec.scope_id) then raise exception 'Reconciliation not found or outside your access.' using errcode='42501';end if;
 end if;
 return jsonb_build_object(
  'scopes',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'businessUnitId',s.business_unit_id) order by s.name),'[]') from public.payroll_access_scopes s where s.kind='business_unit'),
  'reconciliations',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'scopeId',r.scope_id,'scopeName',s.name,'releaseDate',r.release_date,'dateFrom',r.date_from,'dateTo',r.date_to,'employeeGroup',r.employee_group,'status',r.status,'updatedAt',r.updated_at) order by r.updated_at desc),'[]') from payroll_history_private.reconciliations r join public.payroll_access_scopes s on s.id=r.scope_id),
  'reconciliation',case when rec.id is null then null else jsonb_build_object('id',rec.id,'scopeId',rec.scope_id,'releaseDate',rec.release_date,'dateFrom',rec.date_from,'dateTo',rec.date_to,'employeeGroup',rec.employee_group,'status',rec.status) end,
  'employees',case when rec.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'employeeId',h.employee_id,'name',h.full_name,'businessUnit',h.business_unit,'department',h.department,'dateHired',h.date_hired,'endDate',h.end_date,'package',(
    select jsonb_build_object('id',p.id,'effectiveFrom',p.effective_from,'rateType',p.rate_type,'baseAmount',p.base_amount,'components',p.components,'treatment',p.treatment,'sourceRef',p.source_ref)
    from public.payroll_pay_packages p where p.employee_id=h.id and p.status in ('approved','superseded') and p.effective_from<=rec.date_to order by p.effective_from desc limit 1
  )) order by h.full_name),'[]') from public.hris_users h join public.payroll_access_scopes s on s.id=rec.scope_id and s.business_unit_id=h.business_unit_id where not coalesce(h.is_duplicate,false)) end,
  'records',case when rec.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(to_jsonb(x) order by x.kind,x.record_key),'[]') from (select distinct on (rr.kind,rr.record_key) rr.id,rr.kind,rr.record_key,rr.employee_id,rr.work_date,rr.payload,rr.revision,rr.created_at from payroll_history_private.reconciliation_records rr where rr.reconciliation_id=rec.id order by rr.kind,rr.record_key,rr.revision desc) x) end,
  'sources',case when rec.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,'filename',x.filename,'reference',x.reference,'sourceHash',x.source_hash,'createdAt',x.created_at) order by x.created_at desc),'[]') from payroll_history_private.reconciliation_sources x where x.reconciliation_id=rec.id) end,
  'runs',case when rec.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'version',x.version,'createdAt',x.created_at,'result',x.result) order by x.version desc),'[]') from payroll_history_private.reconciliation_runs x where x.reconciliation_id=rec.id) end,
  'audit',case when rec.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'details',a.details,'createdAt',a.created_at,'actor',coalesce(h.full_name,a.actor::text)) order by a.created_at desc),'[]') from payroll_history_private.reconciliation_audit a left join public.hris_users h on h.auth_user_id=a.actor where a.reconciliation_id=rec.id) end
 );
end $$;

create function public.save_historical_reconciliation(p_id uuid,p_scope uuid,p_release date,p_from date,p_to date,p_employee_group text default 'all')
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; old payroll_history_private.reconciliations;
begin
 if not payroll_history_private.reconciliation_allowed(p_scope) then raise exception 'Historical payroll reconciliation is limited to BOD, Admin and HR.' using errcode='42501';end if;
 if p_release is null or p_from is null or p_to is null or p_to<p_from or p_to-p_from>31 or p_release<p_to or p_to>=(now() at time zone 'Asia/Manila')::date then raise exception 'Select a completed payroll and a valid historical period.' using errcode='22023';end if;
 if length(btrim(coalesce(p_employee_group,''))) not between 1 and 200 then raise exception 'Select an employee group.' using errcode='22023';end if;
 if p_id is null then
  insert into payroll_history_private.reconciliations(scope_id,release_date,date_from,date_to,employee_group,created_by,updated_by)
  values(p_scope,p_release,p_from,p_to,btrim(p_employee_group),auth.uid(),auth.uid())
  on conflict(scope_id,release_date,date_from,date_to,employee_group) do update set updated_by=auth.uid(),updated_at=now()
  returning id into rid;
  insert into payroll_history_private.reconciliation_audit(reconciliation_id,actor,action,details) values(rid,auth.uid(),'reconciliation_created',jsonb_build_object('releaseDate',p_release,'dateFrom',p_from,'dateTo',p_to));
 else
  select * into old from payroll_history_private.reconciliations where id=p_id for update;
  if old.id is null or not payroll_history_private.reconciliation_allowed(old.scope_id) or old.status='archived' then raise exception 'Only an accessible, unarchived reconciliation can be edited.' using errcode='42501';end if;
  update payroll_history_private.reconciliations set scope_id=p_scope,release_date=p_release,date_from=p_from,date_to=p_to,employee_group=btrim(p_employee_group),status='draft',updated_by=auth.uid(),updated_at=now() where id=p_id returning id into rid;
  insert into payroll_history_private.reconciliation_audit(reconciliation_id,actor,action,details) values(rid,auth.uid(),'reconciliation_updated',jsonb_build_object('previous',to_jsonb(old),'releaseDate',p_release,'dateFrom',p_from,'dateTo',p_to));
 end if;
 return rid;
end $$;

create function public.save_historical_reconciliation_dataset(p_reconciliation uuid,p_kind text,p_rows jsonb,p_filename text default null,p_source_base64 text default null,p_reference text default 'Manual entry')
returns jsonb language plpgsql security definer set search_path='' as $$
declare rec payroll_history_private.reconciliations; row_data jsonb; key text; employee uuid; work_day date; rev integer; bytes bytea; hash text; saved integer:=0;
begin
 select * into rec from payroll_history_private.reconciliations where id=p_reconciliation for update;
 if rec.id is null or not payroll_history_private.reconciliation_allowed(rec.scope_id) or rec.status='archived' then raise exception 'Only an accessible, unarchived reconciliation can be edited.' using errcode='42501';end if;
 if p_kind not in ('employee','schedule','attendance','original_payroll') or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>10000 then raise exception 'Choose a valid dataset with no more than 10,000 rows.' using errcode='22023';end if;
 if length(btrim(coalesce(p_reference,''))) not between 3 and 1000 then raise exception 'A source or correction reference is required.' using errcode='22023';end if;
 if p_source_base64 is not null then
  if length(p_source_base64)>14000000 or length(coalesce(p_filename,'')) not between 1 and 200 then raise exception 'Source files are limited to 10 MB.' using errcode='22023';end if;
  bytes:=decode(p_source_base64,'base64');hash:=encode(sha256(bytes),'hex');
  if octet_length(bytes)>10485760 then raise exception 'Source files are limited to 10 MB.' using errcode='22023';end if;
  if not exists(select 1 from payroll_history_private.reconciliation_sources s where s.reconciliation_id=rec.id and s.kind=p_kind and s.source_hash=hash) then
   insert into payroll_history_private.reconciliation_sources(reconciliation_id,kind,filename,source_bytes,source_hash,reference,created_by) values(rec.id,p_kind,p_filename,bytes,hash,btrim(p_reference),auth.uid());
  end if;
 end if;
 for row_data in select value from jsonb_array_elements(p_rows) loop
  key:=nullif(btrim(row_data->>'recordKey'),'');employee:=nullif(row_data->>'employeeId','')::uuid;work_day:=nullif(row_data->>'workDate','')::date;
  if key is null or employee is null then raise exception 'Every row needs a stable record key and matched employee.' using errcode='22023';end if;
  if not exists(select 1 from public.hris_users h join public.payroll_access_scopes s on s.id=rec.scope_id where h.id=employee and h.business_unit_id=s.business_unit_id) then raise exception 'A row contains an employee outside the selected business unit.' using errcode='42501';end if;
  if p_kind in ('schedule','attendance') and (work_day is null or work_day not between rec.date_from and rec.date_to) then raise exception 'Schedule and attendance dates must be inside the historical payroll period.' using errcode='22023';end if;
  select coalesce(max(r.revision),0)+1 into rev from payroll_history_private.reconciliation_records r where r.reconciliation_id=rec.id and r.kind=p_kind and r.record_key=key;
  insert into payroll_history_private.reconciliation_records(reconciliation_id,kind,record_key,employee_id,work_date,payload,revision,created_by) values(rec.id,p_kind,key,employee,work_day,row_data-'recordKey'-'employeeId'-'workDate',rev,auth.uid());saved:=saved+1;
 end loop;
 update payroll_history_private.reconciliations set status='draft',updated_by=auth.uid(),updated_at=now() where id=rec.id;
 insert into payroll_history_private.reconciliation_audit(reconciliation_id,actor,action,details) values(rec.id,auth.uid(),p_kind||'_saved',jsonb_build_object('rows',saved,'filename',p_filename,'sourceHash',hash,'reference',p_reference));
 return jsonb_build_object('saved',saved,'sourceHash',hash);
end $$;

-- Recalculate from isolated schedule/attendance rows and the dated approved package.
-- The result is diagnostic only; no live payroll table is referenced as a write target.
create function public.run_historical_payroll_reconciliation(p_reconciliation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rec payroll_history_private.reconciliations; emp record; pkg public.payroll_pay_packages; original jsonb; calc jsonb; rows jsonb:='[]';issues jsonb; result jsonb;hash text;existing payroll_history_private.reconciliation_runs;version integer;monthly_shares jsonb;
 regular_minutes numeric;ot_minutes numeric;worked_days numeric;hourly numeric;basic numeric;components numeric;gross numeric;original_gross numeric;original_deductions numeric;original_net numeric;deductions numeric;net numeric;variance numeric;
 mandatory numeric;tax numeric;loan_total numeric;monthly_basis numeric;
 total_og numeric:=0;total_rg numeric:=0;total_on numeric:=0;total_rn numeric:=0;matched integer:=0;different integer:=0;missing integer:=0;
begin
 select * into rec from payroll_history_private.reconciliations where id=p_reconciliation for update;
 if rec.id is null or not payroll_history_private.reconciliation_allowed(rec.scope_id) or rec.status='archived' then raise exception 'Only an accessible, unarchived reconciliation can be calculated.' using errcode='42501';end if;
 for emp in
  select distinct h.id,h.employee_id,h.full_name from public.hris_users h join public.payroll_access_scopes s on s.id=rec.scope_id and s.business_unit_id=h.business_unit_id
  where exists(select 1 from payroll_history_private.reconciliation_records rr where rr.reconciliation_id=rec.id and rr.employee_id=h.id)
 loop
  issues:='[]';original:=null;select x.payload into original from (select distinct on(record_key) * from payroll_history_private.reconciliation_records where reconciliation_id=rec.id and kind='original_payroll' and employee_id=emp.id order by record_key,revision desc)x limit 1;
  select * into pkg from public.payroll_pay_packages p where p.employee_id=emp.id and p.status in('approved','superseded') and p.effective_from<=rec.date_to order by p.effective_from desc limit 1;
  select coalesce(sum(coalesce((x.payload->>'workedMinutes')::numeric,0)),0),coalesce(sum(coalesce((x.payload->>'overtimeMinutes')::numeric,0)),0),count(*) filter(where coalesce((x.payload->>'workedMinutes')::numeric,0)>0)
  into regular_minutes,ot_minutes,worked_days from (select distinct on(record_key) * from payroll_history_private.reconciliation_records where reconciliation_id=rec.id and kind='attendance' and employee_id=emp.id order by record_key,revision desc)x;
  if original is null then issues:=issues||jsonb_build_array('Original payroll result missing');end if;
  if pkg.id is null then issues:=issues||jsonb_build_array('Historical pay package missing');end if;
  if not exists(select 1 from payroll_history_private.reconciliation_records where reconciliation_id=rec.id and kind='schedule' and employee_id=emp.id) then issues:=issues||jsonb_build_array('Historical schedule missing');end if;
  if not exists(select 1 from payroll_history_private.reconciliation_records where reconciliation_id=rec.id and kind='attendance' and employee_id=emp.id) then issues:=issues||jsonb_build_array('Historical attendance missing');end if;
  if pkg.id is not null then
   hourly:=case pkg.rate_type when 'Monthly' then pkg.base_amount*12/261/8 when 'Daily' then pkg.base_amount/8 else pkg.base_amount end;
   basic:=case pkg.rate_type when 'Monthly' then pkg.base_amount/2 when 'Daily' then worked_days*pkg.base_amount else regular_minutes/60*pkg.base_amount end;
   select coalesce(sum(case coalesce(c->>'frequency',c->>'recurrence') when 'Monthly' then (c->>'amount')::numeric/2 when 'Semi-monthly' then (c->>'amount')::numeric else 0 end),0) into components from jsonb_array_elements(pkg.components)c where coalesce((c->>'includedInGuaranteedPay')::boolean,true) and coalesce(c->>'classification','Guaranteed') ilike 'Guaranteed%';
   gross:=round(basic+components+(ot_minutes/60*hourly*1.25),2);
  else gross:=0;basic:=0;components:=0;end if;
  original_gross:=coalesce(nullif(original->>'grossPay','')::numeric,0);original_deductions:=coalesce(nullif(original->>'totalDeductions','')::numeric,0);original_net:=coalesce(nullif(original->>'netPay','')::numeric,original_gross-original_deductions);
  monthly_basis:=case when pkg.rate_type='Monthly' then pkg.base_amount else gross*2 end;
  if extract(year from rec.release_date)=2026 and pkg.id is not null then
   monthly_shares:=private.payroll_contributions_2026(jsonb_build_object('sssBase',monthly_basis,'philhealthBase',monthly_basis,'pagibigBase',monthly_basis,'sssCovered',true,'philhealthCovered',true,'pagibigCovered',true));
   mandatory:=round((coalesce((monthly_shares->>'sssEE')::numeric,0)+coalesce((monthly_shares->>'mpfEE')::numeric,0)+coalesce((monthly_shares->>'philhealthEE')::numeric,0)+coalesce((monthly_shares->>'pagibigEE')::numeric,0))/2,2);
   tax:=round(private.payroll_withholding_2023(greatest(0,gross-mandatory),0),2);
  else mandatory:=0;tax:=0;end if;
  select coalesce(sum(x.installment),0) into loan_total from (select distinct on(l.account_ref) l.account_ref,l.installment from public.payroll_loan_ledger l where l.employee_id=emp.id and l.as_of<=rec.release_date order by l.account_ref,l.as_of desc,l.revision desc)x;
  deductions:=mandatory+tax+loan_total+coalesce(nullif(original->>'authorizedDeductions','')::numeric,0)+coalesce(nullif(original->>'otherDeductions','')::numeric,0);
  net:=round(gross-deductions,2);variance:=round(net-original_net,2);
  if jsonb_array_length(issues)>0 then missing:=missing+1;elsif abs(variance)<=0.01 then matched:=matched+1;else different:=different+1;end if;
  total_og:=total_og+original_gross;total_rg:=total_rg+gross;total_on:=total_on+original_net;total_rn:=total_rn+net;
  calc:=jsonb_build_object('employeeId',emp.id,'employeeCode',emp.employee_id,'employeeName',emp.full_name,'packageId',pkg.id,'packageEffectiveFrom',pkg.effective_from,'packageSource',pkg.source_ref,'basic',basic,'components',components,'overtime',round(ot_minutes/60*hourly*1.25,2),'governmentContributions',mandatory,'withholdingTax',tax,'loanDeductions',loan_total,'originalGross',original_gross,'recalculatedGross',gross,'grossDifference',round(gross-original_gross,2),'originalDeductions',original_deductions,'recalculatedDeductions',deductions,'deductionDifference',round(deductions-original_deductions,2),'originalNet',original_net,'recalculatedNet',net,'netDifference',variance,'issues',issues,'status',case when jsonb_array_length(issues)>0 then 'Missing historical information' when abs(variance)<=.01 then 'Match' else 'Difference found' end);
  rows:=rows||jsonb_build_array(calc);
 end loop;
 if jsonb_array_length(rows)=0 then raise exception 'Add employees and the original payroll result before recalculating.' using errcode='22023';end if;
 result:=jsonb_build_object('employees',rows,'summary',jsonb_build_object('reviewed',jsonb_array_length(rows),'matched',matched,'differences',different,'missing',missing,'originalGross',round(total_og,2),'recalculatedGross',round(total_rg,2),'grossVariance',round(total_rg-total_og,2),'originalNet',round(total_on,2),'recalculatedNet',round(total_rn,2),'netVariance',round(total_rn-total_on,2)));
 hash:=md5(jsonb_build_object('reconciliation',to_jsonb(rec)-'updated_at'-'updated_by','records',(select jsonb_agg(to_jsonb(x) order by x.kind,x.record_key,x.revision) from payroll_history_private.reconciliation_records x where x.reconciliation_id=rec.id),'result',result)::text);
 select * into existing from payroll_history_private.reconciliation_runs x where x.reconciliation_id=rec.id and x.snapshot_hash=hash;
 if existing.id is null then
  select coalesce(max(x.version),0)+1 into version from payroll_history_private.reconciliation_runs x where x.reconciliation_id=rec.id;
  insert into payroll_history_private.reconciliation_runs(reconciliation_id,version,snapshot_hash,snapshot,result,created_by) values(rec.id,version,hash,jsonb_build_object('releaseDate',rec.release_date,'dateFrom',rec.date_from,'dateTo',rec.date_to,'recordCount',(select count(*) from payroll_history_private.reconciliation_records x where x.reconciliation_id=rec.id)),result,auth.uid()) returning * into existing;
  insert into payroll_history_private.reconciliation_audit(reconciliation_id,actor,action,details) values(rec.id,auth.uid(),'reconciliation_calculated',jsonb_build_object('runId',existing.id,'version',version,'summary',result->'summary'));
 end if;
 update payroll_history_private.reconciliations set status='calculated',updated_by=auth.uid(),updated_at=now() where id=rec.id;
 return jsonb_build_object('id',existing.id,'version',existing.version,'createdAt',existing.created_at,'result',existing.result);
end $$;

create function public.archive_historical_reconciliation(p_reconciliation uuid)
returns void language plpgsql security definer set search_path='' as $$
declare rec payroll_history_private.reconciliations;begin
 select * into rec from payroll_history_private.reconciliations where id=p_reconciliation for update;
 if rec.id is null or not payroll_history_private.reconciliation_allowed(rec.scope_id) then raise exception 'Reconciliation not found or outside your access.' using errcode='42501';end if;
 update payroll_history_private.reconciliations set status='archived',archived_at=now(),updated_by=auth.uid(),updated_at=now() where id=rec.id;
 insert into payroll_history_private.reconciliation_audit(reconciliation_id,actor,action) values(rec.id,auth.uid(),'reconciliation_archived');
end $$;

revoke all on function public.get_historical_reconciliation_context(uuid),public.save_historical_reconciliation(uuid,uuid,date,date,date,text),public.save_historical_reconciliation_dataset(uuid,text,jsonb,text,text,text),public.run_historical_payroll_reconciliation(uuid),public.archive_historical_reconciliation(uuid) from public,anon;
grant execute on function public.get_historical_reconciliation_context(uuid),public.save_historical_reconciliation(uuid,uuid,date,date,date,text),public.save_historical_reconciliation_dataset(uuid,text,jsonb,text,text,text),public.run_historical_payroll_reconciliation(uuid),public.archive_historical_reconciliation(uuid) to authenticated;
notify pgrst,'reload schema';
