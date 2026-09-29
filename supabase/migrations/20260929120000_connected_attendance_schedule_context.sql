-- Published schedule snapshots are references; actual punches are never prefilled.
set local lock_timeout='5s';
set local statement_timeout='30s';
create or replace function public.get_actual_attendance_import_context(p_scope uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare days jsonb;
begin
 if auth.uid() is null or not private.actual_attendance_access(p_scope) then raise exception 'Scoped attendance import access is required.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>31 then raise exception 'Choose a payroll cutoff of at most 32 days.';end if;
 with dated as materialized (
  select h.id,h.employee_id,h.full_name,s.name,dt::date d,private.attendance_schedule(h.id,dt::date) roster
  from public.hris_users h join public.payroll_access_scopes s on s.business_unit_id=h.business_unit_id
  cross join lateral generate_series(p_from,p_to,'1 day'::interval)dt
  where s.id=p_scope and not coalesce(h.is_duplicate,false) and h.date_hired<=dt::date and (h.end_date is null or h.end_date>=dt::date)
 ) select coalesce(jsonb_agg(jsonb_build_object('employeeId',employee_id,'employeeUuid',id,'name',full_name,'businessUnit',name,'workDate',d,'schedule',roster,
 'dayStatus',case when coalesce((roster->>'published')::boolean,false) then
  case when exists(select 1 from jsonb_array_elements(roster->'entries')x where x->>'kind'='work') then 'Workday'
   when exists(select 1 from jsonb_array_elements(roster->'entries')x where x->>'kind'='rest') then 'Rest day'
   when exists(select 1 from jsonb_array_elements(roster->'entries')x where x->>'statusTag'='suspended') then 'Suspended'
   when exists(select 1 from jsonb_array_elements(roster->'entries')x where x->>'statusTag'='paid_leave') then 'Approved leave'
   when exists(select 1 from jsonb_array_elements(roster->'entries')x where x->>'statusTag'='unpaid_leave') then 'Leave without pay'
   when exists(select 1 from jsonb_array_elements(roster->'entries')x where x->>'statusTag'='company_holiday') then 'Company holiday'
  end end) order by full_name,d),'[]') into days from dated;
 return jsonb_build_object('employees',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'code',h.employee_id,'name',h.full_name,'businessUnit',s.name) order by h.full_name),'[]')
  from public.hris_users h join public.payroll_access_scopes s on s.business_unit_id=h.business_unit_id where s.id=p_scope and not coalesce(h.is_duplicate,false) and h.date_hired<=p_to and (h.end_date is null or h.end_date>=p_from)),
  'scheduleDays',days,'dayStatuses',days,
  'leaveTypes',(select coalesce(jsonb_agg(name order by name),'[]') from public.leave_types),
  'imports',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from (select b.id,b.filename,b.accepted_rows,b.duplicate_rows,b.created_at from private.payroll_actual_imports b where b.scope_id=p_scope and b.date_from=p_from and b.date_to=p_to order by b.created_at desc limit 25)x));
end $$;
revoke all on function public.get_actual_attendance_import_context(uuid,date,date) from public,anon;
grant execute on function public.get_actual_attendance_import_context(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
