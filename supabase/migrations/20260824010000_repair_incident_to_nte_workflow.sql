-- Repair the Incident Report -> NTE transition without replacing existing records.

alter table public.ntes
  add column if not exists memo_ids text[] not null default '{}',
  add column if not exists discipline_code_ids text[] not null default '{}',
  add column if not exists nte_code text;

create unique index if not exists ntes_nte_code_unique
  on public.ntes (nte_code)
  where nte_code is not null;

create sequence if not exists public.ntes_nte_code_seq;

select setval(
  'public.ntes_nte_code_seq',
  greatest(
    coalesce((select max(nullif(regexp_replace(nte_number::text, '[^0-9]', '', 'g'), '')::bigint) from public.ntes), 0),
    1
  ),
  true
);

create or replace function public.set_nte_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bu_code text;
  v_year integer;
  v_sequence bigint;
begin
  select nullif(trim(bu.code), '')
    into v_bu_code
  from public.incident_reports ir
  left join public.business_units bu on bu.id = ir.business_unit_id
  where ir.id = new.incident_report_id;

  v_year := extract(year from coalesce(new.created_at, now()))::integer;
  if new.nte_code is null or trim(new.nte_code) = '' then
    v_sequence := nextval('public.ntes_nte_code_seq');
  end if;
  new.nte_code := coalesce(
    nullif(new.nte_code, ''),
    format(
      'NTE-%s-%s-%s',
      v_year,
      upper(coalesce(v_bu_code, 'GEN')),
      lpad(v_sequence::text, 3, '0')
    )
  );

  if new.body is not null then
    new.body := regexp_replace(
      new.body,
      'NTE-[0-9]{4}-[A-Z0-9]+-XXX|NTE-[0-9]{4}-XXX-XXX|TNGNTE-[0-9]+',
      new.nte_code,
      'g'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists ntes_set_nte_code on public.ntes;
create trigger ntes_set_nte_code
before insert or update of incident_report_id, nte_number, body
on public.ntes
for each row execute function public.set_nte_code();

update public.ntes n
set nte_code = format(
  'NTE-%s-%s-%s',
  extract(year from coalesce(n.created_at, now()))::integer,
  upper(coalesce(nullif(trim(bu.code), ''), 'GEN')),
  lpad(regexp_replace(n.nte_number::text, '[^0-9]', '', 'g'), 3, '0')
)
from public.incident_reports ir
left join public.business_units bu on bu.id = ir.business_unit_id
where ir.id = n.incident_report_id
  and n.nte_code is null;

create or replace function public.assign_incident_case_handler(
  p_incident_report_id uuid,
  p_handler_user_id uuid,
  p_move_to_nte boolean default false
)
returns public.incident_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := public.current_hris_user_id();
  v_actor_email text;
  v_handler_name text;
  v_handler_email text;
  v_report public.incident_reports%rowtype;
  v_previous_handler_id uuid;
  v_assignment_changed boolean;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to assign an incident case handler.';
  end if;

  if not public.has_feature_permission('IncidentReports', 'assign')
     and not public.has_feature_permission('IncidentReports', 'manage') then
    raise exception using errcode = '42501', message = 'You do not have permission to assign incident case handlers.';
  end if;

  select * into v_report
  from public.incident_reports
  where id = p_incident_report_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'The incident report could not be found.';
  end if;

  if p_handler_user_id is null then
    raise exception using errcode = '23502', message = 'Select an authorized case handler before continuing.';
  end if;

  select u.full_name, u.email
    into v_handler_name, v_handler_email
  from public.hris_users u
  where u.id = p_handler_user_id
    and lower(coalesce(u.status, '')) = 'active'
    and exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id and r.is_active
      where ur.user_id = u.id
        and ur.is_active
        and ur.role_id in ('HR Staff', 'HR Manager', 'Board of Director')
    );

  if v_handler_name is null then
    raise exception using errcode = '22023', message = 'The selected case handler is not an active authorized HR user.';
  end if;

  if p_move_to_nte and v_report.pipeline_stage not in ('ir-review', 'hr-review-response', 'nte-for-approval') then
    raise exception using errcode = '22023', message = 'This incident report is not in a stage that can move to NTE approval.';
  end if;

  v_previous_handler_id := v_report.assigned_to_id;
  v_assignment_changed := v_previous_handler_id is distinct from p_handler_user_id;

  update public.incident_reports
  set assigned_to_id = p_handler_user_id,
      assigned_to_name = v_handler_name,
      pipeline_stage = case when p_move_to_nte then 'nte-for-approval' else pipeline_stage end,
      status = case when p_move_to_nte then 'Converted'::public.ir_status else status end,
      updated_at = now()
  where id = p_incident_report_id
  returning * into v_report;

  if v_assignment_changed then
    insert into public.notifications (
      user_id, type, title, message, link, related_entity_id
    ) values (
      p_handler_user_id::text,
      'CASE_ASSIGNED',
      'Incident case assigned',
      format(
        'You were assigned %s involving %s (%s, %s).',
        'TNGIR-' || lpad(v_report.case_number::text, 5, '0'),
        coalesce(array_to_string(v_report.involved_employee_names, ', '), 'an employee'),
        coalesce(v_report.business_unit_name, 'Business unit not specified'),
        coalesce(v_report.category, 'Incident')
      ),
      '/feedback/cases?action=view_case&caseId=' || v_report.id::text,
      v_report.id::text
    );

    select email into v_actor_email from public.hris_users where id = v_actor_id;
    insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
    values (
      v_actor_id::text,
      v_actor_email,
      case when v_previous_handler_id is null then 'ASSIGN' else 'REASSIGN' end,
      'IncidentReport',
      v_report.id::text,
      format('Assigned %s to %s (%s).', 'TNGIR-' || lpad(v_report.case_number::text, 5, '0'), v_handler_name, p_handler_user_id)
    );
  end if;

  if p_move_to_nte then
    if v_report.assigned_to_id is null then
      raise exception using errcode = '23502', message = 'The case handler assignment was not saved. NTE approval was not started.';
    end if;
    select email into v_actor_email from public.hris_users where id = v_actor_id;
    insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
    values (
      v_actor_id::text,
      v_actor_email,
      'UPDATE',
      'IncidentReport',
      v_report.id::text,
      format('Moved %s to NTE approval with handler %s.', 'TNGIR-' || lpad(v_report.case_number::text, 5, '0'), v_handler_name)
    );
  end if;

  return v_report;
end;
$$;

revoke all on function public.assign_incident_case_handler(uuid, uuid, boolean) from public, anon;
grant execute on function public.assign_incident_case_handler(uuid, uuid, boolean) to authenticated;

revoke all on function public.set_nte_code() from public, anon, authenticated;
