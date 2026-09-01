-- The HRIS directory protects sensitive columns with column-level grants.
-- Keep reviewer assignment queries limited to the directory fields needed by
-- the rating form; never use SELECT * from hris_users in an authenticated RPC.

create or replace function public.create_interview_rating_assignments(
  p_candidate_id uuid,
  p_application_id uuid,
  p_template_version_id uuid,
  p_reviewer_user_ids uuid[],
  p_due_date date,
  p_interview_round text
)
returns setof public.job_interview_rating_records
language plpgsql
security invoker
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  template_row public.job_interview_templates%rowtype;
  candidate_row public.job_candidates%rowtype;
  application_row public.job_applications%rowtype;
  reviewer_row record;
  rating_row public.job_interview_rating_records%rowtype;
  position_name text;
  applicant_name text;
  existing_id uuid;
  round_name text := coalesce(nullif(btrim(p_interview_round), ''), 'Round 1');
begin
  if actor_id is null
     or not public.has_recruitment_admin_access()
     or not public.has_feature_permission('Interviews', 'manage') then
    raise exception 'Only authorized HR or Admin users can assign interview ratings';
  end if;
  if coalesce(array_length(p_reviewer_user_ids, 1), 0) = 0 then
    raise exception 'At least one reviewer is required';
  end if;
  if (select count(*) from unnest(p_reviewer_user_ids)) <>
     (select count(distinct reviewer_id) from unnest(p_reviewer_user_ids) reviewer_id) then
    raise exception 'A reviewer can only be assigned once per round';
  end if;

  select * into template_row
  from public.job_interview_templates
  where id = p_template_version_id and is_current and status = 'Active';
  if not found then raise exception 'Select an active current interview template'; end if;
  select * into candidate_row from public.job_candidates where id = p_candidate_id;
  if not found then raise exception 'Candidate was not found'; end if;
  select * into application_row
  from public.job_applications
  where id = p_application_id and candidate_id = p_candidate_id;
  if not found then raise exception 'Application does not belong to candidate'; end if;

  select coalesce(nullif(application_row.role_title_snapshot, ''), jp.title, 'Application')
  into position_name
  from public.job_posts jp
  where jp.id = application_row.job_post_id;
  position_name := coalesce(position_name, nullif(application_row.role_title_snapshot, ''), 'Application');
  applicant_name := btrim(concat_ws(' ', candidate_row.first_name, candidate_row.last_name));
  select email into actor_email from public.hris_users where id = actor_id;

  if exists (
    select 1 from unnest(p_reviewer_user_ids) ids
    where not exists (select 1 from public.hris_users u where u.id = ids)
  ) then
    raise exception 'One or more reviewers could not be found';
  end if;

  for reviewer_row in
    select u.id, u.full_name, u.email, u.position
    from public.hris_users u
    where u.id = any(p_reviewer_user_ids)
    order by u.full_name
  loop
    select id into existing_id
    from public.job_interview_rating_records
    where candidate_id = p_candidate_id
      and application_id = p_application_id
      and reviewer_user_id = reviewer_row.id
      and interview_round = round_name;

    if existing_id is not null then
      select * into rating_row from public.job_interview_rating_records where id = existing_id;
      return next rating_row;
      continue;
    end if;

    insert into public.job_interview_rating_records (
      candidate_id, application_id, template_version_id, template_group_id, template_version,
      template_snapshot, reviewer_user_id, reviewer_name_snapshot, reviewer_position_snapshot,
      due_date, interview_round, form_data, created_by_user_id
    ) values (
      p_candidate_id, p_application_id, template_row.id, template_row.template_group_id, template_row.version,
      to_jsonb(template_row), reviewer_row.id, coalesce(nullif(reviewer_row.full_name, ''), reviewer_row.email),
      coalesce(reviewer_row.position, ''), p_due_date, round_name,
      jsonb_build_object(
        'candidate_date', current_date::text,
        'position_applied_for', position_name,
        'applicant_name', applicant_name,
        'interviewer_name', coalesce(nullif(reviewer_row.full_name, ''), reviewer_row.email),
        'interviewer_position', coalesce(reviewer_row.position, ''),
        'electronic_acknowledgement', false
      ), actor_id
    ) returning * into rating_row;

    insert into public.notifications (user_id, title, message, type, link, related_entity_id, dedupe_key)
    values (
      reviewer_row.id::text,
      'Interview rating assigned',
      format('You have been assigned to rate %s for %s (%s).', applicant_name, position_name, round_name),
      'INTERVIEW_RATING_ASSIGNED',
      '/recruitment/interview-ratings/' || rating_row.id::text,
      rating_row.id::text,
      'interview-rating-assigned:' || rating_row.id::text
    );

    insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
    values (actor_id::text, actor_email, 'INTERVIEW_RATING_ASSIGNED', 'job_interview_rating_records', rating_row.id::text,
      jsonb_build_object('candidate_id', p_candidate_id, 'reviewer_id', reviewer_row.id,
        'reviewer_name', coalesce(reviewer_row.full_name, reviewer_row.email), 'template_version', template_row.version,
        'interview_round', round_name, 'due_date', p_due_date)::text);
    return next rating_row;
  end loop;
end;
$$;
