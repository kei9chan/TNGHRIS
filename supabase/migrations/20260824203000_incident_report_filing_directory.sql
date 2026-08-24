-- Let every active authenticated HRIS user file an incident report involving
-- any active employee, without broadening access to sensitive employee data.

create or replace function public.get_incident_report_user_directory()
returns table (
  id uuid,
  full_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    directory_user.id,
    directory_user.full_name
  from public.hris_users directory_user
  where lower(directory_user.status) = 'active'
    and exists (
      select 1
      from public.hris_users caller
      where caller.id = public.current_hris_id()
        and lower(caller.status) = 'active'
    )
  order by directory_user.full_name;
$$;

revoke all on function public.get_incident_report_user_directory() from public, anon;
grant execute on function public.get_incident_report_user_directory() to authenticated;

comment on function public.get_incident_report_user_directory() is
  'Name-only active-user directory for involved-person and witness selection during incident filing.';

-- Canonicalize participant names from their permanent IDs and reject inactive
-- or invalid IDs instead of trusting browser-supplied names.
create or replace function public.canonicalize_incident_report_participants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  involved_count integer;
  witness_count integer;
begin
  select count(*) into involved_count
  from public.hris_users u
  where u.id = any(coalesce(new.involved_employee_ids, '{}'::uuid[]))
    and lower(u.status) = 'active';

  if involved_count <> cardinality(coalesce(new.involved_employee_ids, '{}'::uuid[])) then
    raise exception 'Every involved person must be an active HRIS user.' using errcode = '22023';
  end if;

  select count(*) into witness_count
  from public.hris_users u
  where u.id = any(coalesce(new.witness_ids, '{}'::uuid[]))
    and lower(u.status) = 'active';

  if witness_count <> cardinality(coalesce(new.witness_ids, '{}'::uuid[])) then
    raise exception 'Every witness must be an active HRIS user.' using errcode = '22023';
  end if;

  new.involved_employee_names := coalesce((
    select array_agg(u.full_name order by selected.ordinality)
    from unnest(coalesce(new.involved_employee_ids, '{}'::uuid[])) with ordinality selected(user_id, ordinality)
    join public.hris_users u on u.id = selected.user_id
  ), '{}'::text[]);

  new.witness_names := coalesce((
    select array_agg(u.full_name order by selected.ordinality)
    from unnest(coalesce(new.witness_ids, '{}'::uuid[])) with ordinality selected(user_id, ordinality)
    join public.hris_users u on u.id = selected.user_id
  ), '{}'::text[]);

  return new;
end;
$$;

drop trigger if exists canonicalize_incident_report_participants on public.incident_reports;
create trigger canonicalize_incident_report_participants
before insert or update of involved_employee_ids, witness_ids on public.incident_reports
for each row execute function public.canonicalize_incident_report_participants();

revoke all on function public.canonicalize_incident_report_participants() from public, anon, authenticated;

-- Notifications are created in the database so an employee reporter does not
-- need directory access to HR accounts and cannot choose notification targets.
create or replace function public.notify_hr_on_incident_report_filed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporter_name text;
begin
  select full_name into reporter_name from public.hris_users where id = new.reported_by;

  insert into public.notifications (
    user_id, type, title, message, link, is_read, related_entity_id, dedupe_key
  )
  select
    recipient.id::text,
    'CASE_ASSIGNED',
    'New Incident Report Filed',
    format(
      'A new Incident Report (%s) has been submitted by %s.',
      'TNGIR-' || lpad(new.case_number::text, 5, '0'),
      coalesce(reporter_name, 'an employee')
    ),
    '/feedback/cases?caseId=' || new.id::text,
    false,
    new.id::text,
    'incident:' || new.id::text || ':filed:' || recipient.id::text
  from (
    select distinct u.id
    from public.hris_users u
    join public.user_roles ur on ur.user_id = u.id and ur.is_active
    join public.roles r on r.id = ur.role_id and r.is_active
    where lower(u.status) = 'active'
      and ur.role_id in ('HR Manager', 'HR Staff')
  ) recipient
  on conflict (user_id, dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists notify_hr_on_incident_report_filed on public.incident_reports;
create trigger notify_hr_on_incident_report_filed
after insert on public.incident_reports
for each row execute function public.notify_hr_on_incident_report_filed();

revoke all on function public.notify_hr_on_incident_report_filed() from public, anon, authenticated;

-- Filing is a universal employee capability. Viewing remains constrained by
-- the existing incident-report RLS policies (reporter, involved user, or HR).
insert into public.role_permissions (role_id, resource_id, permissions, updated_at)
select
  r.id,
  'IncidentReports',
  array(
    select distinct permission
    from unnest(coalesce(existing.permissions, '{}'::text[]) || array['view', 'create']::text[]) permission
    order by permission
  ),
  now()
from public.roles r
left join public.role_permissions existing
  on existing.role_id = r.id and existing.resource_id = 'IncidentReports'
where r.is_active
on conflict (role_id, resource_id) do update
set permissions = excluded.permissions, updated_at = now();

insert into public.role_workflow_permissions (role_id, workflow_key, actions, updated_at)
select
  r.id,
  'IncidentReports',
  array(
    select distinct action
    from unnest(coalesce(existing.actions, '{}'::text[]) || array['submit']::text[]) action
    order by action
  ),
  now()
from public.roles r
left join public.role_workflow_permissions existing
  on existing.role_id = r.id and existing.workflow_key = 'IncidentReports'
where r.is_active
on conflict (role_id, workflow_key) do update
set actions = excluded.actions, updated_at = now();

update public.rbac_cache_versions set version = version + 1, updated_at = now();
