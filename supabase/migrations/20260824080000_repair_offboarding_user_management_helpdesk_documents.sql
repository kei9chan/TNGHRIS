-- Focused repairs for employee offboarding, admin user lifecycle management,
-- helpdesk assignment visibility, and editable contract document layout.
-- Existing records and generated document snapshots are preserved.

alter table public.hris_users
  add column if not exists end_date date,
  add column if not exists pre_end_employment_status text;

alter table public.contract_templates
  add column if not exists document_settings jsonb not null default jsonb_build_object(
    'pageSize', 'A4',
    'marginTopMm', 20,
    'marginRightMm', 20,
    'marginBottomMm', 20,
    'marginLeftMm', 20,
    'fontFamily', 'Times New Roman',
    'fontSizePt', 12,
    'lineHeight', 1.45,
    'showPageNumbers', false,
    'showFooter', true
  );

create index if not exists hris_users_end_date_idx
  on public.hris_users(end_date) where end_date is not null;
create index if not exists tickets_assigned_to_created_idx
  on public.tickets(assigned_to_id, created_at desc) where assigned_to_id is not null;

-- Keep this helper aligned with the active multi-role RBAC model. Inactive
-- users still fail closed because current_hris_user_id() returns null for them.
create or replace function public.is_hr_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_active_role('Admin')
      or public.has_active_role('Board of Director')
      or public.has_active_role('HR Manager')
      or public.has_active_role('HR Staff')
$$;

revoke all on function public.is_hr_or_admin() from public, anon;
grant execute on function public.is_hr_or_admin() to authenticated;

-- Employee end-date changes are a single database transaction: profile state,
-- application-access state, reactivation metadata, and the audit record either
-- all commit or all roll back.
create or replace function public.set_employee_end_date(
  p_target_user_id uuid,
  p_end_date date,
  p_reason text
)
returns public.hris_users
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  target_row public.hris_users;
  updated_row public.hris_users;
  previous_access_state text;
  next_access_state text;
  active_admin_count integer;
begin
  if actor_id is null or not (
    public.has_active_role('Admin')
    or public.has_active_role('HR Manager')
    or public.has_active_role('HR Staff')
  ) then
    raise exception 'Forbidden: HR Staff, HR Manager, or Admin authority is required.' using errcode = '42501';
  end if;
  if not public.can_access_hris_user(p_target_user_id) then
    raise exception 'The employee is outside your authorized scope.' using errcode = '42501';
  end if;
  if actor_id = p_target_user_id then
    raise exception 'You cannot offboard or reactivate your own account.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A reason of at least 5 characters is required.';
  end if;

  select * into target_row
  from public.hris_users
  where id = p_target_user_id
  for update;
  if target_row.id is null then
    raise exception 'Employee account not found.' using errcode = 'P0002';
  end if;
  if p_end_date is not null and target_row.date_hired is not null and p_end_date < target_row.date_hired then
    raise exception 'End Date cannot be earlier than Date Hired.';
  end if;

  if p_end_date is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_target_user_id and ur.role_id = 'Admin' and ur.is_active
  ) then
    select count(distinct ur.user_id) into active_admin_count
    from public.user_roles ur
    join public.hris_users u on u.id = ur.user_id
    where ur.role_id = 'Admin' and ur.is_active and lower(u.status) = 'active';
    if active_admin_count <= 1 then
      raise exception 'Cannot offboard the final active Admin.' using errcode = '42501';
    end if;
  end if;

  select email into actor_email from public.hris_users where id = actor_id;
  previous_access_state := case when lower(target_row.status) = 'active' then 'Enabled' else 'Disabled' end;
  next_access_state := case when p_end_date is null then 'Enabled' else 'Disabled' end;

  if p_end_date is not null then
    update public.hris_users
    set end_date = p_end_date,
        pre_end_employment_status = case
          when lower(status) = 'active' then employment_status
          else coalesce(pre_end_employment_status, employment_status)
        end,
        employment_status = 'Separated',
        status = 'Inactive',
        account_lifecycle_reason = trim(p_reason),
        account_inactivated_at = now(),
        account_inactivated_by = actor_id
    where id = p_target_user_id
    returning * into updated_row;
  else
    update public.hris_users
    set end_date = null,
        employment_status = case
          when employment_status = 'Separated' then pre_end_employment_status
          else employment_status
        end,
        status = 'Active',
        account_lifecycle_reason = trim(p_reason),
        account_reactivated_at = now(),
        account_reactivated_by = actor_id
    where id = p_target_user_id
    returning * into updated_row;
  end if;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text,
    actor_email,
    case when p_end_date is null then 'REACTIVATE' else 'OFFBOARD' end,
    'EmployeeOffboarding',
    p_target_user_id::text,
    jsonb_build_object(
      'sourceModule', 'Employees/ProfileEdit',
      'employeeId', target_row.id,
      'employeeName', target_row.full_name,
      'reason', trim(p_reason),
      'confirmedByUserId', actor_id,
      'previousEmploymentStatus', target_row.employment_status,
      'newEmploymentStatus', updated_row.employment_status,
      'previousEndDate', target_row.end_date,
      'newEndDate', updated_row.end_date,
      'previousAccountAccess', previous_access_state,
      'newAccountAccess', next_access_state,
      'confirmedAt', now()
    )::text
  );

  return updated_row;
end;
$$;

revoke all on function public.set_employee_end_date(uuid,date,text) from public, anon;
grant execute on function public.set_employee_end_date(uuid,date,text) to authenticated;

-- Duplicate-account lifecycle actions are intentionally Admin-only. HR users
-- perform employee offboarding through set_employee_end_date instead.
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
  if actor_id is null or not public.has_active_role('Admin') then
    raise exception 'Forbidden: Admin authority is required.' using errcode = '42501';
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

  select * into target_row from public.hris_users where id = p_target_user_id for update;
  if target_row.id is null then raise exception 'Account not found.' using errcode = 'P0002'; end if;

  if normalized_action = 'inactivate' and exists (
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
        duplicate_marked_at = case when p_mark_duplicate then now() else duplicate_marked_at end,
        duplicate_marked_by = case when p_mark_duplicate then actor_id else duplicate_marked_by end
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
  ) into after_state from public.hris_users u where u.id = p_target_user_id;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text,
    actor_email,
    upper(normalized_action),
    'UserAccount',
    p_target_user_id::text,
    jsonb_build_object(
      'sourceModule', 'Admin/UserManagement',
      'reason', trim(p_reason),
      'employeeName', target_row.full_name,
      'email', target_row.email,
      'businessUnit', target_row.business_unit,
      'before', before_state,
      'after', after_state
    )::text
  );
  return after_state;
end;
$$;

revoke all on function public.admin_set_account_lifecycle(uuid,text,text,boolean) from public, anon;
grant execute on function public.admin_set_account_lifecycle(uuid,text,text,boolean) to authenticated;

-- Assignees must be able to retrieve their assigned ticket even when the
-- requester belongs to a different business unit.
drop policy if exists tickets_requester_own on public.tickets;
drop policy if exists tickets_assignee_access on public.tickets;

create policy tickets_requester_own on public.tickets
  for all to authenticated
  using (requester_id = (select public.current_hris_user_id()))
  with check (requester_id = (select public.current_hris_user_id()));

create policy tickets_assignee_access on public.tickets
  for all to authenticated
  using (assigned_to_id = (select public.current_hris_user_id()))
  with check (assigned_to_id = (select public.current_hris_user_id()));

create or replace function public.get_accessible_helpdesk_ticket(p_ticket_id uuid)
returns public.tickets
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  ticket_row public.tickets;
begin
  if actor_id is null then
    raise exception 'Your account is inactive or you are not signed in.' using errcode = '42501';
  end if;
  select * into ticket_row from public.tickets where id = p_ticket_id;
  if ticket_row.id is null then
    raise exception 'The requested ticket was not found.' using errcode = 'P0002';
  end if;
  if ticket_row.requester_id <> actor_id
     and ticket_row.assigned_to_id is distinct from actor_id
     and not public.is_hr_or_admin() then
    raise exception 'You do not have permission to view this ticket.' using errcode = '42501';
  end if;
  return ticket_row;
end;
$$;

revoke all on function public.get_accessible_helpdesk_ticket(uuid) from public, anon;
grant execute on function public.get_accessible_helpdesk_ticket(uuid) to authenticated;

comment on column public.hris_users.end_date is
  'Canonical employee end date. Non-null values are managed through set_employee_end_date.';
comment on column public.contract_templates.document_settings is
  'Editable layout settings used only for newly generated document snapshots.';
