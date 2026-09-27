-- Dacanay is the Inflatable Island business-unit manager and reports directly
-- to the BOD. Keep both legacy HRIS reporting and the approved org chart in
-- sync because schedule publishing and self-schedule approval read both paths.
begin;

with current_line as (
  select to_jsonb(u) as old_value
  from public.hris_users u
  where u.id = '207ba7fa-d7fc-4404-8bf3-2e5053f747b7'::uuid
), updated_user as (
  update public.hris_users
  set reports_to = 'ac4266f6-6fba-4c83-bbbe-022d73ebd71f'::uuid::text,
      position = case when nullif(btrim(coalesce(position, '')), '') is null then 'Resort Director' else position end
  where id = '207ba7fa-d7fc-4404-8bf3-2e5053f747b7'::uuid
  returning to_jsonb(hris_users) as new_value
)
insert into public.org_routing_audit(entity_type, entity_id, action, actor_id, old_value, new_value)
select 'hris_user', '207ba7fa-d7fc-4404-8bf3-2e5053f747b7', 'corrected_direct_bod_reporting_line', null,
       current_line.old_value, updated_user.new_value
from current_line cross join updated_user;

with current_line as (
  select to_jsonb(a) as old_value
  from public.org_chart_assignments a
  where a.user_id = '207ba7fa-d7fc-4404-8bf3-2e5053f747b7'::uuid
    and a.effective_until is null
  order by a.effective_from desc
  limit 1
), updated_assignment as (
  update public.org_chart_assignments
  set reports_to_user_id = 'ac4266f6-6fba-4c83-bbbe-022d73ebd71f'::uuid,
      position_name = case when position_name = 'Unspecified position' then 'Resort Director' else position_name end,
      updated_at = now()
  where user_id = '207ba7fa-d7fc-4404-8bf3-2e5053f747b7'::uuid
    and effective_until is null
  returning to_jsonb(org_chart_assignments) as new_value
)
insert into public.org_routing_audit(entity_type, entity_id, action, actor_id, old_value, new_value)
select 'org_chart_assignment', 'd671da09-1bba-4e83-b85e-878fe6d5a4c2', 'corrected_direct_bod_reporting_line', null,
       current_line.old_value, updated_assignment.new_value
from current_line cross join updated_assignment;

commit;
