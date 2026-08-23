-- Focused, additive Employee Management repairs.
-- Existing employees, accounts, documents, workflow records, and audit history
-- are intentionally preserved.

alter table public.hris_users
  add column if not exists is_duplicate boolean not null default false,
  add column if not exists account_lifecycle_reason text,
  add column if not exists account_inactivated_at timestamptz,
  add column if not exists account_inactivated_by uuid references public.hris_users(id) on delete set null,
  add column if not exists account_reactivated_at timestamptz,
  add column if not exists account_reactivated_by uuid references public.hris_users(id) on delete set null,
  add column if not exists duplicate_marked_at timestamptz,
  add column if not exists duplicate_marked_by uuid references public.hris_users(id) on delete set null;

create index if not exists hris_users_account_status_idx
  on public.hris_users(status, is_duplicate);

-- Inactive HRIS accounts fail closed for every RLS helper and existing session,
-- while the bootstrap lookup still resolves active users normally.
create or replace function public.current_hris_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.hris_users u
  where u.auth_user_id = auth.uid()
    and lower(u.status) = 'active'
  limit 1
$$;

create or replace function public.admin_set_account_lifecycle(
  p_target_user_id uuid,
  p_action text,
  p_reason text,
  p_mark_duplicate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  target_row public.hris_users;
  before_state jsonb;
  after_state jsonb;
  active_admin_count integer;
  normalized_action text := lower(trim(coalesce(p_action, '')));
begin
  if actor_id is null
     or not (public.has_active_role('Admin') or public.has_active_role('HR Manager')) then
    raise exception 'Forbidden: Admin or HR Manager authority is required.' using errcode = '42501';
  end if;
  if actor_id = p_target_user_id then
    raise exception 'You cannot change the lifecycle status of your own account.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A reason of at least 5 characters is required.';
  end if;
  if normalized_action not in ('inactivate', 'reactivate') then
    raise exception 'Unsupported account lifecycle action: %', p_action;
  end if;

  select * into target_row
  from public.hris_users
  where id = p_target_user_id
  for update;
  if target_row.id is null then raise exception 'Account not found.'; end if;

  if normalized_action = 'inactivate'
     and exists (
       select 1 from public.user_roles ur
       where ur.user_id = p_target_user_id and ur.role_id = 'Admin' and ur.is_active
     ) then
    select count(distinct ur.user_id) into active_admin_count
    from public.user_roles ur
    join public.hris_users u on u.id = ur.user_id
    where ur.role_id = 'Admin' and ur.is_active and lower(u.status) = 'active';
    if active_admin_count <= 1 then
      raise exception 'Cannot inactivate the final active Admin.' using errcode = '42501';
    end if;
  end if;

  select email into actor_email from public.hris_users where id = actor_id;
  before_state := jsonb_build_object(
    'status', target_row.status,
    'isDuplicate', target_row.is_duplicate,
    'reason', target_row.account_lifecycle_reason
  );

  if normalized_action = 'inactivate' then
    update public.hris_users
    set status = 'Inactive',
        is_duplicate = coalesce(p_mark_duplicate, false),
        account_lifecycle_reason = trim(p_reason),
        account_inactivated_at = now(),
        account_inactivated_by = actor_id,
        duplicate_marked_at = case when p_mark_duplicate then now() else null end,
        duplicate_marked_by = case when p_mark_duplicate then actor_id else null end
    where id = p_target_user_id;
  else
    update public.hris_users
    set status = 'Active',
        is_duplicate = false,
        account_lifecycle_reason = trim(p_reason),
        account_reactivated_at = now(),
        account_reactivated_by = actor_id
    where id = p_target_user_id;
  end if;

  select jsonb_build_object(
    'status', u.status,
    'isDuplicate', u.is_duplicate,
    'reason', u.account_lifecycle_reason
  ) into after_state
  from public.hris_users u where u.id = p_target_user_id;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text,
    actor_email,
    upper(normalized_action),
    'UserAccount',
    p_target_user_id::text,
    jsonb_build_object('reason', trim(p_reason), 'before', before_state, 'after', after_state)::text
  );

  return after_state;
end;
$$;

revoke all on function public.admin_set_account_lifecycle(uuid,text,text,boolean) from public, anon;
grant execute on function public.admin_set_account_lifecycle(uuid,text,text,boolean) to authenticated;

create or replace function public.update_employee_employment_details(
  p_target_user_id uuid,
  p_position text,
  p_date_hired date,
  p_employment_status text
)
returns public.hris_users
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_row public.hris_users;
begin
  if not (
    public.has_active_role('HR Manager')
    or public.has_active_role('HR Staff')
    or (public.has_active_role('Admin') and not public.has_active_role('IT'))
  ) then
    raise exception 'Forbidden: authorized HR employment-detail access is required.' using errcode = '42501';
  end if;
  if not public.can_access_hris_user(p_target_user_id) then
    raise exception 'The employee is outside your authorized scope.' using errcode = '42501';
  end if;
  if p_date_hired is not null and p_date_hired > current_date then
    raise exception 'Date Hired cannot be in the future.';
  end if;

  update public.hris_users
  set position = nullif(trim(p_position), ''),
      date_hired = p_date_hired,
      employment_status = nullif(trim(p_employment_status), '')
  where id = p_target_user_id
  returning * into updated_row;
  return updated_row;
end;
$$;

revoke all on function public.update_employee_employment_details(uuid,text,date,text) from public, anon;
grant execute on function public.update_employee_employment_details(uuid,text,date,text) to authenticated;

create or replace function public.audit_employee_employment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
begin
  select email into actor_email from public.hris_users where id = actor_id;
  if new.position is distinct from old.position then
    insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details)
    values(coalesce(actor_id::text,'system'),actor_email,'UPDATE','EmployeeProfile',new.id::text,
      jsonb_build_object('field','position','oldValue',old.position,'newValue',new.position)::text);
  end if;
  if new.date_hired is distinct from old.date_hired then
    insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details)
    values(coalesce(actor_id::text,'system'),actor_email,'UPDATE','EmployeeProfile',new.id::text,
      jsonb_build_object('field','date_hired','oldValue',old.date_hired,'newValue',new.date_hired)::text);
  end if;
  if new.employment_status is distinct from old.employment_status then
    insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details)
    values(coalesce(actor_id::text,'system'),actor_email,'UPDATE','EmployeeProfile',new.id::text,
      jsonb_build_object('field','employment_status','oldValue',old.employment_status,'newValue',new.employment_status)::text);
  end if;
  return new;
end;
$$;

create or replace function public.guard_employee_employment_details()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.date_hired is not null and new.date_hired > current_date then
    raise exception 'Date Hired cannot be in the future.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_employee_employment_details on public.hris_users;
create trigger guard_employee_employment_details
before insert or update of date_hired on public.hris_users
for each row execute function public.guard_employee_employment_details();

drop trigger if exists audit_employee_employment_change on public.hris_users;
create trigger audit_employee_employment_change
after update of position, date_hired, employment_status on public.hris_users
for each row execute function public.audit_employee_employment_change();

alter table public.user_documents
  add column if not exists title text,
  add column if not exists notes text,
  add column if not exists document_source text not null default 'Employee',
  add column if not exists uploaded_by uuid references public.hris_users(id) on delete set null,
  add column if not exists uploaded_by_name text,
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists version_number integer not null default 1,
  add column if not exists replaces_document_id text references public.user_documents(id) on delete restrict,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.hris_users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.hris_users(id) on delete set null;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_documents'::regclass
      and conname = 'user_documents_document_source_check'
  ) then
    alter table public.user_documents add constraint user_documents_document_source_check
      check (document_source in ('Employee','HR')) not valid;
  end if;
end $$;

create index if not exists user_documents_employee_active_idx
  on public.user_documents(user_id, archived_at, created_at desc);
create unique index if not exists user_documents_storage_object_idx
  on public.user_documents(storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'employee-documents',
  'employee-documents',
  false,
  20971520,
  array[
    'application/pdf','image/jpeg','image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict(id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_view_employee_documents(p_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_target_user_id = public.current_hris_user_id()
    or (
      public.can_access_hris_user(p_target_user_id)
      and (
        public.has_sensitive_permission('employee_documents','view')
        or (public.has_active_role('Admin') and not public.has_active_role('IT'))
      )
    )
$$;

create or replace function public.can_manage_employee_documents(p_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_hris_user(p_target_user_id)
    and (
      public.has_active_role('HR Manager')
      or public.has_active_role('HR Staff')
      or (public.has_active_role('Admin') and not public.has_active_role('IT'))
    )
$$;

revoke all on function public.can_view_employee_documents(uuid) from public, anon;
revoke all on function public.can_manage_employee_documents(uuid) from public, anon;
grant execute on function public.can_view_employee_documents(uuid) to authenticated;
grant execute on function public.can_manage_employee_documents(uuid) to authenticated;

create or replace function public.set_user_document_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := public.current_hris_user_id(); actor_name text;
begin
  select full_name into actor_name from public.hris_users where id = actor_id;
  if tg_op = 'INSERT' then
    new.uploaded_by := actor_id;
    new.uploaded_by_name := actor_name;
    new.updated_by := actor_id;
    if new.replaces_document_id is not null then
      if not public.can_manage_employee_documents(new.user_id) then
        raise exception 'Only authorized HR users may replace employee documents.' using errcode = '42501';
      end if;
      select coalesce(d.version_number,1) + 1 into new.version_number
      from public.user_documents d
      where d.id = new.replaces_document_id and d.user_id = new.user_id
      for update;
      if new.version_number is null then
        raise exception 'The document being replaced was not found for this employee.';
      end if;
      update public.user_documents
      set archived_at = now(), archived_by = actor_id, updated_at = now(), updated_by = actor_id
      where id = new.replaces_document_id;
    end if;
  else
    new.updated_at := now();
    new.updated_by := actor_id;
    if new.archived_at is not null and old.archived_at is null then
      new.archived_by := actor_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists set_user_document_audit_fields on public.user_documents;
create trigger set_user_document_audit_fields
before insert or update on public.user_documents
for each row execute function public.set_user_document_audit_fields();

create or replace function public.audit_user_document_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := public.current_hris_user_id(); actor_email text; action_name text;
begin
  select email into actor_email from public.hris_users where id = actor_id;
  action_name := case
    when tg_op = 'INSERT' and new.replaces_document_id is not null then 'REPLACE'
    when tg_op = 'INSERT' then 'UPLOAD'
    when new.archived_at is not null and old.archived_at is null then 'ARCHIVE'
    else 'UPDATE'
  end;
  insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details)
  values(
    coalesce(actor_id::text,'system'),actor_email,action_name,'EmployeeDocument',new.id,
    jsonb_build_object(
      'employeeId',new.user_id,'documentType',new.document_type,'source',new.document_source,
      'status',new.status,'version',new.version_number,'replaces',new.replaces_document_id
    )::text
  );
  return new;
end;
$$;

drop trigger if exists audit_user_document_change on public.user_documents;
create trigger audit_user_document_change
after insert or update on public.user_documents
for each row execute function public.audit_user_document_change();

drop policy if exists user_documents_insert on public.user_documents;
drop policy if exists user_documents_scoped_insert on public.user_documents;
drop policy if exists user_documents_scoped_select on public.user_documents;
drop policy if exists user_documents_scoped_update on public.user_documents;

create policy user_documents_scoped_select on public.user_documents
for select to authenticated using (
  (user_id = public.current_hris_user_id() and archived_at is null)
  or (user_id <> public.current_hris_user_id() and public.can_view_employee_documents(user_id))
  or public.can_manage_employee_documents(user_id)
);

create policy user_documents_scoped_insert on public.user_documents
for insert to authenticated with check (
  (
    user_id = public.current_hris_user_id()
    and document_source = 'Employee'
    and archived_at is null
  )
  or (
    document_source = 'HR'
    and public.can_manage_employee_documents(user_id)
    and archived_at is null
  )
);

create policy user_documents_scoped_update on public.user_documents
for update to authenticated using (public.can_manage_employee_documents(user_id))
with check (public.can_manage_employee_documents(user_id));

drop policy if exists employee_documents_select on storage.objects;
drop policy if exists employee_documents_insert on storage.objects;

create policy employee_documents_select on storage.objects
for select to authenticated using (
  bucket_id = 'employee-documents'
  and exists (
    select 1 from public.user_documents d
    where d.storage_bucket = bucket_id and d.storage_path = name
      and (
        (d.user_id = public.current_hris_user_id() and d.archived_at is null)
        or (d.user_id <> public.current_hris_user_id() and public.can_view_employee_documents(d.user_id))
        or public.can_manage_employee_documents(d.user_id)
      )
  )
);

create policy employee_documents_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'employee-documents'
  and array_length(storage.foldername(name),1) >= 2
  and exists (
    select 1 from public.hris_users target
    where target.id::text = (storage.foldername(name))[1]
      and (
        target.id = public.current_hris_user_id()
        or public.can_manage_employee_documents(target.id)
      )
  )
);

create or replace function public.log_employee_document_download(p_document_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := public.current_hris_user_id(); actor_email text; doc public.user_documents;
begin
  select * into doc from public.user_documents where id = p_document_id;
  if doc.id is null or not public.can_view_employee_documents(doc.user_id) then
    raise exception 'Document not found or access denied.' using errcode = '42501';
  end if;
  if doc.archived_at is not null and not public.can_manage_employee_documents(doc.user_id) then
    raise exception 'Archived document access is restricted.' using errcode = '42501';
  end if;
  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details)
  values(actor_id::text,actor_email,'DOWNLOAD','EmployeeDocument',doc.id,
    jsonb_build_object('employeeId',doc.user_id,'fileName',doc.file_name,'version',doc.version_number)::text);
  return true;
end;
$$;

revoke all on function public.log_employee_document_download(text) from public, anon;
grant execute on function public.log_employee_document_download(text) to authenticated;
