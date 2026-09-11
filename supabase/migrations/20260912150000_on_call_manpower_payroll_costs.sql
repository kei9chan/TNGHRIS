-- Link the manpower dashboard to the reviewed payroll gross-pay engine.
-- The dashboard must not recreate overtime or compensation formulas in the
-- client.  We only read the immutable gross-run line items produced by the
-- existing payroll engine and keep the caller's normal HRIS scope.

create or replace function private.on_call_manpower_payroll_ot_costs(
  p_from date,
  p_to date,
  p_business_unit_id uuid,
  p_department_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with current_runs as (
    select
      g.scope_id,
      g.date_from,
      g.date_to,
      g.version,
      g.created_at,
      g.id,
      g.result,
      row_number() over (
        partition by g.scope_id, g.date_from, g.date_to
        order by g.version desc, g.created_at desc, g.id desc
      ) as run_rank
    from public.payroll_gross_runs g
    join public.payroll_access_scopes scope
      on scope.id = g.scope_id
     and scope.kind = 'business_unit'
    where g.date_from <= p_to
      and g.date_to >= p_from
      and (p_business_unit_id is null or scope.business_unit_id = p_business_unit_id)
  ),
  ot_lines as (
    select
      employee_row->>'employeeId' as employee_id,
      nullif(line_row->>'date', '')::date as work_date,
      coalesce(nullif(line_row->>'amount', '')::numeric, 0) as cost
    from current_runs run
    cross join lateral jsonb_array_elements(coalesce(run.result->'employees', '[]'::jsonb)) employee_row
    cross join lateral jsonb_array_elements(coalesce(employee_row->'lines', '[]'::jsonb)) line_row
    join public.hris_users employee
      on employee.id = nullif(employee_row->>'employeeId', '')::uuid
     and lower(employee.status) = 'active'
    where run.run_rank = 1
      and coalesce(run.result->>'ready', 'false') = 'true'
      and line_row->>'label' = 'Approved actual overtime'
      and nullif(line_row->>'date', '')::date between p_from and p_to
      and (p_department_id is null or employee.department_id = p_department_id)
      and public.can_access_hris_user(employee.id)
  ),
  daily as (
    select work_date as date, sum(cost) as cost
    from ot_lines
    group by work_date
  ),
  employees as (
    select employee_id, sum(cost) as cost
    from ot_lines
    group by employee_id
  )
  select jsonb_build_object(
    'total', coalesce((select sum(cost) from ot_lines), 0),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'cost', cost) order by date) from daily), '[]'::jsonb),
    'employees', coalesce((select jsonb_agg(jsonb_build_object('employeeId', employee_id, 'cost', cost) order by employee_id) from employees), '[]'::jsonb)
  )
$$;

revoke all on function private.on_call_manpower_payroll_ot_costs(date, date, uuid, uuid) from public, anon, authenticated;

create or replace function public.get_on_call_manpower_dashboard_v2(
  p_from date default ((current_date at time zone 'Asia/Manila')::date - 29),
  p_to date default (current_date at time zone 'Asia/Manila')::date,
  p_business_unit_id uuid default null,
  p_department_id uuid default null,
  p_employment_type text default null,
  p_shift text default null,
  p_event text default null,
  p_location text default null,
  p_cost_status text default null,
  p_coverage_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base_result jsonb;
  filtered_daily jsonb;
  filtered_employees jsonb;
  filtered_events jsonb;
  calculated_kpis jsonb;
  payroll_costs jsonb;
begin
  -- The base function performs authentication, role and data-scope checks
  -- before returning any rows.  This wrapper only narrows that result.
  base_result := public.get_on_call_manpower_dashboard(
    p_from, p_to, p_business_unit_id, p_department_id,
    p_employment_type, p_shift, p_event, p_cost_status, p_coverage_status
  );
  payroll_costs := private.on_call_manpower_payroll_ot_costs(
    p_from, p_to, p_business_unit_id, p_department_id
  );

  select coalesce(jsonb_agg(
    day_row || jsonb_build_object(
      'approvedOtCost', coalesce((
        select (ot_row->>'cost')::numeric
        from jsonb_array_elements(coalesce(payroll_costs->'daily', '[]'::jsonb)) ot_row
        where ot_row->>'date' = day_row->>'date'
      ), 0),
      'actualCost', coalesce((day_row->>'regularCost')::numeric, 0)
        + coalesce((day_row->>'replacementActualCost')::numeric, 0)
        + coalesce((
          select (ot_row->>'cost')::numeric
          from jsonb_array_elements(coalesce(payroll_costs->'daily', '[]'::jsonb)) ot_row
          where ot_row->>'date' = day_row->>'date'
        ), 0),
      'projectedCost', coalesce((day_row->>'projectedCost')::numeric, 0)
        + coalesce((
          select (ot_row->>'cost')::numeric
          from jsonb_array_elements(coalesce(payroll_costs->'daily', '[]'::jsonb)) ot_row
          where ot_row->>'date' = day_row->>'date'
        ), 0)
    ) order by day_row->>'date'
  ), '[]'::jsonb)
  into filtered_daily
  from jsonb_array_elements(coalesce(base_result->'daily', '[]'::jsonb)) as day_row
  where (p_coverage_status is null
    or lower(day_row->>'coverageStatus') = lower(p_coverage_status))
    and (nullif(trim(p_location), '') is null
      or exists (
        select 1
        from jsonb_array_elements(coalesce(day_row->'events', '[]'::jsonb)) as event_row
        where coalesce(event_row->>'location', '') ilike '%' || trim(p_location) || '%'
      ));

  select coalesce(jsonb_agg(
    employee_row || jsonb_build_object(
      'businessUnit', (
        select bu.name
        from public.business_units bu
        where bu.id = nullif(employee_row->>'businessUnitId', '')::uuid
      ),
      'approvedOtCost', coalesce((
        select (ot_row->>'cost')::numeric
        from jsonb_array_elements(coalesce(payroll_costs->'employees', '[]'::jsonb)) ot_row
        where ot_row->>'employeeId' = employee_row->>'employeeId'
      ), 0),
      'totalActualCost', coalesce((employee_row->>'regularCost')::numeric, 0)
        + coalesce((employee_row->>'onCallCost')::numeric, 0)
        + coalesce((
          select (ot_row->>'cost')::numeric
          from jsonb_array_elements(coalesce(payroll_costs->'employees', '[]'::jsonb)) ot_row
          where ot_row->>'employeeId' = employee_row->>'employeeId'
        ), 0)
    ) order by
      coalesce((employee_row->>'regularCost')::numeric, 0)
      + coalesce((employee_row->>'onCallCost')::numeric, 0)
      + coalesce((
        select (ot_row->>'cost')::numeric
        from jsonb_array_elements(coalesce(payroll_costs->'employees', '[]'::jsonb)) ot_row
        where ot_row->>'employeeId' = employee_row->>'employeeId'
      ), 0) desc,
      employee_row->>'employeeName'
  ), '[]'::jsonb)
  into filtered_employees
  from jsonb_array_elements(coalesce(base_result->'employees', '[]'::jsonb)) as employee_row
  where nullif(trim(p_cost_status), '') is null
    or lower(coalesce(employee_row->>'costStatus', '')) like '%' || lower(trim(p_cost_status)) || '%';

  select coalesce(jsonb_agg(event_row order by event_row->>'start_date', event_row->>'event_name'), '[]'::jsonb)
  into filtered_events
  from jsonb_array_elements(coalesce(base_result->'events', '[]'::jsonb)) as event_row
  where nullif(trim(p_location), '') is null
    or coalesce(event_row->>'location', '') ilike '%' || trim(p_location) || '%';

  select jsonb_build_object(
    'scheduledHeadcount', coalesce(sum((day_row->>'scheduled')::numeric), 0)::integer,
    'reportedHeadcount', coalesce(sum((day_row->>'reported')::numeric), 0)::integer,
    'sickCallIns', coalesce(sum((day_row->>'sick')::numeric), 0)::integer,
    'replacementShifts', coalesce(sum((day_row->>'onCall')::numeric), 0),
    'totalOnCallHours', coalesce((select sum((employee_row->>'onCallHours')::numeric) from jsonb_array_elements(filtered_employees) as employee_row), 0),
    'unfilledPositions', coalesce(sum((day_row->>'unfilled')::numeric), 0),
    'regularProvisionalCost', coalesce(sum((day_row->>'regularCost')::numeric), 0),
    'onCallCommittedCost', coalesce(sum((day_row->>'onCallCommittedCost')::numeric), 0),
    'onCallActualCost', coalesce(sum((day_row->>'replacementActualCost')::numeric), 0),
    'approvedOtCost', coalesce(sum((day_row->>'approvedOtCost')::numeric), 0),
    'totalActualCost', coalesce(sum((day_row->>'actualCost')::numeric), 0),
    'projectedCost', coalesce(sum((day_row->>'projectedCost')::numeric), 0),
    'costStatus', base_result->'kpis'->>'costStatus',
    'actualThroughToday', base_result->'kpis'->>'actualThroughToday',
    'reportingRate', case when coalesce(sum((day_row->>'scheduled')::numeric), 0) = 0 then 0
      else round(100 * coalesce(sum((day_row->>'reported')::numeric), 0) / sum((day_row->>'scheduled')::numeric), 1) end
  )
  into calculated_kpis
  from jsonb_array_elements(filtered_daily) as day_row;

  return base_result || jsonb_build_object(
    'kpis', calculated_kpis,
    'daily', filtered_daily,
    'employees', filtered_employees,
    'events', filtered_events
  );
end;
$$;

revoke all on function public.get_on_call_manpower_dashboard_v2(date, date, uuid, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.get_on_call_manpower_dashboard_v2(date, date, uuid, uuid, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
