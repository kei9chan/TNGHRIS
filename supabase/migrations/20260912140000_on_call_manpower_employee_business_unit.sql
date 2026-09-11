-- Include the business-unit label in employee cost rows without widening the
-- scope: the v2 RPC already returned only rows permitted to the caller.
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
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  base_result jsonb;
  filtered_daily jsonb;
  filtered_employees jsonb;
  filtered_events jsonb;
  calculated_kpis jsonb;
begin
  base_result := public.get_on_call_manpower_dashboard(
    p_from, p_to, p_business_unit_id, p_department_id,
    p_employment_type, p_shift, p_event, p_cost_status, p_coverage_status
  );

  select coalesce(jsonb_agg(
    day_row || jsonb_build_object(
      'actualCost', coalesce((day_row->>'regularCost')::numeric, 0)
        + coalesce((day_row->>'replacementActualCost')::numeric, 0)
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
      'totalActualCost', coalesce((employee_row->>'regularCost')::numeric, 0)
        + coalesce((employee_row->>'onCallCost')::numeric, 0)
        + coalesce((employee_row->>'approvedOtCost')::numeric, 0)
    ) order by
      coalesce((employee_row->>'regularCost')::numeric, 0)
      + coalesce((employee_row->>'onCallCost')::numeric, 0) desc,
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
    'approvedOtCost', coalesce((base_result->'kpis'->>'approvedOtCost')::numeric, 0),
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
    'kpis', calculated_kpis, 'daily', filtered_daily,
    'employees', filtered_employees, 'events', filtered_events
  );
end;
$$;

revoke all on function public.get_on_call_manpower_dashboard_v2(date,date,uuid,uuid,text,text,text,text,text,text) from public, anon;
grant execute on function public.get_on_call_manpower_dashboard_v2(date,date,uuid,uuid,text,text,text,text,text,text) to authenticated;
notify pgrst, 'reload schema';
