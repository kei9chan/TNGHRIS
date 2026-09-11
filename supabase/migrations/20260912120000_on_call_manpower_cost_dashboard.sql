-- On-Call & Manpower Cost dashboard
-- The dashboard reads schedules, verified clock events, leave, overtime and
-- approved on-call requests from the existing HRIS sources.  These tables only
-- add the missing operational notes and replacement verification records.

create table if not exists public.manpower_event_notes (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (length(trim(event_name)) between 2 and 160),
  start_date date not null,
  end_date date not null,
  business_unit_id uuid references public.business_units(id),
  location text,
  expected_attendance integer check (expected_attendance is null or expected_attendance >= 0),
  staffing_target integer check (staffing_target is null or staffing_target >= 0),
  budget_limit numeric(20,2) check (budget_limit is null or budget_limit >= 0),
  notes text,
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  created_by uuid not null references public.hris_users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (end_date >= start_date)
);

create index if not exists manpower_event_notes_dates_idx
  on public.manpower_event_notes (start_date, end_date, business_unit_id);

create table if not exists public.on_call_replacements (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.manpower_requests(id),
  work_date date not null,
  absent_employee_id uuid references public.hris_users(id),
  position text not null check (length(trim(position)) between 1 and 160),
  shift_label text,
  replacement_employee_id uuid references public.hris_users(id),
  status text not null default 'Requested' check (status in ('Requested','Pending Approval','Approved','Checked In','Verified Actual','Pending Confirmation','No-Show','Cancelled','Unfilled')),
  verified_hours numeric(8,2) check (verified_hours is null or verified_hours >= 0),
  actual_cost numeric(20,2) check (actual_cost is null or actual_cost >= 0),
  notes text,
  created_by uuid not null references public.hris_users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (request_id, work_date, position, absent_employee_id, replacement_employee_id)
);

create index if not exists on_call_replacements_date_idx
  on public.on_call_replacements (work_date, status, replacement_employee_id);

alter table public.manpower_event_notes enable row level security;
alter table public.on_call_replacements enable row level security;

drop policy if exists manpower_event_notes_view on public.manpower_event_notes;
create policy manpower_event_notes_view on public.manpower_event_notes
  for select to authenticated
  using (
    public.has_feature_permission('Manpower','view')
    and (
      (public.current_data_scope()->>'type') = 'GLOBAL'
      or business_unit_id is null
      or public.can_access_hris_user(created_by)
      or business_unit_id = (select business_unit_id from public.hris_users where id = public.current_hris_user_id())
    )
  );

drop policy if exists manpower_event_notes_write on public.manpower_event_notes;
create policy manpower_event_notes_write on public.manpower_event_notes
  for all to authenticated
  using (public.has_feature_permission('Manpower','create') and public.can_access_hris_user(created_by))
  with check (
    public.has_feature_permission('Manpower','create')
    and created_by = public.current_hris_user_id()
    and (
      (public.current_data_scope()->>'type') = 'GLOBAL'
      or business_unit_id is null
      or business_unit_id = (select business_unit_id from public.hris_users where id = public.current_hris_user_id())
    )
  );

drop policy if exists on_call_replacements_view on public.on_call_replacements;
create policy on_call_replacements_view on public.on_call_replacements
  for select to authenticated
  using (
    public.has_feature_permission('Manpower','view')
    and (
      public.can_access_hris_user(coalesce(replacement_employee_id, absent_employee_id))
      or exists (select 1 from public.manpower_requests r where r.id = request_id and public.can_access_hris_user(r.requester_id))
    )
  );

drop policy if exists on_call_replacements_write on public.on_call_replacements;
create policy on_call_replacements_write on public.on_call_replacements
  for all to authenticated
  using (public.has_feature_permission('Manpower','create') and public.can_access_hris_user(created_by))
  with check (public.has_feature_permission('Manpower','create') and created_by = public.current_hris_user_id());

-- The two oversight roles previously had approval-only Manpower permissions,
-- which hid this read-only cost dashboard from their navigation.
insert into public.role_permissions(role_id, resource_id, permissions)
values
  ('GeneralManager','Manpower',array['view','approve','review','reject','return']),
  ('Operations Director','Manpower',array['view','approve','review','reject','return'])
on conflict (role_id, resource_id) do update
set permissions = (select array_agg(distinct p order by p) from unnest(role_permissions.permissions || excluded.permissions) p),
    updated_at = now();

create or replace function public.get_on_call_manpower_dashboard(
  p_from date default ((current_date at time zone 'Asia/Manila')::date - 29),
  p_to date default (current_date at time zone 'Asia/Manila')::date,
  p_business_unit_id uuid default null,
  p_department_id uuid default null,
  p_employment_type text default null,
  p_shift text default null,
  p_event text default null,
  p_cost_status text default null,
  p_coverage_status text default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_scope jsonb;
  scope_type text;
  actor_bu uuid;
  result jsonb;
begin
  if actor_id is null or not public.has_feature_permission('Manpower','view') then
    raise exception 'You do not have permission to view manpower costs.' using errcode = '42501';
  end if;
  if not (
    public.has_active_role('Board of Director')
    or public.has_active_role('GeneralManager')
    or public.has_active_role('Operations Director')
    or public.has_active_role('HR Manager')
    or public.has_active_role('HR Staff')
    or public.has_active_role('Business Unit Manager')
    or public.has_active_role('Manager')
  ) then
    raise exception 'This dashboard is limited to authorized HR and management roles.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Choose a valid date range of 366 days or less.' using errcode = '22023';
  end if;

  actor_scope := public.current_data_scope();
  scope_type := actor_scope->>'type';
  select business_unit_id into actor_bu from public.hris_users where id = actor_id;

  -- All scope and filter checks happen in this function.  It is intentionally
  -- not a view so a security-definer query cannot accidentally expose a wider
  -- dataset through PostgREST.
  with scheduled as (
    select
      s.id, s.date, s.employee_id, s.business_unit_id, s.department_id,
      e.full_name, e.department, e.position, e.rate_type,
      coalesce(nullif(e.rate_amount,0), nullif(e.salary_basic,0), 0)::numeric as rate_amount,
      coalesce(t.paid_minutes, 480)::numeric as paid_minutes,
      t.name as shift_name,
      exists (
        select 1 from public.attendance_clock_events ce
        where ce.employee_id = s.employee_id
          and (ce.occurred_at at time zone 'Asia/Manila')::date = s.date
          and ce.action = 'CLOCK_IN'
      ) as reported
    from public.shift_assignments s
    join public.hris_users e on e.id = s.employee_id and lower(e.status) = 'active'
    left join public.shift_templates t on t.id = s.shift_template_id
    where s.date between p_from and p_to
      and (p_business_unit_id is null or s.business_unit_id = p_business_unit_id)
      and (p_department_id is null or s.department_id = p_department_id)
      and (p_employment_type is null or lower(coalesce(e.employment_status,'')) = lower(p_employment_type))
      and (p_shift is null or lower(coalesce(t.name,'')) = lower(p_shift))
      and (
        scope_type = 'GLOBAL'
        or (scope_type = 'SPECIFIC' and s.business_unit_id::text in (select jsonb_array_elements_text(actor_scope->'allowedBuIds')))
        or (scope_type = 'HOME_ONLY' and s.business_unit_id = actor_bu)
        or (scope_type = 'DEPARTMENT' and s.department_id = (select department_id from public.hris_users where id=actor_id))
        or (scope_type = 'DIRECT_REPORTS' and (s.employee_id = actor_id or e.reports_to in (actor_id::text, (select auth_user_id::text from public.hris_users where id=actor_id), (select employee_id from public.hris_users where id=actor_id))))
      )
  ), oncall as (
    select m.id, m.date_needed as work_date, m.business_unit_id, m.department_id,
      coalesce(sum(coalesce(nullif(item->>'onCallNeeded','')::numeric, nullif(item->>'requestedCount','')::numeric, 0)),0) as shifts,
      coalesce(sum(coalesce(nullif(item->>'totalItemCost','')::numeric,0)),0) as cost
    from public.manpower_requests m
    cross join lateral jsonb_array_elements(coalesce(m.items,'[]'::jsonb)) item
    where m.date_needed between p_from and p_to
      and m.status = 'Approved'
      and (p_business_unit_id is null or m.business_unit_id = p_business_unit_id)
      and (p_department_id is null or m.department_id = p_department_id)
      and (
        scope_type = 'GLOBAL'
        or (scope_type = 'SPECIFIC' and m.business_unit_id::text in (select jsonb_array_elements_text(actor_scope->'allowedBuIds')))
        or (scope_type = 'HOME_ONLY' and m.business_unit_id = actor_bu)
        or (scope_type = 'DEPARTMENT' and m.department_id = (select department_id from public.hris_users where id=actor_id))
        or (scope_type = 'DIRECT_REPORTS' and m.requester_id = actor_id)
      )
    group by m.id, m.date_needed, m.business_unit_id, m.department_id
  ), sick as (
    select l.employee_id, d::date as work_date
    from public.leave_requests l
    join public.leave_types lt on lt.id = l.leave_type_id
    cross join lateral generate_series(greatest(l.start_date,p_from)::timestamp, least(l.end_date,p_to)::timestamp, interval '1 day') d
    where l.status = 'Approved'
      and (lower(lt.name) like '%sick%' or lower(coalesce(l.reason,'')) like '%sick%')
  ), daily as (
    select d::date as work_date,
      coalesce((select count(*) from scheduled s where s.date=d),0)::integer scheduled,
      coalesce((select count(*) from scheduled s where s.date=d and s.reported),0)::integer reported,
      coalesce((select count(distinct s.employee_id) from scheduled s join sick k on k.employee_id=s.employee_id and k.work_date=d where s.date=d),0)::integer sick,
      coalesce((select sum(o.shifts) from oncall o where o.work_date=d),0)::numeric oncall_shifts,
      coalesce((select sum(o.cost) from oncall o where o.work_date=d),0)::numeric oncall_committed_cost,
      coalesce((select sum(case when s.reported then case when s.rate_type='Daily' then s.rate_amount when s.rate_type='Hourly' then s.rate_amount*s.paid_minutes/60 when s.rate_type='Monthly' then s.rate_amount*12/extract(day from (date_trunc('month',d::date)+interval '1 month - 1 day')) else 0 end else 0 end) from scheduled s where s.date=d),0)::numeric regular_provisional_cost,
      coalesce((select count(*) from public.on_call_replacements r where r.work_date=d and r.status='Verified Actual'),0)::integer verified_replacements,
      coalesce((select sum(coalesce(r.actual_cost,0)) from public.on_call_replacements r where r.work_date=d and r.status='Verified Actual'),0)::numeric replacement_actual_cost,
      coalesce((select jsonb_agg(to_jsonb(n) order by n.priority desc,n.start_date) from public.manpower_event_notes n where n.start_date<=d::date and n.end_date>=d::date and (p_business_unit_id is null or n.business_unit_id=p_business_unit_id) and (p_event is null or n.event_name ilike '%'||p_event||'%')), '[]'::jsonb) events
    from generate_series(p_from,p_to,interval '1 day') d
  ), employees as (
    select s.employee_id, max(s.full_name) employee_name, max(s.business_unit_id) business_unit_id,
      max(s.department) department, sum(case when s.reported then 1 else 0 end)::integer reported_shifts,
      count(*)::integer scheduled_shifts,
      sum(case when s.reported then case when s.rate_type='Daily' then s.rate_amount when s.rate_type='Hourly' then s.rate_amount*s.paid_minutes/60 when s.rate_type='Monthly' then s.rate_amount*12/extract(day from (date_trunc('month',s.date)+interval '1 month - 1 day')) else 0 end else 0 end)::numeric regular_provisional_cost,
      coalesce((select sum(coalesce(r.verified_hours,0)) from public.on_call_replacements r where r.replacement_employee_id=s.employee_id and r.work_date between p_from and p_to and r.status='Verified Actual'),0)::numeric oncall_hours,
      coalesce((select sum(coalesce(r.actual_cost,0)) from public.on_call_replacements r where r.replacement_employee_id=s.employee_id and r.work_date between p_from and p_to and r.status='Verified Actual'),0)::numeric oncall_actual_cost,
      coalesce((select count(*) from public.on_call_replacements r where r.replacement_employee_id=s.employee_id and r.work_date between p_from and p_to and r.status='Verified Actual'),0)::integer oncall_shifts
    from scheduled s group by s.employee_id
  )
  select jsonb_build_object(
    'from',p_from,'to',p_to,'scopeType',scope_type,'businessUnitId',p_business_unit_id,'departmentId',p_department_id,
    'kpis',jsonb_build_object(
      'scheduledHeadcount',(select coalesce(sum(scheduled),0) from daily),
      'reportedHeadcount',(select coalesce(sum(reported),0) from daily),
      'sickCallIns',(select coalesce(sum(sick),0) from daily),
      'replacementShifts',(select coalesce(sum(oncall_shifts),0) from daily),
      'totalOnCallHours',(select coalesce(sum(oncall_hours),0) from employees),
      'unfilledPositions',(select coalesce(sum(greatest(scheduled-reported-oncall_shifts,0)),0) from daily),
      'regularProvisionalCost',(select coalesce(sum(regular_provisional_cost),0) from daily),
      'onCallCommittedCost',(select coalesce(sum(oncall_committed_cost),0) from daily),
      'onCallActualCost',(select coalesce(sum(replacement_actual_cost),0) from daily),
      'approvedOtCost',0,
      'totalActualCost',(select coalesce(sum(replacement_actual_cost),0) from daily),
      'projectedCost',(select coalesce(sum(regular_provisional_cost+oncall_committed_cost),0) from daily),
      'costStatus',case when exists(select 1 from public.payroll_gross_runs g where g.date_from<=p_to and g.date_to>=p_from) then 'Actual + Provisional' else 'Provisional / Committed' end,
      'actualThroughToday',least(p_to,(current_date at time zone 'Asia/Manila')::date),
      'reportingRate',case when (select coalesce(sum(scheduled),0) from daily)=0 then 0 else round(100*(select coalesce(sum(reported),0)::numeric from daily)/(select sum(scheduled)::numeric from daily),1) end
    ),
    'daily',coalesce((select jsonb_agg(jsonb_build_object('date',work_date,'scheduled',scheduled,'reported',reported,'sick',sick,'onCall',oncall_shifts,'unfilled',greatest(scheduled-reported-oncall_shifts,0),'regularCost',regular_provisional_cost,'onCallCommittedCost',oncall_committed_cost,'replacementActualCost',replacement_actual_cost,'actualCost',replacement_actual_cost,'projectedCost',regular_provisional_cost+oncall_committed_cost,'coverageStatus',case when greatest(scheduled-reported-oncall_shifts,0)>0 then 'Unfilled' when oncall_shifts>0 then 'Covered with on-call' else 'Fully covered' end,'events',events) order by work_date) from daily),'[]'::jsonb),
    'employees',coalesce((select jsonb_agg(jsonb_build_object('employeeId',employee_id,'employeeName',employee_name,'businessUnitId',business_unit_id,'department',department,'regularCost',regular_provisional_cost,'onCallShifts',oncall_shifts,'onCallHours',oncall_hours,'onCallCost',oncall_actual_cost,'approvedOtCost',0,'totalActualCost',oncall_actual_cost,'costStatus','Provisional / Actual') order by regular_provisional_cost+oncall_actual_cost desc,employee_name) from employees),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(n) order by n.start_date,n.event_name) from public.manpower_event_notes n where n.end_date>=p_from and n.start_date<=p_to and (p_business_unit_id is null or n.business_unit_id=p_business_unit_id) and (p_event is null or n.event_name ilike '%'||p_event||'%')),'[]'::jsonb),
    'replacements',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'date',r.work_date,'absentEmployeeId',r.absent_employee_id,'position',r.position,'shift',r.shift_label,'replacementEmployeeId',r.replacement_employee_id,'status',r.status,'hours',r.verified_hours,'cost',r.actual_cost,'requestId',r.request_id) order by r.work_date,r.created_at) from public.on_call_replacements r join public.manpower_requests m on m.id=r.request_id where r.work_date between p_from and p_to and (p_business_unit_id is null or m.business_unit_id=p_business_unit_id)),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_on_call_manpower_dashboard(date,date,uuid,uuid,text,text,text,text,text) from public, anon;
grant execute on function public.get_on_call_manpower_dashboard(date,date,uuid,uuid,text,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';
