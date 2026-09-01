-- Keep assigned reviewers able to open their own rating link without granting
-- them broad candidate-directory access. Also audit the scanned-form lifecycle.

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
  attachment_row public.job_interview_rating_attachments%rowtype;
begin
  attachment_row := case when tg_op = 'INSERT' then new else old end;
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
      'rating_id', attachment_row.rating_id,
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

revoke all on function public.audit_job_interview_rating_attachment() from public, anon;
revoke all on function public.upload_interview_rating_attachment(uuid, text, text, text, bigint) from public, anon;
revoke all on function public.remove_interview_rating_attachment(uuid) from public, anon;
revoke all on function public.get_interview_rating_candidate(uuid) from public, anon;
grant execute on function public.upload_interview_rating_attachment(uuid, text, text, text, bigint) to authenticated;
grant execute on function public.remove_interview_rating_attachment(uuid) to authenticated;
grant execute on function public.get_interview_rating_candidate(uuid) to authenticated;
