-- Force every rating update through its audited workflow function. Reviewers
-- can edit only draft content; HR/Admin must use reopen or lock explicitly.

create or replace function public.validate_job_interview_rating_record()
returns trigger
language plpgsql
as $$
declare
  action_name text := coalesce(current_setting('tng.interview_rating_action', true), '');
  is_admin boolean := public.has_recruitment_admin_access();
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1
      from public.job_applications a
      where a.id = new.application_id
        and a.candidate_id = new.candidate_id
    ) then
      raise exception 'Interview rating application does not belong to candidate';
    end if;
    return new;
  end if;

  if new.candidate_id <> old.candidate_id
     or new.application_id <> old.application_id
     or new.template_version_id <> old.template_version_id
     or new.template_group_id <> old.template_group_id
     or new.template_version <> old.template_version
     or new.template_snapshot <> old.template_snapshot
     or new.reviewer_user_id <> old.reviewer_user_id
     or new.created_by_user_id <> old.created_by_user_id then
    raise exception 'Interview rating identity fields cannot be changed';
  end if;

  if action_name not in ('save', 'submit', 'reopen', 'lock') then
    raise exception 'Use the interview rating workflow action to update this record';
  end if;
  if not is_admin
     and (old.status in ('Submitted', 'Locked') or old.locked_at is not null) then
    raise exception 'Submitted interview ratings are locked';
  end if;

  if action_name = 'save' then
    if new.status <> old.status and not (old.status = 'Not Started' and new.status = 'Draft') then
      raise exception 'Use submit or reopen to change an interview rating status';
    end if;
    if new.submitted_at is distinct from old.submitted_at
       or new.locked_at is distinct from old.locked_at
       or new.reopened_at is distinct from old.reopened_at
       or new.reopened_by_user_id is distinct from old.reopened_by_user_id
       or new.returned_notes is distinct from old.returned_notes then
      raise exception 'Interview rating workflow fields cannot be changed while saving a draft';
    end if;
  elsif action_name = 'submit' then
    if new.status <> 'Submitted' or new.submitted_at is null or new.locked_at is null or new.returned_notes is not null then
      raise exception 'Use the interview rating submission workflow';
    end if;
  elsif action_name = 'reopen' then
    if not is_admin or old.status not in ('Submitted', 'Locked') or new.status <> 'Returned for Revision'
       or new.locked_at is not null or nullif(btrim(new.returned_notes), '') is null then
      raise exception 'Use the authorized reopen workflow for submitted ratings';
    end if;
  elsif action_name = 'lock' then
    if not is_admin or old.status <> 'Submitted' or new.status <> 'Locked' or new.locked_at is null then
      raise exception 'Use the authorized lock workflow for submitted ratings';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.reopen_interview_rating(p_rating_id uuid, p_reason text)
returns public.job_interview_rating_records
language plpgsql
security invoker
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  rating_row public.job_interview_rating_records%rowtype;
  old_status text;
begin
  if actor_id is null or not public.has_recruitment_admin_access() or not public.has_feature_permission('Interviews', 'manage') then
    raise exception 'Only authorized HR or Admin users can reopen interview ratings';
  end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required to reopen an interview rating'; end if;
  select * into rating_row from public.job_interview_rating_records where id = p_rating_id for update;
  if not found then raise exception 'Interview rating was not found'; end if;
  if rating_row.status not in ('Submitted', 'Locked') then raise exception 'Only submitted ratings can be reopened'; end if;
  old_status := rating_row.status;
  perform set_config('tng.interview_rating_action', 'reopen', true);
  update public.job_interview_rating_records
  set status = 'Returned for Revision', locked_at = null, reopened_at = now(), reopened_by_user_id = actor_id,
      returned_notes = btrim(p_reason), updated_at = now()
  where id = p_rating_id;
  select * into rating_row from public.job_interview_rating_records where id = p_rating_id;
  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
  values (actor_id::text, actor_email, 'INTERVIEW_RATING_REOPENED', 'job_interview_rating_records', p_rating_id::text,
    jsonb_build_object('previous_status', old_status, 'new_status', 'Returned for Revision', 'reason', btrim(p_reason), 'reviewer_id', rating_row.reviewer_user_id)::text);
  insert into public.notifications (user_id, title, message, type, link, related_entity_id, dedupe_key)
  values (
    rating_row.reviewer_user_id::text,
    'Interview rating returned for revision',
    format('Your interview rating for %s was returned for revision: %s', rating_row.form_data->>'applicant_name', btrim(p_reason)),
    'INTERVIEW_RATING_RETURNED',
    '/recruitment/interview-ratings/' || rating_row.id::text,
    rating_row.id::text,
    'interview-rating-returned:' || rating_row.id::text || ':' || extract(epoch from now())::bigint
  );
  return rating_row;
end;
$$;

create or replace function public.lock_interview_rating(p_rating_id uuid)
returns public.job_interview_rating_records
language plpgsql
security invoker
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  rating_row public.job_interview_rating_records%rowtype;
begin
  if actor_id is null or not public.has_recruitment_admin_access() or not public.has_feature_permission('Interviews', 'manage') then
    raise exception 'Only authorized HR or Admin users can lock interview ratings';
  end if;
  select * into rating_row from public.job_interview_rating_records where id = p_rating_id for update;
  if not found then raise exception 'Interview rating was not found'; end if;
  if rating_row.status <> 'Submitted' then raise exception 'Only submitted ratings can be locked'; end if;
  perform set_config('tng.interview_rating_action', 'lock', true);
  update public.job_interview_rating_records
  set status = 'Locked', locked_at = coalesce(locked_at, now()), updated_at = now()
  where id = p_rating_id;
  select * into rating_row from public.job_interview_rating_records where id = p_rating_id;
  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
  values (actor_id::text, actor_email, 'INTERVIEW_RATING_LOCKED', 'job_interview_rating_records', p_rating_id::text,
    jsonb_build_object('previous_status', 'Submitted', 'new_status', 'Locked')::text);
  return rating_row;
end;
$$;
