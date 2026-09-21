-- A direct-report schedule may contain a valid business-unit preset that the
-- assigned GM/BOD cannot otherwise reuse in their own reporting line. Keep the
-- normal preset visibility restriction, but allow the exact preset/date rows
-- captured in a pending submission while its assigned approver applies it.

create or replace function private.schedule_submission_approval_allows_preset(
  p_employee uuid,
  p_template uuid,
  p_date date,
  p_actor uuid,
  p_notes text
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  submission_id uuid;
  submission schedule_compliance.submissions;
begin
  if auth.uid() is null
     or p_actor is null
     or p_actor is distinct from public.current_hris_user_id()
     or coalesce(p_notes, '') not like 'Employee submission approved: %' then
    return false;
  end if;

  begin
    submission_id := replace(p_notes, 'Employee submission approved: ', '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if p_notes is distinct from 'Employee submission approved: ' || submission_id::text then
    return false;
  end if;

  select * into submission
  from schedule_compliance.submissions
  where id = submission_id;

  if submission.id is null
     or submission.status <> 'Pending'
     or submission.employee_id is distinct from p_employee
     or submission.manager_id is distinct from p_actor
     or p_actor is distinct from schedule_compliance.bod_manager(p_employee)
     or not (
       private.workflow_user_has_role(p_actor, 'Board of Director')
       or private.workflow_user_has_role(p_actor, 'GeneralManager')
     )
     or p_date < submission.week
     or p_date > submission.week + 6 then
    return false;
  end if;

  return exists (
    select 1
    from jsonb_array_elements(submission.entries) entry
    where entry->>'date' = p_date::text
      and entry->>'templateId' = p_template::text
      and not coalesce((entry->>'restDay')::boolean, false)
  );
exception when others then
  return false;
end
$$;

revoke all on function private.schedule_submission_approval_allows_preset(uuid, uuid, date, uuid, text)
from public, anon, authenticated;

create or replace function private.schedule_assignment_preset_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  template public.shift_templates;
begin
  -- Editing unrelated assignment fields never reauthorizes or rewrites history.
  if tg_op = 'UPDATE'
     and new.employee_id = old.employee_id
     and new.date = old.date
     and new.shift_template_id = old.shift_template_id
     and new.business_unit_id is not distinct from old.business_unit_id then
    return new;
  end if;

  select * into template
  from public.shift_templates
  where id = new.shift_template_id;

  if template.business_unit_id is null
     or template.business_unit_id is distinct from new.business_unit_id then
    raise exception 'Choose a preset created for this business unit. Existing shared presets cannot be assigned or copied into a new schedule.';
  end if;

  -- General reuse remains restricted. The exception is only for the exact
  -- employee/date/preset in a pending submission and its current GM/BOD.
  if auth.uid() is not null
     and not private.schedule_preset_visible(template.created_by)
     and not private.schedule_submission_approval_allows_preset(
       new.employee_id,
       new.shift_template_id,
       new.date,
       new.created_by,
       new.notes
     ) then
    raise exception 'This preset is not available to your current reporting line. Refresh and choose an accessible preset.' using errcode = '42501';
  end if;

  return new;
end
$$;

comment on function private.schedule_submission_approval_allows_preset(uuid, uuid, date, uuid, text) is
  'Allows only the assigned GM/BOD to apply the exact preset rows in a pending direct-report schedule submission.';
