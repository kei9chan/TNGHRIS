-- A narrow, audited operation: HR heads may extend an evaluation without
-- granting general evaluation editing or changing submissions/results.
create or replace function private.extend_evaluation_deadline(
  p_evaluation_id uuid,
  p_due_date date,
  p_expected_due_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  evaluation_row public.evaluations%rowtype;
  assignment_count integer;
  actor_email text;
begin
  if actor_id is null or not (
    public.has_active_role('HR Manager') or public.has_active_role('Admin')
  ) then
    raise exception 'Only the HR Manager or an administrator can extend evaluation deadlines.' using errcode = '42501';
  end if;
  if p_due_date is null or p_due_date < (now() at time zone 'Asia/Manila')::date then
    raise exception 'Choose today or a later date in Philippine time.' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 1000 then
    raise exception 'Enter a reason for the extension (up to 1,000 characters).' using errcode = '22023';
  end if;

  select * into evaluation_row from public.evaluations
  where id = p_evaluation_id for update;
  if not found then
    raise exception 'Evaluation not found.' using errcode = 'P0002';
  end if;
  if evaluation_row.status <> 'InProgress' then
    raise exception 'Only an in-progress evaluation can be extended.' using errcode = '22023';
  end if;
  if evaluation_row.due_date is distinct from p_expected_due_date then
    raise exception 'The deadline has changed. Reload evaluations and try again.' using errcode = '40001';
  end if;
  if evaluation_row.due_date is null or p_due_date <= evaluation_row.due_date then
    raise exception 'Choose a date later than the current deadline.' using errcode = '22023';
  end if;

  update public.evaluations set due_date = p_due_date, updated_at = now()
  where id = p_evaluation_id;
  update public.evaluation_assignments set due_date = p_due_date
  where evaluation_id = p_evaluation_id and status <> 'Cancelled';
  get diagnostics assignment_count = row_count;

  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
  values (actor_id::text, actor_email, 'UPDATE', 'Evaluation', p_evaluation_id::text,
    jsonb_build_object('operation', 'extend_deadline', 'previous_due_date', evaluation_row.due_date,
      'due_date', p_due_date, 'timezone', 'Asia/Manila', 'reason', btrim(p_reason),
      'assignments_updated', assignment_count)::text);

  return jsonb_build_object('evaluation_id', p_evaluation_id, 'due_date', p_due_date,
    'previous_due_date', evaluation_row.due_date, 'assignments_updated', assignment_count);
end;
$$;
revoke all on function private.extend_evaluation_deadline(uuid,date,date,text) from public, anon, authenticated;

-- The authenticated-only API wrapper crosses the private-schema boundary.
-- All authorization is checked by the private operation against server roles;
-- callers receive no general access to the private schema or evaluation writes.
create or replace function public.extend_evaluation_deadline(
  p_evaluation_id uuid,
  p_due_date date,
  p_expected_due_date date,
  p_reason text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.extend_evaluation_deadline(p_evaluation_id, p_due_date, p_expected_due_date, p_reason);
$$;
revoke all on function public.extend_evaluation_deadline(uuid,date,date,text) from public, anon;
grant execute on function public.extend_evaluation_deadline(uuid,date,date,text) to authenticated;
