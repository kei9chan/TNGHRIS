-- Complete the focused repair by enforcing account lifecycle changes in
-- Supabase Auth and narrowing Helpdesk access to the existing RBAC model.
-- This migration is additive and preserves all HRIS and historical records.

alter table public.hris_users
  add column if not exists pre_deactivation_banned_until timestamptz;

comment on column public.hris_users.pre_deactivation_banned_until is
  'Supabase Auth ban that existed before HRIS deactivation; restored on controlled reactivation.';

-- Bootstrap is an own-account lookup. Returning an inactive caller's own
-- status lets the client sign out an already-open browser while all protected
-- data access continues to fail closed through current_hris_user_id().
create or replace function public.get_my_hris_bootstrap()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(profile)
  from (
    select u.id, u.full_name, u.role, u.status, u.department, u.business_unit,
      u.position, u.date_hired, u.is_photo_enrolled, u.email,
      u.business_unit_id, u.department_id, u.reports_to, u.employee_id,
      u.data_access_scope, u.dashboard_type, u.permission_diagnostic,
      u.permission_updated_at, u.permission_updated_by
    from public.hris_users u
    where u.auth_user_id = auth.uid()
    limit 1
  ) profile
$$;

revoke all on function public.get_my_hris_bootstrap() from public, anon;
grant execute on function public.get_my_hris_bootstrap() to authenticated;

-- Employee offboarding, Supabase Auth banning, session revocation, and audit
-- creation run in one PostgreSQL transaction. Any failure rolls everything
-- back so the UI cannot report a misleading partial success.
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
  auth_banned_before timestamptz;
  auth_banned_after timestamptz;
  previous_access_state text;
  next_access_state text;
  active_admin_count integer;
  revoked_session_count integer := 0;
  revoked_refresh_token_count integer := 0;
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

  if target_row.auth_user_id is not null then
    select u.banned_until into auth_banned_before
    from auth.users u
    where u.id = target_row.auth_user_id
    for update;
    if not found then
      raise exception 'The linked authentication account was not found; no changes were saved.';
    end if;
  end if;

  select email into actor_email from public.hris_users where id = actor_id;
  previous_access_state := case
    when target_row.auth_user_id is null then 'No linked auth account'
    when lower(target_row.status) <> 'active' then 'Disabled'
    when auth_banned_before is not null and auth_banned_before > now() then 'Disabled'
    else 'Enabled'
  end;

  if p_end_date is not null then
    if target_row.auth_user_id is not null then
      update auth.users
      set banned_until = '9999-12-31 23:59:59+00'::timestamptz,
          updated_at = now()
      where id = target_row.auth_user_id;

      update auth.refresh_tokens
      set revoked = true,
          updated_at = now()
      where user_id = target_row.auth_user_id::text
        and not revoked;
      get diagnostics revoked_refresh_token_count = row_count;

      delete from auth.sessions where user_id = target_row.auth_user_id;
      get diagnostics revoked_session_count = row_count;
      auth_banned_after := '9999-12-31 23:59:59+00'::timestamptz;
    end if;

    update public.hris_users
    set end_date = p_end_date,
        pre_end_employment_status = case
          when lower(status) = 'active' then employment_status
          else coalesce(pre_end_employment_status, employment_status)
        end,
        pre_deactivation_banned_until = case
          when lower(status) = 'active' then auth_banned_before
          else coalesce(pre_deactivation_banned_until, auth_banned_before)
        end,
        employment_status = 'Separated',
        status = 'Inactive',
        account_lifecycle_reason = trim(p_reason),
        account_inactivated_at = now(),
        account_inactivated_by = actor_id
    where id = p_target_user_id
    returning * into updated_row;
  else
    auth_banned_after := case
      when target_row.pre_deactivation_banned_until is not null
        and target_row.pre_deactivation_banned_until > now()
      then target_row.pre_deactivation_banned_until
      else null
    end;

    if target_row.auth_user_id is not null then
      update auth.users
      set banned_until = auth_banned_after,
          updated_at = now()
      where id = target_row.auth_user_id;

      update auth.refresh_tokens
      set revoked = true,
          updated_at = now()
      where user_id = target_row.auth_user_id::text
        and not revoked;
      get diagnostics revoked_refresh_token_count = row_count;

      delete from auth.sessions where user_id = target_row.auth_user_id;
      get diagnostics revoked_session_count = row_count;
    end if;

    update public.hris_users
    set end_date = null,
        employment_status = case
          when employment_status = 'Separated' then pre_end_employment_status
          else employment_status
        end,
        pre_end_employment_status = null,
        pre_deactivation_banned_until = null,
        status = 'Active',
        account_lifecycle_reason = trim(p_reason),
        account_reactivated_at = now(),
        account_reactivated_by = actor_id
    where id = p_target_user_id
    returning * into updated_row;
  end if;

  next_access_state := case
    when target_row.auth_user_id is null then 'No linked auth account'
    when p_end_date is not null then 'Disabled'
    when auth_banned_after is not null and auth_banned_after > now() then 'Disabled (pre-existing auth restriction)'
    else 'Enabled; fresh sign-in required'
  end;

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
      'previousAuthBannedUntil', auth_banned_before,
      'newAuthBannedUntil', auth_banned_after,
      'revokedSessions', revoked_session_count,
      'revokedRefreshTokens', revoked_refresh_token_count,
      'confirmedAt', now()
    )::text
  );

  return updated_row;
end;
$$;

revoke all on function public.set_employee_end_date(uuid,date,text) from public, anon;
grant execute on function public.set_employee_end_date(uuid,date,text) to authenticated;

-- Duplicate-account lifecycle management uses the same backend Auth lock and
-- session revocation, remains Admin-only, and never deletes the linked profile.
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
  auth_banned_before timestamptz;
  auth_banned_after timestamptz;
  active_admin_count integer;
  revoked_session_count integer := 0;
  revoked_refresh_token_count integer := 0;
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

  select * into target_row
  from public.hris_users
  where id = p_target_user_id
  for update;
  if target_row.id is null then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;
  if normalized_action = 'reactivate' and target_row.end_date is not null then
    raise exception 'This employee has an End Date. Reactivate the employee from the Employee profile so employment and account status remain consistent.';
  end if;

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

  if target_row.auth_user_id is not null then
    select u.banned_until into auth_banned_before
    from auth.users u
    where u.id = target_row.auth_user_id
    for update;
    if not found then
      raise exception 'The linked authentication account was not found; no changes were saved.';
    end if;
  end if;

  select email into actor_email from public.hris_users where id = actor_id;
  before_state := jsonb_build_object(
    'status', target_row.status,
    'isDuplicate', target_row.is_duplicate,
    'reason', target_row.account_lifecycle_reason,
    'authBannedUntil', auth_banned_before,
    'accountAccess', case
      when target_row.auth_user_id is null then 'No linked auth account'
      when lower(target_row.status) <> 'active' then 'Disabled'
      when auth_banned_before is not null and auth_banned_before > now() then 'Disabled'
      else 'Enabled'
    end
  );

  if normalized_action = 'inactivate' then
    if target_row.auth_user_id is not null then
      update auth.users
      set banned_until = '9999-12-31 23:59:59+00'::timestamptz,
          updated_at = now()
      where id = target_row.auth_user_id;

      update auth.refresh_tokens
      set revoked = true,
          updated_at = now()
      where user_id = target_row.auth_user_id::text
        and not revoked;
      get diagnostics revoked_refresh_token_count = row_count;

      delete from auth.sessions where user_id = target_row.auth_user_id;
      get diagnostics revoked_session_count = row_count;
      auth_banned_after := '9999-12-31 23:59:59+00'::timestamptz;
    end if;

    update public.hris_users
    set status = 'Inactive',
        is_duplicate = coalesce(p_mark_duplicate, false),
        pre_deactivation_banned_until = case
          when lower(status) = 'active' then auth_banned_before
          else coalesce(pre_deactivation_banned_until, auth_banned_before)
        end,
        account_lifecycle_reason = trim(p_reason),
        account_inactivated_at = now(),
        account_inactivated_by = actor_id,
        duplicate_marked_at = case when p_mark_duplicate then now() else duplicate_marked_at end,
        duplicate_marked_by = case when p_mark_duplicate then actor_id else duplicate_marked_by end
    where id = p_target_user_id;
  else
    auth_banned_after := case
      when target_row.pre_deactivation_banned_until is not null
        and target_row.pre_deactivation_banned_until > now()
      then target_row.pre_deactivation_banned_until
      else null
    end;

    if target_row.auth_user_id is not null then
      update auth.users
      set banned_until = auth_banned_after,
          updated_at = now()
      where id = target_row.auth_user_id;

      update auth.refresh_tokens
      set revoked = true,
          updated_at = now()
      where user_id = target_row.auth_user_id::text
        and not revoked;
      get diagnostics revoked_refresh_token_count = row_count;

      delete from auth.sessions where user_id = target_row.auth_user_id;
      get diagnostics revoked_session_count = row_count;
    end if;

    update public.hris_users
    set status = 'Active',
        is_duplicate = false,
        pre_deactivation_banned_until = null,
        account_lifecycle_reason = trim(p_reason),
        account_reactivated_at = now(),
        account_reactivated_by = actor_id
    where id = p_target_user_id;
  end if;

  select jsonb_build_object(
    'status', u.status,
    'isDuplicate', u.is_duplicate,
    'reason', u.account_lifecycle_reason,
    'authBannedUntil', auth_banned_after,
    'accountAccess', case
      when u.auth_user_id is null then 'No linked auth account'
      when auth_banned_after is not null and auth_banned_after > now() then 'Disabled'
      else 'Enabled; fresh sign-in required'
    end
  ) into after_state
  from public.hris_users u
  where u.id = p_target_user_id;

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
      'after', after_state,
      'revokedSessions', revoked_session_count,
      'revokedRefreshTokens', revoked_refresh_token_count
    )::text
  );
  return after_state;
end;
$$;

revoke all on function public.admin_set_account_lifecycle(uuid,text,text,boolean) from public, anon;
grant execute on function public.admin_set_account_lifecycle(uuid,text,text,boolean) to authenticated;

-- Helpdesk support authority comes from the existing RBAC resource. This
-- includes IT and other configured support roles without hardcoding emails.
create or replace function public.can_manage_helpdesk_tickets()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.current_hris_user_id() is not null
    and (
      public.is_hr_or_admin()
      or public.has_feature_permission('Helpdesk', 'manage')
      or public.has_feature_permission('Helpdesk', 'edit')
      or public.has_feature_permission('Helpdesk', 'assign')
      or public.has_feature_permission('Helpdesk', 'reassign')
    )
$$;

revoke all on function public.can_manage_helpdesk_tickets() from public, anon;
grant execute on function public.can_manage_helpdesk_tickets() to authenticated;

drop policy if exists tickets_requester_own on public.tickets;
drop policy if exists tickets_assignee_access on public.tickets;
drop policy if exists tickets_hr_admin_all on public.tickets;
drop policy if exists tickets_access_select on public.tickets;
drop policy if exists tickets_access_insert on public.tickets;
drop policy if exists tickets_access_update on public.tickets;
drop policy if exists tickets_access_delete on public.tickets;

create policy tickets_access_select on public.tickets
  for select to authenticated
  using (
    (select public.current_hris_user_id()) is not null
    and (
      requester_id = (select public.current_hris_user_id())
      or assigned_to_id = (select public.current_hris_user_id())
      or (select public.can_manage_helpdesk_tickets())
    )
  );

create policy tickets_access_insert on public.tickets
  for insert to authenticated
  with check (
    (select public.current_hris_user_id()) is not null
    and (
      (requester_id = (select public.current_hris_user_id()) and assigned_to_id is null)
      or (select public.can_manage_helpdesk_tickets())
    )
  );

create policy tickets_access_update on public.tickets
  for update to authenticated
  using (
    (select public.current_hris_user_id()) is not null
    and (
      requester_id = (select public.current_hris_user_id())
      or assigned_to_id = (select public.current_hris_user_id())
      or (select public.can_manage_helpdesk_tickets())
    )
  )
  with check (
    (select public.current_hris_user_id()) is not null
    and (
      requester_id = (select public.current_hris_user_id())
      or assigned_to_id = (select public.current_hris_user_id())
      or (select public.can_manage_helpdesk_tickets())
    )
  );

create policy tickets_access_delete on public.tickets
  for delete to authenticated
  using ((select public.can_manage_helpdesk_tickets()));

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
     and not public.can_manage_helpdesk_tickets() then
    raise exception 'You do not have permission to view this ticket.' using errcode = '42501';
  end if;
  return ticket_row;
end;
$$;

revoke all on function public.get_accessible_helpdesk_ticket(uuid) from public, anon;
grant execute on function public.get_accessible_helpdesk_ticket(uuid) to authenticated;
