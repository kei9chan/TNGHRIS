-- Every employee who submits their own schedule to a BOD or GM must have an
-- explicit Flexi choice. Presets remain owned by the current approver and BU,
-- preserving the reporting-line visibility and approval guards.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

insert into public.shift_templates (
  name,
  start_time,
  end_time,
  break_minutes,
  grace_period_minutes,
  business_unit_id,
  created_by,
  color,
  schedule_kind,
  end_day_offset,
  paid_minutes,
  is_flexible,
  min_hours_per_day,
  min_days_per_week
)
select distinct
  'Flexi',
  '00:00'::time,
  '00:00'::time,
  60,
  5,
  employee.business_unit_id,
  approver.id,
  'indigo',
  'work',
  0,
  480,
  true,
  8,
  5
from public.hris_users employee
join public.hris_users approver
  on approver.id = schedule_compliance.bod_manager(employee.id)
where employee.business_unit_id is not null
  and lower(employee.status::text) = 'active'
  and lower(approver.status::text) = 'active'
  and not exists (
    select 1
    from public.shift_templates existing
    where existing.business_unit_id = employee.business_unit_id
      and existing.created_by = approver.id
      and existing.schedule_kind = 'work'
      and coalesce(existing.is_flexible, false)
      and existing.paid_minutes = 480
  );

-- Include flexibility metadata in both the employee selector and the approval
-- summary. Fail safely if the function shape changed instead of silently
-- applying an incomplete patch.
do $$
declare
  ddl text;
  selector_needle text := $needle$jsonb_build_object('id',t.id,'name',t.name,'start',t.start_time,'end',t.end_time,'kind',t.schedule_kind)$needle$;
  selector_replacement text := $replacement$jsonb_build_object('id',t.id,'name',t.name,'start',t.start_time,'end',t.end_time,'kind',t.schedule_kind,'flexible',t.is_flexible,'paidMinutes',t.paid_minutes)$replacement$;
  review_needle text := $needle$jsonb_build_object('name',case when coalesce((x->>'restDay')::boolean,false) then 'Rest Day' else coalesce(t.name,(select string_agg(concat_ws(' ',a->>'name',a->>'start',a->>'end'),'; ') from jsonb_array_elements(private.payroll_schedule_draft(s.employee_id,s.week)) a where a->>'date'=x->>'date'),'Existing approved leave / exemption') end,'start',t.start_time,'end',t.end_time)$needle$;
  review_replacement text := $replacement$jsonb_build_object('name',case when coalesce((x->>'restDay')::boolean,false) then 'Rest Day' else coalesce(t.name,(select string_agg(concat_ws(' ',a->>'name',a->>'start',a->>'end'),'; ') from jsonb_array_elements(private.payroll_schedule_draft(s.employee_id,s.week)) a where a->>'date'=x->>'date'),'Existing approved leave / exemption') end,'start',t.start_time,'end',t.end_time,'flexible',t.is_flexible,'paidMinutes',t.paid_minutes)$replacement$;
begin
  ddl := pg_get_functiondef('public.get_bod_schedule_workflow(date)'::regprocedure);
  if strpos(ddl, selector_needle) = 0 then
    raise exception 'Review changed schedule selector before adding Flexi metadata';
  end if;
  if strpos(ddl, review_needle) = 0 then
    raise exception 'Review changed schedule approval summary before adding Flexi metadata';
  end if;
  ddl := replace(ddl, selector_needle, selector_replacement);
  ddl := replace(ddl, review_needle, review_replacement);
  execute ddl;
end $$;

-- This is an intentionally authenticated, per-user workflow RPC. Keep the
-- existing function exposed only to signed-in users.
revoke all on function public.get_bod_schedule_workflow(date) from public, anon, authenticated;
grant execute on function public.get_bod_schedule_workflow(date) to authenticated;

notify pgrst, 'reload schema';
