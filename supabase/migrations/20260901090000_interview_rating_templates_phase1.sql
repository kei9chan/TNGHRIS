-- Phase 1: versioned interview templates and separate reviewer rating records.
-- The legacy interview scheduler and feedback tables remain unchanged.

create table if not exists public.job_interview_templates (
  id uuid primary key default gen_random_uuid(),
  template_group_id uuid not null,
  version integer not null default 1 check (version > 0),
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  status text not null default 'Draft' check (status in ('Draft', 'Active', 'Inactive')),
  assignment_business_unit_ids uuid[] not null default '{}',
  assignment_positions text[] not null default '{}',
  assignment_stages text[] not null default '{}',
  sections jsonb not null default '[]'::jsonb,
  rating_scale jsonb not null default '[]'::jsonb,
  created_by_user_id uuid not null references public.hris_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_current boolean not null default true,
  supersedes_template_id uuid references public.job_interview_templates(id)
);

create unique index if not exists job_interview_templates_group_version_key
  on public.job_interview_templates(template_group_id, version);

create unique index if not exists job_interview_templates_current_group_key
  on public.job_interview_templates(template_group_id)
  where is_current;

create index if not exists job_interview_templates_active_lookup
  on public.job_interview_templates(status, is_current, updated_at desc);

create table if not exists public.job_interview_rating_records (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.job_candidates(id) on delete cascade,
  application_id uuid not null references public.job_applications(id) on delete cascade,
  template_version_id uuid not null references public.job_interview_templates(id),
  template_group_id uuid not null,
  template_version integer not null check (template_version > 0),
  template_snapshot jsonb not null default '{}'::jsonb,
  reviewer_user_id uuid not null references public.hris_users(id),
  reviewer_name_snapshot text not null,
  reviewer_position_snapshot text not null default '',
  due_date date,
  interview_round text not null default 'Round 1',
  status text not null default 'Not Started'
    check (status in ('Not Started', 'Draft', 'Submitted', 'Returned for Revision', 'Locked')),
  form_data jsonb not null default '{}'::jsonb,
  created_by_user_id uuid not null references public.hris_users(id),
  returned_notes text,
  submitted_at timestamptz,
  locked_at timestamptz,
  reopened_at timestamptz,
  reopened_by_user_id uuid references public.hris_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists job_interview_rating_records_assignment_key
  on public.job_interview_rating_records(candidate_id, application_id, reviewer_user_id, interview_round);

create index if not exists job_interview_rating_records_candidate_key
  on public.job_interview_rating_records(candidate_id, created_at desc);

create index if not exists job_interview_rating_records_reviewer_key
  on public.job_interview_rating_records(reviewer_user_id, status, due_date);

create table if not exists public.job_interview_rating_attachments (
  id uuid primary key default gen_random_uuid(),
  rating_id uuid not null references public.job_interview_rating_records(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint,
  category text not null default 'Scanned Interview Rating',
  uploaded_by_user_id uuid not null references public.hris_users(id),
  created_at timestamptz not null default now()
);

create index if not exists job_interview_rating_attachments_rating_key
  on public.job_interview_rating_attachments(rating_id, created_at desc);

alter table public.job_interview_templates enable row level security;
alter table public.job_interview_rating_records enable row level security;
alter table public.job_interview_rating_attachments enable row level security;

drop policy if exists job_interview_templates_admin_select on public.job_interview_templates;
create policy job_interview_templates_admin_select
  on public.job_interview_templates for select to authenticated
  using (public.has_recruitment_admin_access());

drop policy if exists job_interview_templates_admin_insert on public.job_interview_templates;
create policy job_interview_templates_admin_insert
  on public.job_interview_templates for insert to authenticated
  with check (public.has_recruitment_admin_access());

drop policy if exists job_interview_templates_admin_update on public.job_interview_templates;
create policy job_interview_templates_admin_update
  on public.job_interview_templates for update to authenticated
  using (public.has_recruitment_admin_access())
  with check (public.has_recruitment_admin_access());

drop policy if exists job_interview_templates_admin_delete on public.job_interview_templates;
create policy job_interview_templates_admin_delete
  on public.job_interview_templates for delete to authenticated
  using (public.has_recruitment_admin_access());

drop policy if exists job_interview_rating_records_participant_select on public.job_interview_rating_records;
create policy job_interview_rating_records_participant_select
  on public.job_interview_rating_records for select to authenticated
  using (
    public.has_recruitment_admin_access()
    or reviewer_user_id = public.current_hris_user_id()
  );

drop policy if exists job_interview_rating_records_admin_insert on public.job_interview_rating_records;
create policy job_interview_rating_records_admin_insert
  on public.job_interview_rating_records for insert to authenticated
  with check (public.has_recruitment_admin_access());

drop policy if exists job_interview_rating_records_participant_update on public.job_interview_rating_records;
create policy job_interview_rating_records_participant_update
  on public.job_interview_rating_records for update to authenticated
  using (
    public.has_recruitment_admin_access()
    or reviewer_user_id = public.current_hris_user_id()
  )
  with check (
    public.has_recruitment_admin_access()
    or reviewer_user_id = public.current_hris_user_id()
  );

drop policy if exists job_interview_rating_records_admin_delete on public.job_interview_rating_records;
create policy job_interview_rating_records_admin_delete
  on public.job_interview_rating_records for delete to authenticated
  using (public.has_recruitment_admin_access());

drop policy if exists job_interview_rating_attachments_participant_select on public.job_interview_rating_attachments;
create policy job_interview_rating_attachments_participant_select
  on public.job_interview_rating_attachments for select to authenticated
  using (
    public.has_recruitment_admin_access()
    or exists (
      select 1
      from public.job_interview_rating_records r
      where r.id = rating_id
        and r.reviewer_user_id = public.current_hris_user_id()
    )
  );

drop policy if exists job_interview_rating_attachments_admin_insert on public.job_interview_rating_attachments;
create policy job_interview_rating_attachments_admin_insert
  on public.job_interview_rating_attachments for insert to authenticated
  with check (
    public.has_recruitment_admin_access()
    and uploaded_by_user_id = public.current_hris_user_id()
  );

drop policy if exists job_interview_rating_attachments_admin_update on public.job_interview_rating_attachments;
create policy job_interview_rating_attachments_admin_update
  on public.job_interview_rating_attachments for update to authenticated
  using (public.has_recruitment_admin_access())
  with check (
    public.has_recruitment_admin_access()
    and uploaded_by_user_id = public.current_hris_user_id()
  );

drop policy if exists job_interview_rating_attachments_admin_delete on public.job_interview_rating_attachments;
create policy job_interview_rating_attachments_admin_delete
  on public.job_interview_rating_attachments for delete to authenticated
  using (public.has_recruitment_admin_access());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'interview-rating-attachments',
  'interview-rating-attachments',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists interview_rating_attachments_storage_select on storage.objects;
create policy interview_rating_attachments_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'interview-rating-attachments'
    and (
      public.has_recruitment_admin_access()
      or exists (
        select 1
        from public.job_interview_rating_records r
        where r.id::text = split_part(name, '/', 2)
          and r.reviewer_user_id = public.current_hris_user_id()
      )
    )
  );

drop policy if exists interview_rating_attachments_storage_insert on storage.objects;
create policy interview_rating_attachments_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'interview-rating-attachments'
    and public.has_recruitment_admin_access()
    and name like 'interview-ratings/%'
  );

drop policy if exists interview_rating_attachments_storage_delete on storage.objects;
create policy interview_rating_attachments_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'interview-rating-attachments'
    and public.has_recruitment_admin_access()
  );

create or replace function public.audit_job_interview_rating_attachment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  candidate_id uuid;
  rating_id_text text;
  attachment_row public.job_interview_rating_attachments%rowtype;
begin
  attachment_row := case when tg_op = 'INSERT' then new else old end;
  rating_id_text := attachment_row.rating_id::text;
  select r.candidate_id into candidate_id
  from public.job_interview_rating_records r
  where r.id = attachment_row.rating_id;
  select u.email into actor_email from public.hris_users u where u.id = actor_id;
  insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text,
    actor_email,
    case when tg_op = 'INSERT' then 'INTERVIEW_RATING_ATTACHMENT_ADDED' else 'INTERVIEW_RATING_ATTACHMENT_REMOVED' end,
    'job_interview_rating_attachments',
    attachment_row.id::text,
    jsonb_build_object(
      'rating_id', rating_id_text,
      'candidate_id', candidate_id,
      'file_name', attachment_row.file_name,
      'storage_path', attachment_row.storage_path,
      'mime_type', attachment_row.mime_type,
      'file_size', attachment_row.file_size
    )::text
  );
  return attachment_row;
end;
$$;

drop trigger if exists audit_job_interview_rating_attachment_trigger on public.job_interview_rating_attachments;
create trigger audit_job_interview_rating_attachment_trigger
  after insert or delete on public.job_interview_rating_attachments
  for each row execute function public.audit_job_interview_rating_attachment();

create or replace function public.upload_interview_rating_attachment(
  p_rating_id uuid,
  p_file_name text,
  p_storage_path text,
  p_mime_type text,
  p_file_size bigint
)
returns public.job_interview_rating_attachments
language plpgsql
security invoker
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  attachment_row public.job_interview_rating_attachments%rowtype;
begin
  if actor_id is null
     or not public.has_recruitment_admin_access()
     or not public.has_feature_permission('Interviews', 'manage') then
    raise exception 'Only authorized HR or Admin users can upload scanned interview ratings';
  end if;
  if nullif(btrim(p_file_name), '') is null then raise exception 'A scanned rating file name is required'; end if;
  if p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Upload a PDF, JPG, or PNG scanned rating form';
  end if;
  if p_file_size is null or p_file_size < 1 or p_file_size > 10485760 then
    raise exception 'Scanned rating forms must be between 1 byte and 10 MB';
  end if;
  if p_storage_path is null or p_storage_path !~ ('^interview-ratings/' || p_rating_id::text || '/[^/]+$') then
    raise exception 'Invalid scanned rating storage path';
  end if;
  if not exists (select 1 from public.job_interview_rating_records r where r.id = p_rating_id) then
    raise exception 'Interview rating was not found';
  end if;

  insert into public.job_interview_rating_attachments (
    rating_id, file_name, storage_path, mime_type, file_size, uploaded_by_user_id
  ) values (
    p_rating_id, btrim(p_file_name), p_storage_path, p_mime_type, p_file_size, actor_id
  ) returning * into attachment_row;
  return attachment_row;
end;
$$;

create or replace function public.remove_interview_rating_attachment(p_attachment_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  attachment_row public.job_interview_rating_attachments%rowtype;
begin
  if actor_id is null
     or not public.has_recruitment_admin_access()
     or not public.has_feature_permission('Interviews', 'manage') then
    raise exception 'Only authorized HR or Admin users can remove scanned interview ratings';
  end if;
  select * into attachment_row
  from public.job_interview_rating_attachments
  where id = p_attachment_id
  for update;
  if not found then raise exception 'Scanned interview rating was not found'; end if;
  delete from public.job_interview_rating_attachments where id = p_attachment_id;
end;
$$;

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

drop trigger if exists validate_job_interview_rating_record_trigger on public.job_interview_rating_records;
create trigger validate_job_interview_rating_record_trigger
  before insert or update on public.job_interview_rating_records
  for each row execute function public.validate_job_interview_rating_record();

create or replace function public.save_interview_template(
  p_template_id uuid,
  p_name text,
  p_description text,
  p_status text,
  p_assignment_business_unit_ids uuid[],
  p_assignment_positions text[],
  p_assignment_stages text[],
  p_sections jsonb,
  p_rating_scale jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  source_template public.job_interview_templates%rowtype;
  saved_id uuid;
  saved_version integer;
  saved_group uuid;
  previous_status text;
begin
  if actor_id is null
     or not public.has_recruitment_admin_access()
     or not public.has_feature_permission('Interviews', 'manage') then
    raise exception 'Only authorized HR or Admin users can manage interview templates';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Interview template name is required';
  end if;
  if coalesce(p_status, 'Draft') not in ('Draft', 'Active', 'Inactive') then
    raise exception 'Invalid interview template status';
  end if;

  select email into actor_email from public.hris_users where id = actor_id;

  if p_template_id is null then
    saved_group := gen_random_uuid();
    saved_version := 1;
    insert into public.job_interview_templates (
      template_group_id, version, name, description, status,
      assignment_business_unit_ids, assignment_positions, assignment_stages,
      sections, rating_scale, created_by_user_id
    ) values (
      saved_group, saved_version, btrim(p_name), coalesce(p_description, ''), coalesce(p_status, 'Draft'),
      coalesce(p_assignment_business_unit_ids, '{}'), coalesce(p_assignment_positions, '{}'),
      coalesce(p_assignment_stages, '{}'), coalesce(p_sections, '[]'::jsonb),
      coalesce(p_rating_scale, '[]'::jsonb), actor_id
    ) returning id into saved_id;

    insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
    values (actor_id::text, actor_email, 'INTERVIEW_TEMPLATE_CREATED', 'job_interview_templates', saved_id::text,
      jsonb_build_object('version', saved_version, 'name', btrim(p_name), 'status', coalesce(p_status, 'Draft'))::text);
    return saved_id;
  end if;

  select * into source_template
  from public.job_interview_templates
  where id = p_template_id and is_current
  for update;
  if not found then
    raise exception 'Current interview template was not found';
  end if;

  previous_status := source_template.status;
  update public.job_interview_templates
  set is_current = false, updated_at = now()
  where id = source_template.id;

  insert into public.job_interview_templates (
    template_group_id, version, name, description, status,
    assignment_business_unit_ids, assignment_positions, assignment_stages,
    sections, rating_scale, created_by_user_id, supersedes_template_id
  ) values (
    source_template.template_group_id, source_template.version + 1, btrim(p_name), coalesce(p_description, ''), coalesce(p_status, previous_status),
    coalesce(p_assignment_business_unit_ids, '{}'), coalesce(p_assignment_positions, '{}'),
    coalesce(p_assignment_stages, '{}'), coalesce(p_sections, '[]'::jsonb),
    coalesce(p_rating_scale, '[]'::jsonb), actor_id, source_template.id
  ) returning id, version, template_group_id into saved_id, saved_version, saved_group;

  insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
  values (actor_id::text, actor_email, 'INTERVIEW_TEMPLATE_VERSION_CREATED', 'job_interview_templates', saved_id::text,
    jsonb_build_object('previous_template_id', source_template.id, 'version', saved_version,
      'name', btrim(p_name), 'previous_status', previous_status, 'status', coalesce(p_status, previous_status))::text);
  return saved_id;
end;
$$;

create or replace function public.duplicate_interview_template(p_template_id uuid, p_name text)
returns uuid
language plpgsql
security invoker
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  source_template public.job_interview_templates%rowtype;
  duplicate_id uuid;
begin
  if actor_id is null
     or not public.has_recruitment_admin_access()
     or not public.has_feature_permission('Interviews', 'manage') then
    raise exception 'Only authorized HR or Admin users can duplicate interview templates';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Interview template name is required';
  end if;
  select * into source_template
  from public.job_interview_templates
  where id = p_template_id and is_current;
  if not found then
    raise exception 'Current interview template was not found';
  end if;
  select email into actor_email from public.hris_users where id = actor_id;

  insert into public.job_interview_templates (
    template_group_id, version, name, description, status,
    assignment_business_unit_ids, assignment_positions, assignment_stages,
    sections, rating_scale, created_by_user_id
  ) values (
    gen_random_uuid(), 1, btrim(p_name), source_template.description, 'Draft',
    source_template.assignment_business_unit_ids, source_template.assignment_positions,
    source_template.assignment_stages, source_template.sections, source_template.rating_scale, actor_id
  ) returning id into duplicate_id;

  insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
  values (actor_id::text, actor_email, 'INTERVIEW_TEMPLATE_DUPLICATED', 'job_interview_templates', duplicate_id::text,
    jsonb_build_object('source_template_id', source_template.id, 'source_version', source_template.version)::text);
  return duplicate_id;
end;
$$;

create or replace function public.set_interview_template_status(p_template_id uuid, p_status text)
returns uuid
language plpgsql
security invoker
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  previous_status text;
begin
  if actor_id is null
     or not public.has_recruitment_admin_access()
     or not public.has_feature_permission('Interviews', 'manage') then
    raise exception 'Only authorized HR or Admin users can change interview template status';
  end if;
  if p_status not in ('Draft', 'Active', 'Inactive') then
    raise exception 'Invalid interview template status';
  end if;
  select status into previous_status
  from public.job_interview_templates
  where id = p_template_id and is_current
  for update;
  if not found then
    raise exception 'Current interview template was not found';
  end if;
  select email into actor_email from public.hris_users where id = actor_id;
  update public.job_interview_templates
  set status = p_status, updated_at = now()
  where id = p_template_id;
  insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
  values (actor_id::text, actor_email, 'INTERVIEW_TEMPLATE_STATUS_CHANGED', 'job_interview_templates', p_template_id::text,
    jsonb_build_object('previous_status', previous_status, 'new_status', p_status)::text);
  return p_template_id;
end;
$$;

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
  if not found then
    raise exception 'Select an active current interview template';
  end if;
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

create or replace function public.remove_interview_rating_assignment(p_rating_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  rating_row public.job_interview_rating_records%rowtype;
begin
  if actor_id is null or not public.has_recruitment_admin_access() or not public.has_feature_permission('Interviews', 'manage') then
    raise exception 'Only authorized HR or Admin users can remove interview rating assignments';
  end if;
  select * into rating_row from public.job_interview_rating_records where id = p_rating_id for update;
  if not found then raise exception 'Interview rating assignment was not found'; end if;
  if rating_row.status in ('Submitted', 'Locked') then
    raise exception 'Submitted interview ratings cannot be removed';
  end if;
  select email into actor_email from public.hris_users where id = actor_id;
  delete from public.job_interview_rating_records where id = p_rating_id;
  insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
  values (actor_id::text, actor_email, 'INTERVIEW_RATING_ASSIGNMENT_REMOVED', 'job_interview_rating_records', p_rating_id::text,
    jsonb_build_object('reviewer_id', rating_row.reviewer_user_id, 'previous_status', rating_row.status)::text);
end;
$$;

create or replace function public.save_interview_rating(p_rating_id uuid, p_form_data jsonb)
returns public.job_interview_rating_records
language plpgsql
security invoker
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  is_admin boolean := public.has_recruitment_admin_access();
  rating_row public.job_interview_rating_records%rowtype;
  old_status text;
  safe_form_data jsonb := coalesce(p_form_data, '{}'::jsonb);
begin
  select * into rating_row from public.job_interview_rating_records where id = p_rating_id for update;
  if not found then raise exception 'Interview rating was not found'; end if;
  if actor_id is null or (rating_row.reviewer_user_id <> actor_id and not is_admin) then
    raise exception 'You are not authorized to edit this interview rating';
  end if;
  if rating_row.status in ('Submitted', 'Locked') or rating_row.locked_at is not null then
    raise exception 'Submitted interview ratings are locked';
  end if;
  old_status := rating_row.status;
  if not is_admin then
    safe_form_data := safe_form_data || jsonb_build_object(
      'candidate_date', coalesce(rating_row.form_data->'candidate_date', 'null'::jsonb),
      'position_applied_for', coalesce(rating_row.form_data->'position_applied_for', 'null'::jsonb),
      'applicant_name', coalesce(rating_row.form_data->'applicant_name', 'null'::jsonb),
      'interviewer_name', coalesce(rating_row.form_data->'interviewer_name', 'null'::jsonb),
      'interviewer_position', coalesce(rating_row.form_data->'interviewer_position', 'null'::jsonb)
    );
  end if;
  perform set_config('tng.interview_rating_action', 'save', true);
  update public.job_interview_rating_records
  set form_data = safe_form_data,
      status = case when status = 'Not Started' then 'Draft' else status end,
      updated_at = now()
  where id = p_rating_id;
  select * into rating_row from public.job_interview_rating_records where id = p_rating_id;
  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
  values (actor_id::text, actor_email, 'INTERVIEW_RATING_DRAFT_SAVED', 'job_interview_rating_records', p_rating_id::text,
    jsonb_build_object('previous_status', old_status, 'new_status', rating_row.status)::text);
  return rating_row;
end;
$$;

create or replace function public.submit_interview_rating(p_rating_id uuid, p_form_data jsonb)
returns public.job_interview_rating_records
language plpgsql
security invoker
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  is_admin boolean := public.has_recruitment_admin_access();
  rating_row public.job_interview_rating_records%rowtype;
  field_row jsonb;
  section_row jsonb;
  field_value jsonb;
  safe_form_data jsonb := coalesce(p_form_data, '{}'::jsonb);
  old_status text;
  field_type text;
begin
  select * into rating_row from public.job_interview_rating_records where id = p_rating_id for update;
  if not found then raise exception 'Interview rating was not found'; end if;
  if actor_id is null or (rating_row.reviewer_user_id <> actor_id and not is_admin) then
    raise exception 'You are not authorized to submit this interview rating';
  end if;
  if rating_row.status in ('Submitted', 'Locked') or rating_row.locked_at is not null then
    raise exception 'This interview rating has already been submitted';
  end if;
  if not is_admin then
    safe_form_data := safe_form_data || jsonb_build_object(
      'candidate_date', coalesce(rating_row.form_data->'candidate_date', 'null'::jsonb),
      'position_applied_for', coalesce(rating_row.form_data->'position_applied_for', 'null'::jsonb),
      'applicant_name', coalesce(rating_row.form_data->'applicant_name', 'null'::jsonb),
      'interviewer_name', coalesce(rating_row.form_data->'interviewer_name', 'null'::jsonb),
      'interviewer_position', coalesce(rating_row.form_data->'interviewer_position', 'null'::jsonb)
    );
  end if;

  for section_row in select value from jsonb_array_elements(coalesce(rating_row.template_snapshot->'sections', '[]'::jsonb))
  loop
    for field_row in select value from jsonb_array_elements(coalesce(section_row->'fields', '[]'::jsonb))
    loop
      if coalesce((field_row->>'required')::boolean, false) then
        field_value := safe_form_data -> (field_row->>'id');
        if field_value is null
           or field_value = 'null'::jsonb
           or (jsonb_typeof(field_value) = 'string' and btrim(field_value #>> '{}') = '') then
          raise exception 'Required interview rating field is missing: %', field_row->>'label';
        end if;
        field_type := field_row->>'type';
        if field_type = 'rating' and (
          jsonb_typeof(field_value) <> 'object'
          or nullif(field_value->>'value', '') is null
          or (field_value->>'value')::integer not between 1 and 5
        ) then
          raise exception 'Select a valid rating for: %', field_row->>'label';
        end if;
        if field_type = 'acknowledgement' and field_value <> 'true'::jsonb then
          raise exception 'Electronic acknowledgement is required';
        end if;
      end if;
    end loop;
  end loop;

  old_status := rating_row.status;
  perform set_config('tng.interview_rating_action', 'submit', true);
  update public.job_interview_rating_records
  set form_data = safe_form_data,
      status = 'Submitted',
      submitted_at = now(),
      locked_at = now(),
      returned_notes = null,
      updated_at = now()
  where id = p_rating_id;
  select * into rating_row from public.job_interview_rating_records where id = p_rating_id;
  select email into actor_email from public.hris_users where id = actor_id;

  insert into public.audit_logs (user_id, user_email, action, entity, entity_id, details)
  values (actor_id::text, actor_email, 'INTERVIEW_RATING_SUBMITTED', 'job_interview_rating_records', p_rating_id::text,
    jsonb_build_object('previous_status', old_status, 'new_status', 'Submitted',
      'overall_evaluation', safe_form_data->>'overall_evaluation', 'job_offer', safe_form_data->'job_offer')::text);

  if rating_row.created_by_user_id <> actor_id then
    insert into public.notifications (user_id, title, message, type, link, related_entity_id, dedupe_key)
    values (
      rating_row.created_by_user_id::text,
      'Interview rating submitted',
      format('%s submitted an interview rating for %s.', rating_row.reviewer_name_snapshot, safe_form_data->>'applicant_name'),
      'INTERVIEW_RATING_SUBMITTED',
      '/recruitment/interview-ratings/' || rating_row.id::text,
      rating_row.id::text,
      'interview-rating-submitted:' || rating_row.id::text
    );
  end if;
  return rating_row;
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
    jsonb_build_object('previous_status', old_status, 'new_status', 'Returned for Revision', 'reason', btrim(p_reason),
      'reviewer_id', rating_row.reviewer_user_id)::text);
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

create or replace function public.get_interview_rating_candidate(p_rating_id uuid)
returns table (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  source text,
  tags text[],
  portfolio_url text,
  consent_at timestamptz,
  current_city text,
  current_employer text,
  years_relevant_experience text,
  earliest_start_date date,
  linkedin_url text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := public.current_hris_user_id();
begin
  if actor_id is null
     or not exists (
       select 1
       from public.job_interview_rating_records r
       where r.id = p_rating_id
         and (r.reviewer_user_id = actor_id or public.has_recruitment_admin_access())
     ) then
    raise exception 'You are not authorized to view this interview rating candidate';
  end if;

  return query
  select c.id, c.first_name, c.last_name, c.email, c.phone, c.source, c.tags,
         c.portfolio_url, c.consent_at, c.current_city, c.current_employer,
         c.years_relevant_experience, c.earliest_start_date, c.linkedin_url
  from public.job_interview_rating_records r
  join public.job_candidates c on c.id = r.candidate_id
  where r.id = p_rating_id;
end;
$$;

insert into public.job_interview_templates (
  template_group_id, version, name, description, status,
  assignment_business_unit_ids, assignment_positions, assignment_stages,
  sections, rating_scale, created_by_user_id
)
select
  gen_random_uuid(), 1,
  'Standard Interview Rating Form — Existing Company Template',
  'Digital version of the existing company interview rating form.',
  'Active', '{}', '{}', '{}',
  jsonb_build_array(
    jsonb_build_object(
      'id', 'candidate-information', 'title', 'Candidate Information', 'description', 'Details linked from the candidate record.', 'order', 1,
      'fields', jsonb_build_array(
        jsonb_build_object('id', 'candidate_date', 'label', 'Date', 'type', 'date', 'required', true, 'autoLinked', true),
        jsonb_build_object('id', 'position_applied_for', 'label', 'Position Applied For', 'type', 'text', 'required', true, 'autoLinked', true),
        jsonb_build_object('id', 'applicant_name', 'label', 'Applicant''s Name', 'type', 'text', 'required', true, 'autoLinked', true)
      )
    ),
    jsonb_build_object(
      'id', 'rating-matrix', 'title', 'Rating Matrix', 'description', 'Select one rating for each criterion.', 'order', 2,
      'fields', jsonb_build_array(
        jsonb_build_object('id', 'first_impression', 'label', 'First Impression', 'description', 'What type of first impression does the applicant make?', 'type', 'rating', 'required', true),
        jsonb_build_object('id', 'appearance', 'label', 'Appearance', 'description', 'How does the applicant''s appearance impress you?', 'type', 'rating', 'required', true),
        jsonb_build_object('id', 'self_expression_communication', 'label', 'Self-Expression/Communication', 'description', 'How well does the applicant use correct English and articulate his/her views?', 'type', 'rating', 'required', true),
        jsonb_build_object('id', 'behaviour', 'label', 'Behaviour', 'description', 'What was the applicant''s behavior during the interview?', 'type', 'rating', 'required', true),
        jsonb_build_object('id', 'responsiveness', 'label', 'Responsiveness', 'description', 'How alert was the applicant?', 'type', 'rating', 'required', true),
        jsonb_build_object('id', 'background', 'label', 'Background', 'description', 'How well do the applicant''s experience, education, and training fit the job?', 'type', 'rating', 'required', true),
        jsonb_build_object('id', 'track_record', 'label', 'Track Record', 'description', 'Effectiveness in previous work.', 'type', 'rating', 'required', true),
        jsonb_build_object('id', 'teamwork', 'label', 'Teamwork', 'description', 'Ability to work with others.', 'type', 'rating', 'required', true)
      )
    ),
    jsonb_build_object(
      'id', 'written-evaluation', 'title', 'Written Evaluation', 'description', 'Interview observations and supporting comments.', 'order', 3,
      'fields', jsonb_build_array(
        jsonb_build_object('id', 'applicant_motivation', 'label', 'Applicant''s Motivation', 'description', 'What factors appear to be influencing the applicant''s consideration of a position with our company at this time? Why is the applicant leaving his/her present position?', 'type', 'textarea', 'required', false),
        jsonb_build_object('id', 'possible_reservations', 'label', 'Possible Reservations', 'description', 'What reservations or concerns (if any) does the applicant have about the position? Consider work location, travel, compensation, advancement, opportunities, etc.', 'type', 'textarea', 'required', false),
        jsonb_build_object('id', 'other_positions', 'label', 'Other Positions', 'description', 'Does the applicant seem to be more suitable for another position or location?', 'type', 'textarea', 'required', false),
        jsonb_build_object('id', 'apparent_assets_limitations', 'label', 'Apparent Assets and Limitations', 'description', 'What are the applicant''s apparent assets and limitations? What training and development (if any) is recommended?', 'type', 'textarea', 'required', false),
        jsonb_build_object('id', 'additional_comments', 'label', 'Additional Comments', 'description', 'Add any additional comments from the interview.', 'type', 'textarea', 'required', false),
        jsonb_build_object('id', 'date_available', 'label', 'Date Available', 'type', 'date', 'required', false)
      )
    ),
    jsonb_build_object(
      'id', 'final-recommendation', 'title', 'Final Recommendation', 'description', 'Overall evaluation and next-step recommendations.', 'order', 4,
      'fields', jsonb_build_array(
        jsonb_build_object('id', 'overall_evaluation', 'label', 'Overall Evaluation', 'type', 'choice', 'required', true, 'options', jsonb_build_array('Good', 'Fair', 'Unfavourable')),
        jsonb_build_object('id', 'further_interview', 'label', 'Further Interview', 'type', 'yes_no', 'required', true),
        jsonb_build_object('id', 'active_pool', 'label', 'Active Pool', 'type', 'yes_no', 'required', true),
        jsonb_build_object('id', 'job_offer', 'label', 'Job Offer', 'type', 'yes_no', 'required', true)
      )
    ),
    jsonb_build_object(
      'id', 'reviewer-information', 'title', 'Reviewer Information', 'description', 'Automatically recorded reviewer details and acknowledgement.', 'order', 5,
      'fields', jsonb_build_array(
        jsonb_build_object('id', 'interviewer_name', 'label', 'Interviewer''s Name', 'type', 'text', 'required', true, 'system', true),
        jsonb_build_object('id', 'interviewer_position', 'label', 'Interviewer''s Position', 'type', 'text', 'required', false, 'system', true),
        jsonb_build_object('id', 'submitted_at', 'label', 'Submission Date and Time', 'type', 'text', 'required', false, 'system', true),
        jsonb_build_object('id', 'electronic_acknowledgement', 'label', 'I acknowledge that this rating represents my interview assessment.', 'type', 'acknowledgement', 'required', true)
      )
    )
  ),
  jsonb_build_array(
    jsonb_build_object('label', 'Very Good', 'value', 5),
    jsonb_build_object('label', 'Good', 'value', 4),
    jsonb_build_object('label', 'Average', 'value', 3),
    jsonb_build_object('label', 'Poor', 'value', 2),
    jsonb_build_object('label', 'Very Poor', 'value', 1)
  ),
  (select id from public.hris_users order by created_at nulls last, id limit 1)
where not exists (
  select 1 from public.job_interview_templates
  where name = 'Standard Interview Rating Form — Existing Company Template'
);

comment on table public.job_interview_templates is 'Versioned interview rating templates. Submitted ratings retain a template snapshot.';
comment on table public.job_interview_rating_records is 'One immutable-after-submit interview rating form per candidate, interview round, and reviewer.';
comment on table public.job_interview_rating_attachments is 'Scanned paper rating forms attached to one reviewer rating record.';

revoke all on function public.validate_job_interview_rating_record() from public, anon;
revoke all on function public.audit_job_interview_rating_attachment() from public, anon;
revoke all on function public.upload_interview_rating_attachment(uuid, text, text, text, bigint) from public, anon;
revoke all on function public.remove_interview_rating_attachment(uuid) from public, anon;
revoke all on function public.get_interview_rating_candidate(uuid) from public, anon;
revoke all on function public.save_interview_template(uuid, text, text, text, uuid[], text[], text[], jsonb, jsonb) from public, anon;
revoke all on function public.duplicate_interview_template(uuid, text) from public, anon;
revoke all on function public.set_interview_template_status(uuid, text) from public, anon;
revoke all on function public.create_interview_rating_assignments(uuid, uuid, uuid, uuid[], date, text) from public, anon;
revoke all on function public.remove_interview_rating_assignment(uuid) from public, anon;
revoke all on function public.save_interview_rating(uuid, jsonb) from public, anon;
revoke all on function public.submit_interview_rating(uuid, jsonb) from public, anon;
revoke all on function public.reopen_interview_rating(uuid, text) from public, anon;
revoke all on function public.lock_interview_rating(uuid) from public, anon;
grant execute on function public.save_interview_template(uuid, text, text, text, uuid[], text[], text[], jsonb, jsonb) to authenticated;
grant execute on function public.duplicate_interview_template(uuid, text) to authenticated;
grant execute on function public.set_interview_template_status(uuid, text) to authenticated;
grant execute on function public.create_interview_rating_assignments(uuid, uuid, uuid, uuid[], date, text) to authenticated;
grant execute on function public.remove_interview_rating_assignment(uuid) to authenticated;
grant execute on function public.save_interview_rating(uuid, jsonb) to authenticated;
grant execute on function public.submit_interview_rating(uuid, jsonb) to authenticated;
grant execute on function public.reopen_interview_rating(uuid, text) to authenticated;
grant execute on function public.lock_interview_rating(uuid) to authenticated;
grant execute on function public.upload_interview_rating_attachment(uuid, text, text, text, bigint) to authenticated;
grant execute on function public.remove_interview_rating_attachment(uuid) to authenticated;
grant execute on function public.get_interview_rating_candidate(uuid) to authenticated;
