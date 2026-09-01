-- Phase 2: candidate rating summary and offer approval package.
-- Interview rating records remain immutable snapshots. This migration adds
-- candidate-scoped supporting documents and a single audited offer approval
-- workflow that is consumed by the existing Approval Center.

alter table public.job_offers
  add column if not exists approval_status text not null default 'Not Requested',
  add column if not exists approval_request_id uuid;

create index if not exists job_offers_approval_request_key
  on public.job_offers(approval_request_id)
  where approval_request_id is not null;

create table if not exists public.job_candidate_documents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.job_candidates(id) on delete cascade,
  application_id uuid references public.job_applications(id) on delete set null,
  document_type text not null check (document_type in ('Resume', 'Interview Rating', 'Offer', 'Other Supporting Document')),
  file_name text not null check (length(btrim(file_name)) > 0),
  mime_type text not null default 'application/octet-stream',
  file_size bigint,
  storage_bucket text,
  storage_path text,
  external_url text,
  uploaded_by_user_id uuid not null references public.hris_users(id),
  uploaded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  archived_at timestamptz,
  constraint job_candidate_documents_source_check check (storage_path is not null or external_url is not null)
);

create index if not exists job_candidate_documents_candidate_key
  on public.job_candidate_documents(candidate_id, document_type, uploaded_at desc);

create table if not exists public.job_offer_approval_requests (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.job_offers(id) on delete restrict,
  application_id uuid not null references public.job_applications(id) on delete restrict,
  candidate_id uuid not null references public.job_candidates(id) on delete restrict,
  requester_user_id uuid not null references public.hris_users(id),
  status text not null default 'Pending Approval'
    check (status in ('Pending Approval', 'Approved', 'Returned for Revision', 'Rejected', 'Cancelled')),
  approval_stage text not null default 'BOD_GM'
    check (approval_stage in ('HR_MANAGER', 'BOD_GM')),
  revision integer not null default 1 check (revision > 0),
  attachment_snapshot jsonb not null default '[]'::jsonb,
  package_snapshot jsonb not null default '{}'::jsonb,
  override_incomplete_ratings boolean not null default false,
  override_reason text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists job_offer_approval_requests_one_active
  on public.job_offer_approval_requests(offer_id)
  where status in ('Pending Approval', 'Returned for Revision');

create index if not exists job_offer_approval_requests_status_key
  on public.job_offer_approval_requests(status, approval_stage, submitted_at desc);

create table if not exists public.job_offer_approval_assignments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.job_offer_approval_requests(id) on delete cascade,
  approver_user_id uuid not null references public.hris_users(id),
  approver_role text not null,
  approval_stage text not null check (approval_stage in ('HR_MANAGER', 'BOD_GM')),
  status text not null default 'Pending'
    check (status in ('Pending', 'Approved', 'Returned for Revision', 'Rejected', 'Cancelled')),
  assigned_at timestamptz not null default now(),
  decided_at timestamptz,
  comments text,
  unique (request_id, approval_stage, approver_user_id)
);

create index if not exists job_offer_approval_assignments_user_key
  on public.job_offer_approval_assignments(approver_user_id, status, assigned_at desc);

create table if not exists public.job_offer_approval_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.job_offer_approval_requests(id) on delete cascade,
  approval_stage text not null,
  approver_user_id uuid references public.hris_users(id),
  approver_role text not null,
  action text not null,
  status_before text,
  status_after text,
  comments text,
  documents_reviewed jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists job_offer_approval_history_request_key
  on public.job_offer_approval_history(request_id, created_at desc);

alter table public.job_candidate_documents enable row level security;
alter table public.job_offer_approval_requests enable row level security;
alter table public.job_offer_approval_assignments enable row level security;
alter table public.job_offer_approval_history enable row level security;

drop policy if exists job_candidate_documents_recruitment_select on public.job_candidate_documents;
create policy job_candidate_documents_recruitment_select
  on public.job_candidate_documents for select to authenticated
  using (
    public.has_recruitment_admin_access()
    or exists (
      select 1
      from public.job_applications application
      where application.id = job_candidate_documents.application_id
        and public.can_access_requisition(application.requisition_id)
    )
  );

drop policy if exists job_candidate_documents_recruitment_insert on public.job_candidate_documents;
create policy job_candidate_documents_recruitment_insert
  on public.job_candidate_documents for insert to authenticated
  with check (
    public.has_recruitment_admin_access()
    and uploaded_by_user_id = public.current_hris_user_id()
  );

drop policy if exists job_candidate_documents_recruitment_update on public.job_candidate_documents;
create policy job_candidate_documents_recruitment_update
  on public.job_candidate_documents for update to authenticated
  using (public.has_recruitment_admin_access())
  with check (public.has_recruitment_admin_access());

drop policy if exists job_candidate_documents_recruitment_delete on public.job_candidate_documents;
create policy job_candidate_documents_recruitment_delete
  on public.job_candidate_documents for delete to authenticated
  using (public.has_recruitment_admin_access());

drop policy if exists job_offer_approval_requests_participant_select on public.job_offer_approval_requests;
create policy job_offer_approval_requests_participant_select
  on public.job_offer_approval_requests for select to authenticated
  using (
    public.has_recruitment_admin_access()
    or exists (
      select 1
      from public.job_offer_approval_assignments assignment
      where assignment.request_id = job_offer_approval_requests.id
        and assignment.approver_user_id = public.current_hris_user_id()
    )
  );

drop policy if exists job_offer_approval_assignments_participant_select on public.job_offer_approval_assignments;
create policy job_offer_approval_assignments_participant_select
  on public.job_offer_approval_assignments for select to authenticated
  using (
    public.has_recruitment_admin_access()
    or approver_user_id = public.current_hris_user_id()
  );

drop policy if exists job_offer_approval_history_participant_select on public.job_offer_approval_history;
create policy job_offer_approval_history_participant_select
  on public.job_offer_approval_history for select to authenticated
  using (
    public.has_recruitment_admin_access()
    or exists (
      select 1
      from public.job_offer_approval_assignments assignment
      where assignment.request_id = job_offer_approval_history.request_id
        and assignment.approver_user_id = public.current_hris_user_id()
    )
  );

drop policy if exists offer_record_assigned_approval_select on public.job_offers;
create policy offer_record_assigned_approval_select
  on public.job_offers for select to authenticated
  using (
    exists (
      select 1
      from public.job_offer_approval_requests request
      join public.job_offer_approval_assignments assignment on assignment.request_id = request.id
      where request.offer_id = job_offers.id
        and assignment.approver_user_id = public.current_hris_user_id()
    )
  );

drop policy if exists interview_rating_records_offer_approval_select on public.job_interview_rating_records;
create policy interview_rating_records_offer_approval_select
  on public.job_interview_rating_records for select to authenticated
  using (
    exists (
      select 1
      from public.job_offer_approval_requests request
      join public.job_offer_approval_assignments assignment on assignment.request_id = request.id
      where request.candidate_id = job_interview_rating_records.candidate_id
        and request.application_id = job_interview_rating_records.application_id
        and assignment.approver_user_id = public.current_hris_user_id()
        and assignment.status = 'Pending'
        and request.status = 'Pending Approval'
    )
  );

drop policy if exists interview_rating_attachments_offer_approval_select on public.job_interview_rating_attachments;
create policy interview_rating_attachments_offer_approval_select
  on public.job_interview_rating_attachments for select to authenticated
  using (
    exists (
      select 1
      from public.job_interview_rating_records rating
      join public.job_offer_approval_requests request
        on request.candidate_id = rating.candidate_id
       and request.application_id = rating.application_id
      join public.job_offer_approval_assignments assignment on assignment.request_id = request.id
      where rating.id = job_interview_rating_attachments.rating_id
        and assignment.approver_user_id = public.current_hris_user_id()
        and assignment.status = 'Pending'
        and request.status = 'Pending Approval'
    )
  );

create or replace function private.offer_user_has_role(p_user_id uuid, p_role text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles assignment
    join public.roles role_row on role_row.id = assignment.role_id and role_row.is_active
    join public.hris_users user_row on user_row.id = assignment.user_id
    where assignment.user_id = p_user_id
      and assignment.role_id = p_role
      and assignment.is_active
      and lower(btrim(coalesce(user_row.status, ''))) = 'active'
  );
$$;

create or replace function private.offer_approval_actor_can_view(p_request_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.has_recruitment_admin_access()
    or exists (
      select 1
      from public.job_offer_approval_assignments assignment
      where assignment.request_id = p_request_id
        and assignment.approver_user_id = public.current_hris_user_id()
    );
$$;

revoke all on function private.offer_user_has_role(uuid, text) from public, anon, authenticated;
revoke all on function private.offer_approval_actor_can_view(uuid) from public, anon, authenticated;

create or replace function public.upload_job_candidate_document(
  p_candidate_id uuid,
  p_application_id uuid,
  p_document_type text,
  p_file_name text,
  p_storage_bucket text,
  p_storage_path text,
  p_mime_type text,
  p_file_size bigint
)
returns public.job_candidate_documents
language plpgsql
security invoker
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  document_row public.job_candidate_documents%rowtype;
begin
  if actor_id is null or not public.has_recruitment_admin_access() then
    raise exception 'Only authorized recruitment users can add candidate documents' using errcode = '42501';
  end if;
  if p_document_type not in ('Resume', 'Interview Rating', 'Offer', 'Other Supporting Document') then
    raise exception 'Invalid candidate document type' using errcode = '22023';
  end if;
  if not exists (select 1 from public.job_candidates candidate where candidate.id = p_candidate_id) then
    raise exception 'Candidate was not found' using errcode = '22023';
  end if;
  if p_application_id is not null and not exists (
    select 1 from public.job_applications application
    where application.id = p_application_id and application.candidate_id = p_candidate_id
  ) then
    raise exception 'Application does not belong to candidate' using errcode = '22023';
  end if;
  if nullif(btrim(p_file_name), '') is null or nullif(btrim(p_storage_path), '') is null then
    raise exception 'Candidate document name and storage path are required' using errcode = '22023';
  end if;
  if p_storage_bucket <> 'candidate-recruitment-documents'
     or p_storage_path !~ ('^candidate-documents/' || p_candidate_id::text || '/[^/]+$') then
    raise exception 'Invalid candidate document storage path' using errcode = '22023';
  end if;
  if p_file_size is null or p_file_size < 1 or p_file_size > 20971520 then
    raise exception 'Candidate documents must be between 1 byte and 20 MB' using errcode = '22023';
  end if;

  insert into public.job_candidate_documents (
    candidate_id, application_id, document_type, file_name, mime_type, file_size,
    storage_bucket, storage_path, uploaded_by_user_id
  ) values (
    p_candidate_id, p_application_id, p_document_type, btrim(p_file_name),
    coalesce(nullif(btrim(p_mime_type), ''), 'application/octet-stream'), p_file_size,
    p_storage_bucket, p_storage_path, actor_id
  ) returning * into document_row;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  select actor_id::text, user_row.email, 'CANDIDATE_DOCUMENT_ADDED', 'job_candidate_documents', document_row.id::text,
    jsonb_build_object('candidate_id', p_candidate_id, 'application_id', p_application_id,
      'document_type', p_document_type, 'file_name', p_file_name)::text
  from public.hris_users user_row
  where user_row.id = actor_id;
  return document_row;
end;
$$;

create or replace function public.remove_job_candidate_document(p_document_id uuid)
returns public.job_candidate_documents
language plpgsql
security invoker
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  document_row public.job_candidate_documents%rowtype;
begin
  if actor_id is null or not public.has_recruitment_admin_access() then
    raise exception 'Only authorized recruitment users can remove candidate documents' using errcode = '42501';
  end if;
  select * into document_row from public.job_candidate_documents where id = p_document_id for update;
  if not found then raise exception 'Candidate document was not found' using errcode = '22023'; end if;
  delete from public.job_candidate_documents where id = p_document_id;
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  select actor_id::text, user_row.email, 'CANDIDATE_DOCUMENT_REMOVED', 'job_candidate_documents', document_row.id::text,
    jsonb_build_object('candidate_id', document_row.candidate_id, 'document_type', document_row.document_type,
      'file_name', document_row.file_name)::text
  from public.hris_users user_row
  where user_row.id = actor_id;
  return document_row;
end;
$$;

create or replace function public.create_job_offer_approval_request(
  p_offer_id uuid,
  p_attachment_snapshot jsonb,
  p_package_snapshot jsonb default '{}'::jsonb,
  p_override_incomplete_ratings boolean default false,
  p_override_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  if initial_stage = 'HR_MANAGER' then
    insert into public.job_offer_approval_assignments (request_id, approver_user_id, approver_role, approval_stage)
    select v_request_id, user_row.id, 'HR Manager', 'HR_MANAGER'
    from public.hris_users user_row
    where lower(btrim(coalesce(user_row.status, ''))) = 'active'
      and private.offer_user_has_role(user_row.id, 'HR Manager');
  else
    insert into public.job_offer_approval_assignments (request_id, approver_user_id, approver_role, approval_stage)
    select v_request_id, user_row.id,
      case when private.offer_user_has_role(user_row.id, 'Board of Director') then 'Board of Director' else 'General Manager' end,
      'BOD_GM'
    from public.hris_users user_row
    where lower(btrim(coalesce(user_row.status, ''))) = 'active'
      and (private.offer_user_has_role(user_row.id, 'Board of Director') or private.offer_user_has_role(user_row.id, 'GeneralManager'));
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
      case when initial_stage = 'HR_MANAGER' then 'HR Manager' else 'BOD / GM' end),
    '/approvals?type=offer&item=' || request_row.id::text, false, request_row.id::text,
    'offer-approval:' || request_row.id::text || ':' || revision_number::text || ':' || assignment.approver_user_id::text
  from public.job_offer_approval_assignments assignment
  join public.job_candidates candidate on candidate.id = application_row.candidate_id
  where assignment.request_id = request_row.id;

  return request_row.id;
end;
$$;

create or replace function public.get_my_pending_offer_approval_ids()
returns table(request_id uuid, offer_id uuid, approval_stage text, assigned_at timestamptz)
language sql
security invoker
as $$
  select assignment.request_id, request.offer_id, assignment.approval_stage, assignment.assigned_at
  from public.job_offer_approval_assignments assignment
  join public.job_offer_approval_requests request on request.id = assignment.request_id
  where assignment.approver_user_id = public.current_hris_user_id()
    and assignment.status = 'Pending'
    and request.status = 'Pending Approval'
    and request.approval_stage = assignment.approval_stage
  order by assignment.assigned_at asc;
$$;

create or replace function public.get_job_offer_approval_package(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_row public.job_offer_approval_requests%rowtype;
  offer_row public.job_offers%rowtype;
  application_row public.job_applications%rowtype;
  candidate_row public.job_candidates%rowtype;
begin
  if public.current_hris_user_id() is null or not private.offer_approval_actor_can_view(p_request_id) then
    raise exception 'You are not authorized to view this offer approval package' using errcode = '42501';
  end if;
  select * into request_row from public.job_offer_approval_requests where id = p_request_id;
  if not found then raise exception 'Offer approval request was not found' using errcode = '22023'; end if;
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
    ), '[]'::jsonb),
    'ratingAttachments', coalesce((
      select jsonb_agg(to_jsonb(attachment) order by attachment.created_at asc)
      from public.job_interview_rating_attachments attachment
      join public.job_interview_rating_records rating on rating.id = attachment.rating_id
      where rating.candidate_id = request_row.candidate_id
        and rating.application_id = request_row.application_id
    ), '[]'::jsonb),
    'candidateDocuments', coalesce((
      select jsonb_agg(to_jsonb(document) order by document.uploaded_at desc)
      from public.job_candidate_documents document
      where document.candidate_id = request_row.candidate_id
        and document.archived_at is null
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

create or replace function public.process_job_offer_approval(
  p_request_id uuid,
  p_decision text,
  p_comments text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
    case when decision = 'approve' and request_row.approval_stage = 'HR_MANAGER' then 'Pending Approval'
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
      'new_status', case when decision = 'approve' and request_row.approval_stage = 'HR_MANAGER' then 'Pending Approval'
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
      case when private.offer_user_has_role(user_row.id, 'Board of Director') then 'Board of Director' else 'General Manager' end,
      next_stage
    from public.hris_users user_row
    where lower(btrim(coalesce(user_row.status, ''))) = 'active'
      and (private.offer_user_has_role(user_row.id, 'Board of Director') or private.offer_user_has_role(user_row.id, 'GeneralManager'));
    select count(*) into next_assigned_count
    from public.job_offer_approval_assignments assignment
    where assignment.request_id = request_row.id and assignment.approval_stage = next_stage and assignment.status = 'Pending';
    if next_assigned_count = 0 then
      raise exception 'No active BOD or General Manager approver is configured' using errcode = '22023';
    end if;
    update public.job_offers set approval_status = 'Pending Approval', updated_at = now() where id = request_row.offer_id;
    insert into public.job_offer_approval_history (
      request_id, approval_stage, approver_user_id, approver_role, action,
      status_before, status_after, comments, documents_reviewed
    ) values (
      request_row.id, next_stage, null, 'BOD / General Manager Pool', 'STAGE_ADVANCED',
      'Pending Approval', 'Pending Approval', null, request_row.attachment_snapshot
    );
    insert into public.notifications(user_id, type, title, message, link, is_read, related_entity_id, dedupe_key)
    select assignment.approver_user_id::text, 'OFFER_APPROVAL',
      'Offer approval package ready for final review',
      format('The HR review is complete. The offer package for %s is awaiting your BOD / GM approval.', coalesce(candidate_name, 'the candidate')),
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
$$;

revoke all on function public.upload_job_candidate_document(uuid, uuid, text, text, text, text, text, bigint) from public, anon;
revoke all on function public.remove_job_candidate_document(uuid) from public, anon;
revoke all on function public.create_job_offer_approval_request(uuid, jsonb, jsonb, boolean, text) from public, anon;
revoke all on function public.get_my_pending_offer_approval_ids() from public, anon;
revoke all on function public.get_job_offer_approval_package(uuid) from public, anon;
revoke all on function public.process_job_offer_approval(uuid, text, text) from public, anon;
grant execute on function public.upload_job_candidate_document(uuid, uuid, text, text, text, text, text, bigint) to authenticated;
grant execute on function public.remove_job_candidate_document(uuid) to authenticated;
grant execute on function public.create_job_offer_approval_request(uuid, jsonb, jsonb, boolean, text) to authenticated;
grant execute on function public.get_my_pending_offer_approval_ids() to authenticated;
grant execute on function public.get_job_offer_approval_package(uuid) to authenticated;
grant execute on function public.process_job_offer_approval(uuid, text, text) to authenticated;

insert into public.role_workflow_permissions(role_id, workflow_key, actions, updated_at)
values ('GeneralManager', 'RecruitmentOffers', array['review', 'approve', 'reject', 'return'], now())
on conflict (role_id, workflow_key) do update
set actions = (
  select array_agg(distinct action order by action)
  from unnest(public.role_workflow_permissions.actions || excluded.actions) action
), updated_at = now();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-recruitment-documents', 'candidate-recruitment-documents', false, 20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists candidate_recruitment_documents_storage_select on storage.objects;
create policy candidate_recruitment_documents_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-recruitment-documents'
    and (
      public.has_recruitment_admin_access()
      or exists (
        select 1 from public.job_candidate_documents document
        where document.storage_bucket = bucket_id and document.storage_path = name
      )
    )
  );

drop policy if exists candidate_recruitment_documents_storage_insert on storage.objects;
create policy candidate_recruitment_documents_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidate-recruitment-documents'
    and public.has_recruitment_admin_access()
    and name ~ '^candidate-documents/[0-9a-fA-F-]{36}/[^/]+$'
  );

drop policy if exists candidate_recruitment_documents_storage_delete on storage.objects;
create policy candidate_recruitment_documents_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'candidate-recruitment-documents'
    and public.has_recruitment_admin_access()
  );

drop policy if exists interview_rating_attachments_offer_storage_select on storage.objects;
create policy interview_rating_attachments_offer_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'interview-rating-attachments'
    and exists (
      select 1
      from public.job_interview_rating_attachments attachment
      join public.job_interview_rating_records rating on rating.id = attachment.rating_id
      join public.job_offer_approval_requests request
        on request.candidate_id = rating.candidate_id
       and request.application_id = rating.application_id
      join public.job_offer_approval_assignments assignment on assignment.request_id = request.id
      where attachment.storage_path = name
        and assignment.approver_user_id = public.current_hris_user_id()
        and assignment.status = 'Pending'
        and request.status = 'Pending Approval'
    )
  );
