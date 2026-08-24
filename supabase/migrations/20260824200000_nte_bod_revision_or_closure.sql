-- Give BOD approvers two explicit, auditable NTE outcomes: return for
-- revision or close the disciplinary case. Existing NTE data is preserved.

alter table public.ntes
  add column if not exists revision_note text,
  add column if not exists revision_requested_at timestamptz,
  add column if not exists revision_requested_by uuid references public.hris_users(id) on delete set null,
  add column if not exists closure_reason text,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references public.hris_users(id) on delete set null,
  add column if not exists workflow_history jsonb not null default '[]'::jsonb;

create or replace function public.process_nte_bod_outcome(
  p_nte_id uuid,
  p_outcome text,
  p_note text
)
returns public.ntes
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_id();
  actor_name text;
  actor_email text;
  current_nte public.ntes;
  linked_ir public.incident_reports;
  normalized_outcome text := lower(trim(coalesce(p_outcome, '')));
  normalized_note text := trim(coalesce(p_note, ''));
  updated_log jsonb;
  workflow_event jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.has_active_role('Board of Director') then
    raise exception 'Only an active Board of Director may return or close an NTE.' using errcode = '42501';
  end if;
  if normalized_outcome not in ('revision', 'closure') then
    raise exception 'Choose either Return for Revision or Close NTE.' using errcode = '22023';
  end if;
  if length(normalized_note) < 3 then
    raise exception 'A note is required and must contain at least 3 characters.' using errcode = '22023';
  end if;

  select * into current_nte from public.ntes where id = p_nte_id for update;
  if current_nte.id is null then
    raise exception 'NTE not found.' using errcode = 'P0002';
  end if;
  if current_nte.status <> 'PendingApproval'::public.nte_status then
    raise exception 'This NTE is no longer pending approval.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(coalesce(current_nte.approval_log, '[]'::jsonb)) step
    where step->>'userId' = actor_id::text and step->>'status' = 'Pending'
  ) then
    raise exception 'This NTE is not assigned to you for approval.' using errcode = '42501';
  end if;

  select full_name, email into actor_name, actor_email
  from public.hris_users where id = actor_id and status = 'Active';
  if actor_name is null then
    raise exception 'Your active HRIS user profile could not be resolved.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    case
      when step->>'userId' = actor_id::text and step->>'status' = 'Pending' then
        step || jsonb_build_object(
          'status', 'Rejected',
          'timestamp', now(),
          'rejectionReason', normalized_note,
          'decision', case when normalized_outcome = 'revision' then 'Return for Revision' else 'Close NTE' end
        )
      else step
    end order by ordinality
  ), '[]'::jsonb)
  into updated_log
  from jsonb_array_elements(coalesce(current_nte.approval_log, '[]'::jsonb)) with ordinality entries(step, ordinality);

  workflow_event := jsonb_build_object(
    'action', case when normalized_outcome = 'revision' then 'RETURN_FOR_REVISION' else 'CLOSE' end,
    'note', normalized_note,
    'actorId', actor_id,
    'actorName', actor_name,
    'timestamp', now()
  );

  perform set_config('app.nte_workflow_rpc', 'on', true);

  if normalized_outcome = 'revision' then
    update public.ntes
    set status = 'Draft'::public.nte_status,
        approval_log = updated_log,
        revision_note = normalized_note,
        revision_requested_at = now(),
        revision_requested_by = actor_id,
        workflow_history = coalesce(workflow_history, '[]'::jsonb) || jsonb_build_array(workflow_event),
        updated_at = now()
    where id = p_nte_id
    returning * into current_nte;

    update public.incident_reports
    set pipeline_stage = 'ir-review', updated_at = now()
    where id = current_nte.incident_report_id
    returning * into linked_ir;

    insert into public.notifications(user_id, type, title, message, link, related_entity_id, dedupe_key)
    select recipient_id::text, 'GENERAL', 'NTE Returned for Revision',
           format('%s returned NTE %s for revision. Note: %s', actor_name, coalesce(current_nte.nte_code, current_nte.nte_number), normalized_note),
           '/feedback/nte/' || current_nte.id::text, current_nte.id::text,
           'nte:' || current_nte.id::text || ':revision:' || extract(epoch from current_nte.revision_requested_at)::bigint::text || ':' || recipient_id::text
    from (
      select current_nte.issued_by_user_id as recipient_id
      union
      select linked_ir.assigned_to_id
    ) recipients
    where recipient_id is not null and recipient_id <> actor_id;
  else
    update public.ntes
    set status = 'Closed'::public.nte_status,
        approval_log = updated_log,
        closure_reason = normalized_note,
        closed_at = now(),
        closed_by = actor_id,
        workflow_history = coalesce(workflow_history, '[]'::jsonb) || jsonb_build_array(workflow_event),
        updated_at = now()
    where id = p_nte_id
    returning * into current_nte;

    update public.incident_reports
    set status = 'Closed'::public.ir_status, pipeline_stage = 'closed', updated_at = now()
    where id = current_nte.incident_report_id
    returning * into linked_ir;

    insert into public.notifications(user_id, type, title, message, link, related_entity_id, dedupe_key)
    select recipient_id::text, 'GENERAL', 'NTE Closed by BOD',
           format('%s closed NTE %s. Reason: %s', actor_name, coalesce(current_nte.nte_code, current_nte.nte_number), normalized_note),
           '/feedback/nte/' || current_nte.id::text, current_nte.id::text,
           'nte:' || current_nte.id::text || ':closed:' || recipient_id::text
    from (
      select current_nte.issued_by_user_id as recipient_id
      union
      select linked_ir.assigned_to_id
    ) recipients
    where recipient_id is not null and recipient_id <> actor_id
    on conflict (user_id, dedupe_key) do nothing;
  end if;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text,
    actor_email,
    case when normalized_outcome = 'revision' then 'RETURN' else 'CLOSE' end,
    'NTE',
    p_nte_id::text,
    case when normalized_outcome = 'revision'
      then 'BOD returned NTE for revision. Note: ' || normalized_note
      else 'BOD closed NTE. Reason: ' || normalized_note
    end
  );

  return current_nte;
end;
$$;

create or replace function public.resubmit_nte_revision(
  p_nte_id uuid,
  p_details text,
  p_body text default null,
  p_response_deadline timestamptz default null,
  p_evidence_link text default null
)
returns public.ntes
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_id();
  actor_name text;
  actor_email text;
  current_nte public.ntes;
  reset_log jsonb;
  approver record;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into current_nte from public.ntes where id = p_nte_id for update;
  if current_nte.id is null then raise exception 'NTE not found.' using errcode = 'P0002'; end if;
  if current_nte.status <> 'Draft'::public.nte_status or current_nte.revision_requested_at is null then
    raise exception 'Only an NTE returned for revision can be resubmitted.' using errcode = '22023';
  end if;
  if actor_id <> current_nte.issued_by_user_id
     and not public.has_active_role('HR Manager')
     and not public.has_active_role('HR Staff')
     and not public.has_active_role('Admin') then
    raise exception 'Only the NTE issuer or an authorized HR user may resubmit it.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_details, ''))) = 0 then
    raise exception 'NTE allegations/details are required.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(current_nte.approval_log, '[]'::jsonb)) = 0 then
    raise exception 'The NTE has no approval route to resubmit.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(
    (step - 'timestamp' - 'rejectionReason' - 'decision') || jsonb_build_object('status', 'Pending')
    order by ordinality
  ), '[]'::jsonb)
  into reset_log
  from jsonb_array_elements(current_nte.approval_log) with ordinality entries(step, ordinality);

  select full_name, email into actor_name, actor_email from public.hris_users where id = actor_id;
  perform set_config('app.nte_workflow_rpc', 'on', true);

  update public.ntes
  set details = trim(p_details),
      body = coalesce(p_body, body),
      response_deadline = coalesce(p_response_deadline, response_deadline),
      evidence_link = p_evidence_link,
      status = 'PendingApproval'::public.nte_status,
      approval_log = reset_log,
      workflow_history = coalesce(workflow_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'action', 'RESUBMITTED', 'actorId', actor_id, 'actorName', actor_name, 'timestamp', now()
      )),
      updated_at = now()
  where id = p_nte_id
  returning * into current_nte;

  update public.incident_reports
  set status = 'Converted'::public.ir_status, pipeline_stage = 'nte-for-approval', updated_at = now()
  where id = current_nte.incident_report_id;

  for approver in
    select distinct step->>'userId' as user_id
    from jsonb_array_elements(reset_log) step
    where nullif(step->>'userId', '') is not null
  loop
    insert into public.notifications(user_id, type, title, message, link, related_entity_id, dedupe_key)
    values (
      approver.user_id, 'GENERAL', 'Revised NTE Approval Required',
      format('A revised NTE %s requires your approval.', coalesce(current_nte.nte_code, current_nte.nte_number)),
      '/feedback/nte/' || current_nte.id::text, current_nte.id::text,
      'nte:' || current_nte.id::text || ':resubmitted:' || extract(epoch from current_nte.updated_at)::bigint::text || ':' || approver.user_id
    );
  end loop;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (actor_id::text, actor_email, 'RESUBMIT', 'NTE', p_nte_id::text, 'Revised NTE resubmitted for BOD approval.');

  return current_nte;
end;
$$;

create or replace function public.guard_nte_bod_outcome_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'PendingApproval'::public.nte_status
     and new.status in ('Draft'::public.nte_status, 'Rejected'::public.nte_status, 'Closed'::public.nte_status)
     and coalesce(current_setting('app.nte_workflow_rpc', true), '') <> 'on' then
    raise exception 'Use the authorized NTE BOD outcome workflow.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_nte_bod_outcome_transition on public.ntes;
create trigger guard_nte_bod_outcome_transition
before update of status on public.ntes
for each row execute function public.guard_nte_bod_outcome_transition();

revoke all on function public.process_nte_bod_outcome(uuid,text,text) from public, anon;
revoke all on function public.resubmit_nte_revision(uuid,text,text,timestamptz,text) from public, anon;
revoke all on function public.guard_nte_bod_outcome_transition() from public, anon, authenticated;
grant execute on function public.process_nte_bod_outcome(uuid,text,text) to authenticated;
grant execute on function public.resubmit_nte_revision(uuid,text,text,timestamptz,text) to authenticated;

comment on function public.process_nte_bod_outcome(uuid,text,text) is
  'Atomically returns an NTE for revision or closes it; restricted to its assigned active BOD approver.';
comment on function public.resubmit_nte_revision(uuid,text,text,timestamptz,text) is
  'Atomically resubmits a BOD-returned NTE while preserving immutable workflow history.';
