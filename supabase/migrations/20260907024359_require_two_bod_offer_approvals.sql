-- Preserve HR review, require two distinct BOD final decisions. Existing RLS unchanged.
CREATE OR REPLACE FUNCTION public.create_job_offer_approval_request(p_offer_id uuid, p_attachment_snapshot jsonb, p_package_snapshot jsonb DEFAULT '{}'::jsonb, p_override_incomplete_ratings boolean DEFAULT false, p_override_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  offer_row public.job_offers%rowtype;
  application_row public.job_applications%rowtype;
  request_row public.job_offer_approval_requests%rowtype;
  document jsonb;
  document_type text;
  source_kind text;
  source_id text;
  rating_id text;
  total_ratings integer;
  submitted_ratings integer;
  has_resume boolean := false;
  has_offer boolean := false;
  has_interview_rating boolean := false;
  initial_stage text;
  v_request_id uuid;
  revision_number integer;
  assigned_count integer;
  approver_role text;
begin
  if actor_id is null
     or not public.has_recruitment_admin_access()
     or not (public.has_workflow_permission('RecruitmentOffers', 'submit') or public.is_system_admin()) then
    raise exception 'Only authorized recruitment users can request offer approval' using errcode = '42501';
  end if;
  if p_attachment_snapshot is null or jsonb_typeof(p_attachment_snapshot) <> 'array' then
    raise exception 'The approval package must include its selected documents' using errcode = '22023';
  end if;

  select * into offer_row from public.job_offers where id = p_offer_id for update;
  if not found then raise exception 'Offer was not found' using errcode = '22023'; end if;
  select * into application_row from public.job_applications where id = offer_row.application_id;
  if not found then raise exception 'Offer application was not found' using errcode = '22023'; end if;

  select count(*) into total_ratings
  from public.job_interview_rating_records rating
  where rating.candidate_id = application_row.candidate_id
    and rating.application_id = application_row.id;
  select count(*) into submitted_ratings
  from public.job_interview_rating_records rating
  where rating.candidate_id = application_row.candidate_id
    and rating.application_id = application_row.id
    and rating.status in ('Submitted', 'Locked');

  for document in select value from jsonb_array_elements(p_attachment_snapshot) loop
    document_type := btrim(coalesce(document->>'documentType', ''));
    source_kind := btrim(coalesce(document->>'source', ''));
    source_id := btrim(coalesce(document->>'sourceId', ''));
    rating_id := btrim(coalesce(document->>'ratingId', source_id));

    if document_type = 'Resume' then
      if source_kind = 'resume' and source_id = application_row.id::text
         and (nullif(application_row.resume_file_url, '') is not null
           or nullif(application_row.resume_file_path, '') is not null
           or nullif(application_row.resume_link, '') is not null
           or nullif(application_row.resume_url, '') is not null) then
        has_resume := true;
      elsif source_kind = 'candidate_document'
        and exists (
          select 1 from public.job_candidate_documents candidate_document
          where candidate_document.id::text = source_id
            and candidate_document.candidate_id = application_row.candidate_id
            and candidate_document.document_type = 'Resume'
            and candidate_document.archived_at is null
        ) then
        has_resume := true;
      else
        raise exception 'The selected resume does not belong to this candidate' using errcode = '42501';
      end if;
    elsif document_type = 'Interview Rating' then
      if source_kind = 'rating' and exists (
        select 1 from public.job_interview_rating_records rating
        where rating.id::text = source_id
          and rating.candidate_id = application_row.candidate_id
          and rating.application_id = application_row.id
          and rating.status in ('Submitted', 'Locked')
      ) then
        has_interview_rating := true;
      elsif source_kind = 'rating_attachment' and exists (
        select 1
        from public.job_interview_rating_attachments attachment
        join public.job_interview_rating_records rating on rating.id = attachment.rating_id
        where attachment.id::text = source_id
          and rating.id::text = rating_id
          and rating.candidate_id = application_row.candidate_id
          and rating.application_id = application_row.id
          and rating.status in ('Submitted', 'Locked')
      ) then
        has_interview_rating := true;
      elsif source_kind = 'candidate_document'
        and exists (
          select 1 from public.job_candidate_documents candidate_document
          where candidate_document.id::text = source_id
            and candidate_document.candidate_id = application_row.candidate_id
            and candidate_document.document_type = 'Interview Rating'
            and candidate_document.archived_at is null
        ) then
        has_interview_rating := true;
      else
        raise exception 'The selected interview rating is not a submitted rating for this candidate' using errcode = '42501';
      end if;
    elsif document_type = 'Offer' then
      if source_kind = 'offer' and source_id = offer_row.id::text then
        has_offer := true;
      else
        raise exception 'The selected offer document does not match this offer' using errcode = '42501';
      end if;
    elsif document_type = 'Other Supporting Document' then
      if source_kind <> 'candidate_document' or not exists (
        select 1 from public.job_candidate_documents candidate_document
        where candidate_document.id::text = source_id
          and candidate_document.candidate_id = application_row.candidate_id
          and candidate_document.document_type = 'Other Supporting Document'
          and candidate_document.archived_at is null
      ) then
        raise exception 'The selected supporting document does not belong to this candidate' using errcode = '42501';
      end if;
    else
      raise exception 'Every package item must have a valid document type' using errcode = '22023';
    end if;
  end loop;

  if not has_resume then raise exception 'Attach a resume before requesting offer approval' using errcode = '22023'; end if;
  if not has_offer then raise exception 'Attach the offer before requesting offer approval' using errcode = '22023'; end if;
  if not has_interview_rating and not p_override_incomplete_ratings then
    raise exception 'Attach at least one submitted interview rating, or use an authorized override' using errcode = '22023';
  end if;
  if total_ratings = 0 and not p_override_incomplete_ratings then
    raise exception 'Interview ratings are required before requesting offer approval' using errcode = '22023';
  end if;
  if total_ratings > submitted_ratings and not p_override_incomplete_ratings then
    raise exception 'All assigned interview ratings must be submitted before requesting offer approval' using errcode = '22023';
  end if;
  if p_override_incomplete_ratings then
    if not (public.is_system_admin() or public.has_active_role('HR Manager')) then
      raise exception 'Only an Admin or HR Manager can override incomplete interview ratings' using errcode = '42501';
    end if;
    if nullif(btrim(p_override_reason), '') is null then
      raise exception 'An explanation is required for an incomplete-ratings override' using errcode = '22023';
    end if;
  end if;

  initial_stage := case
    when public.has_active_role('HR Staff') and not public.has_active_role('HR Manager') then 'HR_MANAGER'
    else 'BOD_GM'
  end;
  select email into actor_email from public.hris_users where id = actor_id;

  select * into request_row
  from public.job_offer_approval_requests request
  where request.offer_id = p_offer_id
    and request.status = 'Returned for Revision'
  for update;

  if request_row.id is not null then
    v_request_id := request_row.id;
    revision_number := request_row.revision + 1;
    delete from public.job_offer_approval_assignments assignment
    where assignment.request_id = v_request_id;
    update public.job_offer_approval_requests
    set application_id = application_row.id,
        candidate_id = application_row.candidate_id,
        requester_user_id = actor_id,
        status = 'Pending Approval',
        approval_stage = initial_stage,
        revision = revision_number,
        attachment_snapshot = p_attachment_snapshot,
        package_snapshot = coalesce(p_package_snapshot, '{}'::jsonb),
        override_incomplete_ratings = coalesce(p_override_incomplete_ratings, false),
        override_reason = nullif(btrim(p_override_reason), ''),
        submitted_at = now(), updated_at = now(), completed_at = null
    where id = v_request_id
    returning * into request_row;
  else
    select * into request_row
    from public.job_offer_approval_requests request
    where request.offer_id = p_offer_id
      and request.status = 'Pending Approval'
    for update;
    if request_row.id is not null then
      raise exception 'This offer already has a pending approval request' using errcode = '23505';
    end if;
    insert into public.job_offer_approval_requests (
      offer_id, application_id, candidate_id, requester_user_id, status, approval_stage,
      attachment_snapshot, package_snapshot, override_incomplete_ratings, override_reason
    ) values (
      p_offer_id, application_row.id, application_row.candidate_id, actor_id, 'Pending Approval', initial_stage,
      p_attachment_snapshot, coalesce(p_package_snapshot, '{}'::jsonb), coalesce(p_override_incomplete_ratings, false),
      nullif(btrim(p_override_reason), '')
    ) returning * into request_row;
    v_request_id := request_row.id;
    revision_number := request_row.revision;
  end if;

  if (select count(*) from public.hris_users h where lower(btrim(coalesce(h.status,'')))='active' and private.offer_user_has_role(h.id,'Board of Director'))<2 then
    raise exception 'At least two active BOD approvers must be configured' using errcode='22023';
  end if;
  if initial_stage = 'HR_MANAGER' then
    insert into public.job_offer_approval_assignments (request_id, approver_user_id, approver_role, approval_stage)
    select v_request_id, user_row.id, 'HR Manager', 'HR_MANAGER'
    from public.hris_users user_row
    where lower(btrim(coalesce(user_row.status, ''))) = 'active'
      and private.offer_user_has_role(user_row.id, 'HR Manager');
  else
    insert into public.job_offer_approval_assignments (request_id, approver_user_id, approver_role, approval_stage)
    select v_request_id, user_row.id,
      'Board of Director',
      'BOD_GM'
    from public.hris_users user_row
    where lower(btrim(coalesce(user_row.status, ''))) = 'active'
      and private.offer_user_has_role(user_row.id, 'Board of Director');
  end if;
  select count(*) into assigned_count from public.job_offer_approval_assignments where request_id = request_row.id;
  if assigned_count = 0 then
    delete from public.job_offer_approval_requests where id = request_row.id;
    raise exception 'No active approver is configured for this offer approval stage' using errcode = '22023';
  end if;

  update public.job_offers
  set approval_status = 'Pending Approval', approval_request_id = request_row.id, updated_at = now()
  where id = p_offer_id;

  insert into public.job_offer_approval_history (
    request_id, approval_stage, approver_user_id, approver_role, action,
    status_before, status_after, comments, documents_reviewed
  ) values (
    request_row.id, initial_stage, actor_id, 'Requester',
    case when revision_number > 1 then 'RESUBMITTED' else 'SUBMITTED' end,
    case when revision_number > 1 then 'Returned for Revision' else 'Not Requested' end,
    'Pending Approval', nullif(btrim(p_override_reason), ''), p_attachment_snapshot
  );

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text, actor_email,
    case when revision_number > 1 then 'OFFER_APPROVAL_RESUBMITTED' else 'OFFER_APPROVAL_SUBMITTED' end,
    'job_offer_approval_requests', request_row.id::text,
    jsonb_build_object('offer_id', p_offer_id, 'candidate_id', application_row.candidate_id,
      'approval_stage', initial_stage, 'revision', revision_number,
      'override_incomplete_ratings', coalesce(p_override_incomplete_ratings, false),
      'override_reason', nullif(btrim(p_override_reason), ''), 'documents_reviewed', p_attachment_snapshot)::text
  );

  insert into public.notifications(user_id, type, title, message, link, is_read, related_entity_id, dedupe_key)
  select assignment.approver_user_id::text, 'OFFER_APPROVAL',
    'Offer approval request',
    format('An offer approval package for %s is awaiting your %s review.', candidate.first_name || 'candidate',
      case when initial_stage = 'HR_MANAGER' then 'HR Manager' else 'BOD (two approvals)' end),
    '/approvals?type=offer&item=' || request_row.id::text, false, request_row.id::text,
    'offer-approval:' || request_row.id::text || ':' || revision_number::text || ':' || assignment.approver_user_id::text
  from public.job_offer_approval_assignments assignment
  join public.job_candidates candidate on candidate.id = application_row.candidate_id
  where assignment.request_id = request_row.id;

  return request_row.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.process_job_offer_approval(p_request_id uuid, p_decision text, p_comments text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  decision text := lower(btrim(coalesce(p_decision, '')));
  request_row public.job_offer_approval_requests%rowtype;
  assignment_row public.job_offer_approval_assignments%rowtype;
  offer_row public.job_offers%rowtype;
  application_row public.job_applications%rowtype;
  candidate_name text;
  previous_status text;
  next_stage text;
  next_role text;
  next_assigned_count integer;
begin
  if decision not in ('approve', 'return', 'reject') then
    raise exception 'Decision must be approve, return, or reject' using errcode = '22023';
  end if;
  if decision in ('return', 'reject') and nullif(btrim(p_comments), '') is null then
    raise exception 'Comments are required when returning or rejecting an offer approval' using errcode = '22023';
  end if;
  if actor_id is null then raise exception 'Your session is not authorized' using errcode = '42501'; end if;

  select * into request_row from public.job_offer_approval_requests where id = p_request_id for update;
  if not found then raise exception 'Offer approval request was not found' using errcode = '22023'; end if;
  if request_row.status <> 'Pending Approval' then
    raise exception 'This offer approval has already been processed' using errcode = 'P0001';
  end if;
  select * into assignment_row
  from public.job_offer_approval_assignments assignment
  where assignment.request_id = request_row.id
    and assignment.approver_user_id = actor_id
    and assignment.status = 'Pending'
    and assignment.approval_stage = request_row.approval_stage
  for update;
  if not found then raise exception 'This offer approval is not assigned to you' using errcode = '42501'; end if;
  if request_row.approval_stage='BOD_GM' and not private.offer_user_has_role(actor_id,'Board of Director') then raise exception 'An active BOD assignment is required' using errcode='42501'; end if;

  select * into offer_row from public.job_offers where id = request_row.offer_id;
  select * into application_row from public.job_applications where id = request_row.application_id;
  select candidate.first_name || ' ' || candidate.last_name into candidate_name
  from public.job_candidates candidate where candidate.id = request_row.candidate_id;
  select email into actor_email from public.hris_users where id = actor_id;
  previous_status := request_row.status;

  update public.job_offer_approval_assignments
  set status = case when decision = 'approve' then 'Approved' when decision = 'return' then 'Returned for Revision' else 'Rejected' end,
      comments = nullif(btrim(p_comments), ''), decided_at = now()
  where id = assignment_row.id;

  insert into public.job_offer_approval_history (
    request_id, approval_stage, approver_user_id, approver_role, action,
    status_before, status_after, comments, documents_reviewed
  ) values (
    request_row.id, request_row.approval_stage, actor_id, assignment_row.approver_role,
    upper(decision), previous_status,
    case when decision = 'approve' and (request_row.approval_stage = 'HR_MANAGER' or (select count(distinct approver_user_id) from public.job_offer_approval_assignments where request_id=p_request_id and approval_stage='BOD_GM' and status='Approved' and approver_role='Board of Director') < 2) then 'Pending Approval'
      when decision = 'approve' then 'Approved'
      when decision = 'return' then 'Returned for Revision' else 'Rejected' end,
    nullif(btrim(p_comments), ''), request_row.attachment_snapshot
  );
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text, actor_email, 'OFFER_APPROVAL_' || upper(decision), 'job_offer_approval_requests', request_row.id::text,
    jsonb_build_object('offer_id', request_row.offer_id, 'candidate_id', request_row.candidate_id,
      'approver_role', assignment_row.approver_role, 'approval_stage', request_row.approval_stage,
      'previous_status', previous_status,
      'new_status', case when decision = 'approve' and (request_row.approval_stage = 'HR_MANAGER' or (select count(distinct approver_user_id) from public.job_offer_approval_assignments where request_id=p_request_id and approval_stage='BOD_GM' and status='Approved' and approver_role='Board of Director') < 2) then 'Pending Approval'
        when decision = 'approve' then 'Approved' when decision = 'return' then 'Returned for Revision' else 'Rejected' end,
      'comments', nullif(btrim(p_comments), ''), 'documents_reviewed', request_row.attachment_snapshot)::text
  );

  if decision <> 'approve' then
    update public.job_offer_approval_requests
    set status = case when decision = 'return' then 'Returned for Revision' else 'Rejected' end,
        updated_at = now(), completed_at = now()
    where id = request_row.id;
    update public.job_offer_approval_assignments
    set status = 'Cancelled', comments = 'Closed by another approval decision.', decided_at = now()
    where request_id = request_row.id and status = 'Pending';
    update public.job_offers
    set approval_status = case when decision = 'return' then 'Returned for Revision' else 'Rejected' end,
        updated_at = now()
    where id = request_row.offer_id;
    insert into public.notifications(user_id, type, title, message, link, is_read, related_entity_id, dedupe_key)
    values (
      request_row.requester_user_id::text, 'OFFER_APPROVAL_' || upper(decision),
      case when decision = 'return' then 'Offer approval returned for revision' else 'Offer approval rejected' end,
      format('The offer approval package for %s was %s. %s', coalesce(candidate_name, 'the candidate'),
        case when decision = 'return' then 'returned for revision' else 'rejected' end, coalesce(p_comments, '')),
      '/recruitment/offers?approval=' || request_row.id::text, false, request_row.id::text,
      'offer-approval-decision:' || request_row.id::text || ':' || request_row.revision::text
    );
    return jsonb_build_object('requestId', request_row.id, 'status', case when decision = 'return' then 'Returned for Revision' else 'Rejected' end);
  end if;

  if request_row.approval_stage='BOD_GM' and (select count(distinct approver_user_id) from public.job_offer_approval_assignments where request_id=p_request_id and approval_stage='BOD_GM' and status='Approved' and approver_role='Board of Director') < 2 then
    return jsonb_build_object('requestId',request_row.id,'status','Pending Approval','approvalStage',request_row.approval_stage);
  end if;

  update public.job_offer_approval_assignments
  set status = 'Cancelled', comments = 'Closed after another approval in this stage.', decided_at = now()
  where request_id = request_row.id and status = 'Pending';

  if request_row.approval_stage = 'HR_MANAGER' then
    next_stage := 'BOD_GM';
    update public.job_offer_approval_requests
    set status = 'Pending Approval', approval_stage = next_stage, updated_at = now(), completed_at = null
    where id = request_row.id;
    insert into public.job_offer_approval_assignments (request_id, approver_user_id, approver_role, approval_stage)
    select request_row.id, user_row.id,
      'Board of Director',
      next_stage
    from public.hris_users user_row
    where lower(btrim(coalesce(user_row.status, ''))) = 'active'
      and private.offer_user_has_role(user_row.id, 'Board of Director');
    select count(*) into next_assigned_count
    from public.job_offer_approval_assignments assignment
    where assignment.request_id = request_row.id and assignment.approval_stage = next_stage and assignment.status = 'Pending';
    if next_assigned_count < 2 then
      raise exception 'At least two active BOD approvers must be configured' using errcode = '22023';
    end if;
    update public.job_offers set approval_status = 'Pending Approval', updated_at = now() where id = request_row.offer_id;
    insert into public.job_offer_approval_history (
      request_id, approval_stage, approver_user_id, approver_role, action,
      status_before, status_after, comments, documents_reviewed
    ) values (
      request_row.id, next_stage, null, 'BOD approval pool', 'STAGE_ADVANCED',
      'Pending Approval', 'Pending Approval', null, request_row.attachment_snapshot
    );
    insert into public.notifications(user_id, type, title, message, link, is_read, related_entity_id, dedupe_key)
    select assignment.approver_user_id::text, 'OFFER_APPROVAL',
      'Offer approval package ready for final review',
      format('The HR review is complete. The offer package for %s is awaiting your BOD (two approvals) approval.', coalesce(candidate_name, 'the candidate')),
      '/approvals?type=offer&item=' || request_row.id::text, false, request_row.id::text,
      'offer-approval-stage:' || request_row.id::text || ':' || request_row.revision::text || ':' || assignment.approver_user_id::text
    from public.job_offer_approval_assignments assignment
    where assignment.request_id = request_row.id and assignment.approval_stage = next_stage;
    return jsonb_build_object('requestId', request_row.id, 'status', 'Pending Approval', 'approvalStage', next_stage);
  end if;

  update public.job_offer_approval_requests
  set status = 'Approved', updated_at = now(), completed_at = now()
  where id = request_row.id;
  update public.job_offers
  set approval_status = 'Approved', updated_at = now()
  where id = request_row.offer_id;
  insert into public.notifications(user_id, type, title, message, link, is_read, related_entity_id, dedupe_key)
  values (
    request_row.requester_user_id::text, 'OFFER_APPROVAL_APPROVED', 'Offer approval completed',
    format('The offer approval package for %s was approved by %s.', coalesce(candidate_name, 'the candidate'), coalesce(actor_email, 'an approver')),
    '/recruitment/offers?approval=' || request_row.id::text, false, request_row.id::text,
    'offer-approval-complete:' || request_row.id::text || ':' || request_row.revision::text
  );
  return jsonb_build_object('requestId', request_row.id, 'status', 'Approved', 'approvalStage', request_row.approval_stage);
end;
$function$;

notify pgrst,'reload schema';

