-- Repair the recruitment offer-approval package and evaluation assignment
-- workspaces without widening access to candidate or employee records.

-- -------------------------------------------------------------------------
-- Offer approval: preserve the complete source relationship on every request.
-- -------------------------------------------------------------------------

alter table public.job_offer_approval_requests
  add column if not exists job_post_id uuid references public.job_posts(id) on delete restrict,
  add column if not exists requisition_id uuid references public.job_requisitions(id) on delete restrict;

update public.job_offer_approval_requests request
set job_post_id = application.job_post_id,
    requisition_id = application.requisition_id
from public.job_applications application
where application.id = request.application_id
  and (request.job_post_id is distinct from application.job_post_id
    or request.requisition_id is distinct from application.requisition_id);

create index if not exists job_offer_approval_requests_requisition_key
  on public.job_offer_approval_requests(requisition_id, submitted_at desc)
  where requisition_id is not null;

create index if not exists job_offer_approval_requests_job_post_key
  on public.job_offer_approval_requests(job_post_id, submitted_at desc)
  where job_post_id is not null;

create or replace function private.populate_offer_approval_request_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_application_id uuid;
  linked_candidate_id uuid;
  linked_job_post_id uuid;
  linked_requisition_id uuid;
begin
  select offer.application_id,
         application.candidate_id,
         application.job_post_id,
         application.requisition_id
  into linked_application_id, linked_candidate_id, linked_job_post_id, linked_requisition_id
  from public.job_offers offer
  join public.job_applications application on application.id = offer.application_id
  where offer.id = new.offer_id;

  if linked_application_id is null then
    raise exception 'Offer application was not found' using errcode = '22023';
  end if;

  new.application_id := linked_application_id;
  new.candidate_id := linked_candidate_id;
  new.job_post_id := linked_job_post_id;
  new.requisition_id := linked_requisition_id;
  return new;
end;
$$;

revoke all on function private.populate_offer_approval_request_scope() from public, anon, authenticated;

drop trigger if exists populate_offer_approval_request_scope on public.job_offer_approval_requests;
create trigger populate_offer_approval_request_scope
before insert or update of offer_id, application_id, candidate_id, job_post_id, requisition_id
on public.job_offer_approval_requests
for each row execute function private.populate_offer_approval_request_scope();

-- Existing candidate files can be classified explicitly. The classification is
-- stored on the same record that is selected and validated by the approval RPC.
create or replace function public.update_job_candidate_document_type(
  p_document_id uuid,
  p_document_type text
)
returns public.job_candidate_documents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select public.current_hris_user_id());
  actor_email text;
  document_row public.job_candidate_documents%rowtype;
  previous_type text;
  normalized_type text;
begin
  if actor_id is null or not (select public.has_recruitment_admin_access()) then
    raise exception 'Only authorized recruitment users can classify candidate documents' using errcode = '42501';
  end if;

  normalized_type := case lower(btrim(coalesce(p_document_type, '')))
    when 'resume' then 'Resume'
    when 'interview rating' then 'Interview Rating'
    when 'offer' then 'Offer'
    when 'other supporting document' then 'Other Supporting Document'
    else null
  end;
  if normalized_type is null then
    raise exception 'Invalid candidate document type' using errcode = '22023';
  end if;

  select * into document_row
  from public.job_candidate_documents
  where id = p_document_id
  for update;
  if not found then
    raise exception 'Candidate document was not found' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.job_offer_approval_requests request
    cross join lateral jsonb_array_elements(coalesce(request.attachment_snapshot, '[]'::jsonb)) attachment
    where attachment->>'source' = 'candidate_document'
      and attachment->>'sourceId' = document_row.id::text
  ) then
    raise exception 'A document already recorded in an approval package cannot be reclassified' using errcode = '55000';
  end if;

  previous_type := document_row.document_type;
  if previous_type = normalized_type then
    return document_row;
  end if;

  update public.job_candidate_documents
  set document_type = normalized_type,
      metadata = jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{classificationHistory}',
        coalesce(metadata->'classificationHistory', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'from', previous_type,
            'to', normalized_type,
            'changedBy', actor_id,
            'changedAt', now()
          )),
        true
      )
  where id = document_row.id
  returning * into document_row;

  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text,
    actor_email,
    'CANDIDATE_DOCUMENT_RECLASSIFIED',
    'job_candidate_documents',
    document_row.id::text,
    jsonb_build_object(
      'candidate_id', document_row.candidate_id,
      'application_id', document_row.application_id,
      'file_name', document_row.file_name,
      'previous_type', previous_type,
      'new_type', normalized_type
    )::text
  );

  return document_row;
end;
$$;

revoke all on function public.update_job_candidate_document_type(uuid, text) from public, anon;
grant execute on function public.update_job_candidate_document_type(uuid, text) to authenticated;

-- Removing a file from the candidate library is now recoverable. Referenced
-- package files and their storage objects remain available to assigned reviewers.
create or replace function public.remove_job_candidate_document(p_document_id uuid)
returns public.job_candidate_documents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select public.current_hris_user_id());
  actor_email text;
  document_row public.job_candidate_documents%rowtype;
begin
  if actor_id is null or not (select public.has_recruitment_admin_access()) then
    raise exception 'Only authorized recruitment users can remove candidate documents' using errcode = '42501';
  end if;

  select * into document_row
  from public.job_candidate_documents
  where id = p_document_id
  for update;
  if not found then
    raise exception 'Candidate document was not found' using errcode = '22023';
  end if;

  if document_row.archived_at is null then
    update public.job_candidate_documents
    set archived_at = now()
    where id = document_row.id
    returning * into document_row;

    select email into actor_email from public.hris_users where id = actor_id;
    insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
    values (
      actor_id::text,
      actor_email,
      'CANDIDATE_DOCUMENT_ARCHIVED',
      'job_candidate_documents',
      document_row.id::text,
      jsonb_build_object(
        'candidate_id', document_row.candidate_id,
        'application_id', document_row.application_id,
        'document_type', document_row.document_type,
        'file_name', document_row.file_name
      )::text
    );
  end if;

  return document_row;
end;
$$;

-- Return only the immutable package documents to request participants. Archived
-- source records remain readable because the request snapshot still references them.
create or replace function public.get_job_offer_approval_package(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.job_offer_approval_requests%rowtype;
  offer_row public.job_offers%rowtype;
  application_row public.job_applications%rowtype;
  candidate_row public.job_candidates%rowtype;
begin
  if (select public.current_hris_user_id()) is null
     or not (select private.offer_approval_actor_can_view(p_request_id)) then
    raise exception 'You are not authorized to view this offer approval package' using errcode = '42501';
  end if;

  select * into request_row from public.job_offer_approval_requests where id = p_request_id;
  if not found then
    raise exception 'Offer approval request was not found' using errcode = '22023';
  end if;
  select * into offer_row from public.job_offers where id = request_row.offer_id;
  select * into application_row from public.job_applications where id = request_row.application_id;
  select * into candidate_row from public.job_candidates where id = request_row.candidate_id;

  return jsonb_build_object(
    'request', to_jsonb(request_row),
    'offer', to_jsonb(offer_row),
    'application', to_jsonb(application_row),
    'candidate', to_jsonb(candidate_row),
    'ratings', coalesce((
      select jsonb_agg(to_jsonb(rating) order by rating.created_at asc)
      from public.job_interview_rating_records rating
      where rating.candidate_id = request_row.candidate_id
        and rating.application_id = request_row.application_id
        and exists (
          select 1
          from jsonb_array_elements(request_row.attachment_snapshot) attachment
          where (attachment->>'source' = 'rating' and attachment->>'sourceId' = rating.id::text)
             or (attachment->>'source' = 'rating_attachment' and attachment->>'ratingId' = rating.id::text)
        )
    ), '[]'::jsonb),
    'ratingAttachments', coalesce((
      select jsonb_agg(to_jsonb(attachment_row) order by attachment_row.created_at asc)
      from public.job_interview_rating_attachments attachment_row
      where exists (
        select 1
        from jsonb_array_elements(request_row.attachment_snapshot) attachment
        where attachment->>'source' = 'rating_attachment'
          and attachment->>'sourceId' = attachment_row.id::text
      )
    ), '[]'::jsonb),
    'candidateDocuments', coalesce((
      select jsonb_agg(to_jsonb(document) order by document.uploaded_at desc)
      from public.job_candidate_documents document
      where document.candidate_id = request_row.candidate_id
        and exists (
          select 1
          from jsonb_array_elements(request_row.attachment_snapshot) attachment
          where attachment->>'source' = 'candidate_document'
            and attachment->>'sourceId' = document.id::text
        )
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(to_jsonb(assignment) order by assignment.assigned_at asc)
      from public.job_offer_approval_assignments assignment
      where assignment.request_id = request_row.id
    ), '[]'::jsonb),
    'approvalTrail', coalesce((
      select jsonb_agg(to_jsonb(history) order by history.created_at asc)
      from public.job_offer_approval_history history
      where history.request_id = request_row.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Assigned approvers may regenerate a short-lived URL whenever they revisit an
-- approval. Access remains package-document scoped instead of role-wide.
drop policy if exists job_candidate_documents_recruitment_select on public.job_candidate_documents;
create policy job_candidate_documents_recruitment_select
  on public.job_candidate_documents for select to authenticated
  using (
    (select public.has_recruitment_admin_access())
    or exists (
      select 1
      from public.job_applications application
      where application.id = job_candidate_documents.application_id
        and (select public.can_access_requisition(application.requisition_id))
    )
    or exists (
      select 1
      from public.job_offer_approval_requests request
      join public.job_offer_approval_assignments assignment on assignment.request_id = request.id
      where request.candidate_id = job_candidate_documents.candidate_id
        and assignment.approver_user_id = (select public.current_hris_user_id())
        and exists (
          select 1
          from jsonb_array_elements(request.attachment_snapshot) attachment
          where attachment->>'source' = 'candidate_document'
            and attachment->>'sourceId' = job_candidate_documents.id::text
        )
    )
  );

drop policy if exists candidate_recruitment_documents_storage_select on storage.objects;
create policy candidate_recruitment_documents_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-recruitment-documents'
    and (
      (select public.has_recruitment_admin_access())
      or exists (
        select 1
        from public.job_candidate_documents document
        join public.job_offer_approval_requests request on request.candidate_id = document.candidate_id
        join public.job_offer_approval_assignments assignment on assignment.request_id = request.id
        where document.storage_bucket = bucket_id
          and document.storage_path = name
          and assignment.approver_user_id = (select public.current_hris_user_id())
          and exists (
            select 1
            from jsonb_array_elements(request.attachment_snapshot) attachment
            where attachment->>'source' = 'candidate_document'
              and attachment->>'sourceId' = document.id::text
          )
      )
    )
  );

drop policy if exists offer_approval_resume_storage_select on storage.objects;
create policy offer_approval_resume_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recruitment-uploads'
    and exists (
      select 1
      from public.job_applications application
      join public.job_offer_approval_requests request on request.application_id = application.id
      join public.job_offer_approval_assignments assignment on assignment.request_id = request.id
      where (
          application.resume_file_path = name
          or name = replace(
            substring(
              split_part(coalesce(application.resume_file_url, application.resume_link, application.resume_url, ''), '?', 1)
              from '/recruitment-uploads/(.*)$'
            ),
            '%20',
            ' '
          )
        )
        and assignment.approver_user_id = (select public.current_hris_user_id())
        and exists (
          select 1
          from jsonb_array_elements(request.attachment_snapshot) attachment
          where attachment->>'source' = 'resume'
            and attachment->>'sourceId' = application.id::text
        )
    )
  );

drop policy if exists interview_rating_attachments_offer_storage_select on storage.objects;
create policy interview_rating_attachments_offer_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'interview-rating-attachments'
    and exists (
      select 1
      from public.job_interview_rating_attachments rating_attachment
      join public.job_interview_rating_records rating on rating.id = rating_attachment.rating_id
      join public.job_offer_approval_requests request
        on request.candidate_id = rating.candidate_id
       and request.application_id = rating.application_id
      join public.job_offer_approval_assignments assignment on assignment.request_id = request.id
      where rating_attachment.storage_path = name
        and assignment.approver_user_id = (select public.current_hris_user_id())
        and exists (
          select 1
          from jsonb_array_elements(request.attachment_snapshot) attachment
          where attachment->>'source' = 'rating_attachment'
            and attachment->>'sourceId' = rating_attachment.id::text
        )
    )
  );

-- Final BOD/GM approval advances the existing application workflow to Offer,
-- but never rewinds a terminal application.
create or replace function private.sync_approved_offer_application_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select public.current_hris_user_id());
  actor_email text;
  prior_stage text;
begin
  if new.approval_status = 'Approved'
     and old.approval_status is distinct from new.approval_status then
    select stage into prior_stage
    from public.job_applications
    where id = new.application_id
    for update;

    update public.job_applications
    set stage = 'Offer', updated_at = now()
    where id = new.application_id
      and stage not in ('Offer', 'Hired', 'Rejected', 'Withdrawn');

    if found and actor_id is not null then
      select email into actor_email from public.hris_users where id = actor_id;
      insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
      values (
        actor_id::text,
        actor_email,
        'OFFER_APPROVAL_APPLICATION_STAGE_ADVANCED',
        'job_applications',
        new.application_id::text,
        jsonb_build_object(
          'offer_id', new.id,
          'approval_request_id', new.approval_request_id,
          'previous_stage', prior_stage,
          'new_stage', 'Offer'
        )::text
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_approved_offer_application_stage() from public, anon, authenticated;
drop trigger if exists sync_approved_offer_application_stage on public.job_offers;
create trigger sync_approved_offer_application_stage
after update of approval_status on public.job_offers
for each row execute function private.sync_approved_offer_application_stage();

-- -------------------------------------------------------------------------
-- Evaluation assignments: canonical IDs, safe target lookup, synchronized state.
-- -------------------------------------------------------------------------

-- This backfill only changes an ID when it is not a profile ID and exactly
-- matches one active auth_user_id. It never guesses by name, email, role, or BU.
update public.evaluation_evaluators evaluator
set user_id = profile.id
from public.hris_users profile
where evaluator.type = 'Individual'
  and evaluator.user_id = profile.auth_user_id
  and not exists (
    select 1 from public.hris_users existing_profile where existing_profile.id = evaluator.user_id
  );

alter table public.evaluation_evaluators
  drop constraint if exists evaluation_evaluators_assignment_shape_check;
alter table public.evaluation_evaluators
  add constraint evaluation_evaluators_assignment_shape_check check (
    (type = 'Individual' and user_id is not null)
    or
    (type = 'Group' and user_id is null and (business_unit_id is not null or department_id is not null))
  ) not valid;
alter table public.evaluation_evaluators
  validate constraint evaluation_evaluators_assignment_shape_check;

alter table public.evaluation_assignments
  drop constraint if exists evaluation_assignments_status_check;
alter table public.evaluation_assignments
  add constraint evaluation_assignments_status_check
  check (status in ('Pending', 'In Progress', 'Completed', 'Cancelled'));

create or replace function private.refresh_evaluation_assignment_status(
  p_evaluation_id uuid,
  p_employee_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.evaluation_assignments assignment
  set status = case
        when assignment.status = 'Cancelled' then 'Cancelled'
        when cardinality(assignment.evaluator_user_ids) = 0 then 'Pending'
        when not exists (
          select 1
          from unnest(assignment.evaluator_user_ids) evaluator_id
          where not exists (
            select 1
            from public.evaluation_submissions submission
            where submission.evaluation_id = assignment.evaluation_id
              and submission.subject_employee_id = assignment.employee_id
              and submission.rater_id = evaluator_id
          )
        ) then 'Completed'
        when exists (
          select 1
          from public.evaluation_submissions submission
          where submission.evaluation_id = assignment.evaluation_id
            and submission.subject_employee_id = assignment.employee_id
            and submission.rater_id = any(assignment.evaluator_user_ids)
        ) then 'In Progress'
        else 'Pending'
      end,
      completed_at = case
        when cardinality(assignment.evaluator_user_ids) > 0
          and not exists (
            select 1
            from unnest(assignment.evaluator_user_ids) evaluator_id
            where not exists (
              select 1
              from public.evaluation_submissions submission
              where submission.evaluation_id = assignment.evaluation_id
                and submission.subject_employee_id = assignment.employee_id
                and submission.rater_id = evaluator_id
            )
          )
        then coalesce((
          select max(submission.submitted_at)
          from public.evaluation_submissions submission
          where submission.evaluation_id = assignment.evaluation_id
            and submission.subject_employee_id = assignment.employee_id
            and submission.rater_id = any(assignment.evaluator_user_ids)
        ), now())
        else null
      end
  where assignment.evaluation_id = p_evaluation_id
    and assignment.employee_id = p_employee_id;
end;
$$;

revoke all on function private.refresh_evaluation_assignment_status(uuid, uuid) from public, anon, authenticated;

create or replace function private.sync_evaluation_assignment_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_evaluation_assignment_status(
    coalesce(new.evaluation_id, old.evaluation_id),
    coalesce(new.subject_employee_id, old.subject_employee_id)
  );
  return coalesce(new, old);
end;
$$;

revoke all on function private.sync_evaluation_assignment_completion() from public, anon, authenticated;
drop trigger if exists sync_evaluation_assignment_completion on public.evaluation_submissions;
create trigger sync_evaluation_assignment_completion
after insert or update or delete on public.evaluation_submissions
for each row execute function private.sync_evaluation_assignment_completion();

create or replace function private.refresh_evaluation_assignment_members(p_evaluation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment_row record;
begin
  update public.evaluation_assignments assignment
  set evaluator_config = coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', evaluator.id,
          'type', upper(evaluator.type),
          'weight', evaluator.weight,
          'user_id', evaluator.user_id,
          'business_unit_id', evaluator.business_unit_id,
          'department_id', evaluator.department_id,
          'is_anonymous', evaluator.is_anonymous,
          'exclude_subject', evaluator.exclude_subject
        ) order by evaluator.id)
        from public.evaluation_evaluators evaluator
        where evaluator.evaluation_id = assignment.evaluation_id
      ), '[]'::jsonb),
      evaluator_user_ids = coalesce((
        select array_agg(distinct eligible_user.id order by eligible_user.id)
        from public.evaluation_evaluators evaluator
        join public.hris_users eligible_user
          on lower(eligible_user.status) = 'active'
         and (
           (evaluator.type = 'Individual' and eligible_user.id = evaluator.user_id)
           or (
             evaluator.type = 'Group'
             and (evaluator.business_unit_id is null or eligible_user.business_unit_id = evaluator.business_unit_id)
             and (evaluator.department_id is null or eligible_user.department_id = evaluator.department_id)
             and not (coalesce(evaluator.exclude_subject, true) and eligible_user.id = assignment.employee_id)
           )
         )
        where evaluator.evaluation_id = assignment.evaluation_id
      ), '{}'::uuid[])
  where assignment.evaluation_id = p_evaluation_id;

  for assignment_row in
    select assignment.employee_id
    from public.evaluation_assignments assignment
    where assignment.evaluation_id = p_evaluation_id
  loop
    perform private.refresh_evaluation_assignment_status(p_evaluation_id, assignment_row.employee_id);
  end loop;

  insert into public.notifications(
    user_id, type, title, message, link, related_entity_id, is_read, dedupe_key
  )
  select distinct
    evaluator_id::text,
    'EVALUATION_ASSIGNED',
    'Evaluation Assigned',
    format('You have been assigned to complete %s.', evaluation.name),
    format('/evaluation/perform/%s', evaluation.id),
    evaluation.id::text,
    false,
    format('evaluation:%s:evaluator', evaluation.id)
  from public.evaluation_assignments assignment
  join public.evaluations evaluation on evaluation.id = assignment.evaluation_id
  cross join lateral unnest(assignment.evaluator_user_ids) evaluator_id
  where assignment.evaluation_id = p_evaluation_id
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

revoke all on function private.refresh_evaluation_assignment_members(uuid) from public, anon, authenticated;

create or replace function private.sync_evaluation_assignment_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_evaluation_assignment_members(old.evaluation_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.evaluation_id is distinct from new.evaluation_id then
    perform private.refresh_evaluation_assignment_members(old.evaluation_id);
  end if;
  perform private.refresh_evaluation_assignment_members(new.evaluation_id);
  return new;
end;
$$;

revoke all on function private.sync_evaluation_assignment_members() from public, anon, authenticated;
drop trigger if exists sync_evaluation_assignment_members on public.evaluation_evaluators;
create trigger sync_evaluation_assignment_members
after insert or update or delete on public.evaluation_evaluators
for each row execute function private.sync_evaluation_assignment_members();

do $$
declare
  evaluation_id uuid;
begin
  for evaluation_id in
    select distinct assignment.evaluation_id from public.evaluation_assignments assignment
  loop
    perform private.refresh_evaluation_assignment_members(evaluation_id);
  end loop;
end
$$;

-- The evaluator receives only fields needed to complete the assigned review.
-- This function deliberately bypasses the broad hris_users row policy without
-- exposing salary, banking, government IDs, leave, or disciplinary information.
create or replace function public.get_my_evaluation_workspace(p_evaluation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select public.current_hris_user_id());
  actor_profile public.hris_users%rowtype;
  evaluation_row public.evaluations%rowtype;
  eligible_target_ids uuid[];
  has_oversight boolean;
begin
  if actor_id is null then
    raise exception 'An active HRIS account is required' using errcode = '42501';
  end if;

  select * into actor_profile
  from public.hris_users
  where id = actor_id and lower(status) = 'active';
  if not found then
    raise exception 'An active HRIS profile is required' using errcode = '42501';
  end if;

  select * into evaluation_row
  from public.evaluations
  where id = p_evaluation_id;
  if not found then
    raise exception 'Evaluation was not found' using errcode = '22023';
  end if;

  has_oversight := (select public.is_hr_or_admin()) or (select public.is_system_admin());

  select coalesce(array_agg(target_id order by target_id), '{}'::uuid[])
  into eligible_target_ids
  from unnest(evaluation_row.target_employee_ids) target(target_id)
  where has_oversight
     or exists (
       select 1
       from public.evaluation_evaluators evaluator
       where evaluator.evaluation_id = evaluation_row.id
         and (
           (evaluator.type = 'Individual' and evaluator.user_id = actor_id)
           or (
             evaluator.type = 'Group'
             and (evaluator.business_unit_id is null or evaluator.business_unit_id = actor_profile.business_unit_id)
             and (evaluator.department_id is null or evaluator.department_id = actor_profile.department_id)
             and not (coalesce(evaluator.exclude_subject, true) and target_id = actor_id)
           )
         )
     );

  if cardinality(eligible_target_ids) = 0 and not has_oversight then
    raise exception 'This evaluation is not assigned to your account' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'raterProfileId', actor_id,
    'evaluation', jsonb_build_object(
      'id', evaluation_row.id,
      'name', evaluation_row.name,
      'timeline_id', evaluation_row.timeline_id,
      'target_business_unit_ids', evaluation_row.target_business_unit_ids,
      'target_employee_ids', eligible_target_ids,
      'question_set_ids', evaluation_row.question_set_ids,
      'status', evaluation_row.status,
      'created_at', evaluation_row.created_at,
      'updated_at', evaluation_row.updated_at,
      'due_date', evaluation_row.due_date,
      'is_employee_visible', evaluation_row.is_employee_visible,
      'acknowledged_by', evaluation_row.acknowledged_by
    ),
    'evaluators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', evaluator.id,
        'evaluation_id', evaluator.evaluation_id,
        'type', evaluator.type,
        'user_id', evaluator.user_id,
        'weight', evaluator.weight,
        'business_unit_id', evaluator.business_unit_id,
        'department_id', evaluator.department_id,
        'is_anonymous', evaluator.is_anonymous,
        'exclude_subject', evaluator.exclude_subject
      ) order by evaluator.id)
      from public.evaluation_evaluators evaluator
      where evaluator.evaluation_id = evaluation_row.id
        and (
          has_oversight
          or (evaluator.type = 'Individual' and evaluator.user_id = actor_id)
          or (
            evaluator.type = 'Group'
            and (evaluator.business_unit_id is null or evaluator.business_unit_id = actor_profile.business_unit_id)
            and (evaluator.department_id is null or evaluator.department_id = actor_profile.department_id)
          )
        )
    ), '[]'::jsonb),
    'targetUsers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', employee.id,
        'full_name', employee.full_name,
        'role', employee.role,
        'status', employee.status,
        'business_unit', employee.business_unit,
        'business_unit_id', employee.business_unit_id,
        'department', employee.department,
        'department_id', employee.department_id,
        'position', employee.position
      ) order by employee.full_name)
      from public.hris_users employee
      where employee.id = any(eligible_target_ids)
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(to_jsonb(question) order by question.title, question.id)
      from public.evaluation_questions question
      where question.question_set_id = any(evaluation_row.question_set_ids)
        and not question.is_archived
    ), '[]'::jsonb),
    'submissions', coalesce((
      select jsonb_agg(to_jsonb(submission) order by submission.submitted_at desc)
      from public.evaluation_submissions submission
      where submission.evaluation_id = evaluation_row.id
        and submission.rater_id = actor_id
        and submission.subject_employee_id = any(eligible_target_ids)
    ), '[]'::jsonb),
    'assignmentRecords', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', assignment.id,
        'evaluation_id', assignment.evaluation_id,
        'employee_id', assignment.employee_id,
        'timeline_id', assignment.timeline_id,
        'due_date', assignment.due_date,
        'status', assignment.status
      ) order by assignment.employee_id)
      from public.evaluation_assignments assignment
      where assignment.evaluation_id = evaluation_row.id
        and assignment.employee_id = any(eligible_target_ids)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_evaluation_workspace(uuid) from public, anon;
grant execute on function public.get_my_evaluation_workspace(uuid) to authenticated;

comment on function public.get_my_evaluation_workspace(uuid) is
  'Returns one assignment-scoped evaluation workspace using canonical hris_users.id values and a minimal employee projection.';
